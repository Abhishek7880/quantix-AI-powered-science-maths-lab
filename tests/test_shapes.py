"""Shapes generator + knowledge/3D-calculator consistency."""

import json
import re

import numpy as np

from src.config import PROJECT_ROOT
from src.dataset_utils import parse_label_file, validate_dataset
from src.shapes_dataset import SHAPE_CLASSES, make_image, make_shapes_dataset


def test_make_image_labels_are_valid():
    rng = np.random.default_rng(0)
    seen = set()
    for _ in range(120):
        img, labels = make_image(rng, 320)
        assert img.shape == (320, 320, 3) and img.dtype == np.uint8
        assert labels, "every image must contain at least one shape"
        for c, x, y, w, h in labels:
            seen.add(c)
            assert 0 <= c < len(SHAPE_CLASSES)
            assert 0 < w <= 1 and 0 < h <= 1
            assert -1e-6 <= x - w / 2 and x + w / 2 <= 1 + 1e-6
            assert -1e-6 <= y - h / 2 and y + h / 2 <= 1 + 1e-6
    assert len(seen) >= 17, f"only {len(seen)} classes in 120 images"


def test_small_dataset_validates(tmp_path):
    yaml_path = make_shapes_dataset(tmp_path / "ds", 20, 6, 6, size=256, seed=1)
    rep = validate_dataset(yaml_path, check_duplicates=False)
    assert rep.ok, rep.summary()
    for lbl in (tmp_path / "ds" / "labels" / "train").glob("*.txt"):
        boxes, problems = parse_label_file(lbl, len(SHAPE_CLASSES))
        assert boxes and not problems


def test_knowledge_and_3d_calculator_cover_all_classes():
    kb = json.loads((PROJECT_ROOT / "src" / "knowledge" / "mensuration.json").read_text(encoding="utf-8"))
    assert set(kb) == set(SHAPE_CLASSES)
    js = (PROJECT_ROOT / "src" / "web" / "shapes3d.js").read_text(encoding="utf-8")
    block = js[js.index("const SHAPES = {"):js.index("function poly(")]
    keys = set(re.findall(r"^\s{4}(\w+): \{", block, flags=re.M))
    assert keys == set(SHAPE_CLASSES), keys ^ set(SHAPE_CLASSES)
    assert (PROJECT_ROOT / "src" / "web" / "vendor" / "three.min.js").stat().st_size > 500_000
