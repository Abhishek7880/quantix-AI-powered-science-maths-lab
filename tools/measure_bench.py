"""Score the Measure pipeline on datasets/measure_bench (made by tools/make_measure_bench.py).

    .venv\\Scripts\\python.exe tools\\measure_bench.py

Per scene: is the main object found, is its shape right, is 2D / 3D right, how far are the key sizes from the truth
(with the true scale), and for the 2D scenes: does the reference finder pick the 25 mm coin (scale error).
"""

from __future__ import annotations

import json
import math
import sys
from collections import defaultdict
from pathlib import Path

import cv2

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
BENCH = ROOT / "datasets" / "measure_bench"

# which output size to compare with which true size (true value in mm)
KEYS = {
    "cylinder": lambda t: {"r": t["r"], "h": t["h"]}, "mug": lambda t: {"r": t["r"], "h": t["h"]},
    "sphere": lambda t: {"r": t["r"]}, "hemisphere": lambda t: {"r": t["r"]}, "cone": lambda t: {"r": t["r"], "h": t["h"]},
    "cube": lambda t: {"a": t["l"]}, "cuboid": lambda t: {"h": t["h"]},
    "circle": lambda t: {"r": t["r"]}, "ellipse": lambda t: {"a": t["a"], "b": t["b"]}, "square": lambda t: {"a": t["l"]},
    "rectangle": lambda t: {"l": t["l"], "b": t["b"]}, "triangle": lambda t: {"a": t["a"]}, "pentagon": lambda t: {"a": t["a"]},
    "hexagon": lambda t: {"a": t["a"]},
}
SHAPE_OK = {"mug": {"cylinder"}, "cube": {"cube", "cuboid"}, "cuboid": {"cuboid", "cube"}, "square": {"square", "rectangle"}}


def run(analyse) -> dict:
    truth = json.loads((BENCH / "truth.json").read_text(encoding="utf-8"))
    stats = defaultdict(lambda: {"n": 0, "found": 0, "shape": 0, "dim": 0, "err": [], "scale_err": []})
    rows = []
    for t in truth:
        img = cv2.imread(str(BENCH / t["file"]))
        res = analyse(img, t["mm_per_px"], t)
        s = stats[t["shape"]]
        s["n"] += 1
        main = res.get("main")
        if main:
            s["found"] += 1
            want = SHAPE_OK.get(t["shape"], {t["shape"]})
            ok_shape = main["class_name"] in want
            s["shape"] += ok_shape
            s["dim"] += (main.get("dimension") == t["dimension"])
            errs = []
            for k, v in KEYS[t["shape"]](t["truth_mm"]).items():
                got = main["dims"].get(k)
                if got is not None:
                    errs.append(abs(got - v) / v * 100)
            if errs and ok_shape:
                s["err"].append(max(errs))
            rows.append(f"{t['file']:22s} {main['class_name']:14s} {main.get('dimension')}  " + " ".join(f"{k}={main['dims'].get(k, float('nan')):.0f}/{v}" for k, v in KEYS[t['shape']](t['truth_mm']).items()))
        else:
            rows.append(f"{t['file']:22s} -- nothing found")
        if t.get("coin_mm") and res.get("scale") is not None:
            s["scale_err"].append(abs(res["scale"] - t["mm_per_px"]) / t["mm_per_px"] * 100)
    return {"stats": stats, "rows": rows}


def report(out: dict, title: str, verbose: bool = False) -> dict:
    print(f"\n== {title}")
    tot = defaultdict(float)
    for k, s in out["stats"].items():
        med = sorted(s["err"])[len(s["err"]) // 2] if s["err"] else float("nan")
        sc = sorted(s["scale_err"])[len(s["scale_err"]) // 2] if s["scale_err"] else float("nan")
        print(f"{k:11s} found {s['found']}/{s['n']}  shape {s['shape']}/{s['n']}  2D/3D {s['dim']}/{s['n']}  size err median {med:5.1f}%"
              + (f"  coin-scale err {sc:5.1f}%" if s["scale_err"] else ""))
        for f in ("n", "found", "shape", "dim"):
            tot[f] += s[f]
        tot["good"] += sum(1 for e in s["err"] if e <= 10)
    print(f"TOTAL: found {tot['found']:.0f}/{tot['n']:.0f}, shape {tot['shape']:.0f}, 2D/3D {tot['dim']:.0f}, sizes within 10 %: {tot['good']:.0f}")
    if verbose:
        print("\n".join(out["rows"]))
    return tot


def current_pipeline(img, mmpp, t):
    """The Measure API as it is: auto detection + box-based sizes; scale from the best coin the finder returns."""
    from src import everyday, measure
    from src.api import CLASS_KNOWLEDGE, _auto_model
    r = everyday.detect_auto(img, _auto_model)
    shapes = measure.measure_detections(r["detections"], mmpp, CLASS_KNOWLEDGE)
    main = max(shapes, key=lambda s: (s["box"][2] - s["box"][0]) * (s["box"][3] - s["box"][1]), default=None)
    out = {"main": None}
    if main:
        out["main"] = {"class_name": main["class_name"], "dimension": main["dimension"], "dims": {k: v for k, v in main["dims_mm"].items()}}
    refs = measure.find_references(img)
    if refs["circles"]:
        c = refs["circles"][0]
        out["scale"] = 25.0 / (2 * c["r"])
    return out


if __name__ == "__main__":
    which = sys.argv[1] if len(sys.argv) > 1 else "new"
    if which == "old":
        report(run(current_pipeline), "current pipeline", verbose="-v" in sys.argv)
    else:
        from src import measure
        def new(img, mmpp, t):
            from src.api import CLASS_KNOWLEDGE, _auto_model
            ref = measure.best_reference(img, "coin_5") if t["dimension"] == "2D" else None
            r = measure.analyse_photo(img, mmpp, CLASS_KNOWLEDGE, _auto_model, exclude=ref)
            main = r["shapes"][0] if r["shapes"] else None
            out = {"main": None, "scale": None}
            if main:
                out["main"] = {"class_name": main["class_name"], "dimension": main["dimension"], "dims": main["dims_mm"]}
            if ref:
                out["scale"] = ref["mm_per_px"]
            return out
        report(run(new), "new pipeline", verbose="-v" in sys.argv)
