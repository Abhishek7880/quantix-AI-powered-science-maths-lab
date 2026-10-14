"""Social-media links: URL / handle normalising, refusing unsafe or wrong-site links, the public endpoint."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from src import api, social
from src.config import AppConfig


@pytest.mark.parametrize("platform, value, expected", [
    ("github", "https://github.com/Abhishek7880", "https://github.com/Abhishek7880"),
    ("github", "Abhishek7880", "https://github.com/Abhishek7880"),
    ("github", "github.com/Abhishek7880", "https://github.com/Abhishek7880"),
    ("youtube", "https://youtube.com/@aiwith_abhishek?si=l5feTE2m8Pqoax0y", "https://youtube.com/@aiwith_abhishek"),
    ("youtube", "@aiwith_abhishek", "https://www.youtube.com/@aiwith_abhishek"),
    ("linkedin", "https://www.linkedin.com/in/someone?utm_source=share_via&utm_medium=member_android",
     "https://www.linkedin.com/in/someone"),
    ("instagram", "http://instagram.com/someone", "https://instagram.com/someone"),
    ("x", "https://twitter.com/someone", "https://twitter.com/someone"),
    ("whatsapp", "+91 98765 43210", "https://wa.me/919876543210"),
    ("whatsapp", 919876543210, "https://wa.me/919876543210"),           # YAML reads a bare number as int
])
def test_profile_url_accepts(platform, value, expected):
    assert social.profile_url(platform, value) == expected


@pytest.mark.parametrize("platform, value", [
    ("github", ""), ("github", None),
    ("github", "javascript:alert(1)"),
    ("github", "javascript://github.com/%0aalert(1)"),
    ("github", "https://evil.example/github.com"),
    ("github", "https://github.com.evil.example/x"),
    ("youtube", "https://github.com/someone"),                          # right URL, wrong platform
    ("instagram", "my name with spaces"),
    ("whatsapp", "call me"),
    ("unknown", "someone"),
])
def test_profile_url_rejects(platform, value):
    assert social.profile_url(platform, value) is None


def test_author_signature_fields():
    c = AppConfig().author
    assert social.author(c) is None                                    # no name -> no signature
    c.name, c.title, c.email, c.phone, c.url = ("Abhishek  Yadav", "AI-Enabled Full-Stack Developer",
                                                "abhishekyadav24991@gmail.com", "+91 7080397264", "https://github.com/Abhishek7880")
    a = social.author(c)
    assert a == {"name": "Abhishek Yadav", "title": "AI-Enabled Full-Stack Developer", "email": "abhishekyadav24991@gmail.com",
                 "phone_tel": "+917080397264", "phone": "+91 70803 97264", "url": "https://github.com/Abhishek7880"}
    c.email, c.phone, c.url = "not an email", "call me", "javascript:alert(1)"   # invalid ones are dropped, not shown
    assert set(social.author(c)) == {"name", "title"}


def test_endpoint_lists_only_valid_links_in_order(monkeypatch):
    c = AppConfig()
    c.social.youtube, c.social.github, c.social.x = "@aiwith_abhishek", "Abhishek7880", "javascript:alert(1)"
    monkeypatch.setattr(api, "load_config", lambda: c)
    with TestClient(api.app) as client:
        r = client.get("/api/v1/social")
    assert r.status_code == 200 and r.json()["success"]
    links = r.json()["data"]["links"]
    assert [l["id"] for l in links] == ["github", "youtube"]
    assert links[0] == {"id": "github", "name": "GitHub", "url": "https://github.com/Abhishek7880"}


def test_site_js_and_icons_served():
    with TestClient(api.app) as client:
        assert "/api/v1/social" in client.get("/web/site.js").text
        icons = client.get("/web/social_icons.js")
        assert icons.status_code == 200 and "SOCIAL_ICONS" in icons.text and '"github"' in icons.text
        assert "data-social" in client.get("/contact").text
