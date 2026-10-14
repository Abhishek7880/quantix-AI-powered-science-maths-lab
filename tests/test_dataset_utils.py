import shutil

import cv2
import pytest

from src.dataset_utils import (load_data_yaml, near_duplicate_pairs, parse_label_file, split_dataset,
                               validate_dataset, write_data_yaml)
from tests.conftest import write_img


# ------------------------------------------------------------------ label parsing

@pytest.mark.parametrize("line,expected_problem", [
    ("0 0.5 0.5 0.2 0.2", None),
    ("1 0.5 0.5 0.2", "expected 5 values"),
    ("0 0.1 0.1 0.2 0.2 0.3 0.3 0.4", "segmentation"),
    ("a 0.5 0.5 0.2 0.2", "non-numeric"),
    ("0.5 0.5 0.5 0.2 0.2", "not an integer"),
    ("5 0.5 0.5 0.2 0.2", "out of range"),
    ("-1 0.5 0.5 0.2 0.2", "out of range"),
    ("0 1.5 0.5 0.2 0.2", "normalised"),
    ("0 0.5 0.5 0 0.2", "non-positive"),
    ("0 0.95 0.5 0.2 0.2", "outside the image"),
    ("0 nan 0.5 0.2 0.2", "NaN"),
])
def test_parse_label_file(tmp_path, line, expected_problem):
    f = tmp_path / "x.txt"
    f.write_text(line + "\n")
    boxes, problems = parse_label_file(f, num_classes=2)
    if expected_problem is None:
        assert problems == [] and len(boxes) == 1
    else:
        assert boxes == [] and len(problems) == 1 and expected_problem in problems[0]


def test_empty_label_is_background(tmp_path):
    f = tmp_path / "x.txt"
    f.write_text("\n")
    assert parse_label_file(f, 1) == ([], [])


# ------------------------------------------------------------------ validation

def test_valid_dataset_passes(tiny_dataset):
    rep = validate_dataset(tiny_dataset)
    assert rep.ok, rep.summary()
    assert rep.stats["splits"]["train"]["images"] == 4
    assert rep.stats["class_counts"] == {"scratch": 4, "dent": 4}


def test_missing_data_yaml(tmp_path):
    rep = validate_dataset(tmp_path / "nope.yaml")
    assert not rep.ok and "not found" in rep.errors[0]


def test_missing_label_is_error(tiny_dataset):
    (tiny_dataset.parent / "labels" / "train" / "train_0.txt").unlink()
    rep = validate_dataset(tiny_dataset)
    assert not rep.ok
    assert any("missing label file" in e for e in rep.errors)


def test_corrupt_image_is_error(tiny_dataset):
    (tiny_dataset.parent / "images" / "train" / "train_1.jpg").write_bytes(b"not an image")
    rep = validate_dataset(tiny_dataset)
    assert any("corrupt" in e for e in rep.errors)


def test_bad_class_id_is_error(tiny_dataset):
    (tiny_dataset.parent / "labels" / "val" / "val_0.txt").write_text("7 0.5 0.5 0.1 0.1\n")
    rep = validate_dataset(tiny_dataset)
    assert any("out of range" in e for e in rep.errors)


def test_orphan_label_is_warning(tiny_dataset):
    (tiny_dataset.parent / "labels" / "train" / "ghost.txt").write_text("0 0.5 0.5 0.1 0.1\n")
    rep = validate_dataset(tiny_dataset)
    assert rep.ok and any("label without image" in w for w in rep.warnings)


def test_identical_image_across_splits_is_leakage(tiny_dataset):
    root = tiny_dataset.parent
    shutil.copy(root / "images" / "train" / "train_0.jpg", root / "images" / "test" / "leak.jpg")
    shutil.copy(root / "labels" / "train" / "train_0.txt", root / "labels" / "test" / "leak.txt")
    rep = validate_dataset(tiny_dataset)
    assert any("data leakage" in e for e in rep.errors)


def test_near_duplicate_across_splits_is_warned(tiny_dataset):
    root = tiny_dataset.parent
    img = cv2.imread(str(root / "images" / "train" / "train_0.jpg"))
    cv2.imwrite(str(root / "images" / "val" / "near.jpg"), cv2.convertScaleAbs(img, alpha=1.05, beta=4),
                [cv2.IMWRITE_JPEG_QUALITY, 60])
    (root / "labels" / "val" / "near.txt").write_text("0 0.5 0.5 0.2 0.2\n")
    rep = validate_dataset(tiny_dataset)
    assert any("near-duplicate" in w for w in rep.warnings)


def test_all_empty_labels_is_error(tiny_dataset):
    for f in (tiny_dataset.parent / "labels" / "train").glob("*.txt"):
        f.write_text("")
    rep = validate_dataset(tiny_dataset)
    assert any("every label file is empty" in e for e in rep.errors)


# ------------------------------------------------------------------ near duplicates

def test_near_duplicate_pairs(tmp_path):
    a = write_img(tmp_path / "a.jpg", 1)
    b = write_img(tmp_path / "b.jpg", 2)
    img = cv2.imread(str(a))
    cv2.imwrite(str(tmp_path / "a_copy.png"), cv2.resize(img, (150, 150)))
    pairs = near_duplicate_pairs([a, b, tmp_path / "a_copy.png"])
    assert [(i, j) for i, j, _ in pairs] == [(0, 2)]


# ------------------------------------------------------------------ split

def _raw_folder(tmp_path, n=20, unlabeled=0):
    src = tmp_path / "raw"
    for i in range(n):
        write_img(src / f"img_{i}.jpg", 100 + i)
        if i >= unlabeled:
            (src / f"img_{i}.txt").write_text("0 0.5 0.5 0.2 0.2\n")
    return src


def test_split_counts_and_no_overlap(tmp_path):
    src = _raw_folder(tmp_path, 20)
    dest = tmp_path / "out"
    counts = split_dataset(src, dest, (0.7, 0.2, 0.1), seed=1)
    assert counts == {"train": 14, "val": 4, "test": 2}
    names = [p.name for s in ("train", "val", "test") for p in (dest / "images" / s).iterdir()]
    assert len(names) == len(set(names)) == 20
    for s in ("train", "val", "test"):
        for img in (dest / "images" / s).iterdir():
            assert (dest / "labels" / s / f"{img.stem}.txt").exists()


def test_split_refuses_unlabeled(tmp_path):
    src = _raw_folder(tmp_path, 10, unlabeled=2)
    with pytest.raises(ValueError, match="no label file"):
        split_dataset(src, tmp_path / "out")
    counts = split_dataset(src, tmp_path / "out2", skip_unlabeled=True)
    assert sum(counts.values()) == 8


def test_split_keeps_near_duplicates_together(tmp_path):
    src = _raw_folder(tmp_path, 20)
    img = cv2.imread(str(src / "img_0.jpg"))
    for k in range(3):
        cv2.imwrite(str(src / f"dup_{k}.jpg"), cv2.convertScaleAbs(img, alpha=1 + 0.02 * k, beta=k))
        (src / f"dup_{k}.txt").write_text("0 0.5 0.5 0.2 0.2\n")
    dest = tmp_path / "out"
    split_dataset(src, dest, seed=3)
    where = {p.stem: s for s in ("train", "val", "test") for p in (dest / "images" / s).iterdir()}
    assert len({where["img_0"], where["dup_0"], where["dup_1"], where["dup_2"]}) == 1


def test_split_refuses_overwrite(tmp_path):
    src = _raw_folder(tmp_path, 6)
    dest = tmp_path / "out"
    split_dataset(src, dest)
    with pytest.raises(FileExistsError):
        split_dataset(src, dest)


def test_split_bad_ratios(tmp_path):
    with pytest.raises(ValueError, match="sum to 1"):
        split_dataset(_raw_folder(tmp_path, 4), tmp_path / "o", (0.5, 0.2, 0.2))


# ------------------------------------------------------------------ data.yaml

def test_write_data_yaml_roundtrip(tmp_path):
    p = write_data_yaml(tmp_path / "data.yaml", ["scratch", "dent", "crack: deep"])
    d = load_data_yaml(p)
    assert d["names"] == ["scratch", "dent", "crack: deep"] and d["nc"] == 3
    assert "path" not in d  # portable: resolved relative to the yaml file


def test_write_data_yaml_errors(tmp_path):
    with pytest.raises(ValueError, match="Duplicate"):
        write_data_yaml(tmp_path / "a.yaml", ["x", "x"])
    with pytest.raises(ValueError):
        write_data_yaml(tmp_path / "b.yaml", [])
    write_data_yaml(tmp_path / "c.yaml", ["x"])
    with pytest.raises(FileExistsError):
        write_data_yaml(tmp_path / "c.yaml", ["y"])
