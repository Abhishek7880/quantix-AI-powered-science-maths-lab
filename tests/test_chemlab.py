"""Chemistry Lab (/chemlab): page, menu, and the reaction engine checked against school chemistry (needs Node)."""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from src import api

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture(scope="module")
def client():
    with TestClient(api.app) as c:
        yield c


def test_chemlab_page_and_scripts(client):
    page = client.get("/chemlab")
    assert page.status_code == 200 and "Chemistry Lab" in page.text
    for js in ("chem_engine.js", "chem_ui.js", "vendor/three.min.js"):
        assert f"/web/{js}" in page.text and client.get(f"/web/{js}").status_code == 200
    assert len(client.get("/api/v1/elements").json()["data"]["elements"]) == 118   # the shelf's element data


def test_chemlab_tab_in_every_menu(client):
    for p in ("/", "/measure", "/formulas", "/elements", "/chemlab", "/physics", "/circuit", "/plc", "/handwriting", "/converter", "/graph"):
        assert 'href="/chemlab"' in client.get(p).text, p
    assert '"/chemlab", "Chem Lab"' in client.get("/web/site.js").text
    from tools import build_seo_pages
    assert "/chemlab" in api.SITEMAP_PAGES and "/chemlab" in build_seo_pages.MAIN_PAGES


@pytest.mark.skipif(not shutil.which("node"), reason="Node.js not installed")
def test_reaction_engine():
    r = subprocess.run(["node", str(ROOT / "tests" / "chem_engine_check.js")], capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=300)
    assert r.returncode == 0, r.stdout + r.stderr
    assert "ALL PASSED" in r.stdout
