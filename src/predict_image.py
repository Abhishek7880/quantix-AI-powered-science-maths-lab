"""Run detection on an image file or a folder of images.

Examples
  python -m src.predict_image --source samples/sample_shapes_01.jpg
  python -m src.predict_image --source samples --conf 0.4 --model models/<run>/best.pt

Annotated images + detections.csv + summary.json are written to a NEW folder
under outputs/predictions/ (previous results are never overwritten).
"""

from __future__ import annotations

import argparse
import csv
import logging
import sys
from pathlib import Path

import cv2

from src.config import IMAGE_EXTENSIONS, AppConfig, load_config, resolve_path
from src.errors import AppError, InputValidationError, ResourceNotFoundError
from src.inference import Detector
from src.utils import relpath, resolve_model_path, setup_logging, timestamp, unique_dir, unique_path, write_json

log = logging.getLogger("predict_image")


def collect_images(source: Path) -> list[Path]:
    if not source.exists():
        raise ResourceNotFoundError(f"Image or folder not found: {source}", error_code="IMAGE_NOT_FOUND",
                                    error_title="Image not found")
    if source.is_file():
        if source.suffix.lower() not in IMAGE_EXTENSIONS:
            raise InputValidationError(f"Unsupported file type '{source.suffix}'. Use JPG, JPEG or PNG.",
                                       error_code="UNSUPPORTED_IMAGE_TYPE")
        return [source]
    images = sorted(p for p in source.iterdir() if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS)
    if not images:
        raise ResourceNotFoundError(f"No JPG/JPEG/PNG images found in {source}", error_code="IMAGE_NOT_FOUND",
                                    error_title="No images found")
    return images


def predict_images(detector: Detector, images: list[Path], out_dir: Path) -> dict:
    out_dir.mkdir(parents=True, exist_ok=True)
    rows, per_image = [], []
    for img_path in images:
        frame = cv2.imread(str(img_path))
        if frame is None:
            log.warning("Skipping unreadable image %s", img_path)
            per_image.append({"image": img_path.name, "error": "unreadable image"})
            continue
        dets, annotated, latency = detector.predict(frame)
        out_img = unique_path(out_dir / f"{img_path.stem}_pred{img_path.suffix}")
        cv2.imwrite(str(out_img), annotated)
        for d in dets:
            rows.append({"image": img_path.name, **d.to_dict()})
        per_image.append({"image": img_path.name, "annotated": relpath(out_img), "latency_ms": round(latency, 1),
                          "detections": [d.to_dict() for d in dets]})
        log.info("%s: %d detection(s) in %.1f ms -> %s", img_path.name, len(dets), latency, out_img.name)

    csv_path = out_dir / "detections.csv"
    with open(csv_path, "w", newline="", encoding="utf-8") as fh:
        fields = ["image", "class_id", "class_name", "confidence", "x1", "y1", "x2", "y2"]
        w = csv.DictWriter(fh, fieldnames=fields)
        w.writeheader()
        w.writerows(rows)
    summary = {"model": str(detector.model_path), "output_dir": relpath(out_dir), "images": per_image,
               "total_detections": len(rows), "conf_threshold": detector.conf,
               "note": "Confidence scores are model scores, not calibrated probabilities."}
    write_json(out_dir / "summary.json", summary)
    return summary


def main(argv: list[str] | None = None) -> int:
    cfg: AppConfig = load_config()
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--source", required=True, help="image file or folder")
    p.add_argument("--model", default=None, help="checkpoint (.pt/.onnx); default = latest trained model")
    p.add_argument("--conf", type=float, default=cfg.inference.conf)
    p.add_argument("--iou", type=float, default=cfg.inference.iou)
    p.add_argument("--imgsz", type=int, default=cfg.inference.imgsz)
    p.add_argument("--device", default=cfg.device)
    p.add_argument("--show", action="store_true", help="display results in a window")
    args = p.parse_args(argv)
    setup_logging("predict_image", cfg.paths.resolve("logs_dir"))

    try:
        model_path = resolve_model_path(cfg, args.model)
        images = collect_images(resolve_path(args.source))
        detector = Detector(model_path, args.device, args.conf, args.iou, args.imgsz, cfg.inference.max_det)
        detector.warmup()  # first call includes one-off setup; keep it out of the reported latency
        out_dir = unique_dir(cfg.paths.resolve("predictions_dir"), f"pred_{timestamp()}")
        summary = predict_images(detector, images, out_dir)
    except AppError as exc:
        log.error("[%s] %s: %s", exc.error_code, exc.error_title, exc.error_content)
        return 2

    print(f"\nProcessed {len(images)} image(s), {summary['total_detections']} detection(s).")
    print(f"Results: {out_dir}")
    if args.show:
        for item in summary["images"]:
            if "annotated" in item:
                cv2.imshow("Prediction (any key = next, q = quit)", cv2.imread(str(resolve_path(item["annotated"]))))
                if cv2.waitKey(0) & 0xFF == ord("q"):
                    break
        cv2.destroyAllWindows()
    return 0


if __name__ == "__main__":
    sys.exit(main())
