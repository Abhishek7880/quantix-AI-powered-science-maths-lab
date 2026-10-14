"""Utils, inference error handling and camera/video source handling."""

import os

import numpy as np
import pytest

from src.config import PROJECT_ROOT
from src.errors import CameraUnavailableError, InputValidationError, ModelNotFoundError, TrainingLockError
from src.utils import acquire_train_lock, read_train_lock, release_train_lock, resolve_device, \
    resolve_model_path, unique_path, write_json


def test_unique_path_never_overwrites(tmp_path):
    p = tmp_path / "a.jpg"
    assert unique_path(p) == p
    p.write_text("x")
    p2 = unique_path(p)
    assert p2.name == "a_1.jpg"
    p2.write_text("y")
    assert unique_path(p).name == "a_2.jpg"


def test_resolve_device_cpu():
    assert resolve_device("cpu") == "cpu"
    assert resolve_device("auto") in ("cpu", "0")


def test_resolve_model_path_errors(tmp_cfg):
    with pytest.raises(ModelNotFoundError, match="not been trained"):
        resolve_model_path(tmp_cfg)
    with pytest.raises(ModelNotFoundError, match="not found"):
        resolve_model_path(tmp_cfg, "models/does_not_exist.pt")


def test_resolve_model_path_registry(tmp_cfg, tmp_path):
    best = tmp_path / "models_dir" / "run1" / "best.pt"
    best.parent.mkdir(parents=True)
    best.write_bytes(b"x")
    write_json(tmp_path / "models_dir" / "registry.json", [{"name": "run1", "best": str(best)}])
    assert resolve_model_path(tmp_cfg) == best


def test_training_lock_blocks_second_process(tmp_cfg, tmp_path):
    # Simulate a lock held by another live process (our parent process).
    lock = tmp_path / "logs_dir" / "train.lock"
    write_json(lock, {"pid": os.getppid(), "started": "now"})
    assert read_train_lock(tmp_cfg) is not None
    with pytest.raises(TrainingLockError):
        acquire_train_lock(tmp_cfg)


def test_stale_lock_is_cleared(tmp_cfg, tmp_path):
    write_json(tmp_path / "logs_dir" / "train.lock", {"pid": 999999999, "started": "old"})
    assert read_train_lock(tmp_cfg) is None
    acquire_train_lock(tmp_cfg)
    assert read_train_lock(tmp_cfg)["pid"] == os.getpid()
    release_train_lock(tmp_cfg)
    assert read_train_lock(tmp_cfg) is None


# ------------------------------------------------------------------ inference

def test_detector_missing_model(tmp_path):
    from src.inference import Detector
    with pytest.raises(ModelNotFoundError):
        Detector(tmp_path / "missing.pt", device="cpu")


def test_detector_invalid_params(tmp_path):
    from src.inference import Detector
    with pytest.raises(InputValidationError):
        Detector(tmp_path / "missing.pt", device="cpu", conf=1.5)


def test_detector_corrupt_model(tmp_path):
    from src.inference import Detector
    bad = tmp_path / "bad.pt"
    bad.write_bytes(b"garbage")
    with pytest.raises(ModelNotFoundError) as ei:
        Detector(bad, device="cpu")
    assert ei.value.error_code == "MODEL_LOAD_FAILED"


# ------------------------------------------------------------------ camera / video

def test_unavailable_camera():
    from src.predict_camera import FrameSource
    with pytest.raises(CameraUnavailableError):
        FrameSource(camera_index=15)


def test_missing_video():
    from src.predict_camera import FrameSource
    with pytest.raises(CameraUnavailableError) as ei:
        FrameSource(video_path=PROJECT_ROOT / "nope.mp4")
    assert ei.value.error_code == "VIDEO_NOT_FOUND"


def test_source_requires_exactly_one():
    from src.predict_camera import FrameSource
    with pytest.raises(InputValidationError):
        FrameSource()


def test_video_source_reads_frames():
    from src.predict_camera import FrameSource
    video = PROJECT_ROOT / "samples" / "sample_conveyor.mp4"
    if not video.exists():
        pytest.skip("sample video not generated (python -m src.dataset_utils make-samples)")
    src = FrameSource(video_path=video)
    try:
        seq, frame = src.read_latest()
        assert isinstance(frame, np.ndarray) and frame.ndim == 3 and seq >= 1
    finally:
        src.release()
