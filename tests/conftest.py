import sys
from pathlib import Path

import cv2
import numpy as np
import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from src.config import AppConfig  # noqa: E402


def write_img(path: Path, seed: int = 0, size: int = 96) -> Path:
    """Distinct random-texture image (so near-duplicate checks don't trigger by accident)."""
    rng = np.random.default_rng(seed)
    img = rng.integers(0, 256, (size, size, 3), dtype=np.uint8)
    img = cv2.GaussianBlur(img, (5, 5), 0)
    path.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(path), img)
    return path


@pytest.fixture
def tmp_cfg(tmp_path) -> AppConfig:
    """Config whose output/model folders live in a temp dir."""
    cfg = AppConfig()
    for name in ("models_dir", "outputs_dir", "predictions_dir", "snapshots_dir", "logs_dir", "runs_dir",
                 "evaluations_dir", "samples_dir"):
        setattr(cfg.paths, name, str(tmp_path / name))
    cfg.paths.data_yaml = str(tmp_path / "ds" / "data.yaml")
    return cfg


@pytest.fixture
def tiny_dataset(tmp_path) -> Path:
    """Valid 2-class dataset: 4 train, 2 val, 2 test images."""
    root = tmp_path / "ds"
    seed = 0
    for split, n in (("train", 4), ("val", 2), ("test", 2)):
        for i in range(n):
            seed += 1
            write_img(root / "images" / split / f"{split}_{i}.jpg", seed)
            lbl = root / "labels" / split / f"{split}_{i}.txt"
            lbl.parent.mkdir(parents=True, exist_ok=True)
            lbl.write_text(f"{i % 2} 0.5 0.5 0.2 0.3\n")
    (root / "data.yaml").write_text("train: images/train\nval: images/val\ntest: images/test\n"
                                    "names:\n  0: scratch\n  1: dent\n")
    return root / "data.yaml"
