"""Corrections for fine-tuning (src/feedback.py + /api/v1/feedback/everyday): consent, validation, limits, storage."""

from __future__ import annotations

import json

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from src import api, feedback
from tests.test_api import assert_error


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(feedback, "DIR", tmp_path / "fb")
    feedback._recent.clear()
    with TestClient(api.app) as c:
        yield c


def photo(w=200, h=150) -> bytes:
    img = np.full((h, w, 3), 200, np.uint8)
    cv2.rectangle(img, (40, 30), (120, 130), (30, 90, 200), -1)
    return cv2.imencode(".jpg", img)[1].tobytes()


def send(client, items, consent=True, extra=()):
    return client.post("/api/v1/feedback/everyday", files={"file": ("p.jpg", photo(), "image/jpeg")},
                       data={"items": json.dumps(items), "extra": json.dumps(list(extra)), "consent": str(consent).lower()})


def test_nothing_is_stored_without_consent(client):
    assert_error(send(client, [{"box": [40, 30, 120, 130], "predicted": "cup", "label": "mug"}], consent=False),
                 400, "CONSENT_REQUIRED")
    assert not (feedback.DIR / "samples.jsonl").exists()


def test_correction_is_saved_as_a_training_sample(client):
    r = send(client, [{"box": [40, 30, 120, 130], "predicted": "cup", "label": "Steel  Tumbler"},
                      {"box": [0, 0, 10, 10], "predicted": "cuboid", "label": "none"}], extra=["dice"])
    assert r.status_code == 201
    rec = feedback.read_all()[0]
    assert rec["boxes"][0]["label"] == "steel tumbler" and rec["boxes"][1]["label"] is None and rec["extra"] == ["dice"]
    assert (feedback.DIR / "images" / f"{rec['id']}.jpg").is_file()


@pytest.mark.parametrize("bad", ["<script>", "a", "x" * 60, "drop table;"])
def test_bad_names_are_rejected(client, bad):
    assert_error(send(client, [{"box": [40, 30, 120, 130], "predicted": "cup", "label": bad}]), 400, "FEEDBACK_INVALID")


def test_rate_limit_and_capacity(client, monkeypatch):
    ok_item = [{"box": [40, 30, 120, 130], "predicted": "cup", "label": "mug"}]
    for _ in range(feedback.RATE_LIMIT):
        assert send(client, ok_item).status_code == 201
    assert_error(send(client, ok_item), 429, "TOO_MANY_PHOTOS")
    feedback._recent.clear()
    monkeypatch.setattr(feedback, "MAX_SAMPLES", feedback.count())
    assert_error(send(client, ok_item), 503, "FEEDBACK_FULL")
