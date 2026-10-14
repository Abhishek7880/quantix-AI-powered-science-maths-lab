"""Live camera (or video file) detection with OpenCV.

Examples
  python -m src.predict_camera                         # default webcam (index from config)
  python -m src.predict_camera --camera 1              # another camera
  python -m src.predict_camera --video samples/sample_conveyor.mp4
  python -m src.predict_camera --video samples/sample_conveyor.mp4 --no-display --max-frames 100

Keyboard (window focused):
  q / ESC   quit safely           s   save snapshot (raw + annotated)
  + / -     confidence +/- 0.05   p   pause / resume

Architecture: capture thread -> latest frame only (no buffering backlog) -> inference
thread -> latest annotated result -> display in the main thread. The display never
waits on inference, so the window stays responsive on slow hardware.

FPS / latency shown on screen are MEASURED on this machine; they are not guaranteed
for any other hardware.
"""

from __future__ import annotations

import argparse
import csv
import logging
import sys
import threading
import time
from collections import deque
from datetime import datetime
from pathlib import Path

import cv2
import numpy as np

from src.config import AppConfig, load_config, resolve_path
from src.errors import AppError, CameraUnavailableError, InputValidationError
from src.inference import Detection, Detector
from src.utils import relpath, resolve_model_path, setup_logging, timestamp, unique_path

log = logging.getLogger("camera")


# =========================================================================== acquisition

class FrameSource:
    """Camera (threaded, keeps only the newest frame) or video file (sequential)."""

    def __init__(self, camera_index: int | None = None, video_path: Path | None = None,
                 width: int = 1280, height: int = 720, loop_video: bool = False, max_failures: int = 30):
        if (camera_index is None) == (video_path is None):
            raise InputValidationError("Specify exactly one of camera index or video file.")
        self.is_video = video_path is not None
        self.loop_video = loop_video
        self.max_failures = max_failures
        self.description = str(video_path) if self.is_video else f"camera {camera_index}"

        if self.is_video:
            if not video_path.exists():
                raise CameraUnavailableError(f"Video file not found: {video_path}", error_code="VIDEO_NOT_FOUND",
                                             error_title="Video not found")
            self.cap = cv2.VideoCapture(str(video_path))
        else:
            backend = cv2.CAP_DSHOW if sys.platform == "win32" else cv2.CAP_ANY
            self.cap = cv2.VideoCapture(camera_index, backend)
            if not self.cap.isOpened() and backend != cv2.CAP_ANY:
                self.cap.release()
                self.cap = cv2.VideoCapture(camera_index)
        if not self.cap.isOpened():
            self.cap.release()
            hint = ("Check the file is a valid video (mp4/avi)." if self.is_video else
                    "Possible causes: no camera connected; wrong index (try --camera 1); camera used by another "
                    "app (Teams/Zoom); OS privacy settings blocking access (Windows: Settings > Privacy > Camera; "
                    "macOS: System Settings > Privacy > Camera; Linux: user in 'video' group). "
                    "For testing without a camera use --video samples/sample_conveyor.mp4")
            raise CameraUnavailableError(f"Could not open {self.description}. {hint}")
        if not self.is_video:
            self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, width)
            self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, height)
            self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)  # minimise driver-side buffering

        ok, frame = self.cap.read()
        if not ok or frame is None:
            self.cap.release()
            raise CameraUnavailableError(f"{self.description} opened but returned no frame "
                                         "(permission denied, device busy, or empty video).",
                                         error_code="FRAME_CAPTURE_FAILED", error_title="Frame capture failed")
        self.fps_hint = self.cap.get(cv2.CAP_PROP_FPS) or 0.0
        self._latest: np.ndarray | None = frame
        self._seq = 1
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self.ended = False
        self.error: str | None = None
        self._thread = threading.Thread(target=self._run, name="capture", daemon=True)
        self._thread.start()

    def _run(self) -> None:
        failures = 0
        frame_period = 1.0 / self.fps_hint if self.is_video and self.fps_hint > 0 else 0.0
        while not self._stop.is_set():
            t0 = time.perf_counter()
            ok, frame = self.cap.read()
            if not ok or frame is None:
                if self.is_video:
                    if self.loop_video:
                        self.cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                        continue
                    self.ended = True
                    break
                failures += 1
                if failures >= self.max_failures:
                    self.error = f"{self.description}: {failures} consecutive frame grabs failed (disconnected?)"
                    log.error(self.error)
                    self.ended = True
                    break
                time.sleep(0.05)
                continue
            failures = 0
            with self._lock:
                self._latest = frame  # overwrite: consumers always get the newest frame
                self._seq += 1
            if frame_period:  # play video files at their native rate
                time.sleep(max(0.0, frame_period - (time.perf_counter() - t0)))

    def read_latest(self) -> tuple[int, np.ndarray | None]:
        with self._lock:
            return self._seq, (None if self._latest is None else self._latest.copy())

    def release(self) -> None:
        self._stop.set()
        self._thread.join(timeout=2)
        self.cap.release()


# =========================================================================== session

class CameraSession:
    """Capture + inference loop running in background threads; safe to read from any thread."""

    def __init__(self, detector: Detector, source: FrameSource, cfg: AppConfig, log_detections: bool = True):
        self.detector = detector
        self.source = source
        self.cfg = cfg
        self.conf = detector.conf
        self.paused = False
        self.started_at = datetime.now().isoformat(timespec="seconds")
        self.frames_processed = 0
        self._latencies: deque[float] = deque(maxlen=30)
        self._frame_times: deque[float] = deque(maxlen=30)
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self.latest_raw: np.ndarray | None = None
        self.latest_annotated: np.ndarray | None = None
        self.latest_detections: list[Detection] = []
        self.error: str | None = None
        self.snapshot_dir = cfg.paths.resolve("snapshots_dir")
        self.snapshot_dir.mkdir(parents=True, exist_ok=True)
        self._csv_fh = None
        self._csv = None
        if log_detections:
            logs = cfg.paths.resolve("logs_dir")
            logs.mkdir(parents=True, exist_ok=True)
            self.csv_path = unique_path(logs / f"camera_detections_{timestamp()}.csv")
            self._csv_fh = open(self.csv_path, "w", newline="", encoding="utf-8")
            self._csv = csv.writer(self._csv_fh)
            self._csv.writerow(["time", "frame", "class_name", "confidence", "x1", "y1", "x2", "y2"])
        self._thread = threading.Thread(target=self._run, name="inference", daemon=True)

    def start(self) -> "CameraSession":
        self._thread.start()
        return self

    def _run(self) -> None:
        last_seq = 0
        try:
            while not self._stop.is_set():
                if self.paused:
                    time.sleep(0.05)
                    continue
                seq, frame = self.source.read_latest()
                if frame is None or seq == last_seq:
                    if self.source.ended:
                        break
                    time.sleep(0.002)
                    continue
                last_seq = seq
                dets, annotated, latency = self.detector.predict(frame, conf=self.conf)
                now = time.perf_counter()
                with self._lock:
                    self.latest_raw, self.latest_annotated, self.latest_detections = frame, annotated, dets
                    self._latencies.append(latency)
                    self._frame_times.append(now)
                    self.frames_processed += 1
                if self._csv and dets:
                    t = datetime.now().isoformat(timespec="milliseconds")
                    for d in dets:
                        self._csv.writerow([t, self.frames_processed, d.class_name, f"{d.confidence:.4f}",
                                            f"{d.x1:.1f}", f"{d.y1:.1f}", f"{d.x2:.1f}", f"{d.y2:.1f}"])
        except Exception as exc:  # surface errors to the caller instead of dying silently
            self.error = f"Inference loop failed: {exc}"
            log.exception(self.error)
        finally:
            if self.source.error and not self.error:
                self.error = self.source.error

    @property
    def running(self) -> bool:
        return self._thread.is_alive()

    def stats(self) -> dict:
        with self._lock:
            lat = sum(self._latencies) / len(self._latencies) if self._latencies else 0.0
            ft = list(self._frame_times)
            n_det = len(self.latest_detections)
        fps = (len(ft) - 1) / (ft[-1] - ft[0]) if len(ft) > 1 and ft[-1] > ft[0] else 0.0
        return {"source": self.source.description, "running": self.running, "paused": self.paused,
                "fps": round(fps, 1), "latency_ms": round(lat, 1), "frames_processed": self.frames_processed,
                "conf": round(self.conf, 2), "detections_in_last_frame": n_det, "started_at": self.started_at,
                "ended": self.source.ended, "error": self.error, "device": self.detector.device}

    def latest(self) -> tuple[np.ndarray | None, list[Detection]]:
        with self._lock:
            img = None if self.latest_annotated is None else self.latest_annotated.copy()
            return img, list(self.latest_detections)

    def overlay(self, img: np.ndarray) -> np.ndarray:
        s = self.stats()
        lines = [f"FPS {s['fps']:.1f}  |  latency {s['latency_ms']:.0f} ms  |  {s['device'].upper()}",
                 f"conf >= {s['conf']:.2f}  |  objects {s['detections_in_last_frame']}"
                 + ("  |  PAUSED" if s["paused"] else ""),
                 "q quit  s snapshot  +/- conf  p pause"]
        y = 22
        for text in lines:
            (tw, th), _ = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 1)
            cv2.rectangle(img, (6, y - th - 6), (14 + tw, y + 6), (0, 0, 0), -1)
            cv2.putText(img, text, (10, y), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1, cv2.LINE_AA)
            y += th + 14
        return img

    def snapshot(self) -> dict:
        with self._lock:
            raw = None if self.latest_raw is None else self.latest_raw.copy()
            ann = None if self.latest_annotated is None else self.latest_annotated.copy()
            dets = [d.to_dict() for d in self.latest_detections]
        if raw is None:
            raise CameraUnavailableError("No frame has been processed yet.", error_code="NO_FRAME_YET",
                                         error_title="No frame yet")
        stem = f"snap_{datetime.now().strftime('%Y%m%d_%H%M%S_%f')[:-3]}"
        raw_p = unique_path(self.snapshot_dir / f"{stem}_raw.jpg")
        ann_p = unique_path(self.snapshot_dir / f"{stem}_annotated.jpg")
        cv2.imwrite(str(raw_p), raw)
        cv2.imwrite(str(ann_p), ann)
        log.info("Snapshot saved: %s (%d detections)", ann_p.name, len(dets))
        return {"raw": relpath(raw_p), "annotated": relpath(ann_p), "detections": dets}

    def adjust_conf(self, delta: float) -> float:
        self.conf = float(min(0.95, max(0.05, round(self.conf + delta, 2))))
        return self.conf

    def stop(self) -> None:
        self._stop.set()
        if self._thread.is_alive():
            self._thread.join(timeout=5)
        self.source.release()
        if self._csv_fh:
            self._csv_fh.close()
            self._csv_fh = None


def open_session(cfg: AppConfig, model: str | None = None, camera: int | None = None, video: str | None = None,
                 conf: float | None = None, imgsz: int | None = None, device: str | None = None,
                 loop_video: bool = False, log_detections: bool = True) -> CameraSession:
    model_path = resolve_model_path(cfg, model)
    detector = Detector(model_path, device or cfg.device, conf if conf is not None else cfg.inference.conf,
                        cfg.inference.iou, imgsz or cfg.inference.imgsz, cfg.inference.max_det)
    detector.warmup()
    if video:
        source = FrameSource(video_path=resolve_path(video), loop_video=loop_video,
                             max_failures=cfg.camera.max_consecutive_failures)
    else:
        source = FrameSource(camera_index=cfg.camera.index if camera is None else camera, width=cfg.camera.width,
                             height=cfg.camera.height, max_failures=cfg.camera.max_consecutive_failures)
    return CameraSession(detector, source, cfg, log_detections).start()


# =========================================================================== CLI

def run_display_loop(session: CameraSession, window: str, display: bool, max_frames: int | None,
                     save_video: Path | None) -> None:
    writer = None
    last_shown = -1
    try:
        if display:
            cv2.namedWindow(window, cv2.WINDOW_NORMAL)
        while True:
            img, _ = session.latest()
            if img is not None and session.frames_processed != last_shown:
                last_shown = session.frames_processed
                img = session.overlay(img)
                if save_video is not None:
                    if writer is None:
                        h, w = img.shape[:2]
                        writer = cv2.VideoWriter(str(save_video), cv2.VideoWriter_fourcc(*"mp4v"), 15, (w, h))
                    writer.write(img)
                if display:
                    cv2.imshow(window, img)
            if display:
                key = cv2.waitKey(1) & 0xFF
                if key in (ord("q"), 27):
                    break
                if key == ord("s"):
                    try:
                        print("Snapshot:", session.snapshot()["annotated"])
                    except AppError as exc:
                        log.warning(exc.error_content)
                elif key in (ord("+"), ord("=")):
                    log.info("conf -> %.2f", session.adjust_conf(+0.05))
                elif key in (ord("-"), ord("_")):
                    log.info("conf -> %.2f", session.adjust_conf(-0.05))
                elif key == ord("p"):
                    session.paused = not session.paused
                # Window closed with the X button
                if cv2.getWindowProperty(window, cv2.WND_PROP_VISIBLE) < 1:
                    break
            else:
                time.sleep(0.01)
            if not session.running:
                break
            if max_frames and session.frames_processed >= max_frames:
                break
    finally:
        if writer is not None:
            writer.release()
        if display:
            cv2.destroyAllWindows()
            cv2.waitKey(1)


def main(argv: list[str] | None = None) -> int:
    cfg = load_config()
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    src = p.add_mutually_exclusive_group()
    src.add_argument("--camera", type=int, default=None, help=f"camera index (default {cfg.camera.index})")
    src.add_argument("--video", default=None, help="video file instead of a camera")
    p.add_argument("--model", default=None, help="checkpoint; default = latest trained model")
    p.add_argument("--conf", type=float, default=cfg.inference.conf)
    p.add_argument("--imgsz", type=int, default=cfg.inference.imgsz)
    p.add_argument("--device", default=cfg.device)
    p.add_argument("--loop", action="store_true", help="loop the video file")
    p.add_argument("--no-display", action="store_true", help="headless mode (no window)")
    p.add_argument("--max-frames", type=int, default=None, help="stop after N processed frames")
    p.add_argument("--save-video", action="store_true", help="record annotated output to outputs/predictions/")
    args = p.parse_args(argv)
    setup_logging("camera", cfg.paths.resolve("logs_dir"))

    session = None
    try:
        session = open_session(cfg, args.model, args.camera, args.video, args.conf, args.imgsz, args.device,
                               loop_video=args.loop)
        log.info("Running on %s. Press q to quit, s to save a snapshot.", session.source.description)
        save_video = None
        if args.save_video:
            d = cfg.paths.resolve("predictions_dir")
            d.mkdir(parents=True, exist_ok=True)
            save_video = unique_path(d / f"camera_{timestamp()}.mp4")
        run_display_loop(session, cfg.camera.window_name, not args.no_display, args.max_frames, save_video)
        stats = session.stats()
        if stats["error"]:
            log.error(stats["error"])
        log.info("Session finished: %d frames, avg FPS %.1f, avg latency %.1f ms (measured on this machine).",
                 stats["frames_processed"], stats["fps"], stats["latency_ms"])
        if save_video:
            log.info("Annotated video: %s", save_video)
        return 1 if stats["error"] else 0
    except AppError as exc:
        log.error("[%s] %s: %s", exc.error_code, exc.error_title, exc.error_content)
        return 2
    except KeyboardInterrupt:
        log.info("Interrupted.")
        return 130
    finally:
        if session is not None:
            session.stop()
            if getattr(session, "csv_path", None):
                log.info("Detection log: %s", session.csv_path)


if __name__ == "__main__":
    sys.exit(main())
