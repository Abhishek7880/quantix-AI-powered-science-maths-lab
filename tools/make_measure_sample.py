"""Make src/web/samples/measure_sample.jpg — a synthetic photo with a known scale for the Measure page.

Scale: 10 px = 1 mm. Contents (real sizes): a ₹10 coin (27 mm), a circle Ø 60 mm, a rectangle 80 × 40 mm and a
triangle with base 60 mm and height 50 mm, on a grey textured table.

    python tools/make_measure_sample.py
"""

from pathlib import Path

import cv2
import numpy as np

PX_PER_MM = 10
OUT = Path(__file__).resolve().parents[1] / "src" / "web" / "samples" / "measure_sample.jpg"


def main() -> None:
    rng = np.random.default_rng(7)
    h, w = 1400, 1800
    img = np.full((h, w, 3), (178, 182, 186), np.uint8)
    img = cv2.add(img, rng.integers(0, 18, (h, w, 3), dtype=np.uint8))
    img = cv2.GaussianBlur(img, (3, 3), 0)

    def mm(v):
        return int(round(v * PX_PER_MM))

    # ₹10 coin (27 mm): two-tone metal with a darker ring
    c = (mm(25), mm(25))
    shadow = np.zeros((h, w), np.uint8)                       # soft contact shadow, as under a real coin
    cv2.circle(shadow, (c[0] + 3, c[1] + 4), mm(13.5), 70, -1, cv2.LINE_AA)
    shadow = cv2.GaussianBlur(shadow, (31, 31), 0)
    img = cv2.subtract(img, cv2.merge([shadow] * 3))
    cv2.circle(img, c, mm(13.5), (60, 110, 130), -1, cv2.LINE_AA)   # rim: outer edge exactly at 13.5 mm
    cv2.circle(img, c, mm(13.5) - 4, (92, 168, 196), -1, cv2.LINE_AA)
    cv2.circle(img, c, mm(10), (160, 170, 176), -1, cv2.LINE_AA)
    cv2.putText(img, "10", (c[0] - 40, c[1] + 20), cv2.FONT_HERSHEY_SIMPLEX, 1.6, (90, 96, 100), 4, cv2.LINE_AA)

    # circle Ø 60 mm
    cv2.circle(img, (mm(100), mm(45)), mm(30), (60, 70, 200), -1, cv2.LINE_AA)
    # rectangle 80 × 40 mm
    cv2.rectangle(img, (mm(15), mm(85)), (mm(95), mm(125)), (40, 90, 200), -1)
    # triangle base 60 mm, height 50 mm
    base_y = mm(125)
    pts = np.array([[mm(110), base_y], [mm(170), base_y], [mm(140), base_y - mm(50)]], np.int32)
    cv2.fillPoly(img, [pts], (60, 160, 70), cv2.LINE_AA)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(OUT), img, [cv2.IMWRITE_JPEG_QUALITY, 90])
    print(f"wrote {OUT} ({w}×{h}, {PX_PER_MM} px/mm)")


if __name__ == "__main__":
    main()
