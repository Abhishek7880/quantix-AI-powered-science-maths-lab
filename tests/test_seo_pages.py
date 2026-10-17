"""Learn pages (tools/build_seo_pages.py): naming, number formatting and the page shell search engines read."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
import build_seo_pages as seo  # noqa: E402


def test_slugs():
    assert seo.slug("Cuboid (Rectangular Box)") == "cuboid-rectangular-box"
    assert seo.slug("Product ↔ sum formulas") == "product-sum-formulas"
    assert seo.slug("km²") == "km2"
    assert seo.slug("Profit, loss & discount") == "profit-loss-and-discount"


def test_number_format():
    assert seo.fmt(0.621371192) == "0.621371"
    assert seo.fmt(1609.344) == "1,609.34"
    assert seo.fmt(100000) == "100,000"
    assert seo.fmt(9.4607e15) == "9.4607 × 10¹⁵"
    assert seo.fmt(1e-10) == "1 × 10⁻¹⁰"


def test_page_shell_has_what_search_engines_need():
    html = seo.page("hi", "/hi/learn/elements/oxygen/", "ऑक्सीजन (O)", "विवरण", "<h1>ऑक्सीजन</h1>",
                    [("होम", "/"), ("तत्व", "/hi/learn/elements/"), ("ऑक्सीजन", "/hi/learn/elements/oxygen/")],
                    alt="/learn/elements/oxygen/")
    assert '<html lang="hi">' in html and '<meta name="description" content="विवरण">' in html
    assert f'<link rel="canonical" href="{seo.SITE}/hi/learn/elements/oxygen/">' in html
    assert f'hreflang="en" href="{seo.SITE}/learn/elements/oxygen/"' in html and 'hreflang="x-default"' in html
    assert '"@type": "BreadcrumbList"' in html and '/web/learn.css' in html and '/web/site.js' in html


def test_temperature_formulas():
    assert seo.TEMPS[("C", "F")][0](100) == 212
    assert abs(seo.TEMPS[("F", "C")][0](98.6) - 37) < 1e-9
    assert seo.TEMPS[("C", "K")][0](0) == 273.15


def test_formula_titles_match_what_people_search():
    assert seo.formula_title("en", "mensuration", "Volume", "Sphere") == "Volume of a Sphere"
    assert seo.formula_title("en", "mensuration", "Area", "Equilateral Triangle") == "Area of an Equilateral Triangle"
    assert seo.formula_title("hi", "mensuration", "आयतन", "गोला") == "गोले का आयतन"
    assert seo.formula_title("hi", "mensuration", "परिधि", "वृत्त") == "वृत्त की परिधि"
    assert seo.formula_title("en", "physics_formulas", "Kinetic energy", "Work, energy & power") == "Kinetic energy"
    assert seo.formula_title("en", "physics_formulas", "Momentum", "Laws of motion") == "Momentum (Laws of motion)"


def test_worked_example_uses_the_real_calculator():
    ex = seo.worked_example("V = (4/3) πr³", "mensuration", {"r": "radius"}, "en", None)
    assert ex["target"] == "V" and ex["values"] == {"r": 7}
    assert abs(ex["answer"]["value"] - 4 / 3 * 3.141592653589793 * 343) < 1e-6
    assert [s["label"] for s in ex["solve"]["steps"]][-1] == "Result"
