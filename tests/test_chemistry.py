"""Periodic table data, molar-mass calculator and their API / page."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from src import api, chemistry
from tests.test_api import assert_error

P = "/api/v1"


@pytest.fixture(scope="module")
def client():
    with TestClient(api.app) as c:
        yield c


def test_all_118_elements_are_complete_and_placed_once():
    els = chemistry.elements()
    assert [e["z"] for e in els] == list(range(1, 119))
    cats = set(chemistry.categories())
    seen = set()
    for e in els:
        assert e["sym"] and e["name"] and e["name_hi"] and e["uses"] and e["uses_hi"], e["sym"]
        assert e["cat"] in cats and e["block"] in "spdf"
        assert sum(e["shells"]) == e["z"], e["sym"]                     # electrons = protons
        assert 1 <= e["col"] <= 18 and 1 <= e["row"] <= 10
        assert (e["row"], e["col"]) not in seen, e["sym"]
        seen.add((e["row"], e["col"]))
        if e["mp"] is not None and e["bp"] is not None:
            assert e["mp"] < e["bp"], e["sym"]


@pytest.mark.parametrize("sym, mass, cat, config_start", [
    ("H", 1.008, "nonmetal", "1s"), ("Na", 22.98977, "alkali", "[Ne]"), ("Fe", 55.845, "transition", "[Ar]"),
    ("Cl", 35.45, "halogen", "[Ne]"), ("Au", 196.96657, "transition", "[Xe]"), ("U", 238.02891, "actinide", "[Rn]"),
])
def test_known_values(sym, mass, cat, config_start):
    e = chemistry.get_element(sym)
    assert e["mass"] == pytest.approx(mass, abs=1e-3) and e["cat"] == cat and e["config"].startswith(config_start)


def test_states_at_room_temperature():
    # liquids at 25 °C (298 K): bromine and mercury; gases: H, N, O, F, Cl and the noble gases
    def state(e, t=298.15):
        if e["sublimes"]:
            return "solid" if t < e["bp"] else "gas"
        if e["mp"] is None:
            return "liquid" if t < e["bp"] else "gas"
        return "solid" if t < e["mp"] else ("liquid" if t < e["bp"] else "gas")
    known = [e for e in chemistry.elements() if e["bp"] is not None]
    liquids = {e["sym"] for e in known if state(e) == "liquid"}
    gases = {e["sym"] for e in known if state(e) == "gas"}
    assert {"Br", "Hg"} <= liquids and {"Fe", "Na", "Ga"}.isdisjoint(liquids)
    assert gases == {"H", "N", "O", "F", "Cl", "He", "Ne", "Ar", "Kr", "Xe", "Rn"}


def test_lookup_by_number_symbol_and_name():
    assert chemistry.get_element("26")["sym"] == "Fe"
    assert chemistry.get_element("fe")["z"] == 26
    assert chemistry.get_element("Iron")["z"] == 26
    with pytest.raises(Exception) as e:
        chemistry.get_element("unobtainium")
    assert e.value.error_code == "ELEMENT_NOT_FOUND"


@pytest.mark.parametrize("formula, expected, atoms", [
    ("H2O", 18.015, 3), ("H2SO4", 98.072, 7), ("Ca(OH)2", 74.092, 5), ("CuSO4·5H2O", 249.677, 21),
    ("CuSO4.5H2O", 249.677, 21), ("K4[Fe(CN)6]", 368.346, 17), ("Al2(SO4)3", 342.131, 17), ("C6H12O6", 180.156, 24),
    ("2H2O", 36.03, 6),
])
def test_molar_mass(formula, expected, atoms):
    r = chemistry.molar_mass(formula)
    assert r["molar_mass"] == pytest.approx(expected, abs=0.01) and r["atoms"] == atoms
    assert sum(b["percent"] for b in r["breakdown"]) == pytest.approx(100, abs=0.01)


@pytest.mark.parametrize("bad, code", [("Xx2", "UNKNOWN_ELEMENT"), ("H2O)", "FORMULA_INVALID"), ("(H2O", "FORMULA_INVALID"),
                                       ("h2o", "FORMULA_INVALID"), ("", "FORMULA_INVALID"), ("H0", "FORMULA_INVALID")])
def test_molar_mass_errors(bad, code):
    with pytest.raises(Exception) as e:
        chemistry.molar_mass(bad)
    assert e.value.error_code == code


def test_api_and_page(client):
    body = client.get(f"{P}/elements").json()
    assert body["success"] and len(body["data"]["elements"]) == 118 and "noble" in body["data"]["categories"]
    assert client.get(f"{P}/elements/Au").json()["data"]["z"] == 79
    assert_error(client.get(f"{P}/elements/xyz"), 404, "ELEMENT_NOT_FOUND")
    r = client.get(f"{P}/chemistry/molar-mass", params={"formula": "NaCl"}).json()
    assert r["success"] and r["data"]["molar_mass"] == pytest.approx(58.44, abs=0.01)
    assert_error(client.get(f"{P}/chemistry/molar-mass", params={"formula": "Qq"}), 400, "UNKNOWN_ELEMENT")
    page = client.get("/elements")
    assert page.status_code == 200 and "Periodic Table" in page.text and page.headers["cache-control"] == "no-cache"
    for p in ("/", "/formulas", "/converter", "/graph"):
        assert 'href="/elements"' in client.get(p).text
