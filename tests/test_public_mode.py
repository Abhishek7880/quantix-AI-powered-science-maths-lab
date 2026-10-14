"""Public mode (IAV_PUBLIC=1, the hosted site): owner-only routes are closed, heavy routes are rate-limited,
system info is minimal, only our own model files can be loaded and visitors' photos are not stored."""

from __future__ import annotations

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from src import api, mailer
from tests.test_api import assert_error


@pytest.fixture()
def public(monkeypatch):
    monkeypatch.setattr(api, "PUBLIC_MODE", True)
    api._heavy_hits.clear()
    with TestClient(api.app) as c:
        yield c
    api._heavy_hits.clear()


def _png() -> bytes:
    img = np.full((64, 64, 3), 255, np.uint8)
    cv2.rectangle(img, (16, 16), (48, 48), (0, 0, 255), -1)
    return cv2.imencode(".png", img)[1].tobytes()


@pytest.mark.parametrize("method, path", [
    ("get", "/training/status"), ("post", "/training/stop"), ("post", "/dataset/validate"), ("get", "/camera/status"),
    ("get", "/history/predictions"), ("get", "/files"), ("get", "/config"), ("post", "/models/export"),
    ("post", "/predict/path"), ("get", "/evaluation/reports"),
])
def test_owner_only_routes_closed(public, method, path):
    assert_error(getattr(public, method)("/api/v1" + path), 403, "NOT_AVAILABLE_ONLINE")


def test_student_routes_still_work(public):
    for path in ("/api/v1/health", "/api/v1/formulas", "/api/v1/elements", "/api/v1/social", "/api/v1/models",
                 "/api/v1/measure/presets"):
        assert public.get(path).status_code == 200, path
    for page in ("/", "/measure", "/formulas", "/elements", "/physics", "/handwriting", "/converter", "/graph", "/contact"):
        assert public.get(page).status_code == 200, page


def test_system_info_is_minimal(public):
    data = public.get("/api/v1/system/info").json()["data"]
    assert set(data) == {"selected_device", "public"}


def test_only_own_models_can_be_loaded(public):
    for model in ("src/api.py", "../secret.pt", "yolo11n.pt", "outputs/x.pt"):
        r = public.post("/api/v1/predict/image", files={"file": ("a.png", _png(), "image/png")}, data={"model": model})
        assert_error(r, 400, "MODEL_NOT_ALLOWED")


def test_heavy_routes_rate_limited(public, monkeypatch):
    monkeypatch.setattr(api, "HEAVY_LIMIT", 3)
    codes = [public.post("/api/v1/formulas/calc/solve", json={}).status_code for _ in range(5)]
    assert codes[:3] != [429] * 3 and codes[3:] == [429, 429]
    assert public.get("/api/v1/health").status_code == 200          # light routes are never limited


def test_off_by_default():
    with TestClient(api.app) as c:
        assert api.PUBLIC_MODE is False
        assert "selected_device" in c.get("/api/v1/system/info").json()["data"]
        assert c.get("/api/v1/training/status").status_code == 200


def test_mail_recipient_from_environment(monkeypatch, tmp_path):
    monkeypatch.setattr(mailer, "SECRETS", tmp_path / "none.json")
    monkeypatch.setenv("IAV_NOTIFY_TO", "owner@example.com")
    monkeypatch.setenv("IAV_INBOX_URL", "https://x.hf.space/contact/inbox")
    s = mailer.settings()
    assert s["to"] == "owner@example.com" and s["inbox_url"] == "https://x.hf.space/contact/inbox"
