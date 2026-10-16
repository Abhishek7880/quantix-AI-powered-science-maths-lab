"""Files at the site root: favicon, robots.txt, sitemap.xml and the Google Search Console verification file."""

from __future__ import annotations

from fastapi.testclient import TestClient

from src import api
from src.config import AppConfig

client = TestClient(api.app)


def test_favicon_and_icons():
    r = client.get("/favicon.ico")
    assert r.status_code == 200 and r.headers["content-type"] == "image/x-icon" and r.content[:4] == b"\x00\x00\x01\x00"
    for f in ("/web/favicon.svg", "/web/apple-touch-icon.png", "/web/favicon-32.png"):
        assert client.get(f).status_code == 200, f
    for page in ("/", "/formulas", "/elements", "/physics", "/handwriting", "/measure", "/converter", "/graph", "/contact"):
        assert 'href="/web/favicon.svg"' in client.get(page).text, page


def test_robots_and_sitemap_use_public_url(monkeypatch, tmp_path):
    c = AppConfig()
    c.site.public_url = "https://quantix.example.org/"
    monkeypatch.setattr(api, "load_config", lambda: c)
    monkeypatch.setattr(api, "SEO_DIR", tmp_path)          # no generated Learn sitemap -> the built-in one
    robots = client.get("/robots.txt").text
    assert "Disallow: /api/" in robots and "Sitemap: https://quantix.example.org/sitemap.xml" in robots
    sm = client.get("/sitemap.xml")
    assert sm.headers["content-type"].startswith("application/xml")
    assert "<loc>https://quantix.example.org/formulas</loc>" in sm.text and "/contact/inbox" not in sm.text


def test_generated_sitemap_wins_when_present(monkeypatch, tmp_path):
    (tmp_path / "sitemap.xml").write_text("<urlset><url><loc>https://x/learn/</loc></url></urlset>", encoding="utf-8")
    monkeypatch.setattr(api, "SEO_DIR", tmp_path)
    assert "https://x/learn/" in client.get("/sitemap.xml").text


def test_google_verification_file_only_when_configured(monkeypatch):
    c = AppConfig()
    monkeypatch.setattr(api, "load_config", lambda: c)
    assert client.get("/google1a2b3c4d5e6f7a8b.html").status_code == 404           # not configured
    c.site.google_verification = "google1a2b3c4d5e6f7a8b.html"
    r = client.get("/google1a2b3c4d5e6f7a8b.html")
    assert r.status_code == 200 and r.text == "google-site-verification: google1a2b3c4d5e6f7a8b.html"
    assert client.get("/google0000000000000000.html").status_code == 404           # any other name
    c.site.google_verification = "../secrets.html"                                  # never anything but a google file
    assert client.get("/secrets.html").status_code == 404
