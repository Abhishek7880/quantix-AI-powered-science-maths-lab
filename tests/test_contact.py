"""Contact-us system: validation, spam protection, ticket numbers, admin inbox API and pages.
Uses a temporary database and admin key — the real outputs/contact/ is never touched."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

import json
import smtplib
import time

from src import api, contact, mailer
from tests.test_api import assert_error

P = "/api/v1/contact"
KEY = "test-admin-key-123"
GOOD = {"name": "Asha Verma", "email": "asha@example.com", "topic": "feature", "message": "Please add a chemistry quiz section."}


class FakeSMTP:
    """Stands in for smtplib.SMTP: records logins and messages, never touches the network."""
    sent: list = []
    fail_login = False

    def __init__(self, host, port, timeout=None):
        self.host, self.port = host, port

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def ehlo(self):
        pass

    def starttls(self, context=None):
        pass

    def login(self, user, pw):
        if FakeSMTP.fail_login:
            raise smtplib.SMTPAuthenticationError(535, b"5.7.8 Username and Password not accepted")
        self.user = user

    def send_message(self, msg):
        FakeSMTP.sent.append(msg)


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(contact, "DB_PATH", tmp_path / "messages.db")
    monkeypatch.setattr(contact, "TOKEN_FILE", tmp_path / "admin_token.txt")
    monkeypatch.setenv("IAV_ADMIN_TOKEN", KEY)
    # never use the real email account in tests: no secrets file, no env credentials, fake SMTP
    monkeypatch.setattr(mailer, "SECRETS", tmp_path / "smtp.json")
    for var in ("IAV_SMTP_USER", "IAV_SMTP_PASSWORD", "IAV_SMTP_HOST", "IAV_SMTP_PORT"):
        monkeypatch.delenv(var, raising=False)
    monkeypatch.setattr(mailer.smtplib, "SMTP", FakeSMTP)
    FakeSMTP.sent, FakeSMTP.fail_login = [], False
    contact._recent.clear()
    with TestClient(api.app) as c:
        yield c


def admin(c, method, path, **kw):
    return getattr(c, method)(P + path, headers={"X-Admin-Key": KEY}, **kw)


def test_submit_gives_ticket_and_stores(client):
    r = client.post(P, json=GOOD)
    assert r.status_code == 201
    t = r.json()["data"]["ticket"]
    assert t.startswith("AVL-") and t.endswith("-0001")
    t2 = client.post(P, json={**GOOD, "message": "A second message about graphs."}).json()["data"]["ticket"]
    assert t2.endswith("-0002")
    data = admin(client, "get", "/messages").json()["data"]
    assert data["total"] == 2 and data["counts"]["new"] == 2 and data["messages"][0]["ticket"] == t2


@pytest.mark.parametrize("field, value, code", [
    ("name", "A", "name_short"), ("email", "not-an-email", "email_invalid"), ("phone", "abc", "phone_invalid"),
    ("message", "short", "message_short"), ("topic", "spam", "topic_invalid"),
    ("message", "see http://a.x http://b.x http://c.x http://d.x now", "too_many_links"),
])
def test_validation(client, field, value, code):
    r = client.post(P, json={**GOOD, field: value})
    body = assert_error(r, 400, "CONTACT_INVALID")
    assert body["data"]["fields"][field] == code


def test_ticket_numbers_never_reused_after_delete(client):
    first = client.post(P, json=GOOD).json()["data"]["ticket"]
    client.post(P, json={**GOOD, "message": "Second message for the delete test."})
    ids = [m["id"] for m in admin(client, "get", "/messages").json()["data"]["messages"]]
    admin(client, "delete", f"/messages/{min(ids)}")
    third = client.post(P, json={**GOOD, "message": "Third message after a delete."})
    assert third.status_code == 201 and third.json()["data"]["ticket"] not in (first,) and third.json()["data"]["ticket"].endswith("-0003")


def test_honeypot_and_rate_limit(client):
    assert_error(client.post(P, json={**GOOD, "website": "http://spam.example"}), 400, "CONTACT_REJECTED")
    for _ in range(contact.RATE_LIMIT):
        assert client.post(P, json=GOOD).status_code == 201
    assert_error(client.post(P, json=GOOD), 429, "TOO_MANY_MESSAGES")


def test_admin_needs_key(client):
    assert_error(client.get(P + "/messages"), 401, "ADMIN_KEY_REQUIRED")
    assert_error(client.get(P + "/messages", headers={"X-Admin-Key": "wrong"}), 401, "ADMIN_KEY_REQUIRED")
    assert_error(client.get(P + "/export.csv"), 401, "ADMIN_KEY_REQUIRED")


def test_admin_update_search_export_delete(client):
    client.post(P, json=GOOD)
    client.post(P, json={**GOOD, "name": "Ravi", "email": "ravi@example.com", "message": "=HYPERLINK(\"x\") bug in graph page"})
    msgs = admin(client, "get", "/messages").json()["data"]["messages"]
    ravi = next(m for m in msgs if m["name"] == "Ravi")
    upd = admin(client, "patch", f"/messages/{ravi['id']}", json={"status": "replied", "note": "Fixed in next build"}).json()["data"]
    assert upd["status"] == "replied" and upd["note"] == "Fixed in next build"
    assert admin(client, "get", "/messages", params={"status": "replied"}).json()["data"]["messages"][0]["id"] == ravi["id"]
    assert len(admin(client, "get", "/messages", params={"q": "asha@"}).json()["data"]["messages"]) == 1
    assert_error(admin(client, "patch", f"/messages/{ravi['id']}", json={"status": "bogus"}), 400, "STATUS_INVALID")
    csv = admin(client, "get", "/export.csv")
    assert csv.status_code == 200 and "Ravi" in csv.text and "'=HYPERLINK" in csv.text     # formula neutralised
    assert admin(client, "delete", f"/messages/{ravi['id']}").status_code == 200
    assert_error(admin(client, "delete", f"/messages/{ravi['id']}"), 404, "MESSAGE_NOT_FOUND")


def test_pages_and_footer(client):
    assert "Contact us" in client.get("/contact").text
    assert "Admin key needed" in client.get("/contact/inbox").text
    assert 'id="contactSection"' in client.get("/").text
    for p in ("/", "/measure", "/formulas", "/elements", "/physics", "/handwriting", "/converter", "/graph", "/contact"):
        assert "/web/site.js" in client.get(p).text, p
    assert 'href = "/contact"' in client.get("/web/site.js").text or 'href="/contact"' in client.get("/web/site.js").text



# ------------------------------------------------------------------ email alerts
def _wait_mail(client, ticket):
    for _ in range(50):
        m = next(x for x in admin(client, "get", "/messages").json()["data"]["messages"] if x["ticket"] == ticket)
        if m["mail"]:
            return m["mail"]
        time.sleep(0.05)
    return None


def test_alerts_off_without_account(client):
    t = client.post(P, json=GOOD).json()["data"]["ticket"]
    assert _wait_mail(client, t) == "off" and FakeSMTP.sent == []
    st = admin(client, "get", "/email-status").json()["data"]
    assert st["enabled"] is False and st["to"] == "ay2276770@gmail.com" and st["missing"]


def test_alert_sent_with_reply_to_visitor(client, tmp_path):
    (tmp_path / "smtp.json").write_text(json.dumps({"username": "sender@gmail.com", "password": "abcd efgh ijkl mnop"}))
    st = admin(client, "get", "/email-status").json()["data"]
    assert st["enabled"] is True and "password" not in json.dumps(st)            # never exposed
    t = client.post(P, json={**GOOD, "name": "Asha\r\nBcc: evil@x.com"}).json()["data"]["ticket"]
    assert _wait_mail(client, t) == "sent"
    msg = FakeSMTP.sent[-1]
    assert msg["To"] == "ay2276770@gmail.com" and msg["Reply-To"] == GOOD["email"]
    assert t in msg["Subject"] and "\n" not in msg["Subject"] and msg["Bcc"] is None     # no header injection
    assert GOOD["message"] in msg.get_body(("plain",)).get_content()
    r = admin(client, "post", "/test-email").json()
    assert r["success"] and r["data"]["to"] == "ay2276770@gmail.com"


def test_wrong_password_is_explained(client, tmp_path):
    (tmp_path / "smtp.json").write_text(json.dumps({"username": "sender@gmail.com", "password": "wrongwrongwrong1"}))
    FakeSMTP.fail_login = True
    assert_error(admin(client, "post", "/test-email"), 502, "MAIL_AUTH_FAILED")
    t = client.post(P, json=GOOD).json()["data"]["ticket"]
    assert _wait_mail(client, t).startswith("failed:")


def test_public_config_hides_contact_settings(client):
    assert "contact" not in client.get("/api/v1/config").json()["data"]
