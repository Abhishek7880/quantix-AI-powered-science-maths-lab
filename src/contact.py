"""Contact-us messages: validated, rate-limited, stored in SQLite, read through an admin inbox.

    submit(form, ip)              -> {ticket, created}            (public)
    list_messages(status, q)      -> messages + counts            (admin)
    update(id, status, note), delete(id), to_csv()               (admin)

Storage: outputs/contact/messages.db (stdlib sqlite3, one row per message). Admin access needs the admin key: the
environment variable IAV_ADMIN_TOKEN, or — if unset — a random key created once in outputs/contact/admin_token.txt
(read it on the server; it is never sent by the API). Spam protection: a hidden "website" field that people leave
empty, at most 5 messages per sender address per 10 minutes, and a cap on links.
"""

from __future__ import annotations

import csv
import hmac
import io
import os
import re
import secrets
import sqlite3
import threading
import time
from datetime import datetime
from pathlib import Path

from src.config import PROJECT_ROOT
from src.errors import AppError, InputValidationError, ResourceNotFoundError

DIR = PROJECT_ROOT / "outputs" / "contact"
DB_PATH = DIR / "messages.db"
TOKEN_FILE = DIR / "admin_token.txt"
TOPICS = ("general", "bug", "feature", "data", "other")
STATUSES = ("new", "read", "replied", "closed")
RATE_LIMIT, RATE_WINDOW_S = 5, 600
EMAIL_RE = re.compile(r"^[^@\s<>]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}$")
_lock = threading.Lock()
_recent: dict[str, list[float]] = {}


class AdminAuthError(AppError):
    status_code = 401
    error_code = "ADMIN_KEY_REQUIRED"
    error_title = "Admin key required"
    message = "This page needs the admin key."


class TooManyMessagesError(AppError):
    status_code = 429
    error_code = "TOO_MANY_MESSAGES"
    error_title = "Too many messages"
    message = "Please wait a few minutes before sending another message."


# ------------------------------------------------------------------ storage
def _db() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(DB_PATH, timeout=10)
    con.row_factory = sqlite3.Row
    con.execute("""CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT, ticket TEXT UNIQUE NOT NULL, created TEXT NOT NULL,
        name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT, topic TEXT NOT NULL, subject TEXT, message TEXT NOT NULL,
        lang TEXT, page TEXT, ip TEXT, status TEXT NOT NULL DEFAULT 'new', note TEXT, updated TEXT)""")
    if "mail" not in {r[1] for r in con.execute("PRAGMA table_info(messages)")}:
        con.execute("ALTER TABLE messages ADD COLUMN mail TEXT")     # email-alert result: sent / failed: … / off
    return con


def admin_token() -> str:
    env = os.environ.get("IAV_ADMIN_TOKEN", "").strip()
    if env:
        return env
    with _lock:
        if not TOKEN_FILE.is_file():
            TOKEN_FILE.parent.mkdir(parents=True, exist_ok=True)
            TOKEN_FILE.write_text(secrets.token_urlsafe(18), encoding="utf-8")
        return TOKEN_FILE.read_text(encoding="utf-8").strip()


def check_admin(token: str | None) -> None:
    expected = admin_token()                                   # also creates the key file on first use
    if not token or not hmac.compare_digest(token.strip().encode(), expected.encode()):
        raise AdminAuthError("Missing or wrong admin key. Find it in outputs/contact/admin_token.txt on the server "
                             "(or the IAV_ADMIN_TOKEN environment variable).")


# ------------------------------------------------------------------ public: submit
def _clean(v, limit: int) -> str:
    v = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", str(v or "")).strip()
    return v[:limit]


def validate(form: dict) -> dict:
    errors = {}
    name = _clean(form.get("name"), 80)
    email = _clean(form.get("email"), 254).lower()
    phone = _clean(form.get("phone"), 20)
    topic = _clean(form.get("topic"), 20) or "general"
    subject = _clean(form.get("subject"), 120)
    message = _clean(form.get("message"), 3000)
    if len(name) < 2:
        errors["name"] = "name_short"
    if not EMAIL_RE.match(email):
        errors["email"] = "email_invalid"
    if phone and not re.fullmatch(r"\+?[0-9][0-9 \-]{6,18}", phone):
        errors["phone"] = "phone_invalid"
    if topic not in TOPICS:
        errors["topic"] = "topic_invalid"
    if len(message) < 10:
        errors["message"] = "message_short"
    elif len(re.findall(r"https?://", message)) > 3:
        errors["message"] = "too_many_links"
    if errors:
        raise InputValidationError("Please check the highlighted fields: " + ", ".join(errors), error_code="CONTACT_INVALID",
                                   error_title="Please check the form", details={"fields": errors})
    return {"name": name, "email": email, "phone": phone or None, "topic": topic, "subject": subject or None,
            "message": message, "lang": "hi" if form.get("lang") == "hi" else "en", "page": _clean(form.get("page"), 80) or None}


def submit(form: dict, ip: str | None) -> dict:
    if _clean(form.get("website"), 200):                         # honeypot: bots fill every field
        raise InputValidationError("Message rejected.", error_code="CONTACT_REJECTED", error_title="Message rejected")
    data = validate(form)
    key = ip or "unknown"
    now = time.time()
    with _lock:
        recent = [t for t in _recent.get(key, []) if now - t < RATE_WINDOW_S]
        if len(recent) >= RATE_LIMIT:
            raise TooManyMessagesError(f"At most {RATE_LIMIT} messages per {RATE_WINDOW_S // 60} minutes. Please try again later.")
        recent.append(now)
        _recent[key] = recent
    created = datetime.now().isoformat(timespec="seconds")
    with _lock, _db() as con:
        day = datetime.now().strftime("%Y%m%d")
        # AUTOINCREMENT ids are never reused, so a ticket number stays unique even after messages are deleted
        seq = con.execute("SELECT seq FROM sqlite_sequence WHERE name = 'messages'").fetchone()
        ticket = f"AVL-{day}-{(seq[0] if seq else 0) + 1:04d}"
        con.execute("""INSERT INTO messages (ticket, created, name, email, phone, topic, subject, message, lang, page, ip)
                       VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                    (ticket, created, data["name"], data["email"], data["phone"], data["topic"], data["subject"],
                     data["message"], data["lang"], data["page"], ip))
    # email alert in the background — the visitor never waits for the mail server
    from src import mailer
    mailer.notify_async({**data, "ticket": ticket, "created": created}, lambda result: _set_mail(ticket, result))
    return {"ticket": ticket, "created": created}


def _set_mail(ticket: str, result: str) -> None:
    with _lock, _db() as con:
        con.execute("UPDATE messages SET mail = ? WHERE ticket = ?", (result[:250], ticket))


# ------------------------------------------------------------------ admin
def list_messages(status: str | None = None, q: str | None = None) -> dict:
    sql, args = "SELECT * FROM messages", []
    where = []
    if status:
        if status not in STATUSES:
            raise InputValidationError(f"status must be one of {STATUSES}", error_code="STATUS_INVALID", error_title="Invalid status")
        where.append("status = ?")
        args.append(status)
    if q:
        where.append("(name LIKE ? OR email LIKE ? OR subject LIKE ? OR message LIKE ? OR ticket LIKE ?)")
        args += [f"%{q.strip()[:80]}%"] * 5
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY id DESC LIMIT 1000"
    with _db() as con:
        rows = [dict(r) for r in con.execute(sql, args)]
        counts = {s: 0 for s in STATUSES}
        for s, n in con.execute("SELECT status, COUNT(*) FROM messages GROUP BY status"):
            counts[s] = n
    return {"messages": rows, "counts": counts, "total": sum(counts.values())}


def update(msg_id: int, status: str | None = None, note: str | None = None) -> dict:
    if status is not None and status not in STATUSES:
        raise InputValidationError(f"status must be one of {STATUSES}", error_code="STATUS_INVALID", error_title="Invalid status")
    with _lock, _db() as con:
        row = con.execute("SELECT * FROM messages WHERE id = ?", (msg_id,)).fetchone()
        if row is None:
            raise ResourceNotFoundError(f"No message #{msg_id}.", error_code="MESSAGE_NOT_FOUND", error_title="Message not found")
        con.execute("UPDATE messages SET status = COALESCE(?, status), note = COALESCE(?, note), updated = ? WHERE id = ?",
                    (status, None if note is None else _clean(note, 2000), datetime.now().isoformat(timespec="seconds"), msg_id))
        return dict(con.execute("SELECT * FROM messages WHERE id = ?", (msg_id,)).fetchone())


def delete(msg_id: int) -> None:
    with _lock, _db() as con:
        if con.execute("DELETE FROM messages WHERE id = ?", (msg_id,)).rowcount == 0:
            raise ResourceNotFoundError(f"No message #{msg_id}.", error_code="MESSAGE_NOT_FOUND", error_title="Message not found")


def to_csv() -> str:
    cols = ["ticket", "created", "status", "topic", "name", "email", "phone", "subject", "message", "note", "lang", "page", "mail"]
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(cols)
    for m in list_messages()["messages"]:
        # neutralise spreadsheet formulas in user text (=, +, -, @ at the start of a cell)
        w.writerow([("'" + str(m[c]) if str(m[c] or "")[:1] in "=+-@" else m[c]) for c in cols])
    return "﻿" + buf.getvalue()
