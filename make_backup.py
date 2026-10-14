"""Zip backup of this project (everything except the virtual env and caches).

    .venv\\Scripts\\python.exe make_backup.py                 # -> D:\\Abhishek\\Backups\\industrial-ai-vision\\industrial-ai-vision_<date>_<time>.zip
    .venv\\Scripts\\python.exe make_backup.py --dest E:\\USB   # another folder

The zip holds the folder `industrial-ai-vision/` with models, datasets, samples, outputs and all code.
Restore steps: WORKSPACE.md §6.
"""

from __future__ import annotations

import argparse
import os
import zipfile
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SKIP_DIRS = {".venv", "__pycache__", ".pytest_cache", ".git", "secrets"}   # secrets: email password
DEFAULT_DEST = Path(r"D:\Abhishek\Backups\industrial-ai-vision")


def make_backup(dest: Path) -> tuple[Path, int, int]:
    dest.mkdir(parents=True, exist_ok=True)
    out = dest / f"{ROOT.name}_{datetime.now():%Y-%m-%d_%H%M}.zip"
    files = size = 0
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for folder, dirs, names in os.walk(ROOT):
            dirs[:] = sorted(d for d in dirs if d not in SKIP_DIRS)
            for name in sorted(names):
                path = Path(folder) / name
                if path == out:
                    continue
                z.write(path, Path(ROOT.name) / path.relative_to(ROOT))
                files += 1
                size += path.stat().st_size
    with zipfile.ZipFile(out) as z:                      # verify every member's CRC
        bad = z.testzip()
        if bad:
            raise SystemExit(f"Backup is corrupt: {bad}")
    return out, files, size


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dest", type=Path, default=DEFAULT_DEST, help=f"folder for the zip (default {DEFAULT_DEST})")
    a = ap.parse_args()
    out, n, size = make_backup(a.dest)
    print(f"Backup written: {out}")
    print(f"{n} files, {size / 1e6:.1f} MB before compression, {out.stat().st_size / 1e6:.1f} MB zipped, verified OK")
