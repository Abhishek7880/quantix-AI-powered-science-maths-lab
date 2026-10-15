"""Draw the Quantix atom icon as PNG / ICO files (the SVG version is src/web/favicon.svg).

    .venv\\Scripts\\python.exe tools\\make_favicon.py

Writes src/web/favicon.ico (16/32/48 px, for browsers and /favicon.ico), src/web/favicon-32.png,
src/web/apple-touch-icon.png (180 px, iPhone home screen, dark rounded tile) and src/web/icon-512.png.
Drawn at 8x and scaled down for smooth edges.
"""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw

WEB = Path(__file__).resolve().parents[1] / "src" / "web"
BLUE, VIOLET, CORE, BG = (56, 189, 248), (167, 139, 250), (224, 242, 254), (5, 10, 22)


def atom(size: int, tile: bool = False) -> Image.Image:
    s = size * 8
    img = Image.new("RGBA", (s, s), BG + (255,) if tile else (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if tile:                                                        # rounded dark tile for home-screen icons
        mask = Image.new("L", (s, s), 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, s - 1, s - 1), radius=int(s * 0.22), fill=255)
        img.putalpha(mask)
    scale = s / 100 * (0.78 if tile else 1.0)                       # viewBox -50..50, padding on the tile
    cx = cy = s / 2
    width = max(2, round(5 * scale))
    for angle, colour, alpha in ((0, BLUE, 255), (60, VIOLET, 255), (120, BLUE, 205)):
        a = math.radians(angle)
        pts = []
        for i in range(181):
            t = 2 * math.pi * i / 180
            x, y = 44 * math.cos(t), 15 * math.sin(t)
            pts.append((cx + (x * math.cos(a) - y * math.sin(a)) * scale, cy + (x * math.sin(a) + y * math.cos(a)) * scale))
        layer = Image.new("RGBA", (s, s), (0, 0, 0, 0))
        ImageDraw.Draw(layer).line(pts, fill=colour + (alpha,), width=width, joint="curve")
        img = Image.alpha_composite(img, layer)
    d = ImageDraw.Draw(img)
    for r, colour in ((15, BLUE + (120,)), (11, BLUE + (255,)), (7, CORE + (255,))):   # glowing core
        layer = Image.new("RGBA", (s, s), (0, 0, 0, 0))
        ImageDraw.Draw(layer).ellipse((cx - r * scale, cy - r * scale, cx + r * scale, cy + r * scale), fill=colour)
        img = Image.alpha_composite(img, layer)
    return img.resize((size, size), Image.LANCZOS)


if __name__ == "__main__":
    big = atom(256)
    big.save(WEB / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
    atom(32).save(WEB / "favicon-32.png")
    atom(180, tile=True).save(WEB / "apple-touch-icon.png")
    atom(512, tile=True).save(WEB / "icon-512.png")
    print("written: favicon.ico, favicon-32.png, apple-touch-icon.png, icon-512.png in", WEB)
