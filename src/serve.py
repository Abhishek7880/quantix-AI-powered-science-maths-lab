"""Run the API server and restart it automatically when code in src/ changes.

  python -m src.serve --port 8000

Used by start_ui.bat. Unlike uvicorn's own --reload (which signals its worker with Ctrl+C and can hang on
Windows when the server has no console window), this supervisor stops the old server process tree directly
and starts a fresh one, so updated code is always picked up. A running training (python -m src.train) is never
stopped by a reload. The server is also restarted if it crashes.
"""

from __future__ import annotations

import argparse
import subprocess
import sys
import time
from pathlib import Path

import psutil

ROOT = Path(__file__).resolve().parent.parent


def _is_training(p: psutil.Process) -> bool:
    try:
        return "src.train" in " ".join(p.cmdline())
    except (psutil.NoSuchProcess, psutil.AccessDenied):
        return False


def start_server(host: str, port: int) -> subprocess.Popen:
    return subprocess.Popen([sys.executable, "-m", "src.api", "--host", host, "--port", str(port)], cwd=str(ROOT))


def stop_server(proc: subprocess.Popen) -> None:
    """Kill the server and its helper processes (venv launcher -> python), but never a training run."""
    try:
        root = psutil.Process(proc.pid)
    except psutil.NoSuchProcess:
        return
    victims = [c for c in root.children(recursive=True) if not _is_training(c)] + [root]
    for p in victims:
        try:
            p.kill()
        except psutil.NoSuchProcess:
            pass
    psutil.wait_procs(victims, timeout=5)


def wait_for_port_free(port: int, timeout: float = 10) -> None:
    t0 = time.time()
    while time.time() - t0 < timeout:
        if not any(c.laddr and c.laddr.port == port and c.status == psutil.CONN_LISTEN
                   for c in psutil.net_connections(kind="tcp")):
            return
        time.sleep(0.2)


def main() -> int:
    from watchfiles import watch

    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8000)
    a = ap.parse_args()

    proc = start_server(a.host, a.port)
    print(f"[serve] server started (PID {proc.pid}) - watching src/ for changes", flush=True)
    crashes = 0
    try:
        for changes in watch(ROOT / "src", watch_filter=lambda _c, path: path.endswith(".py"),
                             rust_timeout=2000, yield_on_timeout=True, debounce=800):
            if changes:
                names = sorted({Path(p).name for _, p in changes})
                print(f"[serve] change in {', '.join(names)} - restarting", flush=True)
                stop_server(proc)
                wait_for_port_free(a.port)
                proc = start_server(a.host, a.port)
                crashes = 0
            elif proc.poll() is not None:               # crashed / exited on its own
                crashes += 1
                delay = min(30, 2 ** crashes)
                print(f"[serve] server exited (code {proc.returncode}); restarting in {delay}s", flush=True)
                time.sleep(delay)
                wait_for_port_free(a.port)
                proc = start_server(a.host, a.port)
    except KeyboardInterrupt:
        print("[serve] stopping", flush=True)
    finally:
        stop_server(proc)
    return 0


if __name__ == "__main__":
    sys.exit(main())
