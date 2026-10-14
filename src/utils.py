"""Shared helpers: logging, device selection, safe output paths, model registry."""

from __future__ import annotations

import json
import logging
import os
import platform
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

from src.config import AppConfig, PROJECT_ROOT, resolve_path
from src.errors import ModelNotFoundError, TrainingLockError  # noqa: F401  (re-exported)


# --------------------------------------------------------------------------- logging

def setup_logging(name: str, log_dir: Path | None = None, level: int = logging.INFO) -> logging.Logger:
    """Configure root logging to console and (optionally) a timestamped file."""
    root = logging.getLogger()
    root.setLevel(level)
    fmt = logging.Formatter("%(asctime)s | %(levelname)-7s | %(name)s | %(message)s", "%Y-%m-%d %H:%M:%S")
    if not any(isinstance(h, logging.StreamHandler) and not isinstance(h, logging.FileHandler) for h in root.handlers):
        sh = logging.StreamHandler(sys.stdout)
        sh.setFormatter(fmt)
        root.addHandler(sh)
    if log_dir is not None:
        log_dir.mkdir(parents=True, exist_ok=True)
        fh = logging.FileHandler(unique_path(log_dir / f"{name}_{timestamp()}.log"), encoding="utf-8")
        fh.setFormatter(fmt)
        root.addHandler(fh)
    return logging.getLogger(name)


# --------------------------------------------------------------------------- paths

def timestamp() -> str:
    return datetime.now().strftime("%Y%m%d_%H%M%S")


def unique_path(path: Path) -> Path:
    """Return ``path`` or ``path`` with a numeric suffix so nothing is overwritten."""
    path = Path(path)
    if not path.exists():
        return path
    stem, suffix = path.stem, path.suffix
    i = 1
    while True:
        candidate = path.with_name(f"{stem}_{i}{suffix}")
        if not candidate.exists():
            return candidate
        i += 1


def unique_dir(parent: Path, name: str) -> Path:
    """Create and return a new directory that did not exist before."""
    parent.mkdir(parents=True, exist_ok=True)
    d = unique_path(parent / name)
    d.mkdir(parents=True, exist_ok=False)
    return d


# --------------------------------------------------------------------------- device

def resolve_device(preference: str = "auto") -> str:
    """Translate a device preference into an Ultralytics device string.

    Returns "cpu" or a CUDA index string such as "0". Falls back to CPU (with a
    warning) when CUDA is requested but not usable with the installed PyTorch.
    """
    log = logging.getLogger("device")
    pref = str(preference).strip().lower()
    if pref == "cpu":
        return "cpu"
    try:
        import torch
    except (ImportError, OSError) as exc:  # pragma: no cover - dependency missing / DLL failure
        from src.errors import DependencyError
        raise DependencyError(f"PyTorch could not be loaded ({exc}). Run: pip install -r requirements.txt "
                              "(on Windows see README > Troubleshooting > WinError 1114).") from exc

    if not torch.cuda.is_available():
        if pref != "auto":
            log.warning("CUDA device '%s' requested but CUDA is not available to PyTorch "
                        "(CPU-only build or no supported GPU). Falling back to CPU.", preference)
        return "cpu"

    # Check the GPU architecture is supported by this PyTorch build.
    try:
        major, minor = torch.cuda.get_device_capability(0)
        arch = f"sm_{major}{minor}"
        supported = torch.cuda.get_arch_list()
        if supported and arch not in supported and not any(a.startswith("compute_") for a in supported):
            log.warning("GPU %s (%s) is not supported by this PyTorch build (%s). Using CPU.",
                        torch.cuda.get_device_name(0), arch, ",".join(supported))
            return "cpu"
    except Exception as exc:  # pragma: no cover - defensive
        log.warning("Could not query CUDA capability (%s). Using CPU.", exc)
        return "cpu"
    return "0" if pref == "auto" else str(preference)


def environment_report() -> dict[str, Any]:
    info: dict[str, Any] = {"python": platform.python_version(), "platform": platform.platform()}
    for mod in ("torch", "torchvision", "ultralytics", "cv2", "numpy"):
        try:
            info[mod] = __import__(mod).__version__
        except Exception:
            info[mod] = "not installed"
    try:
        import torch
        info["cuda_available"] = torch.cuda.is_available()
        if torch.cuda.is_available():
            info["gpu"] = torch.cuda.get_device_name(0)
    except Exception:
        info["cuda_available"] = False
    return info


# --------------------------------------------------------------------------- model registry

def _registry_file(cfg: AppConfig) -> Path:
    return cfg.paths.resolve("models_dir") / "registry.json"


def load_registry(cfg: AppConfig) -> list[dict[str, Any]]:
    f = _registry_file(cfg)
    if not f.exists():
        return []
    try:
        return json.loads(f.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        logging.getLogger("registry").warning("Model registry %s is corrupt; ignoring it.", f)
        return []


def register_model(cfg: AppConfig, entry: dict[str, Any]) -> None:
    f = _registry_file(cfg)
    f.parent.mkdir(parents=True, exist_ok=True)
    reg = load_registry(cfg)
    reg.append(entry)
    tmp = f.with_suffix(".tmp")
    tmp.write_text(json.dumps(reg, indent=2), encoding="utf-8")
    os.replace(tmp, f)


def list_model_files(cfg: AppConfig) -> list[Path]:
    """All .pt / .onnx files under models/ (newest first)."""
    d = cfg.paths.resolve("models_dir")
    if not d.exists():
        return []
    files = [p for p in d.rglob("*") if p.suffix.lower() in (".pt", ".onnx")]
    return sorted(files, key=lambda p: p.stat().st_mtime, reverse=True)


def resolve_model_path(cfg: AppConfig, explicit: str | None = None) -> Path:
    """Find the model to use: CLI arg > config.model_path > latest registered model."""
    candidate = explicit or cfg.model_path
    if candidate:
        p = resolve_path(candidate)
        if p.exists():
            return p
        # Allow bare Ultralytics checkpoint names such as "yolo11n.pt" (auto-downloaded).
        if not Path(candidate).parent.parts and candidate.startswith("yolo"):
            return Path(candidate)
        raise ModelNotFoundError(
            f"Model file not found: {p}\n"
            "Train a model first:  python -m src.train --data dataset/data.yaml\n"
            "or pass an existing checkpoint with --model <path/to/best.pt>")

    for entry in reversed(load_registry(cfg)):
        p = resolve_path(entry.get("best", ""))
        if entry.get("best") and p.exists():
            return p
    raise ModelNotFoundError(
        "No trained model found. The model has not been trained yet.\n"
        "  1. Prepare and label your dataset (see README.md)\n"
        "  2. Train:  python -m src.train --data dataset/data.yaml\n"
        "  3. Or try the synthetic demo:  python -m src.dataset_utils make-synthetic  then\n"
        "     python -m src.train --data examples/synthetic_dataset/data.yaml --epochs 15 --imgsz 320\n"
        "You can also pass any checkpoint explicitly with --model <path>.")


def relpath(p: Path) -> str:
    """Path relative to the project root when possible (for portable records)."""
    try:
        return str(Path(p).resolve().relative_to(PROJECT_ROOT)).replace("\\", "/")
    except ValueError:
        return str(p)


# --------------------------------------------------------------------------- training lock

def _lock_file(cfg: AppConfig) -> Path:
    return cfg.paths.resolve("logs_dir") / "train.lock"


def _pid_alive(pid: int) -> bool:
    try:
        import psutil
        return psutil.pid_exists(pid) and psutil.Process(pid).status() != psutil.STATUS_ZOMBIE
    except Exception:
        return False


def read_train_lock(cfg: AppConfig) -> dict[str, Any] | None:
    """Return lock info when a training process is alive, else None (stale locks are removed)."""
    f = _lock_file(cfg)
    if not f.exists():
        return None
    try:
        info = json.loads(f.read_text(encoding="utf-8"))
    except Exception:
        info = {}
    pid = int(info.get("pid", -1))
    if pid > 0 and _pid_alive(pid):
        return info
    f.unlink(missing_ok=True)
    return None


def acquire_train_lock(cfg: AppConfig, extra: dict[str, Any] | None = None) -> Path:
    existing = read_train_lock(cfg)
    if existing and int(existing.get("pid", -1)) != os.getpid():
        raise TrainingLockError(
            f"Another training process (PID {existing.get('pid')}) is already running since "
            f"{existing.get('started')}. Wait for it to finish or stop it first.")
    f = _lock_file(cfg)
    f.parent.mkdir(parents=True, exist_ok=True)
    payload = {"pid": os.getpid(), "started": datetime.now().isoformat(timespec="seconds")}
    payload.update(extra or {})
    f.write_text(json.dumps(payload), encoding="utf-8")
    return f


def release_train_lock(cfg: AppConfig) -> None:
    f = _lock_file(cfg)
    try:
        info = json.loads(f.read_text(encoding="utf-8"))
        if int(info.get("pid", -1)) == os.getpid():
            f.unlink(missing_ok=True)
    except Exception:
        pass


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, indent=2, default=str), encoding="utf-8")
    os.replace(tmp, path)
