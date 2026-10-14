"""Handwritten equation → text → solved / plotted.

    recognize(img_bgr)   -> symbols (box, class, confidence, alternatives, role) + the equation text
    solve_text("y=x^2-4x+3") -> what kind of problem it is, step-by-step working, solutions, plot points

Scope (honest): ONE line of neatly written maths — digits, x, y, + − × ÷ = ( ), decimal point, powers (a small raised
symbol after a base, x²) and simple fractions (a bar with something above and below). Recognition uses a small CNN
trained on HASYv2 (handwritten symbols, ODbL) and MNIST digits (tools/train_handwriting.py); layout rules handle
"=", "÷", "−", dots, powers and fractions. Every symbol comes with alternatives so the user can correct it.
"""

from __future__ import annotations

import json
import math
from functools import lru_cache
from pathlib import Path

import cv2
import numpy as np

from src.errors import InputValidationError, ModelNotFoundError

MODEL_DIR = Path(__file__).resolve().parents[1] / "models" / "handwriting"
MODEL_FILE = MODEL_DIR / "symbols.pt"
SIZE = 28
# class -> text used in the equation
TEXT = {"times": "*", "div": "/", "minus": "-", "dot": ".", "cdot": "*", "eq": "=", "lpar": "(", "rpar": ")", "plus": "+", "slash": "/"}
DISPLAY = {"times": "×", "div": "÷", "minus": "−", "dot": ".", "cdot": "·", "eq": "=", "lpar": "(", "rpar": ")", "plus": "+", "slash": "/"}
OPERAND = set("0123456789xyzabcn") | {"rpar"}


# ------------------------------------------------------------------ shared preprocessing (training uses this too)
def normalize_symbol(ink: np.ndarray) -> np.ndarray:
    """ink: 2-D array, > 0 where there is ink. Returns float32 SIZE×SIZE in [0, 1]: the symbol cropped, padded to a
    square (so a "−" stays flat and a "1" stays thin) and centred with a margin."""
    ys, xs = np.nonzero(ink > 0)
    out = np.zeros((SIZE, SIZE), np.float32)
    if len(xs) == 0:
        return out
    crop = (ink[ys.min():ys.max() + 1, xs.min():xs.max() + 1] > 0).astype(np.uint8) * 255
    h, w = crop.shape
    side = max(h, w)
    sq = np.zeros((side, side), np.uint8)
    sq[(side - h) // 2:(side - h) // 2 + h, (side - w) // 2:(side - w) // 2 + w] = crop
    inner = SIZE - 6
    sq = cv2.resize(sq, (inner, inner), interpolation=cv2.INTER_AREA)
    out[3:3 + inner, 3:3 + inner] = sq.astype(np.float32) / 255.0
    return out


def ink_mask(img_bgr: np.ndarray) -> np.ndarray:
    """Binary ink mask (uint8 0/255) from a photo or a drawing: flatten uneven lighting, Otsu threshold, drop specks,
    page borders and ruled lines."""
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY) if img_bgr.ndim == 3 else img_bgr
    h, w = gray.shape
    k = max(15, (min(h, w) // 12) | 1)
    bg = cv2.morphologyEx(gray, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
    flat = cv2.divide(gray, bg, scale=255)
    _, mask = cv2.threshold(flat, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    if mask.mean() > 127:                                       # light ink on a dark board
        _, mask = cv2.threshold(flat, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    n, lab, st, _ = cv2.connectedComponentsWithStats(mask, 8)
    keep = np.zeros(n, bool)
    min_area = max(6, (h * w) * 2e-5)
    for i in range(1, n):
        x, y, bw, bh, area = st[i]
        if area < min_area:
            continue
        if bw > 0.6 * w and bh < 0.05 * h:                      # ruled line across the page
            continue
        if bw > 0.95 * w or bh > 0.95 * h:                      # page border / shadow
            continue
        keep[i] = True
    return np.where(keep[lab], 255, 0).astype(np.uint8)


# ------------------------------------------------------------------ the classifier
def _net(n_classes: int):
    import torch.nn as nn
    return nn.Sequential(
        nn.Conv2d(1, 32, 3, padding=1), nn.BatchNorm2d(32), nn.ReLU(), nn.Conv2d(32, 32, 3, padding=1), nn.BatchNorm2d(32), nn.ReLU(),
        nn.MaxPool2d(2), nn.Dropout(0.1),
        nn.Conv2d(32, 64, 3, padding=1), nn.BatchNorm2d(64), nn.ReLU(), nn.Conv2d(64, 64, 3, padding=1), nn.BatchNorm2d(64), nn.ReLU(),
        nn.MaxPool2d(2), nn.Dropout(0.2),
        nn.Flatten(), nn.Linear(64 * 7 * 7, 192), nn.ReLU(), nn.Dropout(0.35), nn.Linear(192, n_classes))


@lru_cache(maxsize=1)
def _model():
    import torch
    if not MODEL_FILE.is_file():
        raise ModelNotFoundError("The handwriting model is not trained yet. Run: python tools/train_handwriting.py",
                                 error_code="HANDWRITING_MODEL_MISSING", error_title="Handwriting model missing")
    ck = torch.load(MODEL_FILE, map_location="cpu", weights_only=False)
    net = _net(len(ck["classes"]))
    net.load_state_dict(ck["state_dict"])
    net.eval()
    return net, ck["classes"]


def classify(crops: list[np.ndarray]) -> list[list[tuple[str, float]]]:
    """Top-3 (class, probability) for each normalised crop."""
    import torch
    if not crops:
        return []
    net, classes = _model()
    with torch.no_grad():
        p = torch.softmax(net(torch.from_numpy(np.stack(crops)).unsqueeze(1)), 1).numpy()
    out = []
    ix, it = (classes.index("x") if "x" in classes else None), (classes.index("times") if "times" in classes else None)
    for row in p:
        row = row.copy()
        if ix is not None and it is not None:          # handwritten x and × look the same: one shape, context decides
            row[ix] += row[it]
            row[it] = 0
        top = np.argsort(-row)[:3]
        out.append([(classes[i], float(row[i])) for i in top])
    return out


# ------------------------------------------------------------------ segmentation + layout
def _components(mask: np.ndarray) -> list[dict]:
    n, lab, st, _ = cv2.connectedComponentsWithStats(mask, 8)
    comps = [{"x1": int(st[i][0]), "y1": int(st[i][1]), "x2": int(st[i][0] + st[i][2]), "y2": int(st[i][1] + st[i][3]),
              "ids": [i]} for i in range(1, n)]
    return comps, lab


def _hw(c):
    return c["x2"] - c["x1"], c["y2"] - c["y1"]


def recognize(img_bgr: np.ndarray) -> dict:
    mask = ink_mask(img_bgr)
    comps, lab = _components(mask)
    if not comps:
        raise InputValidationError("No handwriting found — write darker / larger, or draw in the box.",
                                   error_code="NO_INK", error_title="No handwriting found")
    if len(comps) > 80:
        raise InputValidationError("Too many marks — crop the photo to one line of the equation.",
                                   error_code="TOO_MANY_SYMBOLS", error_title="Too many marks")
    tall = [(_hw(c)[1]) for c in comps if _hw(c)[1] > 0.5 * _hw(c)[0]]
    H = float(np.median(tall)) if tall else float(np.median([max(_hw(c)) for c in comps]))

    # --- rule-based pieces: dots, flat bars (minus / fraction bar), "=" and "÷"
    for c in comps:
        w, h = _hw(c)
        c["kind"] = "dot" if max(w, h) < 0.28 * H else ("bar" if h < 0.35 * w and w > 0.25 * H else "glyph")
    used = set()
    merged = []
    bars = [c for c in comps if c["kind"] == "bar"]
    for i, a in enumerate(bars):                                  # two stacked bars of similar width -> "="
        if id(a) in used:
            continue
        for b in bars[i + 1:]:
            if id(b) in used:
                continue
            ov = min(a["x2"], b["x2"]) - max(a["x1"], b["x1"])
            wa, wb = _hw(a)[0], _hw(b)[0]
            gap = max(a["y1"], b["y1"]) - min(a["y2"], b["y2"])
            if ov > 0.55 * min(wa, wb) and 0.5 < wa / wb < 2 and gap < 0.9 * H:
                merged.append({"x1": min(a["x1"], b["x1"]), "y1": min(a["y1"], b["y1"]), "x2": max(a["x2"], b["x2"]),
                               "y2": max(a["y2"], b["y2"]), "ids": a["ids"] + b["ids"], "kind": "rule", "cls": "eq"})
                used |= {id(a), id(b)}
                break
    for a in bars:                                                # bar with a dot above and below -> "÷"
        if id(a) in used:
            continue
        dots = [d for d in comps if d["kind"] == "dot" and id(d) not in used and a["x1"] <= (d["x1"] + d["x2"]) / 2 <= a["x2"]
                and abs((d["y1"] + d["y2"]) / 2 - (a["y1"] + a["y2"]) / 2) < 0.8 * H]
        above = [d for d in dots if d["y2"] <= a["y1"] + 2]
        below = [d for d in dots if d["y1"] >= a["y2"] - 2]
        if above and below:
            parts = [a, above[0], below[0]]
            merged.append({"x1": min(p["x1"] for p in parts), "y1": min(p["y1"] for p in parts), "x2": max(p["x2"] for p in parts),
                           "y2": max(p["y2"] for p in parts), "ids": sum((p["ids"] for p in parts), []), "kind": "rule", "cls": "div"})
            used |= {id(p) for p in parts}
    syms = merged + [c for c in comps if id(c) not in used]
    for s in syms:
        if s["kind"] == "bar":
            s["kind"], s["cls"] = "rule", "minus"
        elif s["kind"] == "dot":
            s["kind"], s["cls"] = "rule", "dot"

    # --- classify the glyphs
    glyphs = [s for s in syms if s["kind"] == "glyph"]
    crops = []
    for s in glyphs:
        sub = np.isin(lab[s["y1"]:s["y2"], s["x1"]:s["x2"]], s["ids"]).astype(np.uint8) * 255
        crops.append(normalize_symbol(sub))
    for s, top in zip(glyphs, classify(crops)):
        s["cls"], s["conf"], s["alts"] = top[0][0], top[0][1], [c for c, _ in top[1:]]
    for s in syms:
        s.setdefault("conf", 1.0)
        s.setdefault("alts", {"minus": ["eq", "div"], "eq": ["minus"], "div": ["minus", "plus"], "dot": ["cdot"]}.get(s["cls"], []))
    text, roles = _layout(syms, H)
    return {"width": int(img_bgr.shape[1]), "height": int(img_bgr.shape[0]), "line_height": round(H, 1),
            "symbols": [{"box": [s["x1"], s["y1"], s["x2"], s["y2"]], "cls": s["cls"], "display": DISPLAY.get(s["cls"], s["cls"]),
                         "confidence": round(s["conf"], 3), "alternatives": s["alts"], "role": roles.get(id(s), "base")} for s in syms],
            "text": text, "pretty": pretty(text)}


def _layout(syms: list[dict], H: float) -> tuple[str, dict]:
    """Left-to-right reading with fractions (bar with symbols above and below) and powers (small raised symbols)."""
    roles: dict = {}

    def cx(s):
        return (s["x1"] + s["x2"]) / 2

    def build(items: list[dict]) -> str:
        items = sorted(items, key=lambda s: s["x1"])
        # fractions first: a wide "minus" with symbols above and below it
        for bar in sorted([s for s in items if s.get("cls") == "minus"], key=lambda s: s["x1"] - s["x2"]):
            if bar not in items:
                continue
            num = [s for s in items if s is not bar and bar["x1"] - 2 <= cx(s) <= bar["x2"] + 2 and s["y2"] <= (bar["y1"] + bar["y2"]) / 2]
            den = [s for s in items if s is not bar and bar["x1"] - 2 <= cx(s) <= bar["x2"] + 2 and s["y1"] >= (bar["y1"] + bar["y2"]) / 2]
            if num and den:
                roles[id(bar)] = "fraction"
                for s in num:
                    roles[id(s)] = "numerator"
                for s in den:
                    roles[id(s)] = "denominator"
                token = {"x1": bar["x1"], "x2": bar["x2"], "y1": min(s["y1"] for s in num), "y2": max(s["y2"] for s in den),
                         "text": f"({build(num)})/({build(den)})", "cls": "rpar"}
                items = [s for s in items if s is not bar and s not in num and s not in den] + [token]
                items.sort(key=lambda s: s["x1"])
        # baseline = median bottom of the ordinary symbols; a power sits clearly above it and is smaller than the line
        bottoms = [s["y2"] for s in items if s.get("cls") not in ("minus", "eq", "dot", "plus")]
        baseline = float(np.median(bottoms)) if bottoms else 0.0
        out, base, sup = [], None, []
        for k, s in enumerate(items):
            # handwritten "x" between two numbers is a multiplication sign (2x3), otherwise the variable x
            if s.get("cls") == "x" and 0 < k < len(items) - 1:
                prev_c, next_c = items[k - 1].get("cls", ""), items[k + 1].get("cls", "")
                if (prev_c.isdigit() or prev_c == "rpar") and (next_c.isdigit() or next_c == "lpar") and not s.get("text"):
                    s["cls"] = "times"
            t = s.get("text") or TEXT.get(s["cls"], s["cls"])
            sh = s["y2"] - s["y1"]
            raised = (base is not None and base.get("cls") in OPERAND and s.get("cls") not in ("minus", "eq", "dot")
                      and s["y2"] < baseline - 0.35 * H and sh < 0.85 * H)
            cy = (s["y1"] + s["y2"]) / 2
            op = s.get("cls") in ("minus", "plus", "eq", "times", "slash")
            # a power continues (x¹², xⁿ⁻¹) only with symbols that are still raised; an operator must sit high up,
            # otherwise "x² − 5x" would swallow the minus into the exponent
            more = sup and s["y2"] < baseline - 0.25 * H and (not op or cy < baseline - 0.8 * H) and s.get("cls") != "eq"
            if raised or more:
                sup.append(t)
                roles[id(s)] = "power"
                continue
            if sup:
                out.append(f"^({''.join(sup)})")
                sup = []
            out.append(t)
            if s.get("cls") != "dot":
                base = s
        if sup:
            out.append(f"^({''.join(sup)})")
        return "".join(out)

    return build(list(syms)), roles


SUP = str.maketrans("0123456789+-xyn()", "⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻ˣʸⁿ⁽⁾")


def pretty(text: str) -> str:
    import re
    s = re.sub(r"\^\(([0-9xyn+\-]+)\)", lambda m: m.group(1).translate(SUP), text)
    return s.replace("*", "×").replace("-", "−")


# ------------------------------------------------------------------ solving
def solve_text(text: str, lang: str = "en") -> dict:
    """Solve / simplify / plot the recognised (or corrected) text."""
    import sympy as sp

    from src import formula_calc as fc
    H = {"en": {"eq": "Equation", "move": "Bring every term to one side", "factor": "Factorise", "disc": "Discriminant",
                "qf": "Quadratic formula", "sol": "Solution", "sols": "Solutions", "value": "Value", "expand": "Expanded",
                "fact": "Factorised", "simp": "Simplified", "func": "Function of x", "check": "Check"},
         "hi": {"eq": "समीकरण", "move": "सभी पदों को एक ओर लाएँ", "factor": "गुणनखंड", "disc": "विविक्तकर",
                "qf": "द्विघात सूत्र", "sol": "हल", "sols": "हल", "value": "मान", "expand": "विस्तारित",
                "fact": "गुणनखंडित", "simp": "सरलीकृत", "func": "x का फलन", "check": "जाँच"}}[lang if lang == "hi" else "en"]
    raw = (text or "").strip()
    if not raw:
        raise InputValidationError("Nothing to solve.", error_code="EMPTY_EXPRESSION", error_title="Empty expression")
    if raw.count("=") > 1:
        raise InputValidationError("Only one '=' is supported.", error_code="TOO_MANY_EQUALS", error_title="Too many '='")
    try:
        s = fc.normalise(raw)
        parts = [fc._parse_side(p.strip()) for p in s.split("=")] if "=" in s else [fc._parse_side(s)]
    except Exception as e:
        raise InputValidationError(f"Could not read '{raw}' as maths: {getattr(e, 'error_content', e)}", error_code="EXPRESSION_INVALID",
                                   error_title="Not a valid expression") from None
    show = fc.show
    steps: list[dict] = []
    out = {"input": raw, "pretty": pretty(raw), "steps": steps}
    x, y = sp.Symbol("x"), sp.Symbol("y")

    if len(parts) == 1:                                        # expression: evaluate / simplify
        e = parts[0]
        if not e.free_symbols:
            val = sp.nsimplify(e) if e.is_number else e
            steps.append({"label": H["value"], "text": f"{show(e)} = {show(sp.simplify(e))}"})
            out.update(kind="value", value=float(sp.N(e)), exact=show(sp.simplify(val)))
        else:
            ex, fa, si = sp.expand(e), sp.factor(e), sp.simplify(e)
            steps += [{"label": H["expand"], "text": show(ex)}, {"label": H["fact"], "text": show(fa)}, {"label": H["simp"], "text": show(si)}]
            out.update(kind="expression")
            if e.free_symbols == {x}:
                out["plot"] = _plot_points(e, x)
        return out

    lhs, rhs = parts
    syms = (lhs - rhs).free_symbols
    steps.append({"label": H["eq"], "text": f"{show(lhs)} = {show(rhs)}"})
    if y in syms and syms <= {x, y}:                           # relation in x and y -> plot
        sol = fc._run(lambda: sp.solve(sp.Eq(lhs, rhs), y))
        out.update(kind="relation", graph=raw.replace("**", "^"))
        if sol:
            for f_ in sol[:2]:
                steps.append({"label": H["func"], "text": f"y = {show(f_)}"})
            out["plot"] = _plot_points(sol[:2], x)                # both branches of e.g. a circle
            out["y_of_x"] = show(sol[0])
        return out
    if not syms:                                               # "1 + 1 = 2": just check it
        l_, r_ = sp.nsimplify(sp.simplify(lhs)), sp.nsimplify(sp.simplify(rhs))
        true = bool(sp.simplify(l_ - r_) == 0)
        steps.append({"label": H["check"], "text": f"{show(lhs)} = {show(l_)} ; {show(rhs)} = {show(r_)}"})
        out.update(kind="check", correct=true, verdict=("✓ " + ("सही" if lang == "hi" else "True")) if true
                   else ("✗ " + ("गलत" if lang == "hi" else "False") + f": {show(l_)} ≠ {show(r_)}"))
        return out
    if len(syms) != 1:
        out.update(kind="formula", note="Several unknowns — use the 🧮 Formula calculator to solve for one of them."
                   if lang != "hi" else "कई अज्ञात — किसी एक का मान निकालने के लिए 🧮 सूत्र कैलकुलेटर का उपयोग करें।")
        return out
    v = next(iter(syms))
    expr = sp.expand(lhs - rhs)
    if rhs != 0 or sp.expand(lhs) != lhs:
        steps.append({"label": H["move"], "text": f"{show(expr)} = 0"})
    poly = sp.Poly(expr, v) if expr.is_polynomial(v) else None
    if poly is not None and poly.degree() == 2:
        a, b, c = poly.all_coeffs()
        D = sp.simplify(b * b - 4 * a * c)
        steps.append({"label": H["disc"], "text": f"D = b² − 4ac = ({show(b)})² − 4·({show(a)})·({show(c)}) = {show(D)}"})
        fa = sp.factor(expr)
        if fa != expr:
            steps.append({"label": H["factor"], "text": f"{show(fa)} = 0"})
        steps.append({"label": H["qf"], "text": f"{show(v)} = (−b ± √D) / 2a = ({show(-b)} ± √({show(D)})) / {show(2 * a)}"})
    elif poly is not None and poly.degree() >= 3:
        fa = sp.factor(expr)
        if fa != expr:
            steps.append({"label": H["factor"], "text": f"{show(fa)} = 0"})
    sols = fc._run(lambda: sp.solve(sp.Eq(lhs, rhs), v))
    real = [s_ for s_ in sols if s_.is_real is not False]
    shown = [f"{show(v)} = {show(sp.nsimplify(s_) if s_.is_number else s_)}" + (f"  ≈ {float(sp.N(s_)):.6g}" if s_.is_number and s_.is_real and not s_.is_Integer else "")
             for s_ in real]
    cplx = [s_ for s_ in sols if s_.is_real is False]
    shown += [f"{show(v)} = {show(s_).replace('I', 'i')}  (complex)" for s_ in cplx]
    steps.append({"label": H["sols"] if len(shown) > 1 else H["sol"], "text": " ; ".join(shown) if shown else "—"})
    if real and all(s_.is_number for s_ in real):
        chk = [show(sp.nsimplify(lhs.subs(v, s_))) + " = " + show(sp.nsimplify(rhs.subs(v, s_))) for s_ in real[:2]]
        steps.append({"label": H["check"], "text": " ; ".join(chk)})
    out.update(kind="equation", variable=str(v), solutions=[float(sp.N(s_)) for s_ in real if s_.is_number],
               complex_solutions=[show(s_).replace("I", "i") for s_ in cplx])
    if v == x:
        out["plot"] = _plot_points(expr, x)
    return out


def _plot_points(fs, x, lo: float = -10, hi: float = 10, n: int = 401) -> dict:
    """Sample one or more functions of x on [lo, hi]; gaps (outside the domain, poles) are None."""
    import sympy as sp
    series = []
    for f in (fs if isinstance(fs, (list, tuple)) else [fs]):
        fn = sp.lambdify(x, f, "math")
        pts = []
        for i in range(n):
            xv = lo + (hi - lo) * i / (n - 1)
            try:
                yv = float(fn(xv))
                pts.append([round(xv, 4), round(yv, 5)] if math.isfinite(yv) and abs(yv) < 1e6 else [round(xv, 4), None])
            except (ValueError, ZeroDivisionError, OverflowError, TypeError):
                pts.append([round(xv, 4), None])
        series.append(pts)
    return {"x": [lo, hi], "series": series}


def relayout(symbols: list[dict], line_height: float) -> dict:
    """Rebuild the equation text after the user corrected some symbols (boxes + classes from recognize())."""
    syms = []
    for s in symbols[:120]:
        x1, y1, x2, y2 = (float(v) for v in s["box"])
        syms.append({"x1": x1, "y1": y1, "x2": x2, "y2": y2, "cls": str(s["cls"])})
    text, _ = _layout(syms, max(1.0, float(line_height)))
    return {"text": text, "pretty": pretty(text)}


def model_info() -> dict:
    meta = MODEL_DIR / "symbols.json"
    return json.loads(meta.read_text(encoding="utf-8")) if meta.is_file() else {"trained": False}
