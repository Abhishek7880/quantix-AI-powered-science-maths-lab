"""Circuit Lab (/circuit): page, menu, and the JavaScript engine checked against textbook answers (needs Node)."""

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


def test_circuit_page_and_scripts(client):
    page = client.get("/circuit")
    assert page.status_code == 200 and "Circuit Lab" in page.text
    for js in ("circuit_sim.js", "circuit_examples.js", "circuit_ui.js"):
        assert f"/web/{js}" in page.text and client.get(f"/web/{js}").status_code == 200
    assert client.get("/web/circuit_3d.js").status_code == 200      # loaded on demand by the 3D button
    sim = client.get("/web/circuit_sim.js").text
    for part in ("resistor", "capacitor", "inductor", "diode", "led", "zener", "npn", "pnp", "nmos", "opamp", "timer555",
                 "transformer", "relay", "fuse", "motor", "seg7", "voltmeter", "ammeter", "ldr", "ntc"):
        assert f"    {part}: {{" in sim or f"    {part}(" in sim, part


def test_circuits_tab_in_every_menu(client):
    for p in ("/", "/measure", "/formulas", "/elements", "/physics", "/circuit", "/handwriting", "/converter", "/graph"):
        assert 'href="/circuit"' in client.get(p).text, p
    assert '"/circuit", "Circuits"' in client.get("/web/site.js").text      # pages with a script-built menu
    from tools import build_seo_pages
    assert "/circuit" in api.SITEMAP_PAGES and "/circuit" in build_seo_pages.MAIN_PAGES   # both sitemaps list it


@pytest.mark.skipif(not shutil.which("node"), reason="Node.js not installed")
def test_engine_matches_textbook_answers():
    r = subprocess.run(["node", str(ROOT / "tests" / "circuit_sim_check.js")], capture_output=True, text=True, timeout=300)
    assert r.returncode == 0, r.stdout + r.stderr
    assert "ALL PASSED" in r.stdout
