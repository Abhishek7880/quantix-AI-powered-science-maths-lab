"""Formula library data, sketches, PDF export and API."""

import json

import pytest
from fastapi.testclient import TestClient

from src import api, formulas
from src.config import PROJECT_ROOT
from src.sketches import DRAW, render_sketch
from tests.test_api import assert_error

P = api.API_PREFIX


@pytest.fixture(scope="module")
def client():
    with TestClient(api.app) as c:
        yield c


def test_library_is_complete_and_well_formed():
    cats = formulas.load_library()
    ids = [c["id"] for c in cats]
    for required in ("arithmetic", "algebra", "trigonometry", "geometry", "coordinate", "calculus",
                     "vectors_stats", "mensuration", "physics_units", "physics_formulas"):
        assert required in ids
    assert len(ids) == len(set(ids))
    total = 0
    for c in cats:
        assert c["title"] and c["sections"], c["id"]
        sec_ids = [s["id"] for s in c["sections"]]
        assert len(sec_ids) == len(set(sec_ids)), c["id"]
        for s in c["sections"]:
            assert s["title"] and s["items"], (c["id"], s["title"])
            for it in s["items"]:
                assert 2 <= len(it) <= 3 and it[0].strip() and it[1].strip(), (c["id"], s["title"], it)
                total += 1
    assert total > 900


def test_every_mensuration_shape_has_a_sketch():
    shapes = json.loads((PROJECT_ROOT / "src" / "knowledge" / "mensuration.json").read_text(encoding="utf-8"))
    extra = json.loads((PROJECT_ROOT / "src" / "knowledge" / "formulas" / "mensuration_extra.json").read_text(encoding="utf-8"))
    for key in list(shapes) + list(extra):
        assert key in DRAW, key
    men = formulas.get_category("mensuration")
    assert sum(1 for s in men["sections"] if s.get("sketch")) == len(shapes) + len(extra)


@pytest.mark.parametrize("shape", sorted(DRAW))
def test_sketch_renders(shape):
    svg = render_sketch(shape, "svg")
    png = render_sketch(shape, "png")
    assert svg.lstrip().startswith(b"<?xml") and b"<svg" in svg
    assert png[:8] == b"\x89PNG\r\n\x1a\n"


def test_pdf_category_section_and_all():
    data, name = formulas.build_pdf("trigonometry")
    assert data[:5] == b"%PDF-" and name == "trigonometry.pdf"
    data, name = formulas.build_pdf("mensuration", "cone")
    assert data[:5] == b"%PDF-" and name == "mensuration_cone.pdf" and b"/Image" in data   # sketch embedded
    data, name = formulas.build_pdf("all")
    assert data[:5] == b"%PDF-" and len(data) > 200_000 and name == "formula_library.pdf"


def test_formulas_api(client):
    r = client.get(f"{P}/formulas")
    body = r.json()
    assert r.status_code == 200 and body["success"] and len(body["data"]) == 10
    full = client.get(f"{P}/formulas", params={"full": True}).json()["data"]
    assert all("sections" in c and isinstance(c["sections"], list) for c in full)
    one = client.get(f"{P}/formulas/calculus").json()["data"]
    assert one["id"] == "calculus"
    assert_error(client.get(f"{P}/formulas/astrology"), 404, "CATEGORY_NOT_FOUND")


def test_formulas_sketch_and_pdf_endpoints(client):
    r = client.get(f"{P}/formulas/sketch/cone.svg")
    assert r.status_code == 200 and r.headers["content-type"].startswith("image/svg+xml")
    assert_error(client.get(f"{P}/formulas/sketch/dodecahedron.svg"), 404, "SKETCH_NOT_FOUND")
    r = client.get(f"{P}/formulas/pdf", params={"category": "mensuration", "section": "cylinder"})
    assert r.status_code == 200 and r.headers["content-type"] == "application/pdf"
    assert 'filename="mensuration_cylinder.pdf"' in r.headers["content-disposition"]
    assert_error(client.get(f"{P}/formulas/pdf", params={"category": "mensuration", "section": "nope"}), 404, "SECTION_NOT_FOUND")


def test_formulas_page_served(client):
    r = client.get("/formulas")
    assert r.status_code == 200 and "Formula Library" in r.text


# ------------------------------------------------------------------ Hindi
def test_hindi_translations_cover_every_worded_string():
    """Every name / note / title containing real words has a Hindi entry (pure maths may stay English)."""
    import re
    t = formulas.translations("hi")
    missing = set()
    for c in formulas.load_library("en"):
        strings = [c["title"], c.get("description", "")]
        for s in c["sections"]:
            strings += [s["title"], s.get("note", "")] + list(s.get("variables", {}).values())
            strings += [x for it in s["items"] for x in (it[0], it[2] if len(it) > 2 else "")]
        for s in strings:
            # lower-case words of 4+ letters are prose; symbols / function names (sin, log, KE, TSA) are not
            prose = re.sub(r"\b(cosec|sinh|cosh|tanh)\b", "", s or "")
            if re.search(r"\b[a-z]{4,}\b", prose) and s not in t:
                missing.add(s)
    assert not missing, sorted(missing)


def test_hindi_library_and_pdf():
    hi = {c["id"]: c for c in formulas.load_library("hi")}
    en = {c["id"]: c for c in formulas.load_library("en")}
    assert hi.keys() == en.keys()
    assert hi["trigonometry"]["title"] == "त्रिकोणमिति" and hi["mensuration"]["sections"][0]["title"] == "वर्ग"
    for cid in en:   # same structure: same sections and the same number of formulas
        assert [len(s["items"]) for s in hi[cid]["sections"]] == [len(s["items"]) for s in en[cid]["sections"]]
    data, name = formulas.build_pdf("mensuration", "cone", "hi")
    assert data[:5] == b"%PDF-" and name == "mensuration_cone_hi.pdf" and b"NotoSansDevanagari" in data
    data, name = formulas.build_pdf("physics_units", lang="hi")
    assert data[:5] == b"%PDF-" and name == "physics_units_hi.pdf"


def test_formulas_api_language(client):
    body = client.get(f"{P}/formulas", params={"lang": "hi"}).json()
    assert body["success"] and any(c["title"] == "कलन" for c in body["data"])
    one = client.get(f"{P}/formulas/calculus", params={"lang": "hi"}).json()["data"]
    assert one["title"] == "कलन"
    r = client.get(f"{P}/formulas/pdf", params={"category": "algebra", "lang": "hi"})
    assert r.status_code == 200 and 'filename="algebra_hi.pdf"' in r.headers["content-disposition"]
    assert_error(client.get(f"{P}/formulas", params={"lang": "fr"}), 400, "UNSUPPORTED_LANGUAGE")
    assert_error(client.get(f"{P}/formulas/pdf", params={"lang": "xx"}), 400, "UNSUPPORTED_LANGUAGE")
