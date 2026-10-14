"""Synthetic dataset of textbook-style 2D and 3D geometric shapes (for the mensuration demo).

  python -m src.shapes_dataset --dest examples/shapes_dataset --train 1400 --val 250 --test 250

Draws each shape with random size, rotation, proportions and style:
  * styles      : outline, filled, filled+outline, shaded (3D), wireframe with dashed hidden edges
  * backgrounds : white, paper, graph paper, grey, chalkboard (white lines on dark)
  * extras      : dimension labels ("r = 5 cm", "h"), figure captions, blur, JPEG artefacts
3D solids use orthographic or oblique (cavalier) projection like school textbooks.

The images are SYNTHETIC drawings. A model trained on them recognises clean diagrams; real photos
of physical objects are a different domain and need real labeled photos.
"""

from __future__ import annotations

import argparse
import logging
import math
import shutil
import sys
from dataclasses import dataclass, field
from pathlib import Path

import cv2
import numpy as np

from src.config import resolve_path
from src.dataset_utils import write_data_yaml
from src.utils import setup_logging

log = logging.getLogger("shapes")

CLASSES_2D = ["circle", "semicircle", "ellipse", "square", "rectangle", "triangle", "rhombus",
              "parallelogram", "trapezium", "pentagon", "hexagon"]
CLASSES_3D = ["cube", "cuboid", "sphere", "hemisphere", "cylinder", "cone", "square_pyramid",
              "triangular_prism"]
SHAPE_CLASSES = CLASSES_2D + CLASSES_3D


# =========================================================================== primitives

@dataclass
class Drawing:
    """Shape geometry in arbitrary float units; rendered after fitting into a cell."""
    fills: list = field(default_factory=list)     # (pts Nx2, color BGR, shade_mode)
    lines: list = field(default_factory=list)     # (pts Nx2, closed, dashed)

    def all_points(self) -> np.ndarray:
        pts = [p for p, *_ in self.fills] + [p for p, *_ in self.lines]
        return np.concatenate(pts, axis=0)

    def transform(self, scale: float, offset: np.ndarray) -> "Drawing":
        return Drawing([(p * scale + offset, c, m) for p, c, m in self.fills],
                       [(p * scale + offset, cl, d) for p, cl, d in self.lines])


def arc(cx, cy, rx, ry, a0, a1, n=64) -> np.ndarray:
    """Ellipse arc points; angles in degrees, screen coords (y down): 0..180 = lower (front) half."""
    t = np.radians(np.linspace(a0, a1, n))
    return np.stack([cx + rx * np.cos(t), cy + ry * np.sin(t)], axis=1)


def rot2d(pts: np.ndarray, deg: float) -> np.ndarray:
    a = math.radians(deg)
    r = np.array([[math.cos(a), -math.sin(a)], [math.sin(a), math.cos(a)]])
    c = pts.mean(axis=0)
    return (pts - c) @ r.T + c


def shade(color, f: float):
    return tuple(int(np.clip(c * f, 0, 255)) for c in color)


# =========================================================================== 2D shapes

def regular_polygon(n: int, r: float = 1.0) -> np.ndarray:
    t = np.linspace(0, 2 * np.pi, n, endpoint=False) - np.pi / 2
    return np.stack([r * np.cos(t), r * np.sin(t)], axis=1)


def shape_2d(cls: str, rng: np.random.Generator) -> np.ndarray:
    """Closed outline points for a 2D shape (before rotation)."""
    if cls == "circle":
        return arc(0, 0, 1, 1, 0, 360, 120)[:-1]
    if cls == "ellipse":
        return arc(0, 0, rng.uniform(1.45, 2.4), 1, 0, 360, 120)[:-1]
    if cls == "semicircle":
        return arc(0, 0, 1, 1, 180, 360, 80)          # upper half + implicit diameter when closed
    if cls == "square":
        return np.array([[-1, -1], [1, -1], [1, 1], [-1, 1]], float)
    if cls == "rectangle":
        a = rng.uniform(1.45, 2.6)
        return np.array([[-a, -1], [a, -1], [a, 1], [-a, 1]], float)
    if cls == "rhombus":
        d = rng.uniform(1.45, 2.5)                     # diagonal ratio != 1 (else it is a square)
        return np.array([[0, -d], [1, 0], [0, d], [-1, 0]], float)
    if cls == "parallelogram":
        while True:   # slant side must differ clearly from the base, otherwise it is a rhombus
            b, h, s = rng.uniform(1.2, 2.4), 1.0, rng.uniform(0.45, 1.1) * rng.choice([-1, 1])
            slant = math.hypot(2 * s, 2 * h)
            if abs(slant - 2 * b) / (2 * b) > 0.25:
                return np.array([[-b + s, -h], [b + s, -h], [b - s, h], [-b - s, h]], float)
    if cls == "trapezium":
        a = rng.uniform(1.3, 2.2)                      # bottom half-width
        b = a * rng.uniform(0.35, 0.7)                 # top half-width
        off = rng.uniform(-(a - b), (a - b)) * rng.choice([0, 1])  # 0 -> isosceles
        h = rng.uniform(0.8, 1.4)
        return np.array([[-a, h], [a, h], [off + b, -h], [off - b, -h]], float)
    if cls == "pentagon":
        return regular_polygon(5)
    if cls == "hexagon":
        return regular_polygon(6)
    if cls == "triangle":
        kind = rng.choice(["equilateral", "right", "isosceles", "scalene"])
        if kind == "equilateral":
            return regular_polygon(3)
        if kind == "right":
            w, h = rng.uniform(1.0, 2.0), rng.uniform(1.0, 2.0)
            return np.array([[0, 0], [w, 0], [0, -h]], float)
        if kind == "isosceles":
            w, h = rng.uniform(0.6, 1.3), rng.uniform(1.2, 2.5)
            return np.array([[-w, 0], [w, 0], [0, -h]], float)
        while True:                                     # scalene, min angle >= 22 deg
            p = rng.uniform(-1, 1, (3, 2))
            ang = []
            for i in range(3):
                a, b, c = p[i], p[(i + 1) % 3], p[(i + 2) % 3]
                v1, v2 = b - a, c - a
                cosv = v1 @ v2 / (np.linalg.norm(v1) * np.linalg.norm(v2) + 1e-9)
                ang.append(math.degrees(math.acos(np.clip(cosv, -1, 1))))
            if min(ang) >= 22:
                return p
    raise ValueError(cls)


def draw_2d(cls: str, rng: np.random.Generator, style: str, color) -> Drawing:
    if rng.random() < 0.45:   # textbook pose: upright square, standing diamond, base-down triangle ...
        angle = float(rng.choice([0, 90, 180, 270])) + rng.uniform(-4, 4)
    else:
        angle = rng.uniform(0, 360)
    pts = rot2d(shape_2d(cls, rng), angle)
    d = Drawing()
    if style in ("filled", "filled_outline", "shaded"):
        d.fills.append((pts, color, "flat"))
    if style != "filled":
        d.lines.append((pts, True, False))
    return d


# =========================================================================== 3D polyhedra

def _box(l, b, h):
    v = np.array([[x, y, z] for x in (-l, l) for y in (-h, h) for z in (-b, b)], float)
    idx = {(sx, sy, sz): i for i, (sx, sy, sz) in enumerate((x, y, z) for x in (0, 1) for y in (0, 1) for z in (0, 1))}
    f = [[idx[0, 0, 0], idx[1, 0, 0], idx[1, 1, 0], idx[0, 1, 0]], [idx[0, 0, 1], idx[0, 1, 1], idx[1, 1, 1], idx[1, 0, 1]],
         [idx[0, 0, 0], idx[0, 0, 1], idx[1, 0, 1], idx[1, 0, 0]], [idx[0, 1, 0], idx[1, 1, 0], idx[1, 1, 1], idx[0, 1, 1]],
         [idx[0, 0, 0], idx[0, 1, 0], idx[0, 1, 1], idx[0, 0, 1]], [idx[1, 0, 0], idx[1, 0, 1], idx[1, 1, 1], idx[1, 1, 0]]]
    return v, f


def polyhedron(cls: str, rng: np.random.Generator):
    if cls == "cube":
        return _box(1, 1, 1)
    if cls == "cuboid":
        while True:
            dims = rng.uniform(0.45, 1.7, 3)
            if dims.max() / dims.min() >= 1.6:
                return _box(*dims)
    if cls == "square_pyramid":
        a, hgt = 1.0, rng.uniform(1.4, 2.6)
        v = np.array([[-a, -hgt / 2, -a], [a, -hgt / 2, -a], [a, -hgt / 2, a], [-a, -hgt / 2, a], [0, hgt / 2, 0]], float)
        return v, [[0, 1, 2, 3], [0, 4, 1], [1, 4, 2], [2, 4, 3], [3, 4, 0]]
    if cls == "triangular_prism":
        w, th, L = 1.0, rng.uniform(0.9, 1.8), rng.uniform(1.2, 2.4)
        tri = [(-w, -th / 2), (w, -th / 2), (rng.uniform(-0.4, 0.4) * w, th / 2)]
        v = np.array([[x, y, z] for z in (-L / 2, L / 2) for x, y in tri], float)
        return v, [[0, 1, 2], [3, 5, 4], [0, 3, 4, 1], [1, 4, 5, 2], [2, 5, 3, 0]]
    raise ValueError(cls)


def projection(rng: np.random.Generator, oblique: bool) -> np.ndarray:
    """2x3 linear map from object space to screen (y down)."""
    if oblique:   # cavalier / cabinet: front face undistorted, depth drawn at an angle
        ang = math.radians(rng.uniform(25, 50)) * rng.choice([-1, 1])
        k = rng.uniform(0.4, 0.7)
        rot = _rot_y(rng.uniform(-8, 8))
        p = np.array([[1, 0, k * math.cos(ang)], [0, -1, -k * abs(math.sin(ang))]])
        return p @ rot
    rot = _rot_x(rng.uniform(12, 35)) @ _rot_y(rng.uniform(18, 72) * rng.choice([-1, 1]))
    return np.array([[1, 0, 0], [0, -1, 0]]) @ rot


def _rot_x(deg):
    a = math.radians(deg)
    return np.array([[1, 0, 0], [0, math.cos(a), -math.sin(a)], [0, math.sin(a), math.cos(a)]])


def _rot_y(deg):
    a = math.radians(deg)
    return np.array([[math.cos(a), 0, math.sin(a)], [0, 1, 0], [-math.sin(a), 0, math.cos(a)]])


def draw_polyhedron(cls: str, rng: np.random.Generator, style: str, color) -> Drawing:
    verts, faces = polyhedron(cls, rng)
    if style == "shaded_noline":
        style = "shaded"   # flat faces without edges are unreadable; renders of polyhedra show edges
    if cls == "triangular_prism" and rng.random() < 0.5:
        verts = verts[:, [0, 2, 1]] * [1, 1, -1]    # stand the prism on its triangular end
    centre = verts.mean(axis=0)
    normals = []
    for f in faces:
        fv = verts[f]
        n = np.cross(fv[1] - fv[0], fv[2] - fv[0])
        if n @ (fv.mean(axis=0) - centre) < 0:
            n = -n
        normals.append(n / np.linalg.norm(n))
    light = np.array([0.4, 0.7, 0.6])
    light /= np.linalg.norm(light)

    mode = "oblique" if rng.random() < 0.35 else ("perspective" if rng.random() < 0.45 else "ortho")
    if mode == "perspective":   # camera on +z looking at the origin, like 3D plotting tools
        rot = _rot_x(rng.uniform(12, 35)) @ _rot_y(rng.uniform(18, 72) * rng.choice([-1, 1]))
        cam = verts @ rot.T
        f = rng.uniform(3.0, 7.0) * float(np.abs(verts).max())
        scale = f / (f - cam[:, 2])
        scr = np.stack([cam[:, 0] * scale, -cam[:, 1] * scale], axis=1)
        front = [float((rot @ n) @ (np.array([0, 0, f]) - cam[fc].mean(axis=0))) > 1e-6
                 for n, fc in zip(normals, faces)]
        lit = [rot @ n for n in normals]
    else:
        P = projection(rng, oblique=mode == "oblique")
        view = np.cross(P[0], P[1])                  # null space of P = viewing direction
        if view[2] < 0:
            view = -view
        view /= np.linalg.norm(view)
        scr = verts @ P.T
        front = [float(n @ view) > 1e-6 for n in normals]
        lit = normals
    d = Drawing()
    if style in ("filled", "filled_outline", "shaded", "shaded_noline"):
        for f, n, fr in zip(faces, lit, front):
            if fr:
                lam = 0.5 + 0.5 * max(0.0, float(n @ light)) if style.startswith("shaded") else 1.0
                d.fills.append((scr[f], shade(color, lam), "flat"))
    if style == "shaded_noline":
        style = "filled"    # faces only, no edge lines (render-style images)
    edges = {}
    for fi, f in enumerate(faces):
        for i in range(len(f)):
            e = tuple(sorted((f[i], f[(i + 1) % len(f)])))
            edges[e] = edges.get(e, False) or front[fi]
    show_hidden = style in ("outline", "wire_dashed") and rng.random() < 0.75
    for (a, b), visible in edges.items():
        if visible and style != "filled":
            d.lines.append((scr[[a, b]], False, False))
        elif not visible and show_hidden:
            d.lines.append((scr[[a, b]], False, True))
    if not d.lines and not d.fills:
        d.lines.append((scr[[0, 1]], False, False))
    return d


# =========================================================================== 3D curved solids

def draw_curved(cls: str, rng: np.random.Generator, style: str, color) -> Drawing:
    d = Drawing()
    filled = style in ("filled", "filled_outline", "shaded", "shaded_noline")
    outline = style not in ("filled", "shaded_noline")
    dashed_back = rng.random() < 0.7
    t = rng.uniform(0.18, 0.42)                     # ellipse flattening (viewing tilt)
    if style == "shaded_noline":                    # smooth render look (3D plotting tools)
        style = "shaded"
        grad = str(rng.choice(["radial", "vgrad", "hgrad"]))
    else:
        grad = None

    if cls == "cylinder":
        r, h = 1.0, rng.uniform(1.0, 3.0)
        top, bot = -h / 2, h / 2
        body = np.concatenate([[[-r, top]], arc(0, bot, r, r * t, 180, 0, 64), [[r, top]]])
        if filled:
            d.fills.append((body, color, (grad or "hgrad") if style == "shaded" else "flat"))
            d.fills.append((arc(0, top, r, r * t, 0, 360), shade(color, 1.25), "flat"))
        if outline:
            d.lines.append((arc(0, top, r, r * t, 0, 360), True, False))
            d.lines.append((arc(0, bot, r, r * t, 0, 180), False, False))
            if dashed_back:
                d.lines.append((arc(0, bot, r, r * t, 180, 360), False, True))
            d.lines.append((np.array([[-r, top], [-r, bot]]), False, False))
            d.lines.append((np.array([[r, top], [r, bot]]), False, False))
    elif cls == "cone":
        r, h = 1.0, rng.uniform(1.3, 3.0)
        inverted = rng.random() < 0.15
        apex_y, base_y = (h / 2, -h / 2) if inverted else (-h / 2, h / 2)
        if filled:
            if inverted:
                body = np.array([[0, apex_y], [r, base_y], [-r, base_y]])
                d.fills.append((body, color, (grad or "hgrad") if style == "shaded" else "flat"))
                d.fills.append((arc(0, base_y, r, r * t, 0, 360), shade(color, 1.25), "flat"))
            else:
                body = np.concatenate([[[0, apex_y]], arc(0, base_y, r, r * t, 0, 180, 64)])
                d.fills.append((body, color, (grad or "hgrad") if style == "shaded" else "flat"))
        if outline:
            d.lines.append((np.array([[0, apex_y], [-r, base_y]]), False, False))
            d.lines.append((np.array([[0, apex_y], [r, base_y]]), False, False))
            if inverted:
                d.lines.append((arc(0, base_y, r, r * t, 0, 360), True, False))
            else:
                d.lines.append((arc(0, base_y, r, r * t, 0, 180), False, False))
                if dashed_back:
                    d.lines.append((arc(0, base_y, r, r * t, 180, 360), False, True))
            if rng.random() < 0.35:                 # dashed height + radius, textbook style
                d.lines.append((np.array([[0, apex_y], [0, base_y]]), False, True))
                d.lines.append((np.array([[0, base_y], [r, base_y]]), False, True))
    elif cls == "sphere":
        circle = arc(0, 0, 1, 1, 0, 360, 120)
        if filled:
            d.fills.append((circle, color, (grad or "radial") if style == "shaded" else "flat"))
        if outline:
            d.lines.append((circle, True, False))
        if outline and rng.random() < 0.7:          # equator
            d.lines.append((arc(0, 0, 1, t, 0, 180), False, False))
            if dashed_back:
                d.lines.append((arc(0, 0, 1, t, 180, 360), False, True))
        if outline and rng.random() < 0.3:
            d.lines.append((np.array([[0, 0], [1, 0]]), False, rng.random() < 0.5))
    elif cls == "hemisphere":
        dome_up = rng.random() < 0.55
        if dome_up:   # flat base at bottom, dome on top
            dome = np.concatenate([arc(0, 0, 1, 1, 180, 360, 80), arc(0, 0, 1, t, 0, 180, 40)[::-1]])
            if filled:
                d.fills.append((dome, color, (grad or "radial") if style == "shaded" else "flat"))
            if outline:
                d.lines.append((arc(0, 0, 1, 1, 180, 360, 80), False, False))
                d.lines.append((arc(0, 0, 1, t, 0, 180), False, False))
                if dashed_back:
                    d.lines.append((arc(0, 0, 1, t, 180, 360), False, True))
        else:         # bowl: flat face on top
            bowl = np.concatenate([arc(0, 0, 1, 1, 0, 180, 80), arc(0, 0, 1, t, 180, 360, 40)])
            if filled:
                d.fills.append((bowl, color, (grad or "radial") if style == "shaded" else "flat"))
                d.fills.append((arc(0, 0, 1, t, 0, 360), shade(color, 1.3), "flat"))
            if outline:
                d.lines.append((arc(0, 0, 1, 1, 0, 180, 80), False, False))
                d.lines.append((arc(0, 0, 1, t, 0, 360), True, False))
    else:
        raise ValueError(cls)
    return d


def draw_shape(cls: str, rng: np.random.Generator, style: str, color) -> Drawing:
    if cls in CLASSES_2D:
        style2d = {"shaded": "filled_outline", "wire_dashed": "filled_outline", "shaded_noline": "filled"}.get(style, style)
        return draw_2d(cls, rng, style2d, color)
    if cls in ("cube", "cuboid", "square_pyramid", "triangular_prism"):
        return draw_polyhedron(cls, rng, style, color)
    return draw_curved(cls, rng, style, color)


# =========================================================================== rendering

def _dashed(img, pts, color, thick, dash, gap):
    seg_on, pos = True, 0.0
    for a, b in zip(pts[:-1], pts[1:]):
        length = float(np.linalg.norm(b - a))
        if length < 1e-6:
            continue
        direction = (b - a) / length
        s = 0.0
        while s < length:
            step = min((dash if seg_on else gap) - pos, length - s)
            if seg_on:
                p1, p2 = a + direction * s, a + direction * (s + step)
                cv2.line(img, tuple(np.round(p1).astype(int)), tuple(np.round(p2).astype(int)), color, thick, cv2.LINE_AA)
            s += step
            pos += step
            if pos >= (dash if seg_on else gap) - 1e-9:
                seg_on, pos = not seg_on, 0.0


def _shade_fill(img, pts, color, mode):
    poly = np.round(pts).astype(np.int32)
    if mode == "flat":
        cv2.fillPoly(img, [poly], color, cv2.LINE_AA)
        return
    mask = np.zeros(img.shape[:2], np.uint8)
    cv2.fillPoly(mask, [poly], 255, cv2.LINE_AA)
    x0, y0, w, h = cv2.boundingRect(poly)
    if w < 2 or h < 2:
        return
    yy, xx = np.mgrid[0:img.shape[0], 0:img.shape[1]].astype(np.float32)
    if mode == "hgrad":
        u = (xx - (x0 + w * 0.38)) / (w / 2)
        bright = np.clip(1.1 - 0.55 * u ** 2, 0.35, 1.25)
    elif mode == "vgrad":  # darker at the top, lighter at the bottom (colour-map look)
        bright = np.clip(0.45 + 0.85 * (yy - y0) / max(h, 1), 0.35, 1.3)
    else:  # radial highlight up-left
        cx, cy, r = x0 + w * 0.36, y0 + h * 0.33, max(w, h) * 0.75
        bright = np.clip(1.25 - 0.85 * np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) / r, 0.3, 1.25)
    if mode != "hgrad" and np.random.random() < 0.5:   # visible colour bands, as in plotted surfaces
        levels = np.random.randint(6, 14)
        bright = np.round(bright * levels) / levels
    layer = np.clip(np.array(color, np.float32)[None, None, :] * bright[..., None], 0, 255)
    a = (mask.astype(np.float32) / 255.0)[..., None]
    img[:] = (img * (1 - a) + layer * a).astype(np.uint8)


def render(img, drawing: Drawing, line_color, thick: int):
    for pts, color, mode in drawing.fills:
        _shade_fill(img, pts, color, mode)
    dash = max(5, thick * 4)
    for pts, closed, dashed in drawing.lines:
        p = np.vstack([pts, pts[:1]]) if closed else pts
        if dashed:
            _dashed(img, p, line_color, max(1, thick - 1), dash, dash * 0.7)
        else:
            cv2.polylines(img, [np.round(p).astype(np.int32)], False, line_color, thick, cv2.LINE_AA)


def background(rng: np.random.Generator, size: int):
    kind = rng.choice(["white", "white", "paper", "graph", "grey", "chalk", "tinted", "checker"],
                      p=[0.23, 0.1, 0.13, 0.14, 0.11, 0.09, 0.12, 0.08])
    if kind == "checker":   # "transparent PNG" checkerboard, as seen in screenshots of image editors
        step = int(rng.integers(6, 14))
        yy, xx = np.mgrid[0:size, 0:size]
        light, dark = int(rng.integers(245, 256)), int(rng.integers(220, 238))
        img = np.where(((yy // step + xx // step) % 2 == 0)[..., None], light, dark).astype(np.uint8).repeat(3, axis=2)
    elif kind == "white":
        img = np.full((size, size, 3), 255, np.uint8)
    elif kind == "paper":
        img = np.full((size, size, 3), (rng.integers(225, 245), rng.integers(235, 250), rng.integers(240, 255)), np.uint8)
    elif kind == "graph":
        img = np.full((size, size, 3), 255, np.uint8)
        step = int(rng.integers(12, 28))
        c = (int(rng.integers(200, 240)), int(rng.integers(215, 245)), int(rng.integers(170, 235)))
        for v in range(0, size, step):
            cv2.line(img, (v, 0), (v, size), c, 1)
            cv2.line(img, (0, v), (size, v), c, 1)
    elif kind == "grey":
        g = int(rng.integers(170, 225))
        img = np.clip(np.full((size, size, 3), g, np.float32) + rng.normal(0, 6, (size, size, 1)), 0, 255).astype(np.uint8)
    elif kind == "chalk":
        img = np.full((size, size, 3), (int(rng.integers(30, 60)), int(rng.integers(55, 85)), int(rng.integers(25, 50))), np.uint8)
        img = np.clip(img + rng.normal(0, 5, (size, size, 1)), 0, 255).astype(np.uint8)
    else:
        img = np.full((size, size, 3), tuple(int(v) for v in rng.integers(200, 256, 3)), np.uint8)
    dark = kind == "chalk"
    return img, dark


def _label(img, rng, near: np.ndarray, color):
    texts = ["r", "h", "l", "a", "b", "d", "5 cm", "7 cm", "r = 3 cm", "h = 10 cm", "12 m", "x", "4.5 cm", "s", "8"]
    txt = str(rng.choice(texts))
    x = int(np.clip(near[0] + rng.integers(-15, 15), 2, img.shape[1] - 60))
    y = int(np.clip(near[1] + rng.integers(-15, 15), 14, img.shape[0] - 4))
    cv2.putText(img, txt, (x, y), cv2.FONT_HERSHEY_SIMPLEX, rng.uniform(0.35, 0.6), color, 1, cv2.LINE_AA)


def make_image(rng: np.random.Generator, size: int = 416):
    img, dark = background(rng, size)
    layout = rng.choice([1, 2, 3, 4], p=[0.55, 0.22, 0.1, 0.13])
    if layout == 1:
        cells = [(0, 0, size, size)]
    elif layout == 2:
        cells = [(0, 0, size // 2, size), (size // 2, 0, size // 2, size)] if rng.random() < 0.5 else \
                [(0, 0, size, size // 2), (0, size // 2, size, size // 2)]
    else:
        h = size // 2
        cells = [(0, 0, h, h), (h, 0, h, h), (0, h, h, h), (h, h, h, h)][:layout]
    labels = []
    for (cx0, cy0, cw, ch) in cells:
        cls_id = int(rng.integers(0, len(SHAPE_CLASSES)))
        cls = SHAPE_CLASSES[cls_id]
        style = rng.choice(["outline", "outline", "filled", "filled_outline", "shaded", "wire_dashed", "shaded_noline"])
        if dark:
            style = rng.choice(["outline", "wire_dashed"])
        color = tuple(int(v) for v in rng.integers(40, 230, 3))
        line_color = (235, 235, 235) if dark else (tuple(int(v) for v in rng.integers(0, 70, 3))
                                                   if rng.random() < 0.85 else tuple(int(v) for v in rng.integers(0, 200, 3)))
        thick = int(rng.choice([1, 2, 2, 3, 3, 4, 5]))
        dwg = draw_shape(cls, rng, style, color)
        pts = dwg.all_points()
        lo, hi = pts.min(axis=0), pts.max(axis=0)
        span = np.maximum(hi - lo, 1e-6)
        margin = 0.08 * min(cw, ch) + thick + 4
        fill = rng.uniform(0.5, 0.95)
        scale = fill * min((cw - 2 * margin) / span[0], (ch - 2 * margin) / span[1])
        room = np.array([cw, ch]) - span * scale - 2 * margin
        offset = np.array([cx0, cy0]) + margin + rng.uniform(0, 1, 2) * np.maximum(room, 0) - lo * scale
        dwg = dwg.transform(scale, offset)
        render(img, dwg, line_color, thick)
        pts = dwg.all_points()
        x1, y1 = np.floor(pts.min(axis=0) - thick / 2)
        x2, y2 = np.ceil(pts.max(axis=0) + thick / 2)
        x1, y1, x2, y2 = max(0, x1), max(0, y1), min(size - 1, x2), min(size - 1, y2)
        if x2 - x1 < 6 or y2 - y1 < 6:
            continue
        if rng.random() < 0.35:
            _label(img, rng, np.array([x2 + 4, (y1 + y2) / 2]) if rng.random() < 0.5 else np.array([(x1 + x2) / 2, y2 + 16]),
                   line_color)
        labels.append((cls_id, (x1 + x2) / 2 / size, (y1 + y2) / 2 / size, (x2 - x1) / size, (y2 - y1) / size))
    if rng.random() < 0.15:
        cv2.putText(img, f"Fig. {int(rng.integers(1, 30))}", (8, size - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.45,
                    (90, 90, 90) if not dark else (200, 200, 200), 1, cv2.LINE_AA)
    if rng.random() < 0.12:   # screenshot crop: dark UI strip on one edge, outside the shapes
        side, w = int(rng.integers(0, 4)), int(rng.integers(6, 40))
        boxes = [((x - bw / 2) * size, (y - bh / 2) * size, (x + bw / 2) * size, (y + bh / 2) * size)
                 for _, x, y, bw, bh in labels]
        col = tuple(int(v) for v in rng.integers(25, 60, 3))
        if side == 0 and all(b[2] < size - w for b in boxes):
            img[:, size - w:] = col
        elif side == 1 and all(b[0] > w for b in boxes):
            img[:, :w] = col
        elif side == 2 and all(b[3] < size - w for b in boxes):
            img[size - w:, :] = col
        elif side == 3 and all(b[1] > w for b in boxes):
            img[:w, :] = col
    if rng.random() < 0.3:
        img = cv2.GaussianBlur(img, (3, 3), 0)
    return img, labels


def make_shapes_dataset(dest: Path, n_train=1400, n_val=250, n_test=250, size=416, seed=7, overwrite=False) -> Path:
    if dest.exists() and any(dest.iterdir()):
        if not overwrite:
            raise FileExistsError(f"{dest} is not empty (use --overwrite)")
        shutil.rmtree(dest)
    rng = np.random.default_rng(seed)
    for split, n in (("train", n_train), ("val", n_val), ("test", n_test)):
        (dest / "images" / split).mkdir(parents=True, exist_ok=True)
        (dest / "labels" / split).mkdir(parents=True, exist_ok=True)
        for i in range(n):
            img, labels = make_image(rng, size)
            name = f"{split}_{i:05d}"
            q = int(rng.integers(70, 96))
            cv2.imwrite(str(dest / "images" / split / f"{name}.jpg"), img, [cv2.IMWRITE_JPEG_QUALITY, q])
            (dest / "labels" / split / f"{name}.txt").write_text(
                "".join(f"{c} {x:.6f} {y:.6f} {w:.6f} {h:.6f}\n" for c, x, y, w, h in labels), encoding="utf-8")
    write_data_yaml(dest / "data.yaml", SHAPE_CLASSES, overwrite=True,
                    extra_comment="SYNTHETIC textbook-style 2D/3D shapes for the mensuration demo")
    log.info("Shapes dataset written to %s", dest)
    return dest / "data.yaml"


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--dest", default="examples/shapes_dataset")
    p.add_argument("--train", type=int, default=1400)
    p.add_argument("--val", type=int, default=250)
    p.add_argument("--test", type=int, default=250)
    p.add_argument("--size", type=int, default=416)
    p.add_argument("--seed", type=int, default=7)
    p.add_argument("--overwrite", action="store_true")
    p.add_argument("--preview", type=int, default=0, help="only write N preview images to outputs/shape_preview")
    a = p.parse_args(argv)
    setup_logging("shapes")
    if a.preview:
        out = resolve_path("outputs/shape_preview")
        out.mkdir(parents=True, exist_ok=True)
        rng = np.random.default_rng(a.seed)
        tiles = []
        for i in range(a.preview):
            img, labels = make_image(rng, a.size)
            for c, x, y, w, h in labels:
                s = a.size
                cv2.rectangle(img, (int((x - w / 2) * s), int((y - h / 2) * s)), (int((x + w / 2) * s), int((y + h / 2) * s)), (0, 0, 255), 1)
                cv2.putText(img, SHAPE_CLASSES[c], (int((x - w / 2) * s) + 2, int((y - h / 2) * s) + 12),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 0, 255), 1, cv2.LINE_AA)
            tiles.append(cv2.resize(img, (260, 260)))
        cols = 6
        rows = [np.hstack(tiles[i:i + cols] + [np.zeros_like(tiles[0])] * (cols - len(tiles[i:i + cols])))
                for i in range(0, len(tiles), cols)]
        cv2.imwrite(str(out / "preview.jpg"), np.vstack(rows))
        print(out / "preview.jpg")
        return 0
    make_shapes_dataset(resolve_path(a.dest), a.train, a.val, a.test, a.size, a.seed, a.overwrite)
    print(f"Dataset ready: {resolve_path(a.dest) / 'data.yaml'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
