"""Dataset preparation and validation for YOLO object detection.

Sub-commands (run ``python -m src.dataset_utils <command> -h`` for options):

  init            Create the empty dataset folder structure + data.yaml template
  validate        Validate image/label pairs, class IDs and bounding boxes
  split           Split a folder of labeled images into train/val/test
  make-yaml       (Re)generate data.yaml from class names
  make-synthetic  Generate a small SYNTHETIC shapes dataset (demo / smoke test only)
  make-samples    Generate synthetic sample images + a short video for prediction tests

YOLO detection label format (one line per object, values normalised to 0..1):
    <class_id> <x_center> <y_center> <width> <height>
An EMPTY label file means "this image contains no objects" (a background image).
A MISSING label file is an error: the image has not been annotated.
"""

from __future__ import annotations

import argparse
import hashlib
import logging
import math
import random
import shutil
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable

import cv2
import numpy as np
import yaml

from src.config import IMAGE_EXTENSIONS, PROJECT_ROOT, load_config, resolve_path
from src.utils import setup_logging

log = logging.getLogger("dataset")

SPLITS = ("train", "val", "test")
BOX_TOLERANCE = 1e-3  # allow tiny float rounding outside 0..1


# =========================================================================== validation

@dataclass
class ValidationReport:
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    stats: dict = field(default_factory=dict)

    @property
    def ok(self) -> bool:
        return not self.errors

    def summary(self) -> str:
        lines = [f"Dataset validation: {'PASSED' if self.ok else 'FAILED'}"]
        for split, s in self.stats.get("splits", {}).items():
            lines.append(f"  {split:5s}: {s['images']} images, {s['labeled']} labeled, "
                         f"{s['background']} background, {s['boxes']} boxes")
        if self.stats.get("class_counts"):
            lines.append("  boxes per class: " + ", ".join(
                f"{k}={v}" for k, v in sorted(self.stats["class_counts"].items())))
        lines.append(f"  {len(self.errors)} error(s), {len(self.warnings)} warning(s)")
        for e in self.errors[:50]:
            lines.append(f"  ERROR   {e}")
        if len(self.errors) > 50:
            lines.append(f"  ... {len(self.errors) - 50} more errors")
        for w in self.warnings[:30]:
            lines.append(f"  WARNING {w}")
        if len(self.warnings) > 30:
            lines.append(f"  ... {len(self.warnings) - 30} more warnings")
        return "\n".join(lines)


def list_images(folder: Path) -> list[Path]:
    if not folder.exists():
        return []
    return sorted(p for p in folder.iterdir() if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS)


def parse_label_file(label_path: Path, num_classes: int) -> tuple[list[tuple[int, float, float, float, float]], list[str]]:
    """Parse a YOLO detection label file. Returns (boxes, problems)."""
    boxes, problems = [], []
    try:
        text = label_path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return [], [f"{label_path}: not a UTF-8 text file"]
    for ln, raw in enumerate(text.splitlines(), start=1):
        line = raw.strip()
        if not line:
            continue
        parts = line.split()
        where = f"{label_path.name}:{ln}"
        if len(parts) != 5:
            hint = " (looks like a segmentation polygon; this project expects detection boxes)" if len(parts) > 5 else ""
            problems.append(f"{where}: expected 5 values, got {len(parts)}{hint}")
            continue
        try:
            cls_f = float(parts[0])
            x, y, w, h = (float(v) for v in parts[1:])
        except ValueError:
            problems.append(f"{where}: non-numeric value in '{line}'")
            continue
        if not cls_f.is_integer():
            problems.append(f"{where}: class id '{parts[0]}' is not an integer")
            continue
        cls = int(cls_f)
        if cls < 0 or cls >= num_classes:
            problems.append(f"{where}: class id {cls} out of range 0..{num_classes - 1}")
            continue
        if any(math.isnan(v) or math.isinf(v) for v in (x, y, w, h)):
            problems.append(f"{where}: NaN/Inf coordinate")
            continue
        if w <= 0 or h <= 0:
            problems.append(f"{where}: non-positive width/height ({w}, {h})")
            continue
        if not all(-BOX_TOLERANCE <= v <= 1 + BOX_TOLERANCE for v in (x, y, w, h)):
            problems.append(f"{where}: coordinates must be normalised to 0..1 (got {x}, {y}, {w}, {h})")
            continue
        if (x - w / 2 < -BOX_TOLERANCE or x + w / 2 > 1 + BOX_TOLERANCE
                or y - h / 2 < -BOX_TOLERANCE or y + h / 2 > 1 + BOX_TOLERANCE):
            problems.append(f"{where}: box extends outside the image")
            continue
        boxes.append((cls, x, y, w, h))
    return boxes, problems


def file_md5(path: Path) -> str:
    h = hashlib.md5()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


NEAR_DUP_THRESHOLD = 0.95  # correlation of high-pass thumbnails; re-encoded/resized copies score ~0.999


def image_signature(path: Path) -> np.ndarray | None:
    """Unit-length high-pass 32x32 thumbnail.

    The low-frequency background (lighting gradients) is removed first, so images are
    compared by their content. Without that, every image of a smooth, evenly lit
    surface would look like a duplicate.
    """
    img = cv2.imread(str(path), cv2.IMREAD_GRAYSCALE)
    if img is None:
        return None
    g = cv2.resize(img, (64, 64), interpolation=cv2.INTER_AREA).astype(np.float32)
    g = g - cv2.GaussianBlur(g, (0, 0), 8)
    g = cv2.resize(g, (32, 32), interpolation=cv2.INTER_AREA).ravel()
    g -= g.mean()
    n = float(np.linalg.norm(g))
    return g / n if n > 1e-6 else g


def near_duplicate_pairs(paths: list[Path], threshold: float = NEAR_DUP_THRESHOLD,
                         chunk: int = 1024) -> list[tuple[int, int, float]]:
    """Index pairs (i < j) whose signatures correlate >= threshold. Chunked to bound memory."""
    sigs = [image_signature(p) for p in paths]
    idx = [i for i, s in enumerate(sigs) if s is not None]
    if len(idx) < 2:
        return []
    mat = np.stack([sigs[i] for i in idx]).astype(np.float32)
    pairs = []
    for start in range(0, len(idx), chunk):
        block = mat[start:start + chunk] @ mat.T
        for r, c in zip(*np.nonzero(block >= threshold)):
            a, b = start + int(r), int(c)
            if a < b:
                pairs.append((idx[a], idx[b], float(block[r, c])))
    return pairs


def load_data_yaml(data_yaml: Path) -> dict:
    if not data_yaml.exists():
        raise FileNotFoundError(f"data.yaml not found: {data_yaml}\n"
                                "Create it with:  python -m src.dataset_utils make-yaml --classes <names...>")
    with open(data_yaml, "r", encoding="utf-8") as fh:
        data = yaml.safe_load(fh) or {}
    names = data.get("names")
    if isinstance(names, dict):
        names = [names[k] for k in sorted(names)]
    if not names:
        raise ValueError(f"{data_yaml}: 'names' (class names) is missing or empty")
    data["names"] = list(names)
    data["nc"] = len(names)
    return data


def split_dirs(data_yaml: Path, data: dict) -> dict[str, tuple[Path, Path]]:
    """Map split -> (images_dir, labels_dir) following Ultralytics conventions."""
    base = Path(data["path"]) if data.get("path") else data_yaml.parent
    if not base.is_absolute():
        base = (data_yaml.parent / base).resolve()
    out = {}
    for split in SPLITS:
        rel = data.get(split)
        if not rel:
            continue
        img_dir = (base / rel).resolve()
        parts = list(img_dir.parts)
        # Ultralytics swaps the last "images" path component for "labels".
        if "images" in parts:
            idx = len(parts) - 1 - parts[::-1].index("images")
            parts[idx] = "labels"
            lbl_dir = Path(*parts)
        else:
            lbl_dir = img_dir.parent / "labels"
        out[split] = (img_dir, lbl_dir)
    return out


def validate_dataset(data_yaml: Path, check_duplicates: bool = True,
                     near_dup_threshold: float = NEAR_DUP_THRESHOLD) -> ValidationReport:
    rep = ValidationReport()
    try:
        data = load_data_yaml(data_yaml)
    except (FileNotFoundError, ValueError, yaml.YAMLError) as exc:
        rep.errors.append(str(exc))
        return rep

    nc, names = data["nc"], data["names"]
    dirs = split_dirs(data_yaml, data)
    for required in ("train", "val"):
        if required not in dirs:
            rep.errors.append(f"data.yaml has no '{required}' entry")
    rep.stats = {"splits": {}, "class_counts": {}, "nc": nc, "names": names}
    class_counts: Counter = Counter()
    hashes: dict[str, list[tuple[str, Path]]] = defaultdict(list)
    all_images: list[tuple[str, Path]] = []

    for split, (img_dir, lbl_dir) in dirs.items():
        s = {"images": 0, "labeled": 0, "background": 0, "boxes": 0}
        if not img_dir.exists():
            rep.errors.append(f"[{split}] image folder does not exist: {img_dir}")
            rep.stats["splits"][split] = s
            continue
        images = list_images(img_dir)
        s["images"] = len(images)
        if not images:
            (rep.warnings if split == "test" else rep.errors).append(f"[{split}] no images found in {img_dir}")
        image_stems = {p.stem for p in images}
        for img in images:
            if cv2.imread(str(img)) is None:
                rep.errors.append(f"[{split}] unreadable or corrupt image: {img.name}")
                continue
            lbl = lbl_dir / f"{img.stem}.txt"
            if not lbl.exists():
                rep.errors.append(f"[{split}] missing label file for {img.name} (expected {lbl.name}); "
                                  "annotate it, or create an empty .txt if it truly has no objects")
                continue
            boxes, problems = parse_label_file(lbl, nc)
            rep.errors.extend(f"[{split}] {p}" for p in problems)
            if not boxes and not problems:
                s["background"] += 1
            else:
                s["labeled"] += 1
            s["boxes"] += len(boxes)
            class_counts.update(names[b[0]] for b in boxes)
            if check_duplicates:
                hashes[file_md5(img)].append((split, img))
                all_images.append((split, img))
        if lbl_dir.exists():
            for orphan in sorted(p for p in lbl_dir.glob("*.txt") if p.stem not in image_stems):
                rep.warnings.append(f"[{split}] label without image: {orphan.name}")
        if s["images"] and s["background"] == s["images"]:
            # fatal for training; for val/test (common with tiny datasets) the scores are just less meaningful
            (rep.errors if split == "train" else rep.warnings).append(
                f"[{split}] every label file is empty - " + ("nothing to learn from" if split == "train"
                                                             else "no objects to evaluate on in this split"))
        rep.stats["splits"][split] = s

    rep.stats["class_counts"] = dict(class_counts)
    for name in names:
        if class_counts.get(name, 0) == 0:
            rep.warnings.append(f"class '{name}' has no annotated boxes")

    if check_duplicates:
        for md5, items in hashes.items():
            splits_seen = {sp for sp, _ in items}
            if len(items) > 1:
                where = ", ".join(f"{sp}/{p.name}" for sp, p in items)
                if len(splits_seen) > 1:
                    rep.errors.append(f"identical image in multiple splits (data leakage): {where}")
                else:
                    rep.warnings.append(f"identical duplicate images: {where}")
        # Near duplicates across splits (visually near-identical but not byte-identical).
        if len(all_images) <= 50000:
            leaks = 0
            for i, j, score in near_duplicate_pairs([p for _, p in all_images], near_dup_threshold):
                (sp_a, pa), (sp_b, pb) = all_images[i], all_images[j]
                if sp_a != sp_b and file_md5(pa) != file_md5(pb):
                    leaks += 1
                    if leaks <= 50:
                        rep.warnings.append(f"near-duplicate images across splits (possible leakage, "
                                            f"similarity {score:.3f}): {sp_a}/{pa.name} ~ {sp_b}/{pb.name}")
            rep.stats["near_duplicate_cross_split_pairs"] = leaks
        else:
            rep.warnings.append("near-duplicate check skipped (more than 50,000 images)")
    return rep


# =========================================================================== splitting

def _find_label(img: Path, source: Path) -> Path | None:
    candidates = [img.with_suffix(".txt")]
    if img.parent.name == "images":
        candidates.append(img.parent.parent / "labels" / f"{img.stem}.txt")
    parts = list(img.parts)
    if "images" in parts:   # e.g. images/train/x.jpg -> labels/train/x.txt (YOLO / Roboflow layouts)
        k = len(parts) - 1 - parts[::-1].index("images")
        candidates.append(Path(*parts[:k], "labels", *parts[k + 1:]).with_suffix(".txt"))
    candidates.append(source / "labels" / f"{img.stem}.txt")
    for c in candidates:
        if c.exists():
            return c
    return None


def _group_near_duplicates(images: list[Path], threshold: float) -> list[list[Path]]:
    """Union-find grouping so near-identical images always land in the same split."""
    parent = list(range(len(images)))

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for i, j, _ in near_duplicate_pairs(images, threshold):
        parent[find(i)] = find(j)
    groups: dict[int, list[Path]] = defaultdict(list)
    for i, p in enumerate(images):
        groups[find(i)].append(p)
    return list(groups.values())


def split_dataset(source: Path, dest: Path, ratios: tuple[float, float, float] = (0.7, 0.2, 0.1),
                  seed: int = 42, dedupe: bool = True, near_dup_threshold: float = NEAR_DUP_THRESHOLD,
                  skip_unlabeled: bool = False, move: bool = False) -> dict[str, int]:
    """Split labeled images from ``source`` into dest/images/{split} + dest/labels/{split}.

    ``source`` may contain images with .txt labels side-by-side, or images/ and labels/ subfolders.
    """
    if abs(sum(ratios) - 1.0) > 1e-6:
        raise ValueError(f"split ratios must sum to 1.0, got {ratios}")
    if not source.exists():
        raise FileNotFoundError(f"Source folder not found: {source}")
    images = sorted(p for p in source.rglob("*") if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS)
    if not images:
        raise ValueError(f"No JPG/JPEG/PNG images found under {source}")

    pairs, unlabeled = {}, []
    for img in images:
        lbl = _find_label(img, source)
        if lbl is None:
            unlabeled.append(img)
        else:
            pairs[img] = lbl
    if unlabeled:
        msg = (f"{len(unlabeled)} image(s) have no label file, e.g. {unlabeled[0].name}. Object detection is "
               "supervised: every training image must be annotated (empty .txt = no objects).")
        if not skip_unlabeled:
            raise ValueError(msg + " Annotate them or re-run with --skip-unlabeled to leave them out.")
        log.warning(msg + " Skipping them.")
    if not pairs:
        raise ValueError("No labeled images found - annotate your images first (see README).")

    stems = Counter(p.stem for p in pairs)
    clashes = [s for s, c in stems.items() if c > 1]
    if clashes:
        raise ValueError(f"Duplicate file names (different folders/extensions) would collide: {clashes[:5]}")

    imgs = list(pairs)
    groups = _group_near_duplicates(imgs, near_dup_threshold) if dedupe else [[p] for p in imgs]
    largest = max(len(g) for g in groups)
    if dedupe and largest > max(5, 0.2 * len(imgs)):
        # Fixed-camera industrial images can all look "similar" to a coarse hash.
        # Grouping would then dump everything into one split, so fall back to exact duplicates.
        log.warning("Near-duplicate grouping merged %d of %d images into one group (images are visually "
                    "very similar). Falling back to exact-duplicate grouping only. If consecutive video "
                    "frames are in your data, split by recording session instead.", largest, len(imgs))
        by_md5: dict[str, list[Path]] = defaultdict(list)
        for p in imgs:
            by_md5[file_md5(p)].append(p)
        groups = list(by_md5.values())
    merged = sum(1 for g in groups if len(g) > 1)
    if merged:
        log.info("Grouped %d sets of near-duplicate images so they stay in the same split.", merged)
    rng = random.Random(seed)
    rng.shuffle(groups)

    total = len(imgs)
    targets = {"train": ratios[0] * total, "val": ratios[1] * total, "test": ratios[2] * total}
    assigned: dict[str, list[Path]] = {s: [] for s in SPLITS}
    for g in groups:
        # Put each group into the split furthest below its target.
        split = max(SPLITS, key=lambda s: (targets[s] - len(assigned[s])) if targets[s] > 0 else -1e9)
        assigned[split].extend(g)

    for split in SPLITS:
        (dest / "images" / split).mkdir(parents=True, exist_ok=True)
        (dest / "labels" / split).mkdir(parents=True, exist_ok=True)
        for img in assigned[split]:
            dst_img = dest / "images" / split / img.name
            dst_lbl = dest / "labels" / split / f"{img.stem}.txt"
            if dst_img.exists() or dst_lbl.exists():
                raise FileExistsError(f"Refusing to overwrite existing file {dst_img} / {dst_lbl}. "
                                      "Use an empty destination folder.")
            op = shutil.move if move else shutil.copy2
            op(str(img), dst_img)
            op(str(pairs[img]), dst_lbl)
    counts = {s: len(v) for s, v in assigned.items()}
    log.info("Split complete: %s", counts)
    return counts


# =========================================================================== data.yaml

def write_data_yaml(dest_yaml: Path, class_names: Iterable[str], include_test: bool = True,
                    overwrite: bool = False, extra_comment: str = "") -> Path:
    names = [str(n).strip() for n in class_names if str(n).strip()]
    if not names:
        raise ValueError("At least one class name is required")
    if len(set(names)) != len(names):
        raise ValueError(f"Duplicate class names: {names}")
    if dest_yaml.exists() and not overwrite:
        raise FileExistsError(f"{dest_yaml} already exists (use --overwrite to replace it)")
    dest_yaml.parent.mkdir(parents=True, exist_ok=True)
    # No 'path' key: Ultralytics then resolves splits relative to this file's folder,
    # which keeps the dataset portable across machines.
    body = ["# YOLO detection dataset configuration (generated by src/dataset_utils.py)"]
    if extra_comment:
        body.append(f"# {extra_comment}")
    body += ["train: images/train", "val: images/val"]
    if include_test:
        body.append("test: images/test")
    body.append("")
    body.append("names:")
    body += [f"  {i}: {yaml.safe_dump(n, default_style=None).strip().removesuffix('...').strip()}" for i, n in enumerate(names)]
    dest_yaml.write_text("\n".join(body) + "\n", encoding="utf-8")
    return dest_yaml


def init_structure(dataset_dir: Path, class_names: list[str]) -> None:
    for kind in ("images", "labels"):
        for split in SPLITS:
            d = dataset_dir / kind / split
            d.mkdir(parents=True, exist_ok=True)
            (d / ".gitkeep").touch(exist_ok=True)
    yaml_path = dataset_dir / "data.yaml"
    if not yaml_path.exists():
        write_data_yaml(yaml_path, class_names, extra_comment="Edit class names in config.yaml, then re-run make-yaml --overwrite")
    log.info("Dataset structure ready at %s", dataset_dir)


# =========================================================================== synthetic data

SYNTHETIC_CLASSES = ("circle", "square", "triangle")


def _background(rng: np.random.Generator, w: int, h: int) -> np.ndarray:
    base = rng.integers(60, 190)
    grad = np.linspace(-25, 25, w)[None, :] * rng.choice([-1, 1])
    img = np.clip(base + grad + rng.normal(0, 8, (h, w)), 0, 255).astype(np.uint8)
    img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
    tint = rng.integers(-15, 15, size=3)
    return np.clip(img.astype(np.int16) + tint, 0, 255).astype(np.uint8)


def _draw_shape(img: np.ndarray, cls: int, rng: np.random.Generator) -> tuple[float, float, float, float] | None:
    h, w = img.shape[:2]
    size = int(rng.integers(int(min(w, h) * 0.08), int(min(w, h) * 0.25)))
    cx = int(rng.integers(size, w - size))
    cy = int(rng.integers(size, h - size))
    color = tuple(int(c) for c in rng.integers(0, 256, size=3))
    if cls == 0:  # circle
        cv2.circle(img, (cx, cy), size, color, -1, cv2.LINE_AA)
        x1, y1, x2, y2 = cx - size, cy - size, cx + size, cy + size
    elif cls == 1:  # square (axis aligned)
        x1, y1, x2, y2 = cx - size, cy - size, cx + size, cy + size
        cv2.rectangle(img, (x1, y1), (x2, y2), color, -1, cv2.LINE_AA)
    else:  # triangle
        pts = np.array([[cx, cy - size], [cx - size, cy + size], [cx + size, cy + size]], np.int32)
        cv2.fillPoly(img, [pts], color, cv2.LINE_AA)
        x1, y1, x2, y2 = cx - size, cy - size, cx + size, cy + size
    return ((x1 + x2) / 2 / w, (y1 + y2) / 2 / h, (x2 - x1) / w, (y2 - y1) / h)


def synthetic_image(rng: np.random.Generator, imgsz: int = 320, max_objects: int = 4,
                    allow_empty: bool = True) -> tuple[np.ndarray, list[tuple[int, float, float, float, float]]]:
    img = _background(rng, imgsz, imgsz)
    n = int(rng.integers(0 if allow_empty else 1, max_objects + 1))
    labels: list[tuple[int, float, float, float, float]] = []
    occupied: list[tuple[float, float, float, float]] = []
    for _ in range(n * 5):
        if len(labels) >= n:
            break
        cls = int(rng.integers(0, len(SYNTHETIC_CLASSES)))
        trial = img.copy()
        box = _draw_shape(trial, cls, rng)
        if box is None:
            continue
        x, y, bw, bh = box
        # Avoid heavy overlaps so labels stay unambiguous.
        if any(abs(x - ox) < (bw + ow) / 2 and abs(y - oy) < (bh + oh) / 2 for ox, oy, ow, oh in occupied):
            continue
        img = trial
        occupied.append(box)
        labels.append((cls, x, y, bw, bh))
    img = cv2.GaussianBlur(img, (3, 3), 0)
    return img, labels


def make_synthetic_dataset(dest: Path, n_train: int = 150, n_val: int = 40, n_test: int = 40,
                           imgsz: int = 320, seed: int = 0, overwrite: bool = False) -> Path:
    """Create a toy dataset of coloured geometric shapes.

    THIS IS NOT INDUSTRIAL DATA. It only demonstrates the expected folder layout
    and lets you smoke-test the training / prediction pipeline end to end.
    """
    if dest.exists() and any(dest.iterdir()):
        if not overwrite:
            raise FileExistsError(f"{dest} is not empty (use --overwrite to regenerate)")
        shutil.rmtree(dest)
    rng = np.random.default_rng(seed)
    for split, n in (("train", n_train), ("val", n_val), ("test", n_test)):
        (dest / "images" / split).mkdir(parents=True, exist_ok=True)
        (dest / "labels" / split).mkdir(parents=True, exist_ok=True)
        for i in range(n):
            img, labels = synthetic_image(rng, imgsz, allow_empty=(i % 10 == 0))
            name = f"{split}_{i:04d}"
            cv2.imwrite(str(dest / "images" / split / f"{name}.jpg"), img, [cv2.IMWRITE_JPEG_QUALITY, 92])
            (dest / "labels" / split / f"{name}.txt").write_text(
                "".join(f"{c} {x:.6f} {y:.6f} {w:.6f} {h:.6f}\n" for c, x, y, w, h in labels), encoding="utf-8")
    write_data_yaml(dest / "data.yaml", SYNTHETIC_CLASSES, overwrite=True,
                    extra_comment="SYNTHETIC toy dataset (geometric shapes) - NOT real industrial data")
    (dest / "README_SYNTHETIC.txt").write_text(
        "This dataset is SYNTHETIC: random coloured circles, squares and triangles on noisy backgrounds.\n"
        "It exists only to demonstrate the YOLO folder layout and to smoke-test the pipeline.\n"
        "Metrics from a model trained on it say NOTHING about performance on industrial images.\n",
        encoding="utf-8")
    log.info("Synthetic dataset written to %s", dest)
    return dest / "data.yaml"


def make_samples(dest: Path, n_images: int = 6, imgsz: int = 480, seed: int = 999,
                 video_seconds: int = 8, fps: int = 15) -> list[Path]:
    """Synthetic sample images and a short video for prediction / camera-fallback tests."""
    dest.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(seed)
    written = []
    for i in range(n_images):
        img, _ = synthetic_image(rng, imgsz, max_objects=5, allow_empty=False)
        p = dest / f"sample_shapes_{i + 1:02d}.jpg"
        cv2.imwrite(str(p), img)
        written.append(p)

    # Video: shapes drifting across a static background, simulating a conveyor.
    w = h = imgsz
    bg = _background(rng, w, h)
    objs = []
    for _ in range(4):
        cls = int(rng.integers(0, len(SYNTHETIC_CLASSES)))
        objs.append({"cls": cls, "x": float(rng.uniform(0, w)), "y": float(rng.uniform(60, h - 60)),
                     "s": int(rng.integers(25, 55)), "vx": float(rng.uniform(2, 5)),
                     "color": tuple(int(c) for c in rng.integers(0, 256, 3))})
    video = dest / "sample_conveyor.mp4"
    writer = cv2.VideoWriter(str(video), cv2.VideoWriter_fourcc(*"mp4v"), fps, (w, h))
    if not writer.isOpened():
        log.warning("Could not create MP4 writer; skipping sample video.")
    else:
        for _ in range(video_seconds * fps):
            frame = bg.copy()
            for o in objs:
                o["x"] = (o["x"] + o["vx"]) % (w + 2 * o["s"])
                cx, cy, s = int(o["x"] - o["s"]), int(o["y"]), o["s"]
                if o["cls"] == 0:
                    cv2.circle(frame, (cx, cy), s, o["color"], -1, cv2.LINE_AA)
                elif o["cls"] == 1:
                    cv2.rectangle(frame, (cx - s, cy - s), (cx + s, cy + s), o["color"], -1)
                else:
                    pts = np.array([[cx, cy - s], [cx - s, cy + s], [cx + s, cy + s]], np.int32)
                    cv2.fillPoly(frame, [pts], o["color"], cv2.LINE_AA)
            writer.write(frame)
        writer.release()
        written.append(video)
    log.info("Wrote %d sample files to %s", len(written), dest)
    return written


# =========================================================================== CLI

def main(argv: list[str] | None = None) -> int:
    cfg = load_config()
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("init", help="create empty dataset folders + data.yaml template")
    p.add_argument("--dataset", default=cfg.paths.dataset_dir)
    p.add_argument("--classes", nargs="+", default=cfg.class_names)

    p = sub.add_parser("validate", help="validate a dataset described by data.yaml")
    p.add_argument("--data", default=cfg.paths.data_yaml)
    p.add_argument("--no-duplicates", action="store_true", help="skip duplicate / leakage checks")

    p = sub.add_parser("split", help="split labeled images into train/val/test")
    p.add_argument("--source", required=True, help="folder with images + YOLO .txt labels")
    p.add_argument("--dest", default=cfg.paths.dataset_dir)
    p.add_argument("--ratios", nargs=3, type=float, default=[0.7, 0.2, 0.1], metavar=("TRAIN", "VAL", "TEST"))
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--no-dedupe", action="store_true", help="disable near-duplicate grouping")
    p.add_argument("--skip-unlabeled", action="store_true")
    p.add_argument("--move", action="store_true", help="move files instead of copying")
    p.add_argument("--classes", nargs="+", default=None, help="also write data.yaml with these classes")

    p = sub.add_parser("make-yaml", help="write data.yaml")
    p.add_argument("--dest", default=cfg.paths.data_yaml)
    p.add_argument("--classes", nargs="+", default=cfg.class_names)
    p.add_argument("--no-test", action="store_true")
    p.add_argument("--overwrite", action="store_true")

    p = sub.add_parser("make-synthetic", help="generate SYNTHETIC demo dataset (not industrial data)")
    p.add_argument("--dest", default="examples/synthetic_dataset")
    p.add_argument("--train", type=int, default=150)
    p.add_argument("--val", type=int, default=40)
    p.add_argument("--test", type=int, default=40)
    p.add_argument("--imgsz", type=int, default=320)
    p.add_argument("--seed", type=int, default=0)
    p.add_argument("--overwrite", action="store_true")

    p = sub.add_parser("make-samples", help="generate synthetic sample images + video")
    p.add_argument("--dest", default=cfg.paths.samples_dir)

    args = parser.parse_args(argv)
    setup_logging("dataset", cfg.paths.resolve("logs_dir"))

    try:
        if args.cmd == "init":
            init_structure(resolve_path(args.dataset), args.classes)
        elif args.cmd == "validate":
            rep = validate_dataset(resolve_path(args.data), check_duplicates=not args.no_duplicates)
            print(rep.summary())
            return 0 if rep.ok else 1
        elif args.cmd == "split":
            dest = resolve_path(args.dest)
            split_dataset(resolve_path(args.source), dest, tuple(args.ratios), args.seed,
                          dedupe=not args.no_dedupe, skip_unlabeled=args.skip_unlabeled, move=args.move)
            if args.classes:
                write_data_yaml(dest / "data.yaml", args.classes, overwrite=True)
            print(f"Done. Now validate:  python -m src.dataset_utils validate --data {dest / 'data.yaml'}")
        elif args.cmd == "make-yaml":
            out = write_data_yaml(resolve_path(args.dest), args.classes, include_test=not args.no_test,
                                  overwrite=args.overwrite)
            print(f"Wrote {out}")
        elif args.cmd == "make-synthetic":
            out = make_synthetic_dataset(resolve_path(args.dest), args.train, args.val, args.test,
                                         args.imgsz, args.seed, args.overwrite)
            print(f"Synthetic dataset ready: {out}\n(Toy shapes only - NOT industrial data.)")
        elif args.cmd == "make-samples":
            for f in make_samples(resolve_path(args.dest)):
                print(f"  {f}")
    except (FileNotFoundError, FileExistsError, ValueError) as exc:
        log.error("%s", exc)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
