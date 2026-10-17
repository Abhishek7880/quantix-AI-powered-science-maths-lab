"""Everyday-object Auto mode (src/everyday.py): object -> shape mapping, photo-vs-drawing decision, duplicate merging.
The models are replaced by fakes, so these tests are fast and don't need the weights."""

from __future__ import annotations

import numpy as np

from src import everyday
from src.inference import Detection
from src.everyday import detect_auto, merge_duplicates, shape_of


def det(name, conf, box=(10, 10, 60, 60)):
    return Detection(0, name, conf, *box)


class Fake:
    def __init__(self, dets):
        self.dets = dets

    def predict(self, img, conf=0.25, annotate=False):
        return [d for d in self.dets if d.confidence >= conf], None, 1.0


PHOTO = np.random.default_rng(1).integers(0, 255, (80, 80, 3), dtype=np.uint8)   # textured, like a real photo
DRAWING = np.full((80, 80, 3), 230, np.uint8)                                      # flat colours, like a drawing


def run(shapes=(), coco=(), extra=(), img=None):
    models = {"shapes": Fake(list(shapes)), "coco": Fake(list(coco)), "extra": Fake(list(extra))}
    return detect_auto(DRAWING if img is None else img, lambda k: models.get(k))      # no "ft" model -> None


def test_every_object_maps_to_a_known_shape():
    import json
    from pathlib import Path
    known = set(json.loads((Path(everyday.__file__).parent / "knowledge" / "mensuration.json").read_text(encoding="utf-8")))
    for name, (shape, hi, _) in {**everyday.OBJECTS, **everyday.COCO_OBJECTS}.items():
        assert shape in known, (name, shape)
        assert hi, name
    assert shape_of("mug")["shape"] == "cylinder" and shape_of("giraffe") is None


def test_real_photo_uses_everyday_objects_not_the_shape_guess():
    r = run(shapes=[det("cuboid", 0.9)], coco=[det("cup", 0.92)])
    assert r["stage"] == "coco" and [d.class_name for d in r["detections"]] == ["cylinder"]
    assert r["infos"][0]["object"] == "cup"


def test_real_photo_without_known_object_says_nothing():
    r = run(shapes=[det("triangular_prism", 0.9)], coco=[det("giraffe", 0.88)], img=PHOTO)
    assert r["stage"] == "none" and r["detections"] == []


def test_drawing_uses_shapes_model_when_sure():
    r = run(shapes=[det("square", 0.95)], coco=[det("kite", 0.38)], extra=[det("road sign", 0.62)])
    assert r["stage"] == "shapes" and r["detections"][0].class_name == "square" and r["infos"] == [None]


def test_unclear_photo_falls_back_to_open_vocabulary():
    # the glass tumbler: COCO unsure, shapes model guesses "cuboid" at 0.59, open vocabulary sees a glass
    r = run(shapes=[det("cuboid", 0.59)], coco=[det("cell phone", 0.38)], extra=[det("drinking glass", 0.37)], img=PHOTO)
    assert r["stage"] == "extra" and r["infos"][0]["object"] == "drinking glass" and r["detections"][0].class_name == "cylinder"


def test_duplicates_of_one_object_are_merged():
    dets = [det("cylinder", 0.76, (10, 10, 100, 120)), det("cylinder", 0.52, (20, 15, 95, 110)), det("cylinder", 0.4, (300, 300, 340, 350))]
    kept, _ = merge_duplicates(dets, [None] * 3)
    assert [d.confidence for d in kept] == [0.76, 0.4]

def test_photo_never_gets_the_shape_models_guess():
    # the user's close-up glass: shapes model "cuboid 0.88", COCO model unsure -> still a photo (textured) -> glass
    r = run(shapes=[det("cuboid", 0.88)], coco=[det("cell phone", 0.3)], extra=[det("drinking glass", 0.31)], img=PHOTO)
    assert r["stage"] == "extra" and r["detections"][0].class_name == "cylinder"


def test_flatness_tells_drawings_from_photos():
    assert everyday.flatness(DRAWING) > 0.95 and everyday.flatness(PHOTO) < 0.2

def test_table_under_the_object_is_ignored():
    # the user's glass on a table: COCO finds "dining table" but not (surely) the glass -> open vocabulary finds the glass
    r = run(coco=[det("dining table", 0.46, (0, 40, 80, 80))], extra=[det("drinking glass", 0.3)], img=PHOTO)
    assert r["stage"] == "extra" and [i["object"] for i in r["infos"]] == ["drinking glass"]
    r = run(coco=[det("dining table", 0.46, (0, 40, 80, 80)), det("cup", 0.35)], img=PHOTO)
    assert [i["object"] for i in r["infos"]] == ["cup"]
    r = run(coco=[det("dining table", 0.6, (0, 40, 80, 80))], img=PHOTO)        # only a table in the photo
    assert [i["object"] for i in r["infos"]] == ["dining table"]
