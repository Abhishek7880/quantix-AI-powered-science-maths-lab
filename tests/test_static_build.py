"""Quantix Lite (tools/build_static.py + deploy/static/static_api.js): naming rules both sides share, link rewriting,
and that the modules Pyodide loads in the browser need nothing beyond SymPy and the standard library."""

from __future__ import annotations

import ast
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
import build_static  # noqa: E402


@pytest.mark.parametrize("url, name", [
    ("/api/v1/formulas", "formulas.json"),
    ("/api/v1/formulas?lang=hi&full=true", "formulas__full_true_lang_hi.json"),     # query sorted, unsafe -> _
    ("/api/v1/formulas?full=true&lang=hi", "formulas__full_true_lang_hi.json"),
    ("/api/v1/formulas/calc/index", "formulas_calc_index.json"),
    ("/api/v1/system/info", "system_info.json"),
])
def test_data_file_names(url, name):
    assert build_static.data_name(url) == name


def test_js_uses_the_same_naming_rule():
    js = (ROOT / "deploy" / "static" / "static_api.js").read_text(encoding="utf-8")
    assert 'replace(/[^A-Za-z0-9._-]/g, "_") + ".json"' in js and '(q ? "__" + q : "")' in js


def test_links_rewritten_but_not_api_paths():
    src = '<a href="/formulas">F</a> <a href="/graph?e=x">G</a> ["/contact", "Contact"] fetch(`${API}/formulas`) "/api/v1/formulas"'
    out = build_static.rewrite_links(src)
    assert 'href="/formulas.html"' in out and 'href="/graph.html?e=x"' in out and '"/contact.html"' in out
    assert "${API}/formulas`" in out and '"/api/v1/formulas"' in out


@pytest.mark.parametrize("rel", [f for f in build_static.PY_FILES if f.endswith(".py")])
def test_browser_modules_import_only_sympy_and_stdlib(rel):
    allowed = {"src", "sympy", "json", "math", "re", "sys", "keyword", "unicodedata", "concurrent", "functools",
               "pathlib", "__future__"}
    tree = ast.parse((ROOT / rel).read_text(encoding="utf-8"))
    top = [n for n in tree.body if isinstance(n, (ast.Import, ast.ImportFrom))]   # module-level imports only
    names = {(a.name if isinstance(n, ast.Import) else n.module or "").split(".")[0] for n in top for a in n.names}
    assert names <= allowed, f"{rel} imports {names - allowed}"


def test_solver_runs_without_threads(monkeypatch):
    from src import formula_calc
    monkeypatch.setattr(formula_calc, "IN_BROWSER", True)
    assert formula_calc._run(lambda: 42) == 42


def test_eqsolve_still_reachable_from_handwriting():
    from src import eqsolve, handwriting
    assert handwriting.solve_text is eqsolve.solve_text
    assert eqsolve.solve_text("x^2 - 5x + 6 = 0")["solutions"] == [2.0, 3.0]
