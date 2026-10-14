"""Periodic table data and the molar-mass calculator.

    elements()                    -> list of 118 element dicts (src/knowledge/elements.json, built by tools/build_elements.py)
    get_element("Fe" | "26" | "iron")
    molar_mass("CuSO4·5H2O")       -> {formula, molar_mass, atoms, breakdown[…]}

Formula grammar: element symbols with counts, nested (), [] and {} groups, hydrates / adducts joined by "·", "." or
"*" with an optional leading coefficient (CuSO4·5H2O), and an optional coefficient in front of the whole formula.
"""

from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path

from src.errors import InputValidationError, ResourceNotFoundError

DATA = Path(__file__).resolve().parent / "knowledge" / "elements.json"
MAX_FORMULA = 120


@lru_cache(maxsize=1)
def _data() -> dict:
    return json.loads(DATA.read_text(encoding="utf-8"))


def elements() -> list[dict]:
    return _data()["elements"]


def categories() -> dict:
    return _data()["categories"]


@lru_cache(maxsize=1)
def _index() -> dict[str, dict]:
    idx = {}
    for e in elements():
        idx[str(e["z"])] = e
        idx[e["sym"].lower()] = e
        idx[e["name"].lower()] = e
    return idx


def get_element(key: str) -> dict:
    e = _index().get(str(key).strip().lower())
    if e is None:
        raise ResourceNotFoundError(f"No element '{key}'. Use an atomic number (1–118), a symbol (Fe) or a name (iron).",
                                    error_code="ELEMENT_NOT_FOUND", error_title="Element not found")
    return e


# ------------------------------------------------------------------ molar mass
class _Parser:
    OPEN, CLOSE = "([{", ")]}"

    def __init__(self, text: str):
        self.s, self.i = text, 0

    def error(self, msg: str):
        raise InputValidationError(f"{msg} (at position {self.i + 1} of '{self.s}').", error_code="FORMULA_INVALID",
                                   error_title="Formula not understood")

    def number(self, default: int = 1) -> int:
        m = re.compile(r"\d+").match(self.s, self.i)
        if not m:
            return default
        self.i = m.end()
        n = int(m.group())
        if n == 0 or n > 10_000:
            self.error("Counts must be between 1 and 10000")
        return n

    def group(self, closer: str | None) -> dict[str, int]:
        counts: dict[str, int] = {}
        while self.i < len(self.s):
            ch = self.s[self.i]
            if ch in self.OPEN:
                self.i += 1
                inner = self.group(self.CLOSE[self.OPEN.index(ch)])
                k = self.number()
                for sym, n in inner.items():
                    counts[sym] = counts.get(sym, 0) + n * k
            elif ch in self.CLOSE:
                if ch != closer:
                    self.error("Unmatched bracket")
                self.i += 1
                return counts
            elif ch.isupper():
                m = re.compile(r"[A-Z][a-z]?").match(self.s, self.i)
                sym = m.group()
                if sym.lower() not in _index() or _index()[sym.lower()]["sym"] != sym:
                    raise InputValidationError(f"'{sym}' is not an element symbol.", error_code="UNKNOWN_ELEMENT",
                                               error_title="Unknown element", details={"symbol": sym})
                self.i = m.end()
                n = self.number()
                counts[sym] = counts.get(sym, 0) + n
            else:
                self.error(f"Unexpected '{ch}'")
        if closer:
            self.error("Missing closing bracket")
        return counts


def parse_formula(formula: str) -> dict[str, int]:
    text = re.sub(r"\s+", "", formula or "")
    if not text:
        raise InputValidationError("Type a chemical formula, e.g. H2SO4.", error_code="FORMULA_INVALID",
                                   error_title="Formula not understood")
    if len(text) > MAX_FORMULA:
        raise InputValidationError("Formula too long.", error_code="FORMULA_INVALID", error_title="Formula not understood")
    text = text.translate(str.maketrans("₀₁₂₃₄₅₆₇₈₉", "0123456789"))
    total: dict[str, int] = {}
    for part in re.split(r"[·•.*]", text):
        if not part:
            raise InputValidationError("Empty part around '·'.", error_code="FORMULA_INVALID",
                                       error_title="Formula not understood")
        p = _Parser(part)
        k = p.number()                                   # leading coefficient: 5H2O
        counts = p.group(None)
        if not counts:
            p.error("No elements found")
        for sym, n in counts.items():
            total[sym] = total.get(sym, 0) + n * k
    return total


def molar_mass(formula: str) -> dict:
    counts = parse_formula(formula)
    by_sym = {e["sym"]: e for e in elements()}
    rows, total = [], 0.0
    for sym, n in counts.items():
        e = by_sym[sym]
        if e["mass"] is None:
            raise InputValidationError(f"No standard atomic mass for {sym}.", error_code="NO_ATOMIC_MASS",
                                       error_title="No atomic mass")
        sub = e["mass"] * n
        total += sub
        rows.append({"sym": sym, "name": e["name"], "name_hi": e["name_hi"], "z": e["z"], "count": n,
                     "atomic_mass": e["mass"], "subtotal": round(sub, 5)})
    for row in rows:
        row["percent"] = round(100 * row["subtotal"] / total, 3)
    rows.sort(key=lambda r: -r["subtotal"])
    pretty = re.sub(r"(?<=[A-Za-z)\]}])(\d+)", lambda m: m.group(1).translate(str.maketrans("0123456789", "₀₁₂₃₄₅₆₇₈₉")),
                    re.sub(r"\s+", "", formula).replace("*", "·").replace(".", "·"))
    return {"formula": pretty, "molar_mass": round(total, 4), "unit": "g/mol",
            "atoms": sum(counts.values()), "breakdown": rows}
