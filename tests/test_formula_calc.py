"""Formula calculator (src/formula_calc.py + /api/v1/formulas/calc/*) and the unit converter page."""

from __future__ import annotations

import math

import pytest
from fastapi.testclient import TestClient

from src import api, formula_calc as fc
from src.formula_calc import CalcError
from tests.test_api import assert_error

P = "/api/v1"


@pytest.fixture(scope="module")
def client():
    with TestClient(api.app) as c:
        yield c


def val(res, i=0):
    return res["solutions"][i]["value"]


# ------------------------------------------------------------------ parsing
@pytest.mark.parametrize("text, expected", [
    ("v = u + at", {"v", "u", "a", "t"}),
    ("s = ut + ½at²", {"s", "u", "a", "t"}),
    ("v² = u² + 2as", {"v", "u", "a", "s"}),                     # "as" is a Python keyword
    ("KE = ½mv² = p²/2m", {"KE_", "m", "v"}),                     # KE stays one quantity
    ("H = u² sin²θ / 2g", {"H", "u", "theta", "g"}),
    ("C = 4πε₀R", {"C", "epsilon_0", "R"}),                       # Greek letter with subscript
    ("Q = mcΔT", {"Q", "m", "c", "Delta_T"}),                     # ΔT is one quantity
    ("I = nAev_d", None),                                         # words-free but still parses
])
def test_parse_variables(text, expected):
    lhs, rhs, _ = fc.parse_formula(text)[0]
    names = {s.name for s in (lhs - rhs).free_symbols}
    if expected is not None:
        assert names == expected


def test_denominator_convention():
    # p²/2m means p²/(2m), as written in textbooks
    lhs, rhs, _ = fc.parse_formula("E = p²/2m")[0]
    assert float(rhs.subs({"p": 4, "m": 2})) == pytest.approx(4.0)


@pytest.mark.parametrize("text", [
    "Profit = SP − CP",                  # words
    "sin²θ + cos²θ = 1",                 # identity with one variable
    "(a + b)² = a² + 2ab + b²",          # identity
    "dv/dx = 2x",                        # derivative
    "g = 9.8 m/s²",                      # value with a unit
    "P(E) = n(E)/n(S)",                  # function notation
    "a + b > c",                         # inequality
    "राशि = P + SI",                     # Hindi text
])
def test_not_calculable(text):
    with pytest.raises(CalcError):
        fc.parse_formula(text)


@pytest.mark.parametrize("evil", ["__import__('os').system('x') = 1", "x = ().__class__", "x = y.real",
                                  "lambda: 1 = x", "x = 9^9^9^9", "x = 99999999999999999999 * y"])
def test_rejects_code_and_huge_numbers(evil):
    with pytest.raises(CalcError):
        fc.parse_formula(evil)


# ------------------------------------------------------------------ solving
def test_solve_lhs_and_rearranged():
    r = fc.solve("v = u + at", "t", {"v": 20, "u": 5, "a": 3})
    assert val(r) == pytest.approx(5)
    labels = [s["label"] for s in r["steps"]]
    assert labels[0] == "Formula" and labels[-1] == "Result" and any("Rearranged" in x for x in labels)
    r = fc.solve("s = ut + ½at²", "s", {"u": 0, "a": 2, "t": 10}, unit="m")
    assert val(r) == pytest.approx(100) and r["unit"] == "m"


def test_positive_root_first():
    r = fc.solve("V = (1/3) πr²h", "r", {"V": 100, "h": 5})
    assert val(r) == pytest.approx(math.sqrt(300 / (5 * math.pi)))
    assert val(r, 1) < 0


def test_compound_interest_years():
    r = fc.solve("A = P(1 + R/100)ⁿ", "n", {"A": 2000, "P": 1000, "R": 10})
    assert val(r) == pytest.approx(math.log(2) / math.log(1.1))


def test_angles_in_degrees():
    r = fc.solve("R = u² sin 2θ / g", "R", {"u": 20, "theta": 45, "g": 9.8}, angle_unit="deg")
    assert val(r) == pytest.approx(400 / 9.8)
    r = fc.solve("a² = b² + c² − 2bc cos A", "A", {"a": 7, "b": 5, "c": 8}, angle_unit="deg")
    assert r["angle"] and r["solutions"][0]["degrees"] == pytest.approx(60)


def test_hindi_step_labels():
    r = fc.solve("v = u + at", "v", {"u": 1, "a": 2, "t": 3}, lang="hi")
    assert r["steps"][0]["label"] == "सूत्र" and r["steps"][-1]["label"] == "परिणाम"


def test_solve_errors():
    with pytest.raises(Exception) as e:
        fc.solve("v = u + at", "t", {"v": 20})
    assert getattr(e.value, "error_code", "") == "MISSING_VALUES"
    with pytest.raises(Exception) as e:
        fc.solve("v = u + at", "q", {})
    assert getattr(e.value, "error_code", "") == "UNKNOWN_VARIABLE"
    with pytest.raises(CalcError) as e:
        fc.solve("v = √(2gh)", "v", {"g": 9.8, "h": -5})
    assert e.value.error_code == "NO_REAL_SOLUTION"


def test_calculable_index_covers_key_formulas():
    idx = fc.calculable_index()
    total = sum(len(v) for c in idx.values() for v in c.values())
    assert total > 300
    assert "physics_units" not in idx                      # unit identities are not calculations
    assert idx["mensuration"]["cone"] and idx["physics_formulas"]


# ------------------------------------------------------------------ API
def test_calc_api_flow(client):
    body = client.get(f"{P}/formulas/calc/index").json()
    assert body["success"] and "physics_formulas" in body["data"]
    d = client.post(f"{P}/formulas/calc/describe",
                    json={"category": "mensuration", "section": "cone", "index": 0, "lang": "hi"}).json()
    assert d["success"]
    labels = {v["display"]: v["label"] for v in d["data"]["equations"][0]["variables"]}
    assert labels["r"] == "आधार की त्रिज्या"                 # shape's own variable names, translated
    s = client.post(f"{P}/formulas/calc/solve", json={"category": "mensuration", "section": "cone", "index": 0,
                                                     "solve_for": "V", "values": {"r": 3, "h": 4}}).json()
    assert s["success"] and s["data"]["solutions"][0]["value"] == pytest.approx(12 * math.pi)
    s = client.post(f"{P}/formulas/calc/solve", json={"formula": "F = ma", "solve_for": "a",
                                                     "values": {"F": 10, "m": 2}}).json()
    assert s["success"] and s["data"]["solutions"][0]["value"] == pytest.approx(5)


def test_calc_api_errors(client):
    assert_error(client.post(f"{P}/formulas/calc/describe", json={}), 400, "FORMULA_REQUIRED")
    assert_error(client.post(f"{P}/formulas/calc/describe", json={"formula": "Profit = SP − CP"}), 422,
                 "FORMULA_NOT_CALCULABLE")
    assert_error(client.post(f"{P}/formulas/calc/solve", json={"formula": "F = ma", "solve_for": "a", "values": {"F": 1}}),
                 400, "MISSING_VALUES")
    assert_error(client.post(f"{P}/formulas/calc/describe", json={"category": "mensuration", "section": "cone",
                                                                  "index": 999}), 404, "FORMULA_NOT_FOUND")


def test_converter_page_and_unit_data(client):
    r = client.get("/converter")
    assert r.status_code == 200 and "Unit Converter" in r.text and "/web/units.js" in r.text
    js = client.get("/web/units.js")
    assert js.status_code == 200 and "UNIT_DATA" in js.text and "लाख" in js.text
    for page in ("/", "/formulas", "/graph"):
        assert 'href="/converter"' in client.get(page).text


def test_home_page_formula_cards(client):
    page = client.get("/").text
    assert 'id="formulaCards"' in page and "/web/formula_cards.js" in page
    js = client.get("/web/formula_cards.js")
    assert js.status_code == 200 and "/formulas?full=true" in js.text and "/formulas?calc=" in js.text
    assert "?calc=" in client.get("/formulas").text          # library opens the calculator from a card link


def test_home_page_lab_design(client):
    page = client.get("/").text
    for part in ("hero", "data-count=\"formulas\"", "/web/sci_bg.js", "/web/home_fx.js", "prefers-reduced-motion"):
        assert part in page
    for js in ("/web/sci_bg.js", "/web/home_fx.js"):
        assert client.get(js).status_code == 200
