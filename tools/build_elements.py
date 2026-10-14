"""Build src/knowledge/elements.json (periodic table data) from the mendeleev element database.

    python tools/build_elements.py path\\to\\mendeleev\\elements.db

Only factual numeric / categorical data is taken from the database (mendeleev, MIT licence; the values come from
the reference sources it cites). Hindi names and the short "uses" texts are hand-written in
src/knowledge/elements_text.json and merged in. The app does not need mendeleev at runtime.
"""

from __future__ import annotations

import json
import re
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "src" / "knowledge" / "elements.json"
TEXT = ROOT / "src" / "knowledge" / "elements_text.json"

SERIES = {1: "nonmetal", 2: "noble", 3: "alkali", 4: "alkaline", 5: "metalloid", 6: "halogen", 7: "post",
          8: "transition", 9: "lanthanide", 10: "actinide"}
CORES = {"He": "1s2", "Ne": "[He] 2s2 2p6", "Ar": "[Ne] 3s2 3p6", "Kr": "[Ar] 3d10 4s2 4p6",
         "Xe": "[Kr] 4d10 5s2 5p6", "Rn": "[Xe] 4f14 5d10 6s2 6p6"}


def expand(config: str) -> list[tuple[int, str, int]]:
    """'[Ar] 3d6 4s2' -> [(1,'s',2), (2,'s',2), …, (3,'d',6), (4,'s',2)]"""
    out = []
    for part in config.split():
        m = re.fullmatch(r"\[(\w+)\]", part)
        if m:
            out += expand(CORES[m.group(1)])
            continue
        m = re.fullmatch(r"(\d)([spdf])(\d*)", part)
        if not m:
            raise ValueError(f"bad configuration part {part!r} in {config!r}")
        out.append((int(m.group(1)), m.group(2), int(m.group(3) or 1)))
    return out


def shells(config: str) -> list[int]:
    by_n: dict[int, int] = {}
    for n, _, e in expand(config):
        by_n[n] = by_n.get(n, 0) + e
    return [by_n.get(n, 0) for n in range(1, max(by_n) + 1)]


def position(z: int, group: int | None, period: int) -> tuple[int, int]:
    """(row, col) in the 18-column layout; lanthanides / actinides go to rows 9 / 10."""
    if 57 <= z <= 71:
        return 9, 3 + (z - 57)
    if 89 <= z <= 103:
        return 10, 3 + (z - 89)
    return period, group


def category(z: int, series_id: int) -> str:
    """Lu and Lr are drawn in the f-block rows, so they are coloured with their row (common table convention)."""
    if 57 <= z <= 71:
        return "lanthanide"
    if 89 <= z <= 103:
        return "actinide"
    return SERIES[series_id]


def r(x, nd=4):
    return None if x is None else round(float(x), nd)


def main(db_path: str) -> None:
    c = sqlite3.connect(db_path)
    c.row_factory = sqlite3.Row
    text = json.loads(TEXT.read_text(encoding="utf-8"))
    phases: dict[int, sqlite3.Row] = {}
    for row in c.execute("select * from phasetransitions order by id"):
        z = row["atomic_number"]
        if row["is_transition"]:
            continue
        if z not in phases or (phases[z]["allotrope"] and not row["allotrope"]):
            phases[z] = row
    ie1 = {row[0]: row[1] for row in c.execute(
        "select atomic_number, ionization_energy from ionizationenergies where ion_charge = 0")}
    oxi: dict[int, dict[str, list[int]]] = {}
    for z, st, cat in c.execute("select atomic_number, oxidation_state, category from oxidationstates"):
        oxi.setdefault(z, {"main": [], "all": []})
        oxi[z]["all"].append(st)
        if cat == "main":
            oxi[z]["main"].append(st)

    elements = []
    for e in c.execute("select * from elements order by atomic_number"):
        z = e["atomic_number"]
        ph = phases.get(z)
        # sublimes at 1 atm: flagged in the data, or a boiling point without a melting point (As); helium is the
        # exception — it never solidifies at 1 atm, it stays liquid down to absolute zero
        sub = bool(ph and (ph["is_sublimation_point"] or (ph["melting_point"] is None and ph["boiling_point"] and z != 2)))
        mp = None if ph is None or sub else r(ph["melting_point"], 2)
        bp = None if ph is None else r(ph["boiling_point"], 2)
        sh = shells(e["electronic_configuration"])
        assert sum(sh) == z, (z, e["electronic_configuration"], sh)
        row, col = position(z, e["group_id"], e["period"])
        name_hi, uses_en, uses_hi = text["elements"][e["symbol"]]
        if uses_en is None:
            uses_en, uses_hi = text["synthetic_uses"]
        year = e["discovery_year"]
        disc = (e["discoverers"] or "").strip().rstrip(".")
        ox = oxi.get(z, {"main": [], "all": []})
        elements.append({
            "z": z, "sym": e["symbol"], "name": e["name"], "name_hi": name_hi,
            "mass": r(e["atomic_weight"], 5), "cat": category(z, e["series_id"]), "block": e["block"],
            "group": e["group_id"], "period": e["period"], "row": row, "col": col,
            "config": e["electronic_configuration"], "shells": sh,
            "en": r(e["en_pauling"], 2), "radius": r(e["atomic_radius"], 1),
            "density": r(e["density"], 5), "mp": mp, "bp": bp, "sublimes": sub,
            "ie1": r(ie1.get(z), 4), "ea": r(e["electron_affinity"], 4),
            "year": year, "ancient": year is None and "ancient" in disc.lower(),
            "discoverers": None if "ancient" in disc.lower() else (disc or None),
            "oxi_main": sorted(set(ox["main"])), "oxi_all": sorted(set(ox["all"])),
            "radioactive": bool(e["is_radioactive"]), "predicted": z >= 104,
            "crust_ppm": r(e["abundance_crust"], 6),
            "uses": uses_en, "uses_hi": uses_hi,
        })
    assert len(elements) == 118
    payload = {
        "source": "Factual data: mendeleev element database (MIT licence) and the references it cites. "
                  "Hindi names and uses: hand-written for this project.",
        "units": {"mass": "u (g/mol)", "radius": "pm", "density": "g/cm³ (at 20–25 °C; gases at 0 °C, 1 atm)",
                  "mp": "K", "bp": "K", "ie1": "eV", "ea": "eV", "en": "Pauling", "crust_ppm": "mg/kg"},
        "categories": text["categories"],
        "elements": elements,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {OUT} ({OUT.stat().st_size / 1024:.0f} KB, {len(elements)} elements)")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    main(sys.argv[1])
