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
