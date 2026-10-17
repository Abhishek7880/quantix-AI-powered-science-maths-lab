"""Corrections from the home page's Auto mode — the training data for fine-tuning the everyday-object model.

A visitor (or the owner) confirms or corrects each detected box ("this is a steel tumbler") and agrees to share the
photo. Only then is anything stored, as a YOLO-style sample in outputs/feedback/everyday/:
    images/<id>.jpg        the photo, re-encoded (drops EXIF / location data), longest side at most 1280 px
    samples.jsonl          one line per photo: id, time, boxes [{box, predicted, label}], extra names, language
tools/train_everyday.py turns these into a fine-tuned model. Limits keep the free server safe: size, count, rate.
"""

from __future__ import annotations

import json
import re
import threading
import time
import uuid
from pathlib import Path

import cv2
import numpy as np

from src.config import PROJECT_ROOT
from src.errors import InputValidationError

DIR = PROJECT_ROOT / "outputs" / "feedback" / "everyday"
MAX_SAMPLES = 3000                 # stop collecting beyond this (about 600 MB at most)
MAX_SIDE = 1280
RATE_LIMIT, RATE_WINDOW_S = 10, 3600   # per visitor: 10 shared photos an hour
_NAME = re.compile(r"^[a-z0-9][a-z0-9 '\-]{0,38}[a-z0-9]$")
_recent: dict[str, list[float]] = {}
_lock = threading.Lock()


class FeedbackError(InputValidationError):
    error_code = "FEEDBACK_INVALID"
    error_title = "Correction not saved"


def clean_name(text: str) -> str | None:
    """Lower-case object name a-z / 0-9 / space / ' / - (2–40 chars), or None for 'not an object'."""
    t = re.sub(r"\s+", " ", str(text or "").strip().lower())
    if t in ("", "none", "not an object", "nothing"):
        return None
    if not _NAME.match(t):
        raise FeedbackError(f"'{text}' is not a valid object name (letters, numbers, spaces; 2–40 characters).")
    return t


def count() -> int:
    f = DIR / "samples.jsonl"
    return sum(1 for _ in f.open(encoding="utf-8")) if f.is_file() else 0


def save(raw: bytes, items: list[dict], extra: list[str], lang: str, consent: bool, ip: str | None) -> dict:
    """Store one corrected photo. items = [{box: [x1, y1, x2, y2], predicted, label}] in the photo's pixel units."""
    if not consent:
        raise FeedbackError("Tick the box to agree to share this photo — nothing is stored without it.",
                            error_code="CONSENT_REQUIRED")
    img = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        raise FeedbackError("The photo could not be read.")
    h, w = img.shape[:2]
    boxes = []
    for it in items[:30]:
        try:
            x1, y1, x2, y2 = (float(v) for v in it["box"])
        except (KeyError, TypeError, ValueError):
            raise FeedbackError("Each correction needs a box [x1, y1, x2, y2].") from None
        x1, x2 = sorted((max(0.0, min(w, x1)), max(0.0, min(w, x2))))
        y1, y2 = sorted((max(0.0, min(h, y1)), max(0.0, min(h, y2))))
        if x2 - x1 < 4 or y2 - y1 < 4:
            continue
        boxes.append({"box": [round(x1, 1), round(y1, 1), round(x2, 1), round(y2, 1)],
                      "predicted": str(it.get("predicted") or "")[:40], "label": clean_name(it.get("label"))})
    extra_names = [n for n in (clean_name(x) for x in extra[:10]) if n]
    if not boxes and not extra_names:
        raise FeedbackError("Nothing to save — confirm or correct at least one object.")
    now = time.monotonic()
    with _lock:
        if count() >= MAX_SAMPLES:
            raise FeedbackError("Thank you! We have collected enough photos for now.", error_code="FEEDBACK_FULL",
                                status_code=503)
        hits = [t for t in _recent.get(ip or "?", []) if now - t < RATE_WINDOW_S]
        if len(hits) >= RATE_LIMIT:
            raise FeedbackError("Thanks — that's enough photos from you for this hour.", error_code="TOO_MANY_PHOTOS",
                                status_code=429)
        _recent[ip or "?"] = hits + [now]
        scale = min(1.0, MAX_SIDE / max(h, w))
        if scale < 1:
            img = cv2.resize(img, (round(w * scale), round(h * scale)), interpolation=cv2.INTER_AREA)
            for b in boxes:
                b["box"] = [round(v * scale, 1) for v in b["box"]]
        sid = f"{time.strftime('%Y%m%d')}-{uuid.uuid4().hex[:10]}"
        (DIR / "images").mkdir(parents=True, exist_ok=True)
        cv2.imwrite(str(DIR / "images" / f"{sid}.jpg"), img, [cv2.IMWRITE_JPEG_QUALITY, 90])   # re-encoded: no EXIF
        rec = {"id": sid, "time": time.strftime("%Y-%m-%dT%H:%M:%S"), "width": img.shape[1], "height": img.shape[0],
               "boxes": boxes, "extra": extra_names, "lang": "hi" if lang == "hi" else "en"}
        with (DIR / "samples.jsonl").open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(rec, ensure_ascii=False) + "\n")
    return {"id": sid, "boxes": len(boxes), "total": count()}


def read_all(root: Path | None = None) -> list[dict]:
    f = (root or DIR) / "samples.jsonl"
    return [json.loads(line) for line in f.open(encoding="utf-8") if line.strip()] if f.is_file() else []
