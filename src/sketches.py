"""Textbook-style labelled sketches of mensuration shapes (SVG for the web page, PNG for PDFs).

    render_sketch("cone", "svg") -> bytes
3D solids use an oblique (cavalier) projection with dashed hidden edges; dimensions are labelled with the
same symbols as the formulas (r, h, l, a, b …).
"""

from __future__ import annotations

import io
import math
from functools import lru_cache

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.patches import Arc, Circle, Ellipse, Polygon, Rectangle, Wedge  # noqa: E402

INK, FILL, DIM = "#1f2937", "#dbeafe", "#b91c1c"
K, ANG = 0.5, math.radians(40)                 # oblique projection depth factor and angle


def _p(x, y, z=0.0):
    return (x + z * K * math.cos(ANG), y + z * K * math.sin(ANG))


class _S:
    def __init__(self):
        self.fig, self.ax = plt.subplots(figsize=(3.4, 2.7), dpi=150)
        self.ax.set_aspect("equal")
        self.ax.axis("off")

    def line(self, a, b, dashed=False, color=INK, lw=1.6):
        self.ax.plot([a[0], b[0]], [a[1], b[1]], color=color, lw=lw if not dashed else 1.1,
                     ls=(0, (4, 3)) if dashed else "-", solid_capstyle="round", zorder=3)

    def poly(self, pts, fill=True):
        self.ax.add_patch(Polygon(pts, closed=True, fc=FILL if fill else "none", ec=INK, lw=1.6, zorder=2))

    def label(self, xy, text, color=DIM, size=12, **kw):
        self.ax.text(xy[0], xy[1], text, color=color, fontsize=size, fontstyle="italic", family="serif",
                     ha=kw.pop("ha", "center"), va=kw.pop("va", "center"), zorder=5, **kw)

    def right_angle(self, corner, d1, d2, s=0.12):
        a = (corner[0] + d1[0] * s, corner[1] + d1[1] * s)
        b = (a[0] + d2[0] * s, a[1] + d2[1] * s)
        c = (corner[0] + d2[0] * s, corner[1] + d2[1] * s)
        self.ax.plot([a[0], b[0], c[0]], [a[1], b[1], c[1]], color=INK, lw=1, zorder=4)

    def ellipse_arc(self, cx, cy, w, h, t1, t2, dashed=False):
        self.ax.add_patch(Arc((cx, cy), w, h, theta1=t1, theta2=t2, ec=INK, lw=1.6 if not dashed else 1.1,
                              ls=(0, (4, 3)) if dashed else "-", zorder=3))

    def done(self, fmt: str) -> bytes:
        self.ax.autoscale_view()
        self.ax.margins(0.12)
        buf = io.BytesIO()
        self.fig.savefig(buf, format=fmt, bbox_inches="tight", pad_inches=0.05, transparent=(fmt == "svg"),
                         facecolor="white" if fmt == "png" else "none")
        plt.close(self.fig)
        return buf.getvalue()


# ------------------------------------------------------------------ 2D
def _circle(s):
    s.ax.add_patch(Circle((0, 0), 1, fc=FILL, ec=INK, lw=1.6))
    s.line((0, 0), (1, 0), color=DIM)
    s.ax.plot(0, 0, "o", color=INK, ms=3)
    s.label((0.5, 0.12), "r")


def _semicircle(s):
    s.ax.add_patch(Wedge((0, 0), 1, 0, 180, fc=FILL, ec=INK, lw=1.6))
    s.line((0, 0), (math.cos(1), math.sin(1)), color=DIM)
    s.label((0.15, 0.5), "r")


def _ellipse(s):
    s.ax.add_patch(Ellipse((0, 0), 3, 1.8, fc=FILL, ec=INK, lw=1.6))
    s.line((0, 0), (1.5, 0), dashed=True, color=DIM)
    s.line((0, 0), (0, 0.9), dashed=True, color=DIM)
    s.label((0.75, -0.14), "a")
    s.label((-0.14, 0.45), "b")


def _square(s):
    s.poly([(0, 0), (2, 0), (2, 2), (0, 2)])
    s.line((0, 0), (2, 2), dashed=True, color=DIM)
    s.label((1, -0.2), "a")
    s.label((2.2, 1), "a")
    s.label((1.25, 0.9), "d", size=11)


def _rectangle(s):
    s.poly([(0, 0), (3, 0), (3, 1.7), (0, 1.7)])
    s.line((0, 0), (3, 1.7), dashed=True, color=DIM)
    s.label((1.5, -0.2), "l")
    s.label((3.2, 0.85), "b")
    s.label((1.6, 0.6), "d", size=11)


def _triangle(s):
    pts = [(0, 0), (3, 0), (1.1, 2)]
    s.poly(pts)
    s.line((1.1, 2), (1.1, 0), dashed=True, color=DIM)
    s.right_angle((1.1, 0), (1, 0), (0, 1), 0.15)
    s.label((1.6, -0.22), "b")
    s.label((1.27, 0.9), "h")
    s.label((0.35, 1.1), "a", color=INK)
    s.label((2.2, 1.15), "c", color=INK)


def _equilateral_triangle(s):
    h = math.sqrt(3)
    s.poly([(0, 0), (2, 0), (1, h)])
    s.line((1, h), (1, 0), dashed=True, color=DIM)
    s.label((1, -0.2), "a")
    s.label((0.35, 0.95), "a")
    s.label((1.65, 0.95), "a")
    s.label((1.15, 0.6), "h", size=11)


def _right_triangle(s):
    s.poly([(0, 0), (2.6, 0), (0, 1.8)])
    s.right_angle((0, 0), (1, 0), (0, 1), 0.18)
    s.label((1.3, -0.2), "a")
    s.label((-0.2, 0.9), "b")
    s.label((1.45, 1.05), "c")


def _rhombus(s):
    pts = [(0, 1.5), (1, 0), (0, -1.5), (-1, 0)]
    s.poly(pts)
    s.line((-1, 0), (1, 0), dashed=True, color=DIM)
    s.line((0, -1.5), (0, 1.5), dashed=True, color=DIM)
    s.label((0.5, 0.15), "d₁", size=11)
    s.label((0.2, 0.75), "d₂", size=11)
    s.label((0.68, 0.85), "a", color=INK)


def _parallelogram(s):
    s.poly([(0, 0), (2.6, 0), (3.4, 1.5), (0.8, 1.5)])
    s.line((0.8, 1.5), (0.8, 0), dashed=True, color=DIM)
    s.right_angle((0.8, 0), (1, 0), (0, 1), 0.15)
    s.label((1.6, -0.2), "b")
    s.label((0.95, 0.75), "h")
    s.label((3.2, 0.6), "a", color=INK)


def _trapezium(s):
    s.poly([(0, 0), (3.4, 0), (2.5, 1.6), (0.8, 1.6)])
    s.line((0.8, 1.6), (0.8, 0), dashed=True, color=DIM)
    s.label((1.7, -0.2), "a")
    s.label((1.65, 1.8), "b")
    s.label((0.95, 0.8), "h")


def _regular(s, n):
    r = 1.0
    pts = [(r * math.cos(math.pi / 2 + 2 * math.pi * i / n), r * math.sin(math.pi / 2 + 2 * math.pi * i / n)) for i in range(n)]
    s.poly(pts)
    mid = ((pts[1][0] + pts[2][0]) / 2, (pts[1][1] + pts[2][1]) / 2)   # label one side "a"
    s.label((mid[0] * 1.2, mid[1] * 1.2), "a")


def _kite(s):
    pts = [(0, 1.0), (0.9, 0.2), (0, -1.8), (-0.9, 0.2)]
    s.poly(pts)
    s.line((-0.9, 0.2), (0.9, 0.2), dashed=True, color=DIM)
    s.line((0, 1.0), (0, -1.8), dashed=True, color=DIM)
    s.label((0.45, 0.35), "d₁", size=11)
    s.label((0.18, -0.8), "d₂", size=11)
    s.label((0.6, 0.75), "a", color=INK)
    s.label((0.6, -0.9), "b", color=INK)


def _sector(s):
    s.ax.add_patch(Wedge((0, 0), 1.6, 15, 85, fc=FILL, ec=INK, lw=1.6))
    s.ax.add_patch(Arc((0, 0), 0.6, 0.6, theta1=15, theta2=85, ec=DIM, lw=1.2))
    s.label((0.42, 0.42), "θ")
    s.label((0.95, 0.12), "r")
    s.label((1.25, 1.25), "l", color=INK)


def _annulus(s):
    s.ax.add_patch(Circle((0, 0), 1.3, fc=FILL, ec=INK, lw=1.6))
    s.ax.add_patch(Circle((0, 0), 0.7, fc="white", ec=INK, lw=1.6))
    s.line((0, 0), (1.3, 0), color=DIM)
    s.line((0, 0), (-0.495, 0.495), color=DIM)
    s.label((1.0, 0.12), "R")
    s.label((-0.4, 0.15), "r")


# ------------------------------------------------------------------ 3D (oblique projection)
def _box(s, w, h, d):
    v = {k: _p(*k) for k in [(0, 0, 0), (w, 0, 0), (w, h, 0), (0, h, 0), (0, 0, d), (w, 0, d), (w, h, d), (0, h, d)]}
    s.poly([v[(0, 0, 0)], v[(w, 0, 0)], v[(w, h, 0)], v[(0, h, 0)]])                 # front
    s.poly([v[(0, h, 0)], v[(w, h, 0)], v[(w, h, d)], v[(0, h, d)]])                 # top
    s.poly([v[(w, 0, 0)], v[(w, 0, d)], v[(w, h, d)], v[(w, h, 0)]])                 # right
    hidden = v[(0, 0, d)]
    for q in [(w, 0, d), (0, h, d), (0, 0, 0)]:
        s.line(hidden, v[q], dashed=True)
    return v


def _cube(s):
    v = _box(s, 2, 2, 2)
    s.label((1, -0.25), "a")
    s.label((-0.25, 1), "a")
    s.label((2.55, 0.25), "a")


def _cuboid(s):
    v = _box(s, 3, 1.6, 1.6)
    s.label((1.5, -0.25), "l")
    s.label((-0.25, 0.8), "h")
    s.label((3.55, 0.2), "b")
    s.line(v[(0, 0, 0)], v[(3, 1.6, 1.6)], dashed=True, color=DIM)


def _cylinder(s):
    r, h, e = 1.0, 2.4, 0.35
    s.ax.add_patch(Rectangle((-r, 0), 2 * r, h, fc=FILL, ec="none", zorder=1))
    s.ax.add_patch(Ellipse((0, 0), 2 * r, 2 * e, fc=FILL, ec="none", zorder=1))
    s.ax.add_patch(Ellipse((0, h), 2 * r, 2 * e, fc="#eff6ff", ec=INK, lw=1.6, zorder=2))
    s.ellipse_arc(0, 0, 2 * r, 2 * e, 180, 360)
    s.ellipse_arc(0, 0, 2 * r, 2 * e, 0, 180, dashed=True)
    s.line((-r, 0), (-r, h))
    s.line((r, 0), (r, h))
    s.line((0, h), (r, h), color=DIM)
    s.line((0, 0), (0, h), dashed=True, color=DIM)
    s.label((0.5, h + 0.12), "r")
    s.label((0.15, h / 2), "h")


def _cone(s):
    r, h, e = 1.1, 2.4, 0.35
    s.ax.add_patch(Polygon([(-r, 0), (r, 0), (0, h)], fc=FILL, ec="none", zorder=1))
    s.ax.add_patch(Ellipse((0, 0), 2 * r, 2 * e, fc=FILL, ec="none", zorder=1))
    s.ellipse_arc(0, 0, 2 * r, 2 * e, 180, 360)
    s.ellipse_arc(0, 0, 2 * r, 2 * e, 0, 180, dashed=True)
    s.line((-r, 0), (0, h))
    s.line((r, 0), (0, h))
    s.line((0, 0), (0, h), dashed=True, color=DIM)
    s.line((0, 0), (r, 0), dashed=True, color=DIM)
    s.label((0.15, h / 2), "h")
    s.label((r / 2, -0.15), "r")
    s.label((0.75, h / 2 + 0.15), "l", color=INK)


def _sphere(s):
    s.ax.add_patch(Circle((0, 0), 1.2, fc=FILL, ec=INK, lw=1.6))
    s.ellipse_arc(0, 0, 2.4, 0.7, 180, 360)
    s.ellipse_arc(0, 0, 2.4, 0.7, 0, 180, dashed=True)
    s.line((0, 0), (1.2, 0), color=DIM)
    s.ax.plot(0, 0, "o", color=INK, ms=3)
    s.label((0.6, 0.15), "r")


def _hemisphere(s):
    s.ax.add_patch(Wedge((0, 0), 1.2, 0, 180, fc=FILL, ec=INK, lw=1.6))
    s.ax.add_patch(Ellipse((0, 0), 2.4, 0.7, fc="#eff6ff", ec="none", zorder=2))
    s.ellipse_arc(0, 0, 2.4, 0.7, 180, 360)
    s.ellipse_arc(0, 0, 2.4, 0.7, 0, 180, dashed=True)
    s.line((0, 0), (1.2, 0), color=DIM)
    s.label((0.6, 0.15), "r")


def _square_pyramid(s):
    a, h = 2.0, 2.4
    b = {k: _p(*k) for k in [(0, 0, 0), (a, 0, 0), (a, 0, a), (0, 0, a)]}
    apex = _p(a / 2, h, a / 2)
    centre = _p(a / 2, 0, a / 2)
    s.poly([b[(0, 0, 0)], b[(a, 0, 0)], apex])
    s.poly([b[(a, 0, 0)], b[(a, 0, a)], apex])
    s.line(b[(0, 0, 0)], b[(0, 0, a)], dashed=True)
    s.line(b[(0, 0, a)], b[(a, 0, a)], dashed=True)
    s.line(b[(0, 0, a)], apex, dashed=True)
    s.line(centre, apex, dashed=True, color=DIM)
    s.label((a / 2, -0.25), "a")
    s.label((centre[0] + 0.15, (centre[1] + apex[1]) / 2), "h")


def _triangular_prism(s):
    b, h, L = 2.0, 1.6, 2.4
    f = [_p(0, 0, 0), _p(b, 0, 0), _p(b / 2, h, 0)]
    k = [_p(0, 0, L), _p(b, 0, L), _p(b / 2, h, L)]
    s.poly([f[1], k[1], k[2], f[2]])
    s.poly(f)
    s.line(f[2], k[2])
    s.line(f[0], k[0], dashed=True)
    s.line(k[0], k[1], dashed=True)
    s.line(k[0], k[2], dashed=True)
    s.line(f[2], (b / 2, 0), dashed=True, color=DIM)
    s.label((b / 2, -0.25), "b")
    s.label((b / 2 + 0.15, h / 2), "h")
    s.label(((f[1][0] + k[1][0]) / 2 + 0.25, (f[1][1] + k[1][1]) / 2 - 0.1), "L")


def _frustum(s):
    R, r, h, e = 1.3, 0.7, 2.0, 0.35
    s.ax.add_patch(Polygon([(-R, 0), (R, 0), (r, h), (-r, h)], fc=FILL, ec="none", zorder=1))
    s.ax.add_patch(Ellipse((0, h), 2 * r, 2 * e * r / R, fc="#eff6ff", ec=INK, lw=1.6, zorder=2))
    s.ellipse_arc(0, 0, 2 * R, 2 * e, 180, 360)
    s.ellipse_arc(0, 0, 2 * R, 2 * e, 0, 180, dashed=True)
    s.line((-R, 0), (-r, h))
    s.line((R, 0), (r, h))
    s.line((0, 0), (R, 0), dashed=True, color=DIM)
    s.line((0, h), (r, h), color=DIM)
    s.line((0, 0), (0, h), dashed=True, color=DIM)
    s.label((R / 2, -0.15), "R")
    s.label((r / 2, h + 0.15), "r")
    s.label((0.15, h / 2), "h")
    s.label((1.2, h / 2), "l", color=INK)


def _hollow_cylinder(s):
    R, r, h, e = 1.2, 0.7, 2.2, 0.4
    s.ax.add_patch(Rectangle((-R, 0), 2 * R, h, fc=FILL, ec="none", zorder=1))
    s.ax.add_patch(Ellipse((0, 0), 2 * R, 2 * e, fc=FILL, ec="none", zorder=1))
    s.ax.add_patch(Ellipse((0, h), 2 * R, 2 * e, fc="#eff6ff", ec=INK, lw=1.6, zorder=2))
    s.ax.add_patch(Ellipse((0, h), 2 * r, 2 * e * r / R, fc="white", ec=INK, lw=1.4, zorder=3))
    s.ellipse_arc(0, 0, 2 * R, 2 * e, 180, 360)
    s.ellipse_arc(0, 0, 2 * R, 2 * e, 0, 180, dashed=True)
    s.line((-R, 0), (-R, h))
    s.line((R, 0), (R, h))
    s.line((0, h), (R, h), color=DIM)
    s.line((0, h), (-r * 0.7, h + e * r / R * 0.7), color=DIM)
    s.label((0.85, h + 0.13), "R")
    s.label((-0.25, h + 0.05), "r", size=10)
    s.label((R + 0.18, h / 2), "h")


def _spherical_shell(s):
    s.ax.add_patch(Circle((0, 0), 1.3, fc=FILL, ec=INK, lw=1.6))
    s.ax.add_patch(Circle((0, 0), 0.8, fc="white", ec=INK, lw=1.2, ls=(0, (4, 3))))
    s.line((0, 0), (1.3, 0), color=DIM)
    s.line((0, 0), (-0.566, 0.566), color=DIM)
    s.label((1.05, 0.13), "R")
    s.label((-0.45, 0.18), "r")


DRAW = {
    "circle": _circle, "semicircle": _semicircle, "ellipse": _ellipse, "square": _square, "rectangle": _rectangle,
    "triangle": _triangle, "equilateral_triangle": _equilateral_triangle, "right_triangle": _right_triangle,
    "rhombus": _rhombus, "parallelogram": _parallelogram, "trapezium": _trapezium,
    "pentagon": lambda s: _regular(s, 5), "hexagon": lambda s: _regular(s, 6), "kite": _kite,
    "sector": _sector, "annulus": _annulus,
    "cube": _cube, "cuboid": _cuboid, "cylinder": _cylinder, "cone": _cone, "sphere": _sphere,
    "hemisphere": _hemisphere, "square_pyramid": _square_pyramid, "triangular_prism": _triangular_prism,
    "frustum": _frustum, "hollow_cylinder": _hollow_cylinder, "spherical_shell": _spherical_shell,
}


@lru_cache(maxsize=128)
def render_sketch(shape: str, fmt: str = "svg") -> bytes:
    if shape not in DRAW:
        raise KeyError(shape)
    if fmt not in ("svg", "png"):
        raise ValueError(fmt)
    s = _S()
    DRAW[shape](s)
    return s.done(fmt)
