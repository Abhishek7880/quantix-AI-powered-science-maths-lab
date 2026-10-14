"""Email alerts for contact-us messages (SMTP with STARTTLS, e.g. Gmail + an App Password).

Where things come from:
  * recipient, SMTP host / port, inbox link, visitor confirmation on/off -> config.yaml  `contact:` section
  * sending account + password -> secrets/smtp.json  {"username": "...@gmail.com", "password": "app password",
    "from_name": "Quantix"}  or the environment variables IAV_SMTP_USER / IAV_SMTP_PASSWORD
    (IAV_SMTP_HOST / IAV_SMTP_PORT override the host / port; IAV_NOTIFY_TO / IAV_INBOX_URL override the recipient
    and inbox link, used on a hosted copy whose files are public). Set it up with: python tools/setup_email.py

Sending never blocks a visitor: notify_async() runs in a background thread and records "sent" / "failed: …" /
"off" on the message, which the admin inbox shows.
"""

from __future__ import annotations

import html
import json
import logging
import os
import re
import smtplib
import ssl
import threading
from email.message import EmailMessage
from email.utils import formataddr, make_msgid
from pathlib import Path

from src.config import PROJECT_ROOT, load_config
from src.errors import AppError

SECRETS = PROJECT_ROOT / "secrets" / "smtp.json"
TIMEOUT_S = 20
log = logging.getLogger("mailer")


class MailError(AppError):
    status_code = 502
    error_code = "MAIL_FAILED"
    error_title = "Email could not be sent"
    message = "The email server refused or could not be reached."


def settings() -> dict:
    c = load_config().contact
    s = {"to": (c.notify_to or "").strip(), "host": c.smtp_host, "port": int(c.smtp_port), "inbox_url": c.inbox_url,
         "confirm_to_sender": bool(c.confirm_to_sender), "username": "", "password": "", "from_name": "Quantix"}
    if SECRETS.is_file():
        try:
            data = json.loads(SECRETS.read_text(encoding="utf-8"))
            s.update({k: str(v) for k, v in data.items() if k in ("username", "password", "from_name") and v})
        except (json.JSONDecodeError, OSError) as exc:
            log.warning("Ignoring %s: %s", SECRETS, exc)
    env = {"IAV_SMTP_USER": "username", "IAV_SMTP_PASSWORD": "password", "IAV_SMTP_HOST": "host", "IAV_SMTP_PORT": "port",
           "IAV_NOTIFY_TO": "to", "IAV_INBOX_URL": "inbox_url"}     # hosted: keep the address out of public files
    for var, key in env.items():
        if os.environ.get(var):
            s[key] = int(os.environ[var]) if key == "port" else os.environ[var]
    s["password"] = s["password"].replace(" ", "")          # Gmail shows app passwords in groups of 4
    return s


def status() -> dict:
    """What the admin may see (never the password)."""
    s = settings()
    ready = bool(s["to"] and s["username"] and s["password"])
    return {"enabled": ready, "to": s["to"], "from": s["username"], "host": f'{s["host"]}:{s["port"]}',
            "confirm_to_sender": s["confirm_to_sender"],
            "missing": [k for k, v in (("recipient (config.yaml contact.notify_to)", s["to"]),
                                       ("sending account (tools/setup_email.py)", s["username"]),
                                       ("app password (tools/setup_email.py)", s["password"])) if not v]}


def _one_line(v: str, limit: int = 120) -> str:
    return re.sub(r"[\r\n\t]+", " ", str(v or ""))[:limit].strip()


def send(to: str, subject: str, text: str, html_body: str | None = None, reply_to: str | None = None) -> None:
    s = settings()
    if not (s["username"] and s["password"]):
        raise MailError("No sending account set up. Run: python tools/setup_email.py", error_code="MAIL_NOT_CONFIGURED",
                        error_title="Email not set up")
    msg = EmailMessage()
    msg["From"] = formataddr((_one_line(s["from_name"], 60), s["username"]))
    msg["To"] = to
    msg["Subject"] = _one_line(subject, 200)
    msg["Message-ID"] = make_msgid(domain="ai-vision-lab.local")
    if reply_to:
        msg["Reply-To"] = _one_line(reply_to, 254)
    msg.set_content(text)
    if html_body:
        msg.add_alternative(html_body, subtype="html")
    try:
        for attempt in (1, 2):                       # one retry: a slow first handshake sometimes times out
            try:
                with smtplib.SMTP(s["host"], s["port"], timeout=TIMEOUT_S) as smtp:
                    smtp.ehlo()
                    smtp.starttls(context=ssl.create_default_context())
                    smtp.ehlo()
                    smtp.login(s["username"], s["password"])
                    smtp.send_message(msg)
                break
            except (smtplib.SMTPServerDisconnected, smtplib.SMTPConnectError, TimeoutError, ConnectionError):
                if attempt == 2:
                    raise
                log.warning("SMTP connection dropped, retrying once")
    except smtplib.SMTPAuthenticationError as exc:
        raise MailError("The email server rejected the username / password. For Gmail use a 16-character App Password "
                        "(Google Account → Security → 2-Step Verification → App passwords), not your normal password. "
                        f"Server said: {exc.smtp_code} {exc.smtp_error[:120]!r}", error_code="MAIL_AUTH_FAILED",
                        error_title="Email login failed") from None
    except (smtplib.SMTPException, OSError) as exc:
        raise MailError(f"{type(exc).__name__}: {exc}") from None


# ------------------------------------------------------------------ contact messages
TOPIC_NAMES = {"general": "General question", "bug": "Bug report", "feature": "Feature idea", "data": "Wrong formula / data",
               "other": "Other"}


def _alert(m: dict, s: dict) -> tuple[str, str, str]:
    topic = TOPIC_NAMES.get(m["topic"], m["topic"])
    subject = f"[Quantix] {m['ticket']} · {topic} · {m['name']}"
    lines = [f"New contact message {m['ticket']}", "",
             f"From:    {m['name']} <{m['email']}>", f"Phone:   {m.get('phone') or '—'}", f"Topic:   {topic}",
             f"Subject: {m.get('subject') or '—'}", f"Sent:    {m['created']}  (page {m.get('page') or '—'}, {m.get('lang') or 'en'})",
             "", m["message"], "", f"Reply to this email to answer {m['name']} directly.", f"Inbox: {s['inbox_url']}"]
    e = {k: html.escape(str(v or "—")) for k, v in m.items()}
    rows = "".join(f"<tr><td style='color:#64748b;padding:2px 12px 2px 0'>{k}</td><td>{v}</td></tr>" for k, v in
                   (("From", f"{e['name']} &lt;<a href='mailto:{e['email']}'>{e['email']}</a>&gt;"), ("Phone", e["phone"]),
                    ("Topic", html.escape(topic)), ("Subject", e["subject"]), ("Sent", e["created"])))
    body = (f"<div style='font-family:Segoe UI,Arial,sans-serif;max-width:620px'>"
            f"<h2 style='margin:0 0 4px'>New message <span style='color:#0a84d6'>{e['ticket']}</span></h2>"
            f"<table style='font-size:14px;margin:8px 0'>{rows}</table>"
            f"<div style='white-space:pre-wrap;background:#f1f5f9;border-radius:8px;padding:12px;font-size:15px'>{e['message']}</div>"
            f"<p style='font-size:13px;color:#64748b'>Reply to this email to answer {e['name']} directly · "
            f"<a href='{html.escape(s['inbox_url'])}'>Open the inbox</a></p></div>")
    return subject, "\n".join(lines), body


def _confirmation(m: dict) -> tuple[str, str]:
    if m.get("lang") == "hi":
        return (f"आपका संदेश मिल गया — टिकट {m['ticket']}",
                f"नमस्ते {m['name']},\n\nQuantix से संपर्क करने के लिए धन्यवाद। आपका संदेश मिल गया है।\n"
                f"टिकट नंबर: {m['ticket']}\n\nहम आमतौर पर 2 कार्य-दिवसों में उत्तर देते हैं।\n\n— Quantix")
    return (f"We received your message — ticket {m['ticket']}",
            f"Hello {m['name']},\n\nThank you for contacting Quantix. We have received your message.\n"
            f"Ticket number: {m['ticket']}\n\nWe usually reply within 2 working days.\n\n— Quantix")


def notify(m: dict) -> str:
    """Email the admin about message m (and optionally confirm to the visitor). Returns the result to store."""
    s = settings()
    if not (s["to"] and s["username"] and s["password"]):
        return "off"
    try:
        subject, text, body = _alert(m, s)
        send(s["to"], subject, text, body, reply_to=m["email"])
        if s["confirm_to_sender"]:
            subj2, text2 = _confirmation(m)
            send(m["email"], subj2, text2, reply_to=s["to"])
        return "sent"
    except MailError as exc:
        log.warning("Contact alert %s not sent: %s", m.get("ticket"), exc.error_content)
        return f"failed: {exc.error_content[:180]}"


def notify_async(m: dict, done) -> None:
    threading.Thread(target=lambda: done(notify(m)), name=f"mail-{m.get('ticket')}", daemon=True).start()


def send_test() -> dict:
    s = settings()
    if not s["to"]:
        raise MailError("No recipient: set contact.notify_to in config.yaml.", error_code="MAIL_NOT_CONFIGURED",
                        error_title="Email not set up")
    send(s["to"], "[Quantix] Test email — alerts are working",
         "This is a test from Quantix.\n\nNew contact-us messages will arrive at this address.\n"
         f"Inbox: {s['inbox_url']}")
    return {"to": s["to"], "from": s["username"]}
