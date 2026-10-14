"""Export a trained checkpoint to ONNX and validate the exported model.

Example
  python -m src.export_model --model models/<run>/best.pt --imgsz 640 --samples samples

Validation steps:
  1. onnx.checker structural check
  2. run the ONNX model (onnxruntime via Ultralytics) and the original .pt model on the
     sample images and compare detections (count, classes, box IoU, confidence delta).
"""

from __future__ import annotations

import argparse
import logging
import shutil
import sys
from pathlib import Path

import cv2
import numpy as np

from src.config import IMAGE_EXTENSIONS, AppConfig, load_config, resolve_path
from src.errors import AppError, DependencyError, InputValidationError
from src.inference import Detector
from src.utils import relpath, resolve_model_path, setup_logging, timestamp, write_json

log = logging.getLogger("export")


def _iou(a, b) -> float:
    x1, y1 = max(a.x1, b.x1), max(a.y1, b.y1)
    x2, y2 = min(a.x2, b.x2), min(a.y2, b.y2)
    inter = max(0.0, x2 - x1) * max(0.0, y2 - y1)
    union = (a.x2 - a.x1) * (a.y2 - a.y1) + (b.x2 - b.x1) * (b.y2 - b.y1) - inter
    return inter / union if union > 0 else 0.0


def compare_models(pt: Detector, onnx: Detector, images: list[Path]) -> dict:
    per_image, ious, conf_deltas, mismatches = [], [], [], 0
    for p in images:
        img = cv2.imread(str(p))
        if img is None:
            continue
        d_pt, _, _ = pt.predict(img, annotate=False)
        d_ox, _, _ = onnx.predict(img, annotate=False)
        used = set()
        matched = 0
        for a in d_pt:
            best, best_j = 0.0, -1
            for j, b in enumerate(d_ox):
                if j in used or b.class_id != a.class_id:
                    continue
                v = _iou(a, b)
                if v > best:
                    best, best_j = v, j
            if best_j >= 0 and best >= 0.5:
                used.add(best_j)
                matched += 1
                ious.append(best)
                conf_deltas.append(abs(a.confidence - d_ox[best_j].confidence))
        unmatched = (len(d_pt) - matched) + (len(d_ox) - matched)
        mismatches += unmatched
        per_image.append({"image": p.name, "pt_detections": len(d_pt), "onnx_detections": len(d_ox),
                          "matched": matched})
    total_pt = sum(i["pt_detections"] for i in per_image)
    return {
        "images": len(per_image),
        "pt_detections": total_pt,
        "onnx_detections": sum(i["onnx_detections"] for i in per_image),
        "matched": sum(i["matched"] for i in per_image),
        "unmatched": mismatches,
        "mean_iou": round(float(np.mean(ious)), 4) if ious else None,
        "max_conf_delta": round(float(max(conf_deltas)), 4) if conf_deltas else None,
        "per_image": per_image,
        # Small differences near the confidence threshold are normal between runtimes.
        "passed": total_pt == 0 or (mismatches <= max(1, int(0.05 * total_pt))
                                    and (not ious or float(np.mean(ious)) > 0.9)),
    }


def export_onnx(cfg: AppConfig, model: str | None = None, imgsz: int | None = None,
                samples: str | None = None, opset: int | None = None) -> dict:
    try:
        import onnx  # noqa: F401
        from ultralytics import YOLO
    except (ImportError, OSError) as exc:
        raise DependencyError(f"ONNX export needs 'onnx' and 'ultralytics': {exc}") from exc
    src = resolve_model_path(cfg, model)
    if src.suffix != ".pt":
        raise InputValidationError(f"Export needs a PyTorch .pt checkpoint, got {src.name}")
    imgsz = imgsz or cfg.inference.imgsz

    target = src.with_suffix(".onnx")
    if target.exists():  # never overwrite a previous export silently
        backup = target.with_name(f"{target.stem}_{timestamp()}.onnx")
        shutil.move(str(target), backup)
        log.info("Existing export moved to %s", backup.name)

    kwargs = {"format": "onnx", "imgsz": imgsz, "dynamic": False, "simplify": False}
    if opset:
        kwargs["opset"] = opset
    out = Path(YOLO(str(src)).export(**kwargs))
    import onnx as onnx_mod
    onnx_mod.checker.check_model(str(out))
    log.info("ONNX checker passed: %s", out)

    sample_dir = resolve_path(samples or cfg.paths.samples_dir)
    images = sorted(p for p in sample_dir.glob("*") if p.suffix.lower() in IMAGE_EXTENSIONS) \
        if sample_dir.is_dir() else ([sample_dir] if sample_dir.exists() else [])
    comparison = None
    if images:
        pt_det = Detector(src, "cpu", cfg.inference.conf, cfg.inference.iou, imgsz)
        ox_det = Detector(out, "cpu", cfg.inference.conf, cfg.inference.iou, imgsz)
        comparison = compare_models(pt_det, ox_det, images[:20])
    else:
        log.warning("No sample images in %s - skipped output comparison.", sample_dir)

    report = {"source": relpath(src), "onnx": relpath(out), "imgsz": imgsz,
              "size_mb": round(out.stat().st_size / 1e6, 2), "checker": "passed", "comparison": comparison}
    write_json(out.with_suffix(".export.json"), report)
    return report


def main(argv: list[str] | None = None) -> int:
    cfg = load_config()
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--model", default=None)
    p.add_argument("--imgsz", type=int, default=cfg.inference.imgsz)
    p.add_argument("--samples", default=cfg.paths.samples_dir, help="images used to compare .pt vs .onnx")
    p.add_argument("--opset", type=int, default=None)
    args = p.parse_args(argv)
    setup_logging("export", cfg.paths.resolve("logs_dir"))
    try:
        r = export_onnx(cfg, args.model, args.imgsz, args.samples, args.opset)
    except AppError as exc:
        log.error("[%s] %s: %s", exc.error_code, exc.error_title, exc.error_content)
        return 2
    c = r["comparison"]
    print(f"\nONNX model: {r['onnx']} ({r['size_mb']} MB) - checker passed")
    if c:
        print(f"Comparison on {c['images']} images: pt={c['pt_detections']} onnx={c['onnx_detections']} "
              f"matched={c['matched']} mean IoU={c['mean_iou']} -> {'PASSED' if c['passed'] else 'CHECK MANUALLY'}")
    print(f"Use it like any model:  python -m src.predict_image --model {r['onnx']} --source samples")
    return 0 if not c or c["passed"] else 1


if __name__ == "__main__":
    sys.exit(main())
