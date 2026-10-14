"""Measure real objects in a photo.

A photo only gives pixels; a reference of known size in the same plane (coin, card, A4 sheet, ruler) gives the
scale in mm per pixel. With that scale:

    find_references(img)                       -> candidate coins (circles) and cards / sheets (4-corner shapes)
    measure_detections(dets, mm_per_px, info)  -> each detected shape with real dimensions and its mensuration
                                                  formulas evaluated (area, perimeter, volume …) by src.formula_calc

Accuracy needs the camera roughly straight above / in front of the object, with the reference at the same distance.
3D solids are measured from their outline in the photo (front view); depth that a photo cannot show is assumed
(e.g. a cuboid's breadth) and reported as an assumption.
"""

from __future__ import annotations

import math

import cv2
import numpy as np

from src import formula_calc
from src.errors import InputValidationError

# real sizes of common references, mm
REFERENCES = {
    "coin_1": {"label": "₹1 coin", "label_hi": "₹1 सिक्का", "kind": "circle", "mm": 20.0},
    "coin_2": {"label": "₹2 coin", "label_hi": "₹2 सिक्का", "kind": "circle", "mm": 23.0},
    "coin_5": {"label": "₹5 coin", "label_hi": "₹5 सिक्का", "kind": "circle", "mm": 25.0},
    "coin_10": {"label": "₹10 coin", "label_hi": "₹10 सिक्का", "kind": "circle", "mm": 27.0},
    "card": {"label": "Bank / ID card (long side)", "label_hi": "बैंक / पहचान कार्ड (लंबी भुजा)", "kind": "rect", "mm": 85.60,
             "short_mm": 53.98},
    "a4": {"label": "A4 sheet (long side)", "label_hi": "A4 कागज़ (लंबी भुजा)", "kind": "rect", "mm": 297.0, "short_mm": 210.0},
    "custom": {"label": "Custom length (ruler …)", "label_hi": "अपनी लंबाई (स्केल …)", "kind": "line", "mm": None},
}


# ------------------------------------------------------------------ reference finding (OpenCV)
def refine_circle(gray: np.ndarray, cx: float, cy: float, r: float) -> tuple[float, float, float]:
    """Sharpen a Hough circle: along 180 rays find the strongest edge between 0.8 r and 1.25 r, then fit a circle
    through those edge points (least squares). Hough radii are often 2–4 % off; refined ≈ ±1 % in tests
    (scaled 0.5–1.3×, blurred, noisy, soft contact shadow)."""
    g = cv2.GaussianBlur(gray, (5, 5), 0).astype(np.float32)
    h, w = g.shape
    radii = np.linspace(0.8 * r, 1.25 * r, 90)
    pts = []
    for a in np.linspace(0, 2 * np.pi, 180, endpoint=False):
        xs, ys = cx + radii * np.cos(a), cy + radii * np.sin(a)
        ok = (xs >= 0) & (xs < w - 1) & (ys >= 0) & (ys < h - 1)
        if ok.sum() < 10:
            continue
        prof = cv2.remap(g, xs[ok].reshape(1, -1).astype(np.float32), ys[ok].reshape(1, -1).astype(np.float32),
                         cv2.INTER_LINEAR).ravel()
        grad = np.abs(np.diff(prof))
        if grad.max() < 4:                               # no real edge on this ray
            continue
        i = int(np.argmax(grad))                         # the coin's rim is the sharpest edge near the Hough radius
        rr = (radii[ok][i] + radii[ok][i + 1]) / 2
        pts.append((cx + rr * np.cos(a), cy + rr * np.sin(a)))
    if len(pts) < 40:
        return cx, cy, r
    p = np.array(pts)
    # algebraic (Kasa) circle fit: x² + y² + D x + E y + F = 0, then drop outliers and refit once
    for _ in range(2):
        A = np.c_[p[:, 0], p[:, 1], np.ones(len(p))]
        D, E, F = np.linalg.lstsq(A, -(p[:, 0] ** 2 + p[:, 1] ** 2), rcond=None)[0]
        fx, fy = -D / 2, -E / 2
        fr = math.sqrt(max(fx * fx + fy * fy - F, 0))
        d = np.abs(np.hypot(p[:, 0] - fx, p[:, 1] - fy) - fr)
        keep = d < max(2.0, 2.5 * np.median(d))
        if keep.all() or keep.sum() < 30:
            break
        p = p[keep]
    if not (0.8 * r < fr < 1.25 * r):
        return cx, cy, r
    return fx, fy, fr



def find_references(img: np.ndarray, max_each: int = 6) -> dict:
    """Candidate reference objects: circles (coins) and convex quadrilaterals (cards, A4 sheets), in image pixels."""
    h, w = img.shape[:2]
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    small_side = min(h, w)

    circles = []
    blur = cv2.medianBlur(gray, 5)
    found = cv2.HoughCircles(blur, cv2.HOUGH_GRADIENT, dp=1.2, minDist=small_side * 0.06, param1=120, param2=40,
                             minRadius=int(small_side * 0.02), maxRadius=int(small_side * 0.35))
    if found is not None:
        # largest first; drop circles centred inside a bigger one (a coin's inner ring is not another coin)
        for x, y, r in sorted(found[0], key=lambda c: -c[2]):
            if any(math.hypot(x - c["cx"], y - c["cy"]) < c["r"] for c in circles):
                continue
            x, y, r = refine_circle(gray, float(x), float(y), float(r))
            circles.append({"cx": round(float(x), 2), "cy": round(float(y), 2), "r": round(float(r), 2)})
            if len(circles) >= max_each:
                break

    rects = []
    edges = cv2.Canny(cv2.GaussianBlur(gray, (5, 5), 0), 50, 150)
    edges = cv2.dilate(edges, np.ones((3, 3), np.uint8), iterations=1)
    contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    for c in sorted(contours, key=cv2.contourArea, reverse=True)[:30]:
        area = cv2.contourArea(c)
        if area < 0.01 * w * h:
            break
        approx = cv2.approxPolyDP(c, 0.02 * cv2.arcLength(c, True), True)
        if len(approx) != 4 or not cv2.isContourConvex(approx):
            continue
        pts = approx.reshape(4, 2).astype(float)
        sides = [float(np.linalg.norm(pts[i] - pts[(i + 1) % 4])) for i in range(4)]
        long_px, short_px = (sides[0] + sides[2]) / 2, (sides[1] + sides[3]) / 2
        if long_px < short_px:
            long_px, short_px = short_px, long_px
        rects.append({"pts": [[round(x, 1), round(y, 1)] for x, y in pts], "long_px": round(long_px, 1),
                      "short_px": round(short_px, 1), "aspect": round(long_px / max(short_px, 1e-6), 3),
                      "guess": "card" if abs(long_px / max(short_px, 1e-6) - 1.586) < 0.12
                      else "a4" if abs(long_px / max(short_px, 1e-6) - 1.414) < 0.1 else None})
        if len(rects) >= max_each:
            break
    return {"width": w, "height": h, "circles": circles, "rects": rects}


# ------------------------------------------------------------------ shape dimensions from a detection box
def _dims_from_box(cls: str, w: float, h: float, depth: float | None) -> tuple[dict, list[str]]:
    """Real dimensions (mm, keyed by the formula engine's symbol names) and the assumptions made."""
    big, small = max(w, h), min(w, h)
    notes: list[str] = []
    if cls == "circle":
        return {"r": (w + h) / 4, "d": (w + h) / 2}, notes
    if cls == "semicircle":
        return {"r": max(w, 2 * h) / 2}, notes
    if cls == "ellipse":
        return {"a": big / 2, "b": small / 2}, notes
    if cls == "square":
        return {"a": (w + h) / 2}, notes
    if cls == "rectangle":
        return {"l": big, "b": small}, notes
    if cls == "triangle":
        side = math.hypot(w / 2, h)
        notes.append("isosceles_assumed")
        return {"b": w, "h": h, "a": side, "c": side, "s": (w + 2 * side) / 2}, notes
    if cls == "rhombus":
        return {"d_1": w, "d_2": h, "a": math.hypot(w, h) / 2}, notes
    if cls == "parallelogram":
        notes.append("slant_side_assumed")
        return {"b": w * 0.75, "h": h, "a": math.hypot(w * 0.25, h)}, notes
    if cls == "trapezium":
        notes.append("trapezium_sides_assumed")
        leg = math.hypot(w * 0.2, h)
        return {"a": w, "b": w * 0.6, "h": h, "c": leg, "d": leg}, notes
    if cls == "pentagon":
        return {"a": big / 1.618}, notes
    if cls == "hexagon":
        return {"a": big / 2}, notes
    if cls == "cube":
        notes.append("front_view")
        return {"a": (w + h) / 2}, notes
    if cls == "cuboid":
        notes.append("depth_assumed" if depth is None else "depth_given")
        return {"l": w, "h": h, "b": depth if depth else small}, notes
    if cls in ("sphere",):
        return {"r": (w + h) / 4}, notes
    if cls == "hemisphere":
        return {"r": w / 2}, notes
    if cls in ("cylinder", "cone"):
        notes.append("side_view")
        return {"r": w / 2, "h": h}, notes
    if cls == "square_pyramid":
        notes.append("side_view")
        return {"a": w, "h": h}, notes
    if cls == "triangular_prism":
        notes.append("depth_assumed" if depth is None else "depth_given")
        side = math.hypot(w / 2, h)
        return {"b": w, "h": h, "L": depth if depth else w, "a": side, "c": side}, notes
    return {"width": w, "height": h}, ["unknown_shape"]


def _power(text: str, target: str, values: dict) -> int:
    """1 = length, 2 = area, 3 = volume: scale every length by 2 and see how the result scales."""
    try:
        a = formula_calc.solve(text, target, values)["solutions"][0]["value"]
        b = formula_calc.solve(text, target, {k: 2 * v for k, v in values.items()})["solutions"][0]["value"]
        return max(0, round(math.log2(abs(b / a)))) if a else 1
    except Exception:
        return 1


def _evaluate(info: dict | None, dims: dict) -> list[dict]:
    """Evaluate the shape's library formulas in order; each result can feed the next (cone: l, then CSA = πrl)."""
    known = dict(dims)
    out = []
    for f in (info or {}).get("formulas", []):
        if f["label"].lower().startswith("equilateral"):    # a special case, not the measured triangle
            continue
        text = f["formula"].replace("[", "(").replace("]", ")")
        # "A = ¼√(…) a² ≈ 1.720 a²": keep the exact part; "P ≈ π(…)": the approximation is the formula itself
        text = text.split("≈")[0].strip() if "=" in text else text.replace("≈", "=")
        f = {**f, "formula": text}
        try:
            eq = formula_calc.parse_formula(f["formula"])[0]
        except Exception:
            continue                                         # e.g. "Interior angle: 108°"
        lhs, rhs, _ = eq
        if not hasattr(lhs, "name"):
            continue
        target = lhs.name
        need = {s.name for s in (lhs - rhs).free_symbols} - {target}
        if not need or not need <= known.keys():
            continue
        values = {k: known[k] for k in need}
        try:
            res = formula_calc.solve(f["formula"], target, values)
        except Exception:
            continue
        val = res["solutions"][0]["value"]
        out.append({"label": f["label"], "formula": f["formula"], "value_mm": val, "power": _power(f["formula"], target, values)})
        known.setdefault(target, val)
    return out


def measure_detections(dets: list, mm_per_px: float, class_info: dict, depth_mm: float | None = None) -> list[dict]:
    if not (mm_per_px and mm_per_px > 0 and math.isfinite(mm_per_px)):
        raise InputValidationError("Set the scale first (mm per pixel must be a positive number).",
                                   error_code="SCALE_REQUIRED", error_title="Scale not set")
    shapes = []
    for d in dets:
        w_mm, h_mm = (d.x2 - d.x1) * mm_per_px, (d.y2 - d.y1) * mm_per_px
        dims, notes = _dims_from_box(d.class_name, w_mm, h_mm, depth_mm)
        info = class_info.get(d.class_name)
        shapes.append({
            "class_name": d.class_name, "name": (info or {}).get("name", d.class_name),
            "dimension": (info or {}).get("dimension"), "confidence": round(d.confidence, 4),
            "box": [round(d.x1, 1), round(d.y1, 1), round(d.x2, 1), round(d.y2, 1)],
            "width_mm": round(w_mm, 3), "height_mm": round(h_mm, 3),
            "dims_mm": {formula_calc.pretty_name(k): round(v, 3) for k, v in dims.items()},
            "variables": (info or {}).get("variables", {}),
            "results": _evaluate(info, dims), "assumptions": notes,
        })
    return shapes
