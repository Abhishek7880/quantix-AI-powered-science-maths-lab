"""Equation Solver: layout (powers, fractions), solving, API and — when the model is trained — recognition."""

from __future__ import annotations

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from src import api, handwriting as hw
from tests.test_api import assert_error

P = "/api/v1"
MODEL = hw.MODEL_FILE.is_file()


@pytest.fixture(scope="module")
def client():
    with TestClient(api.app) as c:
        yield c


def box(cls, x1, y1, x2, y2):
    return {"box": [x1, y1, x2, y2], "cls": cls}


# ------------------------------------------------------------------ layout
def test_layout_power_and_operators():
    # x², then "+ 1 = 5"; the small raised "2" is a power
    syms = [box("x", 0, 40, 30, 80), box("2", 32, 20, 46, 45), box("plus", 55, 50, 80, 75), box("1", 90, 40, 105, 80),
            box("eq", 115, 52, 140, 70), box("5", 150, 40, 175, 80)]
    assert hw.relayout(syms, 40)["text"] == "x^(2)+1=5"


def test_layout_fraction():
    # 3 over 4 (a bar with symbols above and below), then "= x"
    syms = [box("3", 10, 0, 30, 35), box("minus", 0, 42, 40, 46), box("4", 10, 55, 30, 90), box("eq", 50, 38, 75, 52),
            box("x", 85, 25, 110, 60)]
    assert hw.relayout(syms, 35)["text"] == "(3)/(4)=x"


def test_pretty():
    assert hw.pretty("x^(2)-4*x+3") == "x²−4×x+3"


# ------------------------------------------------------------------ solving
@pytest.mark.parametrize("text, kind, check", [
    ("2x+3=7", "equation", lambda r: r["solutions"] == [2.0]),
    ("x^2-5x+6=0", "equation", lambda r: sorted(r["solutions"]) == [2.0, 3.0]),
    ("2(x-1)=x+5", "equation", lambda r: r["solutions"] == [7.0]),
    ("x^2+1=0", "equation", lambda r: r["solutions"] == [] and sorted(r["complex_solutions"]) == ["-i", "i"]),
    ("(3+4)*2", "value", lambda r: r["value"] == 14),
    ("3/4+1/4", "value", lambda r: r["value"] == 1),
    ("y=x^2-4x+3", "relation", lambda r: "plot" in r),
    ("x^2+y^2=25", "relation", lambda r: len(r["plot"]["series"]) == 2),
])
def test_solve(text, kind, check):
    r = hw.solve_text(text)
    assert r["kind"] == kind and check(r)


def test_quadratic_working_has_discriminant_and_factors():
    labels = [s["label"] for s in hw.solve_text("x^2-5x+6=0")["steps"]]
    assert {"Discriminant", "Factorise", "Quadratic formula", "Check"} <= set(labels)
    assert hw.solve_text("x^2-5x+6=0", "hi")["steps"][0]["label"] == "समीकरण"


@pytest.mark.parametrize("bad, code", [("", "EMPTY_EXPRESSION"), ("x=1=2", "TOO_MANY_EQUALS"), ("2x+=", "EXPRESSION_INVALID")])
def test_solve_errors(bad, code):
    with pytest.raises(Exception) as e:
        hw.solve_text(bad)
    assert e.value.error_code == code


def test_api_solve_relayout_and_page(client):
    r = client.post(f"{P}/handwriting/solve", json={"text": "x^2-5x+6=0"}).json()
    assert r["success"] and sorted(r["data"]["solutions"]) == [2.0, 3.0]
    assert_error(client.post(f"{P}/handwriting/solve", json={"text": ""}), 400, "EMPTY_EXPRESSION")
    r = client.post(f"{P}/handwriting/relayout", json={"symbols": [box("2", 0, 0, 20, 40), box("x", 22, 5, 50, 40)], "line_height": 40}).json()
    assert r["data"]["text"] == "2x"
    page = client.get("/handwriting")
    assert page.status_code == 200 and "Equation Solver" in page.text
    for p in ("/", "/measure", "/formulas", "/elements", "/physics", "/converter", "/graph"):
        assert 'href="/handwriting"' in client.get(p).text
    assert "URLSearchParams(location.search).getAll(\"e\")" in client.get("/web/graph.js").text


# ------------------------------------------------------------------ recognition (needs the trained model)
def render(text: str) -> np.ndarray:
    """Draw an equation in OpenCV's handwriting-style Hershey script font; "^" makes the next char a small power."""
    img = np.full((200, 60 + 70 * len(text), 3), 255, np.uint8)
    x, i = 30, 0
    while i < len(text):
        ch = text[i]
        if ch == "^":
            cv2.putText(img, text[i + 1], (x - 6, 85), cv2.FONT_HERSHEY_SCRIPT_SIMPLEX, 1.6, (0, 0, 0), 4, cv2.LINE_AA)
            x += 40
            i += 2
            continue
        cv2.putText(img, ch, (x, 140), cv2.FONT_HERSHEY_SCRIPT_SIMPLEX, 2.6, (0, 0, 0), 5, cv2.LINE_AA)
        x += 70
        i += 1
    return img


@pytest.mark.skipif(not MODEL, reason="handwriting model not trained (python tools/train_handwriting.py)")
def test_recognize_simple_equations():
    hits = 0
    cases = ["2x+3=7", "x^2=9", "4+5=9", "3x=12"]
    for c in cases:
        r = hw.recognize(render(c))
        assert r["symbols"] and r["text"]
        hits += r["text"] == c.replace("^2", "^(2)")
    assert hits >= len(cases) - 1, "the classifier should read clean script digits and operators"


def test_recognize_rejects_blank(client):
    blank = cv2.imencode(".png", np.full((100, 300, 3), 255, np.uint8))[1].tobytes()
    assert_error(client.post(f"{P}/handwriting/recognize", files={"file": ("b.png", blank, "image/png")}), 400, "NO_INK")
