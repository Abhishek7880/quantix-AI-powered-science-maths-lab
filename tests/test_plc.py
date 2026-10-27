"""PLC Lab (/plc): page, menu, and the ladder engine checked against expected machine behaviour (needs Node)."""

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


def test_plc_page_and_scripts(client):
    page = client.get("/plc")
    assert page.status_code == 200 and "PLC Lab" in page.text
    for js in ("plc_engine.js", "plc_ui.js"):
        assert f"/web/{js}" in page.text and client.get(f"/web/{js}").status_code == 200
    engine = client.get("/web/plc_engine.js").text
    for ex in ("motor", "traffic", "tank", "conveyor", "flasher", "stardelta"):
        assert f'id: "{ex}"' in engine, ex


def test_plc_tab_in_every_menu(client):
    for p in ("/", "/measure", "/formulas", "/elements", "/physics", "/circuit", "/plc", "/handwriting", "/converter", "/graph"):
        assert 'href="/plc"' in client.get(p).text, p
    assert '"/plc", "PLC"' in client.get("/web/site.js").text
    from tools import build_seo_pages
    assert "/plc" in api.SITEMAP_PAGES and "/plc" in build_seo_pages.MAIN_PAGES


@pytest.mark.skipif(not shutil.which("node"), reason="Node.js not installed")
def test_ladder_engine():
    r = subprocess.run(["node", str(ROOT / "tests" / "plc_engine_check.js")], capture_output=True, text=True, timeout=120)
    assert r.returncode == 0, r.stdout + r.stderr
    assert "ALL PASSED" in r.stdout
