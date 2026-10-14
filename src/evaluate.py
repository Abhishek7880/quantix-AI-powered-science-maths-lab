"""Evaluate a trained detector on the validation or held-out TEST split.

Examples
  python -m src.evaluate --split val
  python -m src.evaluate --split test --model models/<run>/best.pt --data dataset/data.yaml

Reports precision, recall, mAP@0.5, mAP@0.5:0.95, per-class metrics, the confusion
matrix, and inference latency / throughput MEASURED on this machine.

  * "val"  metrics were used to pick the best epoch, so they are optimistic.
  * "test" metrics (images never seen during training or model selection) are the
           right estimate of generalisation.
Evaluating on "train" is allowed only for debugging and is flagged as such.
"""

from __future__ import annotations

import argparse
import logging
import statistics
import sys
import time
from datetime import datetime
from pathlib import Path

import cv2

from src.config import AppConfig, load_config, resolve_path
from src.dataset_utils import list_images, load_data_yaml, split_dirs
from src.errors import AppError, DatasetError, DependencyError, InputValidationError, ResourceNotFoundError
from src.inference import Detector
from src.utils import relpath, resolve_device, resolve_model_path, setup_logging, timestamp, write_json

log = logging.getLogger("evaluate")

SPLIT_NOTES = {
    "val": "VALIDATION split: used for model selection during training - optimistic estimate.",
    "test": "TEST split: held out from training and model selection - estimate of generalisation.",
    "train": "TRAIN split: the model has seen these images. NOT a measure of generalisation (debug only).",
}


def benchmark_latency(detector: Detector, images: list[Path], max_images: int = 50, warmup: int = 3) -> dict:
    imgs = [cv2.imread(str(p)) for p in images[:max_images]]
    imgs = [i for i in imgs if i is not None]
    if not imgs:
        return {}
    for i in range(min(warmup, len(imgs))):
        detector.predict(imgs[i], annotate=False)
    lat = []
    t0 = time.perf_counter()
    for img in imgs:
        _, _, ms = detector.predict(img, annotate=False)
        lat.append(ms)
    wall = time.perf_counter() - t0
    lat_sorted = sorted(lat)
    return {
        "images": len(imgs),
        "device": detector.device,
        "mean_latency_ms": round(statistics.mean(lat), 2),
        "p50_latency_ms": round(lat_sorted[len(lat) // 2], 2),
        "p95_latency_ms": round(lat_sorted[min(len(lat) - 1, int(len(lat) * 0.95))], 2),
        "throughput_fps": round(len(imgs) / wall, 2) if wall > 0 else None,
        "note": "End-to-end single-image latency (pre+inference+post) measured on this machine, batch=1.",
    }


def plot_per_class(per_class: list[dict], out_png: Path) -> Path | None:
    if not per_class:
        return None
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    names = [c["class_name"] for c in per_class]
    x = range(len(names))
    fig, ax = plt.subplots(figsize=(max(6, len(names) * 1.2), 4))
    width = 0.2
    for k, (key, label) in enumerate([("precision", "P"), ("recall", "R"), ("mAP50", "mAP50"),
                                      ("mAP50_95", "mAP50-95")]):
        ax.bar([i + (k - 1.5) * width for i in x], [c[key] for c in per_class], width, label=label)
    ax.set_xticks(list(x))
    ax.set_xticklabels(names, rotation=30, ha="right")
    ax.set_ylim(0, 1.05)
    ax.set_title("Per-class metrics")
    ax.legend(fontsize=8)
    fig.tight_layout()
    fig.savefig(out_png, dpi=110)
    plt.close(fig)
    return out_png


def evaluate(cfg: AppConfig, model: str | None = None, data: str | None = None, split: str = "val",
             imgsz: int | None = None, batch: int | None = None, device: str | None = None,
             benchmark_images: int = 50) -> dict:
    if split not in SPLIT_NOTES:
        raise InputValidationError(f"split must be one of {list(SPLIT_NOTES)}, got '{split}'")
    try:
        from ultralytics import YOLO
    except (ImportError, OSError) as exc:
        raise DependencyError(f"Ultralytics could not be imported: {exc}") from exc

    model_path = resolve_model_path(cfg, model)
    data_yaml = resolve_path(data or cfg.paths.data_yaml)
    try:
        ds = load_data_yaml(data_yaml)
    except FileNotFoundError as exc:
        raise ResourceNotFoundError(str(exc), error_code="DATA_YAML_NOT_FOUND", error_title="data.yaml not found")
    except ValueError as exc:
        raise DatasetError(str(exc))
    dirs = split_dirs(data_yaml, ds)
    if split not in dirs:
        raise DatasetError(f"data.yaml has no '{split}' split. Add e.g. '{split}: images/{split}' and put "
                           f"images in it.", error_code="SPLIT_MISSING", error_title="Split missing")
    split_images = list_images(dirs[split][0])
    if not split_images:
        raise DatasetError(f"No images in the '{split}' split ({dirs[split][0]}).", error_code="SPLIT_EMPTY",
                           error_title="Split empty")
    if split == "train":
        log.warning(SPLIT_NOTES["train"])

    dev = resolve_device(device or cfg.device)
    imgsz = imgsz or cfg.inference.imgsz
    out_parent = cfg.paths.resolve("evaluations_dir")
    yolo = YOLO(str(model_path), task="detect")
    log.info("Evaluating %s on %s split (%d images) ...", model_path, split, len(split_images))
    metrics = yolo.val(data=str(data_yaml), split=split, imgsz=imgsz, batch=batch or cfg.train.batch, device=dev,
                       project=str(out_parent), name=f"{split}_{timestamp()}", exist_ok=False, plots=True,
                       verbose=False)
    save_dir = Path(metrics.save_dir)
    box = metrics.box
    names = metrics.names if isinstance(metrics.names, dict) else dict(enumerate(metrics.names))

    per_class = []
    nt = getattr(metrics, "nt_per_class", None)
    for i, cls_idx in enumerate(box.ap_class_index):
        p, r, ap50, ap = box.class_result(i)
        per_class.append({"class_id": int(cls_idx), "class_name": names[int(cls_idx)],
                          "instances": int(nt[int(cls_idx)]) if nt is not None and len(nt) > int(cls_idx) else None,
                          "precision": round(float(p), 4), "recall": round(float(r), 4),
                          "mAP50": round(float(ap50), 4), "mAP50_95": round(float(ap), 4)})

    cm = getattr(metrics, "confusion_matrix", None)
    cm_list = cm.matrix.astype(int).tolist() if cm is not None and getattr(cm, "matrix", None) is not None else None
    if cm_list:
        labels = [names[i] for i in sorted(names)] + ["background"]
        import pandas as pd
        pd.DataFrame(cm_list, index=[f"pred_{l}" for l in labels], columns=[f"true_{l}" for l in labels]) \
            .to_csv(save_dir / "confusion_matrix.csv")

    detector = Detector(model_path, dev, cfg.inference.conf, cfg.inference.iou, imgsz, cfg.inference.max_det)
    bench = benchmark_latency(detector, split_images, benchmark_images)
    plot_per_class(per_class, save_dir / "per_class_metrics.png")

    report = {
        "created": datetime.now().isoformat(timespec="seconds"),
        "model": relpath(model_path),
        "data": relpath(data_yaml),
        "split": split,
        "split_note": SPLIT_NOTES[split],
        "images": len(split_images),
        "overall": {"precision": round(float(box.mp), 4), "recall": round(float(box.mr), 4),
                    "mAP50": round(float(box.map50), 4), "mAP50_95": round(float(box.map), 4)},
        "per_class": per_class,
        "confusion_matrix": cm_list,
        "confusion_matrix_labels": [names[i] for i in sorted(names)] + ["background"],
        "ultralytics_speed_ms_per_image": {k: round(v, 2) for k, v in (metrics.speed or {}).items()},
        "benchmark": bench,
        "output_dir": relpath(save_dir),
        "plots": sorted(relpath(p) for p in save_dir.glob("*.png")),
        "disclaimer": "Metrics apply only to this dataset split. Validate on representative industrial images "
                      "before any production use. Confidence scores are not calibrated probabilities.",
    }
    write_json(save_dir / "evaluation.json", report)
    return report


def main(argv: list[str] | None = None) -> int:
    cfg = load_config()
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--model", default=None)
    p.add_argument("--data", default=cfg.paths.data_yaml)
    p.add_argument("--split", default="val", choices=list(SPLIT_NOTES))
    p.add_argument("--imgsz", type=int, default=cfg.inference.imgsz)
    p.add_argument("--batch", type=int, default=cfg.train.batch)
    p.add_argument("--device", default=cfg.device)
    p.add_argument("--benchmark-images", type=int, default=50)
    args = p.parse_args(argv)
    setup_logging("evaluate", cfg.paths.resolve("logs_dir"))
    try:
        r = evaluate(cfg, args.model, args.data, args.split, args.imgsz, args.batch, args.device,
                     args.benchmark_images)
    except AppError as exc:
        log.error("[%s] %s: %s", exc.error_code, exc.error_title, exc.error_content)
        return 2

    o = r["overall"]
    print("\n" + "=" * 72)
    print(f"Evaluation - {r['split'].upper()} split ({r['images']} images)")
    print(r["split_note"])
    print(f"  Precision {o['precision']:.3f} | Recall {o['recall']:.3f} | "
          f"mAP@0.5 {o['mAP50']:.3f} | mAP@0.5:0.95 {o['mAP50_95']:.3f}")
    print(f"  {'class':<18}{'inst':>6}{'P':>8}{'R':>8}{'mAP50':>8}{'mAP50-95':>10}")
    for c in r["per_class"]:
        print(f"  {c['class_name']:<18}{c['instances'] or '-':>6}{c['precision']:>8.3f}{c['recall']:>8.3f}"
              f"{c['mAP50']:>8.3f}{c['mAP50_95']:>10.3f}")
    b = r["benchmark"]
    if b:
        print(f"  Latency ({b['device']}): mean {b['mean_latency_ms']} ms, p95 {b['p95_latency_ms']} ms, "
              f"throughput {b['throughput_fps']} img/s  (measured on this machine)")
    print(f"  Report + plots: {r['output_dir']}")
    print("=" * 72)
    return 0


if __name__ == "__main__":
    sys.exit(main())
