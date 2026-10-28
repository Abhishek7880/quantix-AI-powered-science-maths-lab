"""Pack the site into the Android app so it works with no internet.

    .venv\\Scripts\\python.exe tools\\build_app_bundle.py      # -> android/app/src/main/assets/site/ (+ index.json)

Every page, script, style, image and the read-only data the pages load (elements, formulas, sketches, presets...)
is fetched from the app itself (FastAPI TestClient, no server needed) exactly as the server sends it. The app serves
these files when the phone is offline (MainActivity.shouldInterceptRequest); online it always uses the live site.
Live-only features (photo AI, auto-measure, solver, PDFs, contact) are not packed: offline they get a
"turn on the internet" popup.
"""

from __future__ import annotations

import hashlib
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
OUT = ROOT / "android" / "app" / "src" / "main" / "assets" / "site"
WEB = ROOT / "src" / "web"

PAGES = ["/", "/formulas", "/converter", "/graph", "/elements", "/measure", "/physics", "/circuit", "/plc", "/chemlab",
         "/handwriting", "/contact"]
SKIP_WEB = {"app", "sw.js", "og-image.png", "contact_inbox.html"}           # the APK itself, the web-only service worker
DATA = ["/api/v1/elements", "/api/v1/formulas", "/api/v1/formulas?full=true&lang=en", "/api/v1/formulas?full=true&lang=hi",
        "/api/v1/formulas/calc/index", "/api/v1/measure/presets", "/api/v1/social", "/api/v1/system/info",
        "/api/v1/models", "/favicon.ico"]


def sketches(obj, out: set) -> set:
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k == "sketch" and isinstance(v, str) and v:
                out.add(v)
            else:
                sketches(v, out)
    elif isinstance(obj, list):
        for v in obj:
            sketches(v, out)
    return out


def main() -> None:
    from fastapi.testclient import TestClient
    from src import api
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)
    index, total = {}, 0

    def put(key: str, body: bytes, mime: str) -> None:
        nonlocal total
        name = hashlib.sha1(key.encode()).hexdigest()[:16] + Path(key.split("?")[0]).suffix
        (OUT / name).write_bytes(body)
        index[key] = [name, mime.split(";")[0].strip()]
        total += len(body)

    with TestClient(api.app) as c:
        def get(key: str) -> None:
            r = c.get(key)
            if r.status_code != 200:
                raise SystemExit(f"{key}: HTTP {r.status_code}")
            put(key, r.content, r.headers.get("content-type", "application/octet-stream"))

        for p in PAGES + DATA:
            get(p)
        for f in sorted(WEB.rglob("*")):
            rel = f.relative_to(WEB).as_posix()
            if f.is_file() and rel.split("/")[0] not in SKIP_WEB:
                get("/web/" + rel)
        for s in sorted(sketches(c.get("/api/v1/formulas?full=true&lang=en").json(), set())):
            get(f"/api/v1/formulas/sketch/{s}.svg")
    (OUT / "index.json").write_text(json.dumps(index, separators=(",", ":")), encoding="utf-8")
    print(f"{len(index)} files, {total / 1e6:.1f} MB -> {OUT}")


if __name__ == "__main__":
    main()
