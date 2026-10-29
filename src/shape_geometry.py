"""Exact outlines and true sizes of objects in a photo (classical computer vision, no extra model).

    object_mask(img, box)            GrabCut cut-out of the object inside a detection box
    foreground_regions(img)          objects that stand out from a plain table / paper (for things no model knows)
    analyse(img, mask, prior)        outline -> 2D shape or 3D solid, and its real dimensions in pixels:
                                     circle / ellipse / triangle / square / rectangle / rhombus / pentagon / hexagon,
                                     sphere / hemisphere / cylinder / cone / cube / cuboid
Sizes come from the outline, not the box: a mug's handle and a glass's elliptical rim are left out, a tilted
rectangle is measured along its own sides, and for solids seen from slightly above the camera tilt is estimated from
the visible rim (cylinder, cone) or top face (box) and corrected.
"""

from __future__ import annotations

import math

import cv2
import numpy as np

SOLIDS = {"sphere", "hemisphere", "cylinder", "cone", "cube", "cuboid", "square_pyramid", "triangular_prism"}
POLY_SIDES = {"triangle": 3, "square": 4, "rectangle": 4, "rhombus": 4, "pentagon": 5, "hexagon": 6}
# a shaded photo of what a drawing model calls a flat shape is the matching solid seen from the side
SOLID_OF = {"triangle": "cone", "rectangle": "cuboid", "square": "cube", "circle": "sphere"}


# ------------------------------------------------------------------ cut-outs
def _clean(mask: np.ndarray) -> np.ndarray:
    """Largest blob, holes filled."""
    n, lab, st, _ = cv2.connectedComponentsWithStats(mask.astype(np.uint8), 8)
    if n <= 1:
        return np.zeros_like(mask, np.uint8)
    k = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
    m = (lab == k).astype(np.uint8)
    cnts, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    out = np.zeros_like(m)
    cv2.drawContours(out, cnts, -1, 1, -1)
    return out


def object_mask(img: np.ndarray, box, iters: int = 4) -> np.ndarray | None:
    """Full-size 0/1 mask of the object in `box` (x1, y1, x2, y2) using GrabCut on a down-scaled crop."""
    h, w = img.shape[:2]
    x1, y1, x2, y2 = [float(v) for v in box]
    bw, bh = x2 - x1, y2 - y1
    if bw < 6 or bh < 6:
        return None
    pad = 0.12
    cx1, cy1 = max(0, int(x1 - pad * bw)), max(0, int(y1 - pad * bh))
    cx2, cy2 = min(w, int(x2 + pad * bw)), min(h, int(y2 + pad * bh))
    crop = img[cy1:cy2, cx1:cx2]
    s = min(1.0, 360 / max(crop.shape[:2]))
    small = cv2.resize(crop, (max(8, int(crop.shape[1] * s)), max(8, int(crop.shape[0] * s))), interpolation=cv2.INTER_AREA)
    rect = (max(1, int((x1 - cx1) * s)), max(1, int((y1 - cy1) * s)), max(4, int(bw * s) - 2), max(4, int(bh * s) - 2))
    rect = (rect[0], rect[1], min(rect[2], small.shape[1] - rect[0] - 1), min(rect[3], small.shape[0] - rect[1] - 1))
    gm = np.zeros(small.shape[:2], np.uint8)
    try:
        cv2.grabCut(small, gm, rect, np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64), iters, cv2.GC_INIT_WITH_RECT)
    except cv2.error:
        return None
    m = ((gm == cv2.GC_FGD) | (gm == cv2.GC_PR_FGD)).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    m = _clean(m)
    if m.sum() < 0.12 * rect[2] * rect[3]:             # GrabCut lost the object: fall back to nothing
        return None
    full = np.zeros((h, w), np.uint8)
    full[cy1:cy2, cx1:cx2] = cv2.resize(m, (crop.shape[1], crop.shape[0]), interpolation=cv2.INTER_NEAREST)
    return full


def foreground_regions(img: np.ndarray, min_frac: float = 0.004, max_regions: int = 8) -> list[np.ndarray]:
    """Objects that differ from the background colour (estimated from the image border). Shadows are mostly ignored
    by weighting lightness less than colour. Regions touching two or more image borders (a wall, a table edge) are
    dropped. Works for things lying on a plain surface; cluttered scenes rely on the detectors instead."""
    h, w = img.shape[:2]
    s = min(1.0, 720 / max(h, w))
    small = cv2.resize(img, (int(w * s), int(h * s)), interpolation=cv2.INTER_AREA) if s < 1 else img
    lab = cv2.cvtColor(cv2.GaussianBlur(small, (5, 5), 0), cv2.COLOR_BGR2LAB).astype(np.float32)
    sh, sw = lab.shape[:2]
    b = max(4, int(0.04 * min(sh, sw)))
    border = np.concatenate([lab[:b].reshape(-1, 3), lab[-b:].reshape(-1, 3), lab[:, :b].reshape(-1, 3), lab[:, -b:].reshape(-1, 3)])
    ref = np.median(border, axis=0)
    spread = np.median(np.abs(border - ref), axis=0)
    d = np.sqrt(((lab[..., 0] - ref[0]) * 0.45) ** 2 + (lab[..., 1] - ref[1]) ** 2 + (lab[..., 2] - ref[2]) ** 2)
    thr = max(10.0, 4.0 * float(np.sqrt((spread[0] * 0.45) ** 2 + spread[1] ** 2 + spread[2] ** 2)))
    m = (d > thr).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    n, lab_, st, _ = cv2.connectedComponentsWithStats(m, 8)
    out = []
    for k in sorted(range(1, n), key=lambda i: -st[i, cv2.CC_STAT_AREA]):
        x, y, ww, hh, area = st[k]
        if area < min_frac * sh * sw:
            break
        touches = int(x <= 1) + int(y <= 1) + int(x + ww >= sw - 1) + int(y + hh >= sh - 1)
        if touches >= 2 or area > 0.6 * sh * sw:
            continue
        r = _clean((lab_ == k).astype(np.uint8))
        out.append(cv2.resize(r, (w, h), interpolation=cv2.INTER_NEAREST) if s < 1 else r)
        if len(out) >= max_regions:
            break
    return out


# ------------------------------------------------------------------ outline analysis
def main_object(img: np.ndarray) -> np.ndarray | None:
    """The main subject of a photo nobody's model knows (an inverter in a rack, a machine part): GrabCut seeded with
    the middle of the frame, so neighbours and rails cut off by the frame edge stay background. None if the result
    is tiny, most of the frame, or in pieces."""
    h, w = img.shape[:2]
    m = object_mask(img, (0.06 * w, 0.06 * h, 0.94 * w, 0.96 * h))
    if m is None:
        return None
    cnt = _contour(m)
    if cnt is None:
        return None
    keep = np.zeros_like(m)
    cv2.drawContours(keep, [cnt], -1, 1, -1)                  # the biggest piece, holes filled
    frac = keep.mean()
    if not 0.03 < frac < 0.85 or cv2.contourArea(cnt) < 0.7 * m.sum():
        return None
    return keep.astype(np.uint8)


def _contour(mask):
    cnts, _ = cv2.findContours(mask.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    return max(cnts, key=cv2.contourArea) if cnts else None


def _row_widths(mask, y1, y2):
    """Width of the run through the body centre on each row (a mug handle beside the body is a separate run)."""
    xs = np.where(mask.any(axis=0))[0]
    cx = int((xs.min() + xs.max()) / 2)
    ws = []
    for y in range(int(y1), int(y2)):
        row = mask[y]
        if not row[cx]:
            idx = np.where(row)[0]
            if not len(idx):
                continue
            c = idx[np.argmin(np.abs(idx - cx))]
        else:
            c = cx
        l = c
        while l > 0 and row[l - 1]:
            l -= 1
        r = c
        while r < len(row) - 1 and row[r + 1]:
            r += 1
        ws.append((r - l + 1, l, r))
    return ws


def _shading(img, mask):
    """How much the brightness inside the object varies, after a flat colour would be removed (0 = flat paper)."""
    er = cv2.erode(mask, np.ones((5, 5), np.uint8), iterations=2)
    if er.sum() < 50:
        er = mask
    g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32)
    v = g[er > 0]
    return float(np.std(v)) if v.size else 0.0


def _inner_edges(img, mask):
    """Share of strong edges inside the object (box faces, a cylinder's rim); flat cut-outs have almost none."""
    er = cv2.erode(mask, np.ones((3, 3), np.uint8), iterations=max(2, int(0.04 * math.sqrt(mask.sum()))))
    if er.sum() < 50:
        return 0.0, None
    g = cv2.GaussianBlur(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY), (5, 5), 0)
    e = cv2.Canny(g, 40, 110)
    e[er == 0] = 0
    return float(e.sum() / 255) / math.sqrt(er.sum()), e


def looks_solid(img: np.ndarray, mask: np.ndarray, lenient: bool = False) -> bool:
    """Shading or inner edges (faces, rims) that a flat cut-out or a drawing does not have. lenient: a detector
    already says "solid", so a softly lit one still counts (flat paper shows almost none of either)."""
    shade, edges = _shading(img, mask), _inner_edges(img, mask)[0]
    return (shade > 5 or edges > 0.6) if lenient else (shade > 10 or edges > 1.2)


def _poly(cnt, peri):
    """Corner count at the coarsest tolerance that still keeps the outline (stable for real, slightly soft photos)."""
    best = None
    for eps in (0.012, 0.02, 0.03, 0.04):
        a = cv2.approxPolyDP(cnt, eps * peri, True)
        if best is None or len(a) < len(best):
            best = a
        if len(a) <= 6:
            break
    return best.reshape(-1, 2).astype(float)


def analyse(img: np.ndarray, mask: np.ndarray, prior: str | None = None) -> dict | None:
    """Shape and size (in pixels) of one object. `prior` is a shape name from a detector (e.g. "cylinder" for a mug);
    it decides between solids, while the outline gives the sizes. Returns {class_name, dimension, dims_px, outline,
    notes}."""
    cnt = _contour(mask)
    if cnt is None or cv2.contourArea(cnt) < 60:
        return None
    A = float(cv2.contourArea(cnt))
    P = float(cv2.arcLength(cnt, True))
    circ = 4 * math.pi * A / (P * P)
    x, y, bw, bh = cv2.boundingRect(cnt)
    (rcx, rcy), (rw, rh), ang = cv2.minAreaRect(cnt)
    rect_fill = A / max(rw * rh, 1)
    ell = cv2.fitEllipse(cnt) if len(cnt) >= 5 else ((0, 0), (bw, bh), 0)
    MA, ma = max(ell[1]), min(ell[1])
    ell_ratio = ma / max(MA, 1e-6)
    hull = cv2.convexHull(cnt)
    solidity = A / max(cv2.contourArea(hull), 1)
    shade = _shading(img, mask)
    edges, _ = _inner_edges(img, mask)
    poly = _poly(cnt, P)
    nv = len(poly)
    outline = cv2.approxPolyDP(cnt, min(1.5, 0.003 * P), True).reshape(-1, 2).astype(int).tolist()[:240]
    # flat (2D) or solid (3D)? Shading and inner edges say "solid"; a detector's solid label too.
    looks_3d = shade > 10 or edges > 1.2
    # how well the fitted ellipse covers the outline (a drawn or cut circle/ellipse: ~0.97+; polygons: lower)
    em = np.zeros(mask.shape, np.uint8)
    cv2.ellipse(em, ell, 1, -1)
    ell_fit = float(np.logical_and(em, mask).sum() / max(1, np.logical_or(em, mask).sum()))
    if prior in SOLIDS and shade < 4 and edges < 0.3 and ell_fit > 0.9:
        is3d = False                                   # a detector's "ball" that is evenly lit with no rim: a flat disc
    elif prior in SOLIDS:
        is3d = True
    elif prior and prior not in SOLIDS:
        is3d = False if not (shade > 22 and edges > 2.5) else True
    else:
        is3d = looks_3d
    notes: list[str] = []
    res = {"outline": outline, "notes": notes, "features": {"circularity": round(circ, 3), "rect_fill": round(rect_fill, 3),
           "ellipse_ratio": round(ell_ratio, 3), "solidity": round(solidity, 3), "vertices": nv, "shading": round(shade, 1),
           "inner_edges": round(edges, 2), "ellipse_fit": round(ell_fit, 3)}}

    if not is3d:                                       # ---------------- flat shapes
        if (circ > 0.84 or ell_fit > 0.965) and ell_ratio > 0.9:
            r = (MA + ma) / 4
            return {**res, "class_name": "circle", "dimension": "2D", "dims_px": {"r": r, "d": 2 * r}}
        if ell_fit > 0.965 or (circ > 0.7 and nv > 6 and ell_ratio <= 0.9):
            return {**res, "class_name": "ellipse", "dimension": "2D", "dims_px": {"a": MA / 2, "b": ma / 2}}
        # a drawing model's polygon name wins when the vertex count is off by one (rounded or rotated corners)
        want = POLY_SIDES.get(prior or "")
        if want and want != nv and abs(want - nv) <= 1:
            for eps in (0.012, 0.02, 0.03, 0.045):         # only if the outline also reads that way at some tolerance
                ap = cv2.approxPolyDP(cnt, eps * P, True).reshape(-1, 2)
                if len(ap) == want:
                    poly, nv = ap, want
                    break
        if nv == 3:
            sides = [float(np.linalg.norm(poly[i] - poly[(i + 1) % 3])) for i in range(3)]
            b_ = sides[0]
            return {**res, "class_name": "triangle", "dimension": "2D",
                    "dims_px": {"b": b_, "a": sides[1], "c": sides[2], "h": 2 * A / b_, "s": sum(sides) / 2}}
        if nv == 4 or rect_fill > 0.92:
            l_, s_ = max(rw, rh), min(rw, rh)
            if rect_fill < 0.8 and nv == 4:            # a diamond: diagonals are the bounding sides
                d1 = float(np.linalg.norm(poly[0] - poly[2])); d2 = float(np.linalg.norm(poly[1] - poly[3]))
                return {**res, "class_name": "rhombus", "dimension": "2D", "dims_px": {"d_1": d1, "d_2": d2, "a": math.hypot(d1, d2) / 2}}
            if s_ / l_ > 0.92:
                return {**res, "class_name": "square", "dimension": "2D", "dims_px": {"a": (l_ + s_) / 2}}
            return {**res, "class_name": "rectangle", "dimension": "2D", "dims_px": {"l": l_, "b": s_}}
        if nv in (5, 6):
            name = "pentagon" if nv == 5 else "hexagon"
            a = math.sqrt(4 * A * math.tan(math.pi / nv) / nv)        # regular polygon side from its area
            return {**res, "class_name": name, "dimension": "2D", "dims_px": {"a": a}}
        if circ > 0.75:
            return {**res, "class_name": "ellipse" if ell_ratio < 0.9 else "circle", "dimension": "2D",
                    "dims_px": {"a": MA / 2, "b": ma / 2} if ell_ratio < 0.9 else {"r": (MA + ma) / 4, "d": (MA + ma) / 2}}
        notes.append("irregular_outline")
        return {**res, "class_name": "polygon", "dimension": "2D", "dims_px": {"width": rw, "height": rh, "area": A}}

    # ---------------------------------------------------------------- solids
    top, bottom = y, y + bh
    ws = _row_widths(mask, top + 0.3 * bh, top + 0.7 * bh)
    body_w = float(np.median([w_[0] for w_ in ws])) if ws else bw
    cls = prior if prior in SOLIDS else None
    if cls is None:
        if circ > 0.84 and ell_ratio > 0.9:
            cls = "sphere"
        elif nv == 3 or (solidity > 0.85 and _narrow_top(mask, x, y, bw, bh)):
            cls = "cone"
        elif (nv in (5, 6) and edges > 1.2) or (rect_fill > 0.85 and max(_top_sagitta(mask, x, y, bw),
                                                 _bottom_sagitta(mask, x, y, bw, bh)) < 0.015 * bw):
            # faces and edges, or a straight top and bottom (a cylinder seen from slightly above shows a curved rim)
            cls = "cuboid"                             # depth is not visible, so "cube" only comes from a detector
        elif ell_ratio < 0.9 and bw > bh:
            cls = "hemisphere" if _round_bottom(mask, x, y, bw, bh) else "cuboid"
        else:
            cls = "cylinder"
    if cls == "sphere":
        r = (MA + ma) / 4
        return {**res, "class_name": "sphere", "dimension": "3D", "dims_px": {"r": r}}
    if cls == "hemisphere":
        r = bw / 2
        notes.append("open_side_up")
        return {**res, "class_name": "hemisphere", "dimension": "3D", "dims_px": {"r": r}}
    if cls == "cylinder":
        # the rim (top fifth) is as wide as the body but never includes a mug's handle
        rim = _row_widths(mask, top, top + 0.2 * bh)
        rim_w = max((w_[0] for w_ in rim), default=body_w)
        r = min(body_w, rim_w) / 2
        sag = _top_sagitta(mask, x, y, bw)
        e = min(2 * sag, 2 * r)                         # minor axis of the rim ellipse
        tilt = math.asin(min(0.95, e / (2 * r))) if r > 0 else 0.0
        hgt = max(1.0, (bh - e) / max(math.cos(tilt), 0.3))
        notes.append("rim_corrected" if e > 2 else "side_view")
        return {**res, "class_name": "cylinder", "dimension": "3D", "dims_px": {"r": r, "h": hgt}, "tilt_deg": round(math.degrees(tilt), 1)}
    if cls == "cone":
        bws = _row_widths(mask, top + 0.75 * bh, bottom - 1)
        base_w = max((w_[0] for w_ in bws), default=bw)
        r = base_w / 2
        sag = _bottom_sagitta(mask, x, y, bw, bh)
        e = min(2 * sag, 2 * r)
        tilt = math.asin(min(0.95, e / (2 * r))) if r > 0 else 0.0
        hgt = max(1.0, (bh - e / 2) / max(math.cos(tilt), 0.3))
        notes.append("base_corrected" if e > 2 else "side_view")
        return {**res, "class_name": "cone", "dimension": "3D", "dims_px": {"r": r, "h": hgt}}
    if cls in ("cube", "cuboid"):
        front_h, top_h = _box_front_height(img, mask, x, y, bw, bh)
        hgt = front_h if front_h else bh
        notes.append("top_face_removed" if front_h else "front_view")
        if cls == "cube":
            return {**res, "class_name": "cube", "dimension": "3D", "dims_px": {"a": hgt}}
        notes.append("depth_assumed")
        return {**res, "class_name": "cuboid", "dimension": "3D", "dims_px": {"l": bw if not front_h else bw * 0.75, "h": hgt, "b": (top_h or bw * 0.3) * 2}}
    notes.append("outline_only")
    return {**res, "class_name": cls, "dimension": "3D", "dims_px": {"width": bw, "height": bh}}


def _top_profile(mask, x, bw):
    cols = range(int(x + 0.04 * bw), int(x + 0.96 * bw))
    out = []
    for c in cols:
        ys = np.where(mask[:, c])[0]
        if len(ys):
            out.append((c, ys.min(), ys.max()))
    return out


def _top_sagitta(mask, x, y, bw):
    """How far the outline's top dips from the middle to the sides: half the rim ellipse's minor axis."""
    prof = _top_profile(mask, x, bw)
    if len(prof) < 6:
        return 0.0
    tops = np.array([p[1] for p in prof], float)
    n = len(tops)
    mid = np.median(tops[int(0.4 * n):int(0.6 * n) + 1])
    side = np.median(np.r_[tops[:max(1, n // 12)], tops[-max(1, n // 12):]])
    return max(0.0, float(side - mid))


def _bottom_sagitta(mask, x, y, bw, bh):
    prof = _top_profile(mask, x, bw)
    if len(prof) < 6:
        return 0.0
    bots = np.array([p[2] for p in prof], float)
    n = len(bots)
    mid = np.median(bots[int(0.4 * n):int(0.6 * n) + 1])
    side = np.median(np.r_[bots[:max(1, n // 12)], bots[-max(1, n // 12):]])
    return max(0.0, float(mid - side))


def _narrow_top(mask, x, y, bw, bh):
    ws = _row_widths(mask, y + 0.05 * bh, y + 0.2 * bh)
    return bool(ws) and np.median([w[0] for w in ws]) < 0.35 * bw


def _round_bottom(mask, x, y, bw, bh):
    ws = _row_widths(mask, y + 0.75 * bh, y + bh - 1)
    return bool(ws) and np.median([w[0] for w in ws]) < 0.75 * bw


def _box_front_height(img, mask, x, y, bw, bh):
    """A box seen from above shows its top face: find the brightness change between the top face and the front faces
    along the middle columns; the front face is what lies below it."""
    g = cv2.GaussianBlur(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY), (5, 5), 0).astype(np.float32)
    cols = np.linspace(x + 0.12 * bw, x + 0.88 * bw, 13).astype(int)
    cuts = []
    for c in cols:
        ys = np.where(mask[:, c])[0]
        if len(ys) < 10:
            continue
        prof = g[ys.min():ys.max() + 1, c]
        if len(prof) < 10:
            continue
        d = np.abs(np.diff(prof))
        lo, hi = int(0.08 * len(d)), int(0.7 * len(d))
        if hi <= lo:
            continue
        k = lo + int(np.argmax(d[lo:hi]))
        if d[k] > 6:
            cuts.append((ys.min() + k, ys.max(), c))
    if len(cuts) < 3:
        return None, None
    edge = float(np.median([c[0] for c in cuts]))
    # a real top-face edge is one straight line (slanted when the box is turned) across almost the whole box; a
    # label, panel or recess on the front face only crosses part of it
    xs_, ks = np.array([c[2] for c in cuts], float), np.array([c[0] for c in cuts], float)
    best = 0
    for i in range(len(cuts)):                       # line through every pair: the one most cut points agree with
        for j in range(i + 1, len(cuts)):
            if xs_[j] == xs_[i]:
                continue
            s = (ks[j] - ks[i]) / (xs_[j] - xs_[i])
            best = max(best, int((np.abs(ks - (ks[i] + s * (xs_ - xs_[i]))) <= 0.04 * bh).sum()))
    if best < 0.7 * len(cols):
        return None, None
    base = float(np.median([c[1] for c in cuts]))
    return base - edge, edge - y
