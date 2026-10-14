"""Score the shapes model on the independent check images in samples/shapes/.

The expected class is the file-name prefix (e.g. 'square_pyramid_1.png' -> square_pyramid).

  python tests/check_shape_model.py [--model models/shapes_mensuration/best.pt] [--conf 0.25]
"""

import argparse
import re
import sys
from pathlib import Path

import cv2

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from src.inference import Detector  # noqa: E402
from src.shapes_dataset import SHAPE_CLASSES  # noqa: E402


def expected_class(stem: str) -> str:
    for c in sorted(SHAPE_CLASSES, key=len, reverse=True):
        if stem == c or stem.startswith(c + "_"):
            return c
    return re.sub(r"_\d+$", "", stem)


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--model", default=str(ROOT / "models" / "shapes_mensuration" / "best.pt"))
    p.add_argument("--conf", type=float, default=0.25)
    p.add_argument("--imgsz", type=int, default=320)
    a = p.parse_args()
    det = Detector(a.model, "cpu", a.conf, 0.45, a.imgsz)
    det.warmup()
    files = sorted((ROOT / "samples" / "shapes").glob("*.png"))
    correct = 0
    for f in files:
        dets, _, _ = det.predict(cv2.imread(str(f)), annotate=False)
        want = expected_class(f.stem)
        top = max(dets, key=lambda d: d.confidence) if dets else None
        ok = top is not None and top.class_name == want
        correct += ok
        others = ", ".join(f"{d.class_name} {d.confidence:.2f}" for d in sorted(dets, key=lambda d: -d.confidence)[1:3])
        print(f"{'OK  ' if ok else 'MISS'} {f.name:<28} expected {want:<17} got "
              f"{(top.class_name + f' {top.confidence:.2f}') if top else '(nothing)':<24} {others}")
    print(f"\nTop-1 correct: {correct}/{len(files)} ({100 * correct / max(1, len(files)):.0f}%)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
