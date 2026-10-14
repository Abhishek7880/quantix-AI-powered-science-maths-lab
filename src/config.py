"""Central configuration.

Defaults live here. Any value can be overridden in ``config.yaml`` at the
project root (or the file pointed to by the ``IAV_CONFIG`` environment
variable). CLI arguments override both.

All relative paths are resolved against the project root, so the project can
be moved to any machine without editing code.
"""

from __future__ import annotations

import os
from dataclasses import asdict, dataclass, field, fields, is_dataclass
from pathlib import Path
from typing import Any

import yaml

PROJECT_ROOT = Path(__file__).resolve().parent.parent
CONFIG_FILE = Path(os.environ.get("IAV_CONFIG", PROJECT_ROOT / "config.yaml"))

IMAGE_EXTENSIONS = (".jpg", ".jpeg", ".png")


@dataclass
class PathsConfig:
    dataset_dir: str = "dataset"
    data_yaml: str = "dataset/data.yaml"
    models_dir: str = "models"
    outputs_dir: str = "outputs"
    predictions_dir: str = "outputs/predictions"
    snapshots_dir: str = "outputs/snapshots"
    logs_dir: str = "outputs/logs"
    runs_dir: str = "outputs/runs"
    evaluations_dir: str = "outputs/evaluations"
    samples_dir: str = "samples"

    def resolve(self, name: str) -> Path:
        """Return an absolute path for one of the fields above."""
        p = Path(getattr(self, name))
        return p if p.is_absolute() else (PROJECT_ROOT / p).resolve()


@dataclass
class TrainConfig:
    # Lightweight pretrained COCO detection checkpoint used for transfer learning.
    base_model: str = "yolo11n.pt"
    epochs: int = 50
    imgsz: int = 640
    batch: int = 8
    lr0: float = 0.01
    workers: int = 2
    patience: int = 15  # early stopping: epochs without improvement
    seed: int = 42
    optimizer: str = "auto"
    cache: bool = False


@dataclass
class InferenceConfig:
    conf: float = 0.25
    iou: float = 0.45
    imgsz: int = 640
    max_det: int = 100


@dataclass
class CameraConfig:
    index: int = 0
    width: int = 1280
    height: int = 720
    window_name: str = "Industrial AI Vision - Live"
    max_consecutive_failures: int = 30


@dataclass
class ContactConfig:
    # Email alerts for contact-us messages. Empty notify_to = no emails (messages still reach the inbox).
    notify_to: str = ""
    # Also send the visitor an automatic "we received your message, ticket …" email.
    confirm_to_sender: bool = False
    # SMTP server; the sending account and its password live in secrets/smtp.json or IAV_SMTP_* environment
    # variables — never in this file.
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    inbox_url: str = "http://127.0.0.1:8000/contact/inbox"
    # Static "Quantix Lite" site only (tools/build_static.py): Web3Forms access key — the form service that emails
    # contact messages when there is no server. Public by design (it can only send to your own inbox).
    web3forms_key: str = ""


@dataclass
class AuthorConfig:
    # The signature in every page footer. Empty fields are not shown. Checked in src/social.py.
    name: str = ""
    title: str = ""
    email: str = ""
    phone: str = ""             # with country code, e.g. +91 98765 43210
    url: str = ""               # where the signature links to (e.g. your GitHub)


@dataclass
class SocialConfig:
    # Public social-media links (footer of every page + Contact page). A full profile URL or just the username;
    # empty = not shown. whatsapp = phone number with country code. Checked in src/social.py.
    github: str = ""
    linkedin: str = ""
    instagram: str = ""
    youtube: str = ""
    x: str = ""
    facebook: str = ""
    threads: str = ""
    telegram: str = ""
    whatsapp: str = ""
    discord: str = ""


@dataclass
class AppConfig:
    # Class names for YOUR use case. Used when generating dataset/data.yaml.
    class_names: list[str] = field(default_factory=lambda: ["defect"])
    # "auto" -> CUDA GPU when usable, otherwise CPU. Or "cpu", "0", "0,1".
    device: str = "auto"
    # Empty -> use the most recently registered trained model in models/.
    model_path: str = ""
    paths: PathsConfig = field(default_factory=PathsConfig)
    train: TrainConfig = field(default_factory=TrainConfig)
    inference: InferenceConfig = field(default_factory=InferenceConfig)
    camera: CameraConfig = field(default_factory=CameraConfig)
    contact: ContactConfig = field(default_factory=ContactConfig)
    social: SocialConfig = field(default_factory=SocialConfig)
    author: AuthorConfig = field(default_factory=AuthorConfig)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _merge(obj: Any, overrides: dict[str, Any]) -> None:
    valid = {f.name: f for f in fields(obj)}
    for key, value in (overrides or {}).items():
        if key not in valid:
            raise ValueError(f"Unknown config key '{key}' in {CONFIG_FILE}. Valid keys: {sorted(valid)}")
        current = getattr(obj, key)
        if is_dataclass(current):
            if not isinstance(value, dict):
                raise ValueError(f"Config section '{key}' must be a mapping")
            _merge(current, value)
        else:
            setattr(obj, key, value)


def load_config(path: Path | None = None) -> AppConfig:
    cfg = AppConfig()
    path = Path(path) if path else CONFIG_FILE
    if path.exists():
        with open(path, "r", encoding="utf-8") as fh:
            data = yaml.safe_load(fh) or {}
        if not isinstance(data, dict):
            raise ValueError(f"{path} must contain a YAML mapping")
        _merge(cfg, data)
    return cfg


def resolve_path(p: str | Path) -> Path:
    p = Path(p)
    return p if p.is_absolute() else (PROJECT_ROOT / p).resolve()
