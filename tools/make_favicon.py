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


def share_card() -> Image.Image:
    """1200x630 link-preview image (WhatsApp, LinkedIn, X…): atom + name + tagline on the site's dark gradient."""
    from PIL import ImageFont
    W, H = 1200, 630
    img = Image.new("RGB", (W, H), BG)
    px = img.load()
    for y in range(H):                                              # soft blue -> violet glow across the dark page
        for x in range(0, W, 2):
            g = max(0.0, 1 - math.hypot(x - 330, y - 315) / 520) ** 2
            v = max(0.0, 1 - math.hypot(x - 1050, y - 80) / 600) ** 2
            c = tuple(int(BG[i] + g * (BLUE[i] - BG[i]) * 0.35 + v * (VIOLET[i] - BG[i]) * 0.25) for i in range(3))
            px[x, y] = c
            if x + 1 < W:
                px[x + 1, y] = c
    img = img.convert("RGBA")
    img.alpha_composite(atom(420), (120, 105))
    d = ImageDraw.Draw(img)
    fonts = Path("C:/Windows/Fonts")
    bold = ImageFont.truetype(str(fonts / "segoeuib.ttf"), 112)
    semi = ImageFont.truetype(str(fonts / "seguisb.ttf"), 38)
    small = ImageFont.truetype(str(fonts / "segoeui.ttf"), 30)
    d.text((600, 150), "Quant", font=bold, fill=(230, 240, 255))
    d.text((600 + d.textlength("Quant", font=bold), 150), "ix", font=bold, fill=BLUE)
    d.text((604, 290), "AI-powered science & maths lab", font=semi, fill=(186, 230, 253))
    for i, line in enumerate(("1,022 formulas · step-by-step calculator", "Periodic table · physics simulations",
                              "Measure from photos · equation solver", "Free · English & Hindi")):
        d.text((604, 362 + i * 44), line, font=small, fill=(147, 166, 196))
    return img.convert("RGB")


if __name__ == "__main__":
    share_card().save(WEB / "og-image.png", optimize=True)
    big = atom(256)
    big.save(WEB / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
    atom(32).save(WEB / "favicon-32.png")
    atom(180, tile=True).save(WEB / "apple-touch-icon.png")
    atom(512, tile=True).save(WEB / "icon-512.png")
    print("written: favicon.ico, favicon-32.png, apple-touch-icon.png, icon-512.png in", WEB)
