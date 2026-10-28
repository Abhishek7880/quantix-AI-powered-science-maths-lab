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


# ------------------------------------------------------------------ outlines: 2D shape or 3D solid
def _canvas():
    import numpy as np
    return np.full((400, 400, 3), 225, np.uint8)


def test_flat_ellipse_and_pentagon_are_2d():
    import numpy as np
    from src import shape_geometry as sg
    img = _canvas()
    cv2.ellipse(img, ((200, 200), (220, 120), 30), (40, 90, 200), -1)
    m = (np.abs(img.astype(int) - 225).sum(2) > 30).astype(np.uint8)
    a = sg.analyse(img, m)
    assert (a["class_name"], a["dimension"]) == ("ellipse", "2D")
    assert a["dims_px"]["a"] == pytest.approx(110, rel=0.04) and a["dims_px"]["b"] == pytest.approx(60, rel=0.04)
    img = _canvas()
    R = 90
    pts = np.array([[200 + R * np.cos(np.pi / 2 + k * 2 * np.pi / 5 + 0.3), 200 + R * np.sin(np.pi / 2 + k * 2 * np.pi / 5 + 0.3)] for k in range(5)], np.int32)
    cv2.fillPoly(img, [pts], (30, 160, 60))
    m = (np.abs(img.astype(int) - 225).sum(2) > 30).astype(np.uint8)
    a = sg.analyse(img, m, "pentagon")
    assert (a["class_name"], a["dimension"]) == ("pentagon", "2D")
    assert a["dims_px"]["a"] == pytest.approx(2 * R * np.sin(np.pi / 5), rel=0.05)


def test_shaded_ball_is_a_sphere_but_a_flat_disc_is_a_circle():
    import numpy as np
    from src import shape_geometry as sg
    img = _canvas()
    yy, xx = np.mgrid[:400, :400]
    d = np.hypot(xx - 200, yy - 200)
    lit = np.clip(255 - 1.6 * np.hypot(xx - 165, yy - 165), 30, 255)     # lit from the top left
    for ch in range(3):
        img[..., ch] = np.where(d <= 100, lit * (0.4, 0.6, 1.0)[ch], img[..., ch])
    m = (d <= 100).astype(np.uint8)
    a = sg.analyse(img, m, "sphere")
    assert (a["class_name"], a["dimension"]) == ("sphere", "3D") and a["dims_px"]["r"] == pytest.approx(100, rel=0.03)
    flat = _canvas()
    cv2.circle(flat, (200, 200), 100, (60, 60, 200), -1)
    a = sg.analyse(flat, m, "sphere")                   # a detector called the paper disc a ball
    assert (a["class_name"], a["dimension"]) == ("circle", "2D")


def test_reference_coin_is_not_measured(client):
    with open(SAMPLE, "rb") as fh:
        refs = client.post(f"{P}/measure/references", files={"file": ("s.jpg", fh, "image/jpeg")}).json()
    coin = min(refs["data"]["circles"], key=lambda c: abs(c["cx"] - 250) + abs(c["cy"] - 250))
    assert "score" in coin and coin["score"] >= 0.75
    with open(SAMPLE, "rb") as fh:
        body = client.post(f"{P}/measure/shapes", files={"file": ("s.jpg", fh, "image/jpeg")},
                           data={"mm_per_px": str(27 / (2 * coin["r"])), "ref_cx": str(coin["cx"]), "ref_cy": str(coin["cy"]), "ref_r": str(coin["r"])}).json()
    for s in body["data"]["shapes"]:
        cx, cy = (s["box"][0] + s["box"][2]) / 2, (s["box"][1] + s["box"][3]) / 2
        assert abs(cx - coin["cx"]) + abs(cy - coin["cy"]) > coin["r"] * 0.5
        assert s["dimension"] == "2D" and len(s["outline"]) >= 3


def test_unknown_object_falls_back_to_its_outline():
    """A thing no model knows (an inverter in a rack): traced from the middle of the frame, named by geometry."""
    import numpy as np
    from src import everyday
    rng = np.random.default_rng(1)
    img = (rng.normal(60, 18, (480, 600, 3))).clip(0, 255).astype(np.uint8)          # dark cluttered rack
    img[:, :40] = (40, 170, 210); img[:, 560:] = (40, 170, 210)                        # neighbours cut by the frame
    shade = np.linspace(150, 230, 300)[None, :, None]                                  # a lit, shaded yellow box
    img[90:430, 150:450] = (np.array([40, 190, 220]) * shade / 230).astype(np.uint8)
    cv2.rectangle(img, (230, 220), (420, 410), (200, 200, 200), -1)                    # a label on its front
    seen = {}
    r = everyday.outline_fallback(img, lambda d, i, stage, ordered=False: seen.update(d=d, i=i, stage=stage) or seen)
    assert r["stage"] == "outline" and r["i"][0]["object"] == "Unknown object"
    d = r["d"][0]
    assert d.class_name == "cuboid"
    assert d.x1 == pytest.approx(150, abs=12) and d.x2 == pytest.approx(450, abs=12)
    assert d.y2 - d.y1 == pytest.approx(340, rel=0.06)
