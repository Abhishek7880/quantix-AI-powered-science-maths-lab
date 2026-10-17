"""Fine-tune the everyday-object model on corrected photos (home page "✏️ Wrong? Help Quantix learn").

    .venv\\Scripts\\python.exe tools\\train_everyday.py --pull        # copy the server's collected photos, show counts
    .venv\\Scripts\\python.exe tools\\train_everyday.py --train       # train when there is enough data

Data: outputs/feedback/everyday/ (samples.jsonl + images/), see src/feedback.py. Only boxes whose label is an object
Quantix knows the shape of (src/everyday.py) are used, and only objects with at least --min-per-object examples.
Result: models/everyday_ft/best.pt (+ classes.json). Auto mode then tries it first on real photos.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from src import feedback  # noqa: E402
from src.everyday import shape_of  # noqa: E402

HOST, USER, KEY = "144.24.129.250", "ubuntu", Path.home() / ".ssh" / "quantix_oracle"
DATA = ROOT / "datasets" / "everyday_ft"
OUT = ROOT / "models" / "everyday_ft"


def pull() -> None:
    """Copy outputs/feedback/everyday from the server (it lives in ~/quantix/data there)."""
    feedback.DIR.parent.mkdir(parents=True, exist_ok=True)
    tmp = feedback.DIR.parent / "server_feedback.tar.gz"
    with open(tmp, "wb") as fh:
        r = subprocess.run(["ssh", "-i", str(KEY), "-o", "BatchMode=yes", f"{USER}@{HOST}",
                            "cd ~/quantix/data/feedback 2>/dev/null && sudo tar -czf - everyday || true"], stdout=fh)
    if r.returncode == 0 and tmp.stat().st_size > 100:
        subprocess.run(["tar", "-xzf", str(tmp), "-C", str(feedback.DIR.parent)], check=True)
        print(f"pulled server corrections into {feedback.DIR}")
    else:
        print("no corrections on the server yet")
    tmp.unlink(missing_ok=True)


def summary(samples: list[dict]) -> Counter:
    c = Counter(b["label"] for s in samples for b in s["boxes"] if b["label"])
    unknown = sorted(n for n in c if not shape_of(n))
    print(f"{len(samples)} photos, {sum(c.values())} labelled boxes, {len(c)} different objects")
    for name, k in c.most_common(30):
        print(f"  {k:4d}  {name}{'' if shape_of(name) else '   (no shape yet — add it to src/everyday.py OBJECTS)'}")
    if unknown:
        print(f"{len(unknown)} names have no shape mapping yet: {', '.join(unknown[:15])}")
    return c


def build_dataset(samples: list[dict], classes: list[str]) -> Path:
    if DATA.exists():
        shutil.rmtree(DATA)
    idx = {n: i for i, n in enumerate(classes)}
    for s in samples:
        boxes = [b for b in s["boxes"] if b["label"] in idx]
        if not boxes:
            continue
        split = "val" if int(hashlib.md5(s["id"].encode()).hexdigest(), 16) % 5 == 0 else "train"   # stable 80/20
        (DATA / "images" / split).mkdir(parents=True, exist_ok=True)
        (DATA / "labels" / split).mkdir(parents=True, exist_ok=True)
        shutil.copy2(feedback.DIR / "images" / f"{s['id']}.jpg", DATA / "images" / split / f"{s['id']}.jpg")
        W, H = s["width"], s["height"]
        lines = [f"{idx[b['label']]} {(b['box'][0] + b['box'][2]) / 2 / W:.6f} {(b['box'][1] + b['box'][3]) / 2 / H:.6f} "
                 f"{(b['box'][2] - b['box'][0]) / W:.6f} {(b['box'][3] - b['box'][1]) / H:.6f}" for b in boxes]
        (DATA / "labels" / split / f"{s['id']}.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")
    yaml = DATA / "data.yaml"
    yaml.write_text(f"path: {DATA.as_posix()}\ntrain: images/train\nval: images/val\nnames: {json.dumps(classes)}\n", encoding="utf-8")
    return yaml


def train(min_per_object: int, epochs: int) -> None:
    samples = feedback.read_all()
    counts = summary(samples)
    classes = sorted(n for n, k in counts.items() if k >= min_per_object and shape_of(n))
    if not classes:
        sys.exit(f"Not enough data yet: no object has {min_per_object}+ labelled examples with a known shape. "
                 "Keep collecting corrections and try again.")
    print(f"training on {len(classes)} objects: {', '.join(classes)}")
    data = build_dataset(samples, classes)
    from ultralytics import YOLO
    model = YOLO(str(ROOT / "models" / "pretrained" / "yolo11n.pt"))
    res = model.train(data=str(data), epochs=epochs, imgsz=640, device="cpu", project=str(ROOT / "outputs" / "runs"),
                      name="everyday_ft", exist_ok=True, patience=15, verbose=False)
    best = Path(res.save_dir) / "weights" / "best.pt"
    OUT.mkdir(parents=True, exist_ok=True)
    shutil.copy2(best, OUT / "best.pt")
    (OUT / "classes.json").write_text(json.dumps({"classes": classes, "photos": len(samples)}, indent=1), encoding="utf-8")
    print(f"saved {OUT / 'best.pt'} — Auto mode uses it first on real photos after the next deploy")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--pull", action="store_true", help="copy the corrections collected on the server")
    ap.add_argument("--train", action="store_true", help="fine-tune when there is enough data")
    ap.add_argument("--min-per-object", type=int, default=20)
    ap.add_argument("--epochs", type=int, default=60)
    a = ap.parse_args()
    if a.pull:
        pull()
    if a.train:
        train(a.min_per_object, a.epochs)
    if not (a.pull or a.train):
        summary(feedback.read_all())
