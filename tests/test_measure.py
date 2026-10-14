"""Measure real objects in a photo: reference finding, real-size maths and the API (uses the sample photo
src/web/samples/measure_sample.jpg — 10 px = 1 mm, ₹10 coin Ø 27 mm, circle Ø 60 mm, rectangle 80 × 40 mm,
triangle base 60 mm / height 50 mm)."""

from __future__ import annotations

import json
from pathlib import Path

import cv2
import pytest
from fastapi.testclient import TestClient

from src import api, measure
from src.inference import Detection
from tests.test_api import assert_error

P = "/api/v1"
SAMPLE = Path(__file__).resolve().parents[1] / "src" / "web" / "samples" / "measure_sample.jpg"
INFO = json.loads((Path(__file__).resolve().parents[1] / "src" / "knowledge" / "mensuration.json").read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def client():
    with TestClient(api.app) as c:
        yield c


def test_coin_found_within_two_percent():
    found = measure.find_references(cv2.imread(str(SAMPLE)))
    coin = min(found["circles"], key=lambda c: abs(c["cx"] - 250) + abs(c["cy"] - 250))
    assert coin["r"] == pytest.approx(135, rel=0.02)
    # the coin's inner ring is not reported as a second coin
    assert not any(abs(c["cx"] - 250) < 60 and abs(c["cy"] - 250) < 60 and c is not coin for c in found["circles"])


@pytest.mark.parametrize("cls, w, h, label, expected, power", [
    ("circle", 40, 40, "Area", 1256.637, 2),
    ("square", 30, 30, "Perimeter", 120, 1),
    ("rectangle", 50, 20, "Area", 1000, 2),
    ("cylinder", 20, 40, "Volume", 12566.37, 3),              # r = 10, h = 40
    ("cone", 30, 40, "Slant height", 42.72, 1),               # r = 15, h = 40
    ("cone", 30, 40, "Curved surface area", 2013.2, 2),       # uses the slant height computed first
    ("hexagon", 40, 35, "Area", 1039.23, 2),                  # "≈" formula: exact part used
    ("ellipse", 60, 30, "Perimeter (Ramanujan approximation)", 145.33, 1),
])
def test_dimensions_and_formulas(cls, w, h, label, expected, power):
    dims, _ = measure._dims_from_box(cls, w, h, None)
    res = {r["label"]: r for r in measure._evaluate(INFO[cls], dims)}
    assert res[label]["value_mm"] == pytest.approx(expected, rel=1e-3) and res[label]["power"] == power


def test_depth_is_reported_as_assumption():
    d = Detection(12, "cuboid", 0.9, 0, 0, 500, 200)
    shape = measure.measure_detections([d], 0.1, INFO)[0]
    assert "depth_assumed" in shape["assumptions"]
    shape = measure.measure_detections([d], 0.1, INFO, depth_mm=30)[0]
    assert "depth_given" in shape["assumptions"] and shape["dims_mm"]["b"] == 30
    with pytest.raises(Exception) as e:
        measure.measure_detections([d], 0, INFO)
    assert e.value.error_code == "SCALE_REQUIRED"


def test_api_flow_on_sample(client):
    assert client.get(f"{P}/measure/presets").json()["data"]["coin_10"]["mm"] == 27
    with open(SAMPLE, "rb") as fh:
        refs = client.post(f"{P}/measure/references", files={"file": ("s.jpg", fh, "image/jpeg")}).json()
    coin = min(refs["data"]["circles"], key=lambda c: abs(c["cx"] - 250) + abs(c["cy"] - 250))
    mm_per_px = 27 / (2 * coin["r"])
    with open(SAMPLE, "rb") as fh:
        body = client.post(f"{P}/measure/shapes", files={"file": ("s.jpg", fh, "image/jpeg")},
                           data={"mm_per_px": str(mm_per_px)}).json()
    assert body["success"]
    shapes = {s["class_name"]: s for s in body["data"]["shapes"]}
    assert {"triangle", "circle", "rectangle"} <= shapes.keys()
    # detector boxes are a little loose; real sizes within 6 %
    assert shapes["rectangle"]["width_mm"] == pytest.approx(80, rel=0.06)
    assert shapes["circle"]["dims_mm"]["d"] == pytest.approx(60, rel=0.06)
    assert shapes["triangle"]["height_mm"] == pytest.approx(50, rel=0.06)


def test_api_errors_and_page(client):
    with open(SAMPLE, "rb") as fh:
        r = client.post(f"{P}/measure/shapes", files={"file": ("s.jpg", fh, "image/jpeg")}, data={"mm_per_px": "0"})
    assert r.status_code in (400, 422)
    assert_error(client.post(f"{P}/measure/references", files={"file": ("x.txt", b"hello", "text/plain")}), 400,
                 "UNSUPPORTED_IMAGE_TYPE")
    page = client.get("/measure")
    assert page.status_code == 200 and "Measure" in page.text and client.get("/web/samples/measure_sample.jpg").status_code == 200
    for p in ("/", "/formulas", "/elements", "/converter", "/graph"):
        assert 'href="/measure"' in client.get(p).text


def test_physics_lab_page(client):
    page = client.get("/physics")
    assert page.status_code == 200 and "Physics Lab" in page.text and "/web/physics.js" in page.text
    js = client.get("/web/physics.js").text
    for sim in ("projectile", "pendulum", "spring", "collision", "lens", "circuit"):
        assert f'id: "{sim}"' in js
    for p in ("/", "/measure", "/formulas", "/elements", "/converter", "/graph"):
        assert 'href="/physics"' in client.get(p).text
