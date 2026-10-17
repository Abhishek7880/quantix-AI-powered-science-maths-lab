"""Build the everyday-object detector: YOLO-World with Quantix's vocabulary (src/everyday.py) baked in.

    .venv\\Scripts\\python.exe tools\\build_everyday_model.py        # -> models/everyday/everyday.pt (+ .json)

set_classes() needs the CLIP text model (downloaded once, ~350 MB, only on this PC). The saved model keeps the
encoded vocabulary, so the server can run it without CLIP — just like any other YOLO model.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from src.everyday import EXTRA_NAMES as NAMES  # noqa: E402   (objects the COCO model doesn't know)

BASE = ROOT / "models" / "pretrained" / "yolov8s-worldv2.pt"
OUT = ROOT / "models" / "everyday"

if __name__ == "__main__":
    from ultralytics import YOLO
    model = YOLO(str(BASE))
    model.set_classes(NAMES)
    OUT.mkdir(parents=True, exist_ok=True)
    model.save(str(OUT / "everyday.pt"))
    (OUT / "everyday.json").write_text(json.dumps({"base": BASE.name, "classes": NAMES}, ensure_ascii=False, indent=1),
                                       encoding="utf-8")
    print(f"saved {OUT / 'everyday.pt'} with {len(NAMES)} classes")
