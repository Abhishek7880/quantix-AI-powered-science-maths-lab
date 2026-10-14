"""Model inference, independent of camera acquisition and UI.

``Detector`` wraps an Ultralytics YOLO checkpoint (.pt or exported .onnx) and
returns plain Python detections plus an annotated frame. It is used by the
image CLI, the camera CLI and the REST API.

Note: confidence scores are model scores, NOT calibrated probabilities.
"""

from __future__ import annotations

import logging
import threading
import time
from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np

from src.errors import DependencyError, InputValidationError, ModelNotFoundError
from src.utils import resolve_device

log = logging.getLogger("inference")

COCO_CHECKPOINT_PREFIXES = ("yolov8", "yolo11", "yolo12")


@dataclass
class Detection:
    class_id: int
    class_name: str
    confidence: float
    x1: float
    y1: float
    x2: float
    y2: float

    def to_dict(self) -> dict:
        d = asdict(self)
        d["confidence"] = round(self.confidence, 4)
        for k in ("x1", "y1", "x2", "y2"):
            d[k] = round(d[k], 1)
        return d


def validate_inference_params(conf: float, iou: float, imgsz: int) -> None:
    if not 0.0 <= conf <= 1.0:
        raise InputValidationError(f"conf must be between 0 and 1, got {conf}")
    if not 0.0 < iou <= 1.0:
        raise InputValidationError(f"iou must be between 0 and 1, got {iou}")
    if imgsz < 32 or imgsz > 4096:
        raise InputValidationError(f"imgsz must be between 32 and 4096, got {imgsz}")


class Detector:
    def __init__(self, model_path: str | Path, device: str = "auto", conf: float = 0.25, iou: float = 0.45,
                 imgsz: int = 640, max_det: int = 100):
        validate_inference_params(conf, iou, imgsz)
        try:
            from ultralytics import YOLO
        except (ImportError, OSError) as exc:
            raise DependencyError(f"Ultralytics/PyTorch could not be imported: {exc}") from exc

        self.model_path = Path(model_path)
        bare_name = not self.model_path.parent.parts
        if not self.model_path.exists() and not bare_name:
            raise ModelNotFoundError(f"Model file not found: {self.model_path}. Train a model first "
                                     "(python -m src.train) or pass a valid --model path.")
        self.device = resolve_device(device)
        self.conf, self.iou, self.imgsz, self.max_det = conf, iou, imgsz, max_det
        try:
            self.model = YOLO(str(self.model_path), task="detect")
        except Exception as exc:
            raise ModelNotFoundError(f"Could not load model '{self.model_path}': {exc}",
                                     error_code="MODEL_LOAD_FAILED", error_title="Model load failed") from exc
        if getattr(self.model, "task", "detect") != "detect":
            raise InputValidationError(f"{self.model_path.name} is a '{self.model.task}' model; a detection model "
                                       "is required.", error_code="WRONG_MODEL_TASK")
        names = self.model.names
        self.names: list[str] = [names[k] for k in sorted(names)] if isinstance(names, dict) else list(names)
        self.is_generic_pretrained = self.model_path.name.startswith(COCO_CHECKPOINT_PREFIXES)
        if self.is_generic_pretrained:
            log.warning("'%s' is a generic COCO-pretrained checkpoint, NOT trained on your classes. "
                        "Use it only for pipeline testing.", self.model_path.name)
        self._lock = threading.Lock()  # Ultralytics predictors are not thread-safe
        log.info("Loaded model %s on device=%s with %d classes: %s", self.model_path, self.device,
                 len(self.names), self.names)

    def warmup(self, size: int | None = None) -> None:
        dummy = np.zeros((size or self.imgsz, size or self.imgsz, 3), dtype=np.uint8)
        self.predict(dummy)

    def predict(self, frame_bgr: np.ndarray, conf: float | None = None, annotate: bool = True
                ) -> tuple[list[Detection], np.ndarray | None, float]:
        """Run detection on one BGR image. Returns (detections, annotated_bgr, latency_ms)."""
        if frame_bgr is None or not isinstance(frame_bgr, np.ndarray) or frame_bgr.ndim != 3:
            raise InputValidationError("Input image is empty or not a valid 3-channel image.",
                                       error_code="INVALID_IMAGE")
        conf = self.conf if conf is None else conf
        t0 = time.perf_counter()
        with self._lock:
            results = self.model.predict(frame_bgr, conf=conf, iou=self.iou, imgsz=self.imgsz,
                                         max_det=self.max_det, device=self.device, verbose=False)
        latency_ms = (time.perf_counter() - t0) * 1000
        r = results[0]
        dets: list[Detection] = []
        if r.boxes is not None and len(r.boxes):
            xyxy = r.boxes.xyxy.cpu().numpy()
            confs = r.boxes.conf.cpu().numpy()
            clss = r.boxes.cls.cpu().numpy().astype(int)
            for (x1, y1, x2, y2), c, k in zip(xyxy, confs, clss):
                name = self.names[k] if 0 <= k < len(self.names) else str(k)
                dets.append(Detection(int(k), name, float(c), float(x1), float(y1), float(x2), float(y2)))
        annotated = r.plot() if annotate else None
        return dets, annotated, latency_ms

    def info(self) -> dict:
        return {"model": str(self.model_path), "device": self.device, "classes": self.names,
                "conf": self.conf, "iou": self.iou, "imgsz": self.imgsz,
                "generic_pretrained": self.is_generic_pretrained}
