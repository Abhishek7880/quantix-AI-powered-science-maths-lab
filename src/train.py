"""Train a YOLO object detector on a custom dataset (transfer learning).

Examples
  python -m src.train --data dataset/data.yaml
  python -m src.train --data dataset/data.yaml --epochs 100 --imgsz 640 --batch 16 --device 0
  python -m src.train --resume outputs/runs/train/<run>/weights/last.pt

Every run gets a NEW folder under outputs/runs/train/ (never overwritten). On success the
best/last checkpoints are copied to models/<run_name>/ and recorded in models/registry.json.
"""

from __future__ import annotations

import argparse
import logging
import os
import shutil
import sys
import time
import traceback
from datetime import datetime
from pathlib import Path

from src.config import AppConfig, load_config, resolve_path
from src.dataset_utils import load_data_yaml, validate_dataset
from src.utils import (TrainingLockError, acquire_train_lock, environment_report, register_model, relpath,
                       release_train_lock, resolve_device, setup_logging, timestamp, unique_path, write_json)

log = logging.getLogger("train")


def parse_args(cfg: AppConfig, argv: list[str] | None = None) -> argparse.Namespace:
    t = cfg.train
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--data", default=cfg.paths.data_yaml, help="path to data.yaml")
    p.add_argument("--model", default=t.base_model, help="pretrained detection checkpoint for transfer learning")
    p.add_argument("--epochs", type=int, default=t.epochs)
    p.add_argument("--imgsz", type=int, default=t.imgsz)
    p.add_argument("--batch", type=int, default=t.batch)
    p.add_argument("--lr0", type=float, default=t.lr0, help="initial learning rate")
    p.add_argument("--workers", type=int, default=t.workers)
    p.add_argument("--patience", type=int, default=t.patience, help="early stopping patience (epochs)")
    p.add_argument("--seed", type=int, default=t.seed)
    p.add_argument("--optimizer", default=t.optimizer)
    p.add_argument("--device", default=cfg.device, help="auto | cpu | 0 | 0,1")
    p.add_argument("--name", default=None, help="run name (default: <dataset>_<timestamp>)")
    p.add_argument("--resume", default=None, help="path to a last.pt checkpoint to resume an interrupted run")
    p.add_argument("--cache", action="store_true", default=t.cache, help="cache images in RAM")
    p.add_argument("--skip-validation", action="store_true", help="skip dataset validation (not recommended)")
    return p.parse_args(argv)


def _status_file(cfg: AppConfig) -> Path:
    return cfg.paths.resolve("logs_dir") / "training_status.json"


def _write_status(cfg: AppConfig, **fields) -> None:
    fields["updated"] = datetime.now().isoformat(timespec="seconds")
    write_json(_status_file(cfg), fields)


def check_hardware(device: str, args: argparse.Namespace) -> None:
    env = environment_report()
    log.info("Environment: %s", env)
    try:
        import psutil
        mem_gb = psutil.virtual_memory().available / 1e9
        disk_gb = shutil.disk_usage(resolve_path(".")).free / 1e9
        log.info("Available RAM: %.1f GB, free disk: %.1f GB", mem_gb, disk_gb)
        if mem_gb < 2:
            log.warning("Less than 2 GB RAM available - reduce --batch / --imgsz / --workers if training crashes.")
        if disk_gb < 2:
            log.warning("Less than 2 GB free disk space - checkpoints and plots may fail to save.")
    except Exception:
        pass
    if device == "cpu":
        log.warning("Training on CPU. This works but is slow; consider a CUDA GPU for large datasets "
                    "(epochs=%d, imgsz=%d).", args.epochs, args.imgsz)


def plot_training_curves(results_csv: Path, out_png: Path) -> Path | None:
    """Our own Matplotlib summary of losses + metrics (Ultralytics also writes results.png)."""
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        import pandas as pd
    except ImportError:
        return None
    if not results_csv.exists():
        return None
    df = pd.read_csv(results_csv)
    df.columns = [c.strip() for c in df.columns]
    if "epoch" not in df.columns or df.empty:
        return None
    loss_cols = [c for c in df.columns if "loss" in c]
    metric_cols = [c for c in df.columns if c.startswith("metrics/")]
    fig, axes = plt.subplots(1, 2, figsize=(13, 4.5))
    for c in loss_cols:
        axes[0].plot(df["epoch"], df[c], label=c)
    axes[0].set_title("Losses")
    axes[0].set_xlabel("epoch")
    axes[0].legend(fontsize=7)
    for c in metric_cols:
        axes[1].plot(df["epoch"], df[c], label=c.replace("metrics/", ""))
    axes[1].set_title("Validation metrics")
    axes[1].set_xlabel("epoch")
    axes[1].set_ylim(0, 1.02)
    axes[1].legend(fontsize=7)
    fig.tight_layout()
    fig.savefig(out_png, dpi=110)
    plt.close(fig)
    return out_png


def _final_metrics(save_dir: Path) -> dict:
    csv = save_dir / "results.csv"
    if not csv.exists():
        return {}
    import pandas as pd
    df = pd.read_csv(csv)
    df.columns = [c.strip() for c in df.columns]
    if df.empty:
        return {}
    keys = {"metrics/precision(B)": "precision", "metrics/recall(B)": "recall",
            "metrics/mAP50(B)": "mAP50", "metrics/mAP50-95(B)": "mAP50_95"}
    best_idx = df["metrics/mAP50-95(B)"].idxmax() if "metrics/mAP50-95(B)" in df else df.index[-1]
    row = df.loc[best_idx]
    out = {v: round(float(row[k]), 4) for k, v in keys.items() if k in df}
    out["best_epoch"] = int(row["epoch"]) if "epoch" in df else None
    out["epochs_completed"] = int(len(df))
    return out


def train(cfg: AppConfig, args: argparse.Namespace) -> int:
    try:
        from ultralytics import YOLO
    except ImportError:
        log.error("Ultralytics is not installed. Run: pip install -r requirements.txt")
        return 2

    data_yaml = resolve_path(args.data)
    if not args.resume:
        if not data_yaml.exists():
            log.error("data.yaml not found: %s\nCreate the dataset first (see README, 'Dataset preparation').", data_yaml)
            return 2
        if not args.skip_validation:
            log.info("Validating dataset %s ...", data_yaml)
            rep = validate_dataset(data_yaml)
            for line in rep.summary().splitlines():
                log.info(line)
            if not rep.ok:
                log.error("Dataset validation failed - fix the errors above before training "
                          "(or use --skip-validation at your own risk).")
                return 2
        data = load_data_yaml(data_yaml)
        log.info("Classes (%d): %s", data["nc"], data["names"])
    elif not resolve_path(args.resume).exists():
        log.error("Resume checkpoint not found: %s", args.resume)
        return 2

    device = resolve_device(args.device)
    check_hardware(device, args)
    if args.workers > 0 and sys.platform == "win32":
        log.info("Windows detected: using %d dataloader workers (set --workers 0 if you see worker errors).",
                 args.workers)

    runs_dir = cfg.paths.resolve("runs_dir") / "train"
    name = args.name or f"{data_yaml.parent.name}_{timestamp()}"

    try:
        acquire_train_lock(cfg, {"name": name, "data": relpath(data_yaml)})
    except TrainingLockError as exc:
        log.error("%s", exc)
        return 3

    started = time.time()
    _write_status(cfg, state="running", name=name, data=relpath(data_yaml), epochs=args.epochs,
                  started=datetime.now().isoformat(timespec="seconds"))
    model = None
    history: list[dict] = []
    prog = {"batch": 0, "last_write": 0.0, "epoch_start": time.time()}
    short = {"metrics/precision(B)": "precision", "metrics/recall(B)": "recall",
             "metrics/mAP50(B)": "mAP50", "metrics/mAP50-95(B)": "mAP50_95"}

    def _progress(trainer, epoch_done: bool) -> None:
        """Live progress for the web UI (outputs/logs/training_status.json)."""
        epochs = int(getattr(trainer, "epochs", args.epochs) or args.epochs)
        epoch = int(getattr(trainer, "epoch", 0)) + (1 if epoch_done else 0)
        try:
            nb = len(trainer.train_loader)
        except Exception:
            nb = 0
        frac = 1.0 if epoch_done or not nb else min(1.0, prog["batch"] / nb)
        done = (epoch if epoch_done else epoch + frac)
        elapsed = time.time() - started
        eta = max(0.0, elapsed / done * (epochs - done)) if done > 0 else None
        _write_status(cfg, state="running", name=name, data=relpath(data_yaml), pid=os.getpid(), epochs=epochs,
                      epoch=epoch, epoch_fraction=round(frac, 3), progress=round(min(1.0, done / epochs), 4),
                      elapsed_sec=round(elapsed), eta_sec=round(eta) if eta is not None else None,
                      run_dir=relpath(Path(trainer.save_dir)) if getattr(trainer, "save_dir", None) else None,
                      metrics=history[-1] if history else None, history=history[-300:], started=started_iso)

    def on_train_epoch_start(trainer):
        prog["batch"] = 0

    def on_train_batch_end(trainer):
        prog["batch"] += 1
        if time.time() - prog["last_write"] > 2:
            prog["last_write"] = time.time()
            _progress(trainer, epoch_done=False)

    def on_fit_epoch_end(trainer):
        ep = int(trainer.epoch) + 1
        if ep > int(getattr(trainer, "epochs", args.epochs) or args.epochs):
            return   # the final validation of best.pt fires this event once more; it is not a new epoch
        m = {v: round(float(trainer.metrics[k]), 4) for k, v in short.items() if trainer.metrics and k in trainer.metrics}
        history[:] = [e for e in history if e["epoch"] != ep] + [{"epoch": ep, **m}]
        _progress(trainer, epoch_done=True)

    started_iso = datetime.now().isoformat(timespec="seconds")
    try:
        if args.resume:
            ckpt = resolve_path(args.resume)
            log.info("Resuming training from %s", ckpt)
            model = YOLO(str(ckpt))
            for ev, fn in (("on_train_epoch_start", on_train_epoch_start), ("on_train_batch_end", on_train_batch_end),
                           ("on_fit_epoch_end", on_fit_epoch_end)):
                model.add_callback(ev, fn)
            model.train(resume=True)
        else:
            base = args.model
            # Keep downloaded pretrained weights inside models/pretrained/ instead of the CWD.
            if not Path(base).exists() and not Path(base).parent.parts:
                pre_dir = cfg.paths.resolve("models_dir") / "pretrained"
                pre_dir.mkdir(parents=True, exist_ok=True)
                base = str(pre_dir / base)
            log.info("Loading pretrained checkpoint %s (transfer learning)", base)
            model = YOLO(base)
            if getattr(model, "task", "detect") != "detect":
                log.error("Checkpoint %s is a '%s' model; this project trains object DETECTION models "
                          "(e.g. yolo11n.pt).", base, model.task)
                _write_status(cfg, state="failed", name=name, error="wrong model task")
                return 2
            for ev, fn in (("on_train_epoch_start", on_train_epoch_start), ("on_train_batch_end", on_train_batch_end),
                           ("on_fit_epoch_end", on_fit_epoch_end)):
                model.add_callback(ev, fn)
            model.train(
                data=str(data_yaml), epochs=args.epochs, imgsz=args.imgsz, batch=args.batch, lr0=args.lr0,
                workers=args.workers, patience=args.patience, seed=args.seed, deterministic=True,
                optimizer=args.optimizer, device=device, project=str(runs_dir), name=name,
                exist_ok=False, pretrained=True, plots=True, cache=args.cache, verbose=True,
            )

        trainer = model.trainer
        save_dir = Path(trainer.save_dir)
        best, last = Path(trainer.best), Path(trainer.last)
        if not best.exists():
            raise RuntimeError(f"Training finished but no best checkpoint was written in {save_dir / 'weights'}")

        dest_dir = unique_path(cfg.paths.resolve("models_dir") / save_dir.name)
        dest_dir.mkdir(parents=True)
        shutil.copy2(best, dest_dir / "best.pt")
        if last.exists():
            shutil.copy2(last, dest_dir / "last.pt")
        curves = plot_training_curves(save_dir / "results.csv", save_dir / "training_curves.png")
        metrics = _final_metrics(save_dir)
        duration = round(time.time() - started, 1)

        experiment = {
            "name": save_dir.name,
            "created": datetime.now().isoformat(timespec="seconds"),
            "data": relpath(data_yaml),
            "base_model": args.model,
            "resumed_from": args.resume,
            "device": device,
            "params": {k: getattr(args, k) for k in ("epochs", "imgsz", "batch", "lr0", "workers", "patience",
                                                      "seed", "optimizer")},
            "validation_metrics": metrics,
            "duration_sec": duration,
            "run_dir": relpath(save_dir),
            "best": relpath(dest_dir / "best.pt"),
            "last": relpath(dest_dir / "last.pt"),
            "environment": environment_report(),
        }
        write_json(save_dir / "experiment.json", experiment)
        write_json(dest_dir / "experiment.json", experiment)
        register_model(cfg, {**{k: experiment[k] for k in ("name", "created", "data", "best", "last", "run_dir",
                                                            "validation_metrics", "device")},
                             "imgsz": args.imgsz})
        _write_status(cfg, state="completed", name=save_dir.name, best=experiment["best"], data=relpath(data_yaml),
                      run_dir=experiment["run_dir"], metrics=metrics, duration_sec=duration, history=history[-300:],
                      progress=1.0, epoch=metrics.get("epochs_completed"), epochs=args.epochs, imgsz=args.imgsz)

        log.info("=" * 70)
        log.info("TRAINING COMPLETE in %.1f min", duration / 60)
        log.info("Run folder     : %s", save_dir)
        log.info("Best checkpoint: %s", dest_dir / "best.pt")
        log.info("Validation metrics (best epoch): %s", metrics)
        if curves:
            log.info("Training curves: %s", curves)
        log.info("These are VALIDATION metrics. Run src.evaluate --split test for held-out test metrics.")
        log.info("=" * 70)
        return 0
    except KeyboardInterrupt:
        msg = "Training interrupted by user."
        last = Path(model.trainer.last) if model is not None and getattr(model, "trainer", None) else None
        if last and last.exists():
            msg += f" Resume with: python -m src.train --resume {last}"
        log.warning(msg)
        _write_status(cfg, state="interrupted", name=name, message=msg)
        return 130
    except Exception as exc:
        log.error("Training failed: %s", exc)
        log.debug(traceback.format_exc())
        hint = ""
        text = str(exc).lower()
        if "out of memory" in text or "cuda error" in text:
            hint = "Reduce --batch and/or --imgsz, or train with --device cpu."
        elif "no labels found" in text or "images not found" in text:
            hint = "Check data.yaml paths and that labels/ mirrors images/ (run src.dataset_utils validate)."
        elif "connection" in text or "download" in text:
            hint = "Pretrained weights could not be downloaded - check internet access or pass a local --model path."
        elif "worker" in text or "dataloader" in text:
            hint = "Try --workers 0."
        if hint:
            log.error("Hint: %s", hint)
        _write_status(cfg, state="failed", name=name, error=str(exc), hint=hint)
        return 1
    finally:
        release_train_lock(cfg)


def main(argv: list[str] | None = None) -> int:
    cfg = load_config()
    args = parse_args(cfg, argv)
    setup_logging("train", cfg.paths.resolve("logs_dir"))
    return train(cfg, args)


if __name__ == "__main__":
    sys.exit(main())
