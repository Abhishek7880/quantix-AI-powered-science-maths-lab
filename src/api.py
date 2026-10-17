"""REST API for Quantix (FastAPI) — AI-powered science & maths lab, built on the Industrial AI Vision toolkit.

Run:
  python -m src.api                      # http://127.0.0.1:8000  (docs at /docs)
  uvicorn src.api:app --host 127.0.0.1 --port 8000

Every JSON response uses one envelope.

Success:
  {"code": 200, "success": true, "message": "Prediction completed", "data": {...}}

Error:
  {"code": 404, "success": false, "message": "No usable model checkpoint was found.",
   "error": {"errorCode": "MODEL_NOT_FOUND", "errorTitle": "Model not found",
             "errorContent": "No trained model found. ..."}}

Binary endpoints (/camera/stream, /camera/frame, /files) return image bytes on success
and the same JSON error envelope on failure.

Security: the server binds to 127.0.0.1 by default and has no authentication. Do not expose
it on a network without adding authentication and TLS in front of it. For a public deployment set
IAV_PUBLIC=1 (public mode): owner-only routes (training, datasets, camera, evaluation, server files,
history, config, model export) answer 403, and the heavy AI routes are rate-limited per visitor.
"""

from __future__ import annotations

import base64
import json
import logging
import os
import re
import subprocess
import sys
import threading
import time
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import Any, Literal

import cv2
import numpy as np
from fastapi import FastAPI, File, Form, Query, Request, UploadFile
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from starlette.exceptions import HTTPException as StarletteHTTPException

from src import __version__
from src.config import IMAGE_EXTENSIONS, PROJECT_ROOT, load_config, resolve_path
from src.dataset_utils import make_samples, make_synthetic_dataset, split_dataset, validate_dataset, write_data_yaml
from src.errors import (AppError, CameraUnavailableError, ConflictError, DatasetError, InputValidationError,
                        ResourceNotFoundError, TrainingLockError)
from src.inference import Detector
from src.utils import (environment_report, list_model_files, load_registry, read_train_lock, relpath,
                       resolve_device, resolve_model_path, setup_logging, timestamp, unique_dir,
                       unique_path, write_json)

cfg = load_config()
log = setup_logging("api", cfg.paths.resolve("logs_dir"))
MAX_UPLOAD_MB = 25
API_PREFIX = "/api/v1"

@asynccontextmanager
async def lifespan(_: FastAPI):
    yield
    s = _camera.get("session")
    if s is not None:  # always release the camera on shutdown
        s.stop()


app = FastAPI(title="Quantix API", version=__version__, lifespan=lifespan,
              description="Train YOLO detectors and run image / live camera inference. "
                          "All JSON responses use the {code, success, message, data | error} envelope.")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:8501", "http://127.0.0.1:8501"],
                   allow_methods=["*"], allow_headers=["*"])

PAGE_PATHS = {"/", "/formulas", "/converter", "/graph", "/elements", "/measure", "/physics", "/handwriting", "/contact", "/contact/inbox"}


@app.middleware("http")
async def revalidate_pages(request: Request, call_next):
    """Pages and their CSS / JS must never be served stale from the browser cache after an edit:
    'no-cache' makes the browser re-check every time (a cheap 304 via ETag when nothing changed)."""
    response = await call_next(request)
    path = request.url.path
    if path in PAGE_PATHS or (path.startswith("/web/") and not path.startswith("/web/vendor/")):
        response.headers["Cache-Control"] = "no-cache"
    return response


# public mode (IAV_PUBLIC=1, set by the Dockerfile): visitors get the student tools only
PUBLIC_MODE = os.environ.get("IAV_PUBLIC", "").strip().lower() in ("1", "true", "yes", "on")
_OWNER_ONLY = ("/dataset", "/training", "/evaluation", "/camera", "/history", "/files", "/config", "/models/export",
               "/predict/path")
_HEAVY = ("/predict/image", "/measure/references", "/measure/shapes", "/handwriting/recognize", "/handwriting/solve",
          "/formulas/calc/solve", "/formulas/pdf")
HEAVY_LIMIT, HEAVY_WINDOW_S = 40, 60                 # per visitor: 40 heavy requests a minute
_heavy_hits: dict[str, list[float]] = {}
_heavy_lock = threading.Lock()


def _heavy_allowed(ip: str) -> bool:
    now = time.monotonic()
    with _heavy_lock:
        if len(_heavy_hits) > 5000:                  # forget idle visitors so memory stays small
            for k in [k for k, v in _heavy_hits.items() if not v or now - v[-1] > HEAVY_WINDOW_S]:
                del _heavy_hits[k]
        hits = [t for t in _heavy_hits.get(ip, []) if now - t < HEAVY_WINDOW_S]
        if len(hits) >= HEAVY_LIMIT:
            _heavy_hits[ip] = hits
            return False
        hits.append(now)
        _heavy_hits[ip] = hits
        return True


@app.middleware("http")
async def public_guard(request: Request, call_next):
    if PUBLIC_MODE and request.url.path.startswith(API_PREFIX):
        route = request.url.path[len(API_PREFIX):]
        if route.startswith(_OWNER_ONLY):
            return fail(403, "NOT_AVAILABLE_ONLINE", "Not available on the public site",
                        "Training, datasets, camera, evaluation and server files only work on the owner's own computer.")
        if route.startswith(_HEAVY) and not _heavy_allowed(request.client.host if request.client else "?"):
            return fail(429, "TOO_MANY_REQUESTS", "Too many requests",
                        f"Please wait a minute — at most {HEAVY_LIMIT} image / solver requests per minute.")
    return await call_next(request)


# =========================================================================== envelope

def ok(data: Any = None, message: str = "OK", code: int = 200) -> JSONResponse:
    return JSONResponse(status_code=code, content={"code": code, "success": True, "message": message,
                                                   "data": jsonable_encoder(data)})


def fail(code: int, error_code: str, title: str, content: str, message: str | None = None) -> JSONResponse:
    return JSONResponse(status_code=code, content={
        "code": code, "success": False, "message": message or title,
        "error": {"errorCode": error_code, "errorTitle": title, "errorContent": content}})


@app.exception_handler(AppError)
async def _app_error(_: Request, exc: AppError):
    level = logging.ERROR if exc.status_code >= 500 else logging.WARNING
    log.log(level, "[%s] %s", exc.error_code, exc.error_content)
    resp = fail(exc.status_code, exc.error_code, exc.error_title, exc.error_content, exc.message)
    if getattr(exc, "details", None):
        body = json.loads(resp.body)
        body["data"] = jsonable_encoder(exc.details)
        resp = JSONResponse(status_code=exc.status_code, content=body)
    return resp


@app.exception_handler(RequestValidationError)
async def _validation_error(_: Request, exc: RequestValidationError):
    details = "; ".join(f"{'.'.join(str(p) for p in e.get('loc', []) if p != 'body')}: {e.get('msg')}"
                        for e in exc.errors())
    return fail(422, "VALIDATION_ERROR", "Request validation failed", details,
                "One or more request fields are missing or invalid.")


@app.exception_handler(StarletteHTTPException)
async def _http_error(_: Request, exc: StarletteHTTPException):
    mapping = {404: ("ROUTE_NOT_FOUND", "Route not found"), 405: ("METHOD_NOT_ALLOWED", "Method not allowed")}
    ec, title = mapping.get(exc.status_code, (f"HTTP_{exc.status_code}", "HTTP error"))
    return fail(exc.status_code, ec, title, str(exc.detail))


@app.exception_handler(Exception)
async def _unhandled(_: Request, exc: Exception):
    log.exception("Unhandled error")
    return fail(500, "INTERNAL_ERROR", "Internal server error",
                f"{type(exc).__name__}: {exc}. See outputs/logs for the full traceback.",
                "The request could not be completed.")


# =========================================================================== helpers

_detector_cache: dict[tuple, Detector] = {}
_detector_lock = threading.Lock()


def get_detector(model: str | None, conf: float, imgsz: int, device: str | None = None) -> Detector:
    path = resolve_model_path(cfg, model)
    key = (str(path), device or cfg.device, imgsz)
    with _detector_lock:
        det = _detector_cache.get(key)
        if det is None:
            det = Detector(path, device or cfg.device, conf, cfg.inference.iou, imgsz, cfg.inference.max_det)
            det.warmup()  # keep one-off setup out of the first request's reported latency
            _detector_cache.clear()  # keep one model in memory
            _detector_cache[key] = det
    det.conf = conf
    return det


KNOWLEDGE_DIR = Path(__file__).resolve().parent / "knowledge"


def load_class_knowledge() -> dict[str, dict]:
    """Class-name -> info (e.g. mensuration formulas) from src/knowledge/*.json."""
    kb: dict[str, dict] = {}
    for f in sorted(KNOWLEDGE_DIR.glob("*.json")):
        if f.name.startswith("elements"):          # periodic-table data (src/chemistry.py), not detector classes
            continue
        try:
            kb.update(json.loads(f.read_text(encoding="utf-8")))
        except (json.JSONDecodeError, OSError) as exc:
            log.warning("Ignoring knowledge file %s: %s", f.name, exc)
    return kb


CLASS_KNOWLEDGE = load_class_knowledge()


def _encode_jpeg_b64(img: np.ndarray) -> str:
    okk, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 88])
    return base64.b64encode(buf.tobytes()).decode("ascii") if okk else ""


def _safe_output_path(rel: str) -> Path:
    """Only files under outputs/, samples/ or models/ may be served."""
    p = resolve_path(rel)
    allowed = [cfg.paths.resolve(k) for k in ("outputs_dir", "samples_dir", "models_dir")]
    if not any(p == a or a in p.parents for a in allowed):
        raise InputValidationError("Only files under outputs/, samples/ or models/ can be downloaded.",
                                   error_code="PATH_NOT_ALLOWED", error_title="Path not allowed")
    if not p.is_file():
        raise ResourceNotFoundError(f"File not found: {rel}", error_code="FILE_NOT_FOUND", error_title="File not found")
    return p


# =========================================================================== system

WEB_DIR = Path(__file__).resolve().parent / "web"


@app.get("/", include_in_schema=False)
def upload_page():
    """Image upload UI (static page that calls this API)."""
    page = WEB_DIR / "index.html"
    if not page.exists():
        raise ResourceNotFoundError("Upload page not found (src/web/index.html).", error_code="PAGE_NOT_FOUND",
                                    error_title="Page not found")
    return FileResponse(page, media_type="text/html")


# ---- site files browsers and search engines ask for at the root
SITEMAP_PAGES = ["/", "/formulas", "/elements", "/physics", "/handwriting", "/measure", "/converter", "/graph", "/contact"]


@app.get("/favicon.ico", include_in_schema=False)
def favicon():
    return FileResponse(WEB_DIR / "favicon.ico", media_type="image/x-icon", headers={"Cache-Control": "public, max-age=604800"})


def _site_url(request: Request) -> str:
    try:
        url = load_config().site.public_url.strip()
    except (OSError, ValueError):
        url = ""
    return (url or str(request.base_url)).rstrip("/")


@app.get("/robots.txt", include_in_schema=False)
def robots_txt(request: Request):
    body = (f"User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /contact/inbox\nDisallow: /docs\n\n"
            f"Sitemap: {_site_url(request)}/sitemap.xml\n")
    return Response(body, media_type="text/plain")


SEO_DIR = PROJECT_ROOT / "build" / "seo"           # Learn pages from tools/build_seo_pages.py (Caddy serves them online)


@app.get("/sitemap.xml", include_in_schema=False)
def sitemap_xml(request: Request):
    if (SEO_DIR / "sitemap.xml").is_file():          # the full sitemap, including every Learn page
        return FileResponse(SEO_DIR / "sitemap.xml", media_type="application/xml")
    base = _site_url(request)
    urls = "".join(f"  <url><loc>{base}{p}</loc></url>\n" for p in SITEMAP_PAGES)
    return Response(f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{urls}</urlset>\n',
                    media_type="application/xml")


@app.get("/{name}.txt", include_in_schema=False)
def indexnow_key_file(name: str):
    """IndexNow ownership check: /<key>.txt answers with the key from config.yaml site.indexnow_key."""
    try:
        key = load_config().site.indexnow_key.strip()
    except (OSError, ValueError):
        key = ""
    if not key or name != key or not re.fullmatch(r"[A-Za-z0-9-]{8,128}", key):
        raise StarletteHTTPException(status_code=404, detail="Not Found")
    return Response(key, media_type="text/plain")


@app.get("/{name}.html", include_in_schema=False)
def google_verification_file(name: str):
    """Google Search Console ownership check: serves exactly the file named in config.yaml site.google_verification."""
    try:
        wanted = load_config().site.google_verification.strip()
    except (OSError, ValueError):
        wanted = ""
    if not wanted or f"{name}.html" != wanted or not re.fullmatch(r"google[0-9a-f]{8,32}\.html", wanted):
        raise StarletteHTTPException(status_code=404, detail="Not Found")
    return Response(f"google-site-verification: {wanted}", media_type="text/html")


@app.get("/graph", include_in_schema=False)
def graph_page():
    """Graph plotter (Cartesian plane, trigonometry, 3D planes/surfaces) - static page."""
    page = WEB_DIR / "graph.html"
    if not page.exists():
        raise ResourceNotFoundError("Graph page not found (src/web/graph.html).", error_code="PAGE_NOT_FOUND",
                                    error_title="Page not found")
    return FileResponse(page, media_type="text/html")


@app.get("/converter", include_in_schema=False)
def converter_page():
    """Unit converter (pure client-side; unit data in src/web/units.js)."""
    page = WEB_DIR / "converter.html"
    if not page.is_file():
        raise ResourceNotFoundError("Converter page not found (src/web/converter.html).", error_code="PAGE_NOT_FOUND",
                                    error_title="Page not found")
    return FileResponse(page, media_type="text/html")


@app.get("/measure", include_in_schema=False)
def measure_page():
    """Measure real objects in a photo."""
    page = WEB_DIR / "measure.html"
    if not page.is_file():
        raise ResourceNotFoundError("Measure page not found (src/web/measure.html).", error_code="PAGE_NOT_FOUND",
                                    error_title="Page not found")
    return FileResponse(page, media_type="text/html")


async def _read_upload_image(file: UploadFile) -> np.ndarray:
    name = Path(file.filename or "upload.jpg").name
    if Path(name).suffix.lower() not in IMAGE_EXTENSIONS:
        raise InputValidationError(f"Unsupported file type '{Path(name).suffix}'. Upload JPG, JPEG or PNG.",
                                   error_code="UNSUPPORTED_IMAGE_TYPE", error_title="Unsupported image type")
    raw = await file.read()
    if not raw:
        raise InputValidationError("Uploaded file is empty.", error_code="EMPTY_FILE", error_title="Empty file")
    if len(raw) > MAX_UPLOAD_MB * 1024 * 1024:
        raise InputValidationError(f"File exceeds {MAX_UPLOAD_MB} MB.", status_code=413,
                                   error_code="FILE_TOO_LARGE", error_title="File too large")
    img = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        raise InputValidationError("The uploaded file is not a readable image.", error_code="INVALID_IMAGE",
                                   error_title="Invalid image")
    return img


@app.get(f"{API_PREFIX}/measure/presets", tags=["measure"])
def measure_presets():
    from src import measure
    return ok(measure.REFERENCES, f"{len(measure.REFERENCES)} reference presets")


@app.post(f"{API_PREFIX}/measure/references", tags=["measure"])
async def measure_references(file: UploadFile = File(...)):
    """Find candidate reference objects (coins, cards, A4 sheets) in a photo."""
    from src import measure
    img = await _read_upload_image(file)
    found = measure.find_references(img)
    return ok(found, f"{len(found['circles'])} circle(s), {len(found['rects'])} rectangle(s) found")


@app.post(f"{API_PREFIX}/measure/shapes", tags=["measure"])
async def measure_shapes(file: UploadFile = File(...), mm_per_px: float = Form(..., gt=0),
                         depth_mm: float | None = Form(None, gt=0), model: str | None = Form(None),
                         conf: float = Form(cfg.inference.conf, ge=0, le=1),
                         imgsz: int = Form(cfg.inference.imgsz, ge=32, le=4096)):
    """Detect shapes and measure them in real units using the scale (mm per pixel) of this exact image."""
    from src import everyday, measure
    img = await _read_upload_image(file)
    if model in (None, "", "auto"):                  # default: drawn shapes AND real everyday objects
        r = everyday.detect_auto(img, _auto_model)
        dets, latency, model_name = r["detections"], r["latency_ms"], "auto"
        shapes = measure.measure_detections(dets, mm_per_px, CLASS_KNOWLEDGE, depth_mm)
        for sh, info in zip(shapes, r["infos"]):
            if info:                                 # "mug → Cylinder", plus how much it holds
                sh.update(object=info["object"], object_hi=info["object_hi"], shape_note=info["note"],
                          name=f"{info['object']} → {sh['name']}")
                vol = next((x["value_mm"] for x in sh["results"] if x.get("power") == 3), None)
                if vol and info["shape"] in ("cylinder", "hemisphere", "sphere", "cone", "cuboid", "cube"):
                    sh["capacity_ml"] = round(vol / 1000, 1)          # 1 ml = 1000 mm³ (outside size, so a bit more than it holds)
    else:
        det = get_detector(model, conf, imgsz)
        dets, _, latency = det.predict(img, conf=conf, annotate=False)
        shapes, model_name = measure.measure_detections(dets, mm_per_px, CLASS_KNOWLEDGE, depth_mm), str(det.model_path)
    return ok({"width": img.shape[1], "height": img.shape[0], "mm_per_px": mm_per_px, "model": model_name,
               "latency_ms": round(latency, 1), "shapes": shapes,
               "note": "Real sizes assume the camera faces the object squarely and the reference is at the same distance."},
              f"{len(shapes)} shape(s) measured")


@app.get("/contact", include_in_schema=False)
def contact_page():
    page = WEB_DIR / "contact.html"
    if not page.is_file():
        raise ResourceNotFoundError("Contact page not found (src/web/contact.html).", error_code="PAGE_NOT_FOUND",
                                    error_title="Page not found")
    return FileResponse(page, media_type="text/html")


@app.get("/contact/inbox", include_in_schema=False)
def contact_inbox_page():
    page = WEB_DIR / "contact_inbox.html"
    if not page.is_file():
        raise ResourceNotFoundError("Inbox page not found (src/web/contact_inbox.html).", error_code="PAGE_NOT_FOUND",
                                    error_title="Page not found")
    return FileResponse(page, media_type="text/html")


class ContactRequest(BaseModel):
    name: str = Field("", max_length=200)
    email: str = Field("", max_length=300)
    phone: str | None = Field(None, max_length=40)
    topic: str = Field("general", max_length=20)
    subject: str | None = Field(None, max_length=200)
    message: str = Field("", max_length=5000)
    lang: str = Field("en", max_length=5)
    page: str | None = Field(None, max_length=200)
    website: str | None = Field(None, max_length=300, description="leave empty (spam trap)")


class ContactUpdate(BaseModel):
    status: str | None = None
    note: str | None = Field(None, max_length=2000)


def _admin(request: Request) -> None:
    from src import contact
    contact.check_admin(request.headers.get("x-admin-key"))


@app.post(f"{API_PREFIX}/contact", tags=["contact"])
def contact_submit(req: ContactRequest, request: Request):
    from src import contact
    r = contact.submit(req.model_dump(), request.client.host if request.client else None)
    return ok(r, f"Message received — ticket {r['ticket']}", code=201)


@app.get(f"{API_PREFIX}/contact/messages", tags=["contact"])
def contact_messages(request: Request, status: str | None = None, q: str | None = Query(None, max_length=80)):
    from src import contact
    _admin(request)
    r = contact.list_messages(status, q)
    return ok(r, f"{len(r['messages'])} message(s)")


@app.patch(f"{API_PREFIX}/contact/messages/{{msg_id}}", tags=["contact"])
def contact_update(msg_id: int, req: ContactUpdate, request: Request):
    from src import contact
    _admin(request)
    return ok(contact.update(msg_id, req.status, req.note), "Message updated")


@app.delete(f"{API_PREFIX}/contact/messages/{{msg_id}}", tags=["contact"])
def contact_delete(msg_id: int, request: Request):
    from src import contact
    _admin(request)
    contact.delete(msg_id)
    return ok({"id": msg_id}, "Message deleted")


@app.get(f"{API_PREFIX}/social", tags=["contact"])
def social_links():
    """Public social-media links for the footer and Contact page (config.yaml → social:). config.yaml is
    re-read on every call, so edited links show after a browser refresh without restarting the server."""
    from src import social
    try:
        c = load_config()
    except (OSError, ValueError) as exc:          # a broken config.yaml must not break every page footer
        log.warning("config.yaml unreadable, using startup social links: %s", exc)
        c = cfg
    return ok({"links": social.links(c.social), "author": social.author(c.author)}, "Social links")


@app.get(f"{API_PREFIX}/contact/email-status", tags=["contact"])
def contact_email_status(request: Request):
    from src import mailer
    _admin(request)
    st = mailer.status()
    return ok(st, "Email alerts are on" if st["enabled"] else "Email alerts are not set up yet")


@app.post(f"{API_PREFIX}/contact/test-email", tags=["contact"])
def contact_test_email(request: Request):
    from src import mailer
    _admin(request)
    r = mailer.send_test()
    return ok(r, f"Test email sent to {r['to']}")


@app.get(f"{API_PREFIX}/contact/export.csv", tags=["contact"])
def contact_export(request: Request):
    from src import contact
    _admin(request)
    return Response(contact.to_csv(), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": 'attachment; filename="contact_messages.csv"', "Cache-Control": "no-store"})


@app.get("/handwriting", include_in_schema=False)
def handwriting_page():
    """Handwritten equation → solved / plotted."""
    page = WEB_DIR / "handwriting.html"
    if not page.is_file():
        raise ResourceNotFoundError("Handwriting page not found (src/web/handwriting.html).", error_code="PAGE_NOT_FOUND",
                                    error_title="Page not found")
    return FileResponse(page, media_type="text/html")


class HandwritingSolveRequest(BaseModel):
    text: str = Field(..., max_length=200, description="equation or expression, e.g. 2x+3=7 or y=x^2-4x+3")
    lang: str = Field("en", description="en | hi")


class HandwritingRelayoutRequest(BaseModel):
    symbols: list[dict] = Field(..., max_length=120, description="[{box: [x1,y1,x2,y2], cls}] from /recognize, corrected")
    line_height: float = Field(..., gt=0)


@app.get(f"{API_PREFIX}/handwriting/model", tags=["handwriting"])
def handwriting_model():
    from src import handwriting
    info = handwriting.model_info()
    return ok(info, "Handwriting model ready" if info.get("trained") else "Handwriting model not trained yet")


@app.post(f"{API_PREFIX}/handwriting/recognize", tags=["handwriting"])
async def handwriting_recognize(file: UploadFile = File(...)):
    from src import handwriting
    img = await _read_upload_image(file)
    r = handwriting.recognize(img)
    return ok(r, f"Read: {r['pretty']}")


@app.post(f"{API_PREFIX}/handwriting/relayout", tags=["handwriting"])
def handwriting_relayout(req: HandwritingRelayoutRequest):
    from src import handwriting
    r = handwriting.relayout(req.symbols, req.line_height)
    return ok(r, r["pretty"])


@app.post(f"{API_PREFIX}/handwriting/solve", tags=["handwriting"])
def handwriting_solve(req: HandwritingSolveRequest):
    from src import handwriting
    r = handwriting.solve_text(req.text, req.lang)
    return ok(r, f"{r['kind']}")


@app.get("/physics", include_in_schema=False)
def physics_page():
    """Physics Lab: interactive simulations (client-side, src/web/physics.js)."""
    page = WEB_DIR / "physics.html"
    if not page.is_file():
        raise ResourceNotFoundError("Physics page not found (src/web/physics.html).", error_code="PAGE_NOT_FOUND",
                                    error_title="Page not found")
    return FileResponse(page, media_type="text/html")


@app.get("/elements", include_in_schema=False)
def elements_page():
    """Interactive periodic table."""
    page = WEB_DIR / "elements.html"
    if not page.is_file():
        raise ResourceNotFoundError("Periodic table page not found (src/web/elements.html).", error_code="PAGE_NOT_FOUND",
                                    error_title="Page not found")
    return FileResponse(page, media_type="text/html")


@app.get(f"{API_PREFIX}/elements", tags=["chemistry"])
def elements_list():
    from src import chemistry
    return ok({"categories": chemistry.categories(), "elements": chemistry.elements()}, "118 elements")


@app.get(f"{API_PREFIX}/elements/{{key}}", tags=["chemistry"])
def element_get(key: str):
    from src import chemistry
    e = chemistry.get_element(key)
    return ok(e, f"{e['z']} {e['sym']} — {e['name']}")


@app.get(f"{API_PREFIX}/chemistry/molar-mass", tags=["chemistry"])
def chemistry_molar_mass(formula: str = Query(..., max_length=120, description="e.g. H2SO4, Ca(OH)2, CuSO4·5H2O")):
    from src import chemistry
    r = chemistry.molar_mass(formula)
    return ok(r, f"M({r['formula']}) = {r['molar_mass']} g/mol")


@app.get("/formulas", include_in_schema=False)
def formulas_page():
    """Formula library (maths, mensuration with sketches, physics) - static page."""
    page = WEB_DIR / "formulas.html"
    if not page.exists():
        raise ResourceNotFoundError("Formula page not found (src/web/formulas.html).", error_code="PAGE_NOT_FOUND",
                                    error_title="Page not found")
    return FileResponse(page, media_type="text/html")


@app.get(f"{API_PREFIX}/formulas", tags=["formulas"])
def formulas_list(full: bool = Query(False, description="include every section and formula"),
                  lang: str = Query("en", description="language: en | hi")):
    from src import formulas
    if full:
        data = list(formulas.load_library(formulas.check_lang(lang)))
        return ok(data, f"{sum(len(s['items']) for c in data for s in c['sections'])} formulas in {len(data)} categories")
    data = formulas.summary(formulas.check_lang(lang))
    return ok(data, f"{sum(c['formulas'] for c in data)} formulas in {len(data)} categories")


@app.get(f"{API_PREFIX}/formulas/sketch/{{shape}}.svg", tags=["formulas"])
def formulas_sketch(shape: str):
    from src.sketches import DRAW, render_sketch
    if shape not in DRAW:
        raise ResourceNotFoundError(f"No sketch for '{shape}'.", error_code="SKETCH_NOT_FOUND", error_title="Sketch not found")
    return Response(render_sketch(shape, "svg"), media_type="image/svg+xml",
                    headers={"Cache-Control": "public, max-age=86400"})


@app.get(f"{API_PREFIX}/formulas/pdf", tags=["formulas"])
def formulas_pdf(category: str = Query("all", description="category id, or 'all'"),
                 section: str | None = Query(None, description="one section id / title (e.g. a shape)"),
                 lang: str = Query("en", description="language: en | hi")):
    from src import formulas
    data, name = formulas.build_pdf(category, section, lang)
    return Response(data, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{name}"'})


# ---------------------------------------------------------------- formula calculator
class CalcRef(BaseModel):
    """Either a library formula (category + section + index) or any typed formula (formula)."""
    formula: str | None = Field(None, max_length=200, description="custom formula, e.g. 'v = u + at'")
    category: str | None = Field(None, description="library category id")
    section: str | None = Field(None, description="library section id")
    index: int | None = Field(None, ge=0, description="item index inside the section")
    lang: str = Field("en", description="en | hi")


class CalcSolveRequest(CalcRef):
    solve_for: str = Field(..., description="variable to solve for (symbol name from /describe)")
    values: dict[str, float] = Field(default_factory=dict, description="known values, by symbol name")
    equation: int = Field(0, ge=0, description="which equation when the formula holds several")
    angle_unit: Literal["rad", "deg"] = "deg"


def _calc_target(req: CalcRef) -> tuple[str, str | None, dict | None, str | None]:
    """-> (formula text, category, section variables (translated), unit of the left-hand side)."""
    from src import formula_calc, formulas
    lang = formulas.check_lang(req.lang)
    if req.category and req.section is not None and req.index is not None:
        _, sec, item = formula_calc.library_item(req.category, req.section, req.index)
        hi_sec = next(s for s in formulas.get_category(req.category, lang)["sections"] if s["id"] == req.section)
        return item[1], req.category, hi_sec.get("variables"), formula_calc.item_unit(item[2] if len(item) > 2 else "")
    if req.formula and req.formula.strip():
        return req.formula, req.category, None, None
    raise InputValidationError("Send either 'formula' or 'category' + 'section' + 'index'.",
                               error_code="FORMULA_REQUIRED", error_title="Formula required")


@app.get(f"{API_PREFIX}/formulas/calc/index", tags=["formula calculator"])
def calc_index():
    from src import formula_calc
    idx = formula_calc.calculable_index()
    return ok(idx, f"{sum(len(v) for c in idx.values() for v in c.values())} formulas can be calculated")


@app.post(f"{API_PREFIX}/formulas/calc/describe", tags=["formula calculator"])
def calc_describe(req: CalcRef):
    from src import formula_calc
    text, cat, sec_vars, unit = _calc_target(req)
    data = formula_calc.describe(text, category=cat, section_vars=sec_vars, lang=req.lang)
    data["unit"] = unit
    return ok(data, f"{len(data['equations'])} equation(s)")


@app.post(f"{API_PREFIX}/formulas/calc/solve", tags=["formula calculator"])
def calc_solve(req: CalcSolveRequest):
    from src import formula_calc
    text, _, _, unit = _calc_target(req)
    data = formula_calc.solve(text, req.solve_for, req.values, eq_index=req.equation, lang=req.lang, unit=unit,
                              angle_unit=req.angle_unit)
    return ok(data, data["steps"][-1]["text"])


@app.get(f"{API_PREFIX}/formulas/{{category}}", tags=["formulas"])
def formulas_category(category: str, lang: str = Query("en", description="language: en | hi")):
    from src import formulas
    c = formulas.get_category(category, formulas.check_lang(lang))
    return ok(c, f"{sum(len(s['items']) for s in c['sections'])} formulas in {c['title']}")


app.mount("/web", StaticFiles(directory=WEB_DIR), name="web")   # page scripts (3D viewer, vendored three.js)
# Learn pages, for previewing on this PC (online, Caddy serves build/seo directly and never reaches the app)
for _prefix, _sub in (("/learn", "learn"), ("/hi/learn", "hi/learn")):
    if (SEO_DIR / _sub).is_dir():
        app.mount(_prefix, StaticFiles(directory=SEO_DIR / _sub, html=True), name=f"seo-{_sub.replace('/', '-')}")


@app.get(f"{API_PREFIX}/health", tags=["system"])
def health():
    return ok({"status": "up", "version": __version__, "time": datetime.now().isoformat(timespec="seconds")},
              "Service is healthy")


@app.get(f"{API_PREFIX}/system/info", tags=["system"])
def system_info():
    if PUBLIC_MODE:                                  # the home page only needs the device; no server details online
        return ok({"selected_device": resolve_device(cfg.device), "public": True}, "System information")
    env = environment_report()
    env["selected_device"] = resolve_device(cfg.device)
    return ok(env, "System information")


@app.get(f"{API_PREFIX}/knowledge", tags=["system"])
def knowledge(class_name: str | None = Query(None, description="one class, e.g. 'cone'")):
    if class_name is not None:
        if class_name not in CLASS_KNOWLEDGE:
            raise ResourceNotFoundError(f"No information for class '{class_name}'. Known: {sorted(CLASS_KNOWLEDGE)}",
                                        error_code="CLASS_INFO_NOT_FOUND", error_title="Class info not found")
        return ok(CLASS_KNOWLEDGE[class_name], f"Information for '{class_name}'")
    return ok(CLASS_KNOWLEDGE, f"{len(CLASS_KNOWLEDGE)} class description(s)")


@app.get(f"{API_PREFIX}/config", tags=["system"])
def get_config():
    data = cfg.to_dict()
    data.pop("contact", None)            # alert address is private; admins see it in the contact inbox
    return ok(data, "Active configuration")


# =========================================================================== dataset

class ValidateRequest(BaseModel):
    data_yaml: str = Field(default=cfg.paths.data_yaml, description="path to data.yaml")
    check_duplicates: bool = True


class SplitRequest(BaseModel):
    source: str = Field(..., description="folder with images + YOLO .txt labels")
    dest: str = cfg.paths.dataset_dir
    ratios: tuple[float, float, float] = (0.7, 0.2, 0.1)
    seed: int = 42
    dedupe: bool = True
    skip_unlabeled: bool = False
    classes: list[str] | None = None


class DataYamlRequest(BaseModel):
    dest: str = cfg.paths.data_yaml
    classes: list[str] = Field(..., min_length=1)
    include_test: bool = True
    overwrite: bool = False


class SyntheticRequest(BaseModel):
    dest: str = "examples/synthetic_dataset"
    train: int = Field(150, ge=10, le=5000)
    val: int = Field(40, ge=5, le=2000)
    test: int = Field(40, ge=0, le=2000)
    imgsz: int = Field(320, ge=64, le=1280)
    seed: int = 0
    overwrite: bool = False


@app.post(f"{API_PREFIX}/dataset/validate", tags=["dataset"])
def dataset_validate(req: ValidateRequest):
    rep = validate_dataset(resolve_path(req.data_yaml), check_duplicates=req.check_duplicates)
    data = {"valid": rep.ok, "errors": rep.errors, "warnings": rep.warnings, "stats": rep.stats,
            "summary": rep.summary()}
    if not rep.ok:
        return JSONResponse(status_code=422, content={
            "code": 422, "success": False, "message": "The dataset failed validation.",
            "error": {"errorCode": "DATASET_INVALID", "errorTitle": "Dataset invalid",
                      "errorContent": f"{len(rep.errors)} error(s): " + " | ".join(rep.errors[:10])},
            "data": jsonable_encoder(data)})
    return ok(data, f"Dataset is valid ({len(rep.warnings)} warning(s))")


@app.post(f"{API_PREFIX}/dataset/split", tags=["dataset"])
def dataset_split(req: SplitRequest):
    dest = resolve_path(req.dest)
    try:
        counts = split_dataset(resolve_path(req.source), dest, req.ratios, req.seed, dedupe=req.dedupe,
                               skip_unlabeled=req.skip_unlabeled)
        yaml_path = write_data_yaml(dest / "data.yaml", req.classes, overwrite=True) if req.classes else None
    except FileNotFoundError as exc:
        raise ResourceNotFoundError(str(exc), error_code="SOURCE_NOT_FOUND", error_title="Source folder not found")
    except FileExistsError as exc:
        raise ConflictError(str(exc), error_code="FILE_EXISTS", error_title="File already exists")
    except ValueError as exc:
        raise DatasetError(str(exc))
    return ok({"counts": counts, "dest": relpath(dest), "data_yaml": relpath(yaml_path) if yaml_path else None},
              "Dataset split completed", 201)


@app.post(f"{API_PREFIX}/dataset/data-yaml", tags=["dataset"])
def dataset_data_yaml(req: DataYamlRequest):
    try:
        out = write_data_yaml(resolve_path(req.dest), req.classes, req.include_test, req.overwrite)
    except FileExistsError as exc:
        raise ConflictError(str(exc), error_code="FILE_EXISTS", error_title="data.yaml already exists")
    except ValueError as exc:
        raise InputValidationError(str(exc))
    return ok({"data_yaml": relpath(out), "classes": req.classes}, "data.yaml written", 201)


@app.post(f"{API_PREFIX}/dataset/synthetic", tags=["dataset"])
def dataset_synthetic(req: SyntheticRequest):
    try:
        out = make_synthetic_dataset(resolve_path(req.dest), req.train, req.val, req.test, req.imgsz, req.seed,
                                     req.overwrite)
    except FileExistsError as exc:
        raise ConflictError(str(exc), error_code="FILE_EXISTS", error_title="Destination not empty")
    return ok({"data_yaml": relpath(out), "note": "SYNTHETIC shapes - not industrial data"},
              "Synthetic dataset generated", 201)


@app.post(f"{API_PREFIX}/dataset/samples", tags=["dataset"])
def dataset_samples():
    files = make_samples(cfg.paths.resolve("samples_dir"))
    return ok({"files": [relpath(f) for f in files]}, "Sample files generated", 201)


# =========================================================================== training

class TrainRequest(BaseModel):
    data: str = cfg.paths.data_yaml
    model: str = cfg.train.base_model
    epochs: int = Field(cfg.train.epochs, ge=1, le=2000)
    imgsz: int = Field(cfg.train.imgsz, ge=64, le=2048)
    batch: int = Field(cfg.train.batch, ge=1, le=512)
    lr0: float = Field(cfg.train.lr0, gt=0, le=1)
    workers: int = Field(cfg.train.workers, ge=0, le=32)
    patience: int = Field(cfg.train.patience, ge=0, le=1000)
    seed: int = cfg.train.seed
    device: str = cfg.device
    name: str | None = Field(None, pattern=r"^[A-Za-z0-9_\-]{1,64}$")
    resume: str | None = None


_train_proc: dict[str, Any] = {"proc": None, "log": None, "started": None}
_train_lock = threading.Lock()


def _training_status_payload() -> dict:
    status_file = cfg.paths.resolve("logs_dir") / "training_status.json"
    status = json.loads(status_file.read_text(encoding="utf-8")) if status_file.exists() else {"state": "idle"}
    proc = _train_proc["proc"]
    lock = read_train_lock(cfg)
    alive = (proc is not None and proc.poll() is None) or lock is not None
    if status.get("state") == "running" and not alive:
        # Process died without writing a final state (killed / crashed hard).
        status["state"] = "failed"
        status.setdefault("error", "Training process exited unexpectedly; see the training log.")
    status["process_alive"] = alive
    status["log_file"] = relpath(_train_proc["log"]) if _train_proc["log"] else None
    if proc is not None and proc.poll() is not None:
        status["exit_code"] = proc.returncode
    return status


@app.post(f"{API_PREFIX}/training/start", tags=["training"])
def training_start(req: TrainRequest):
    with _train_lock:
        proc = _train_proc["proc"]
        if (proc is not None and proc.poll() is None) or read_train_lock(cfg):
            raise TrainingLockError("A training process is already running. Check /training/status or stop it first.")
        if not req.resume and not resolve_path(req.data).exists():
            raise ResourceNotFoundError(f"data.yaml not found: {req.data}", error_code="DATA_YAML_NOT_FOUND",
                                        error_title="data.yaml not found")
        if req.resume and not resolve_path(req.resume).exists():
            raise ResourceNotFoundError(f"Resume checkpoint not found: {req.resume}",
                                        error_code="CHECKPOINT_NOT_FOUND", error_title="Checkpoint not found")
        cmd = [sys.executable, "-m", "src.train"]
        if req.resume:
            cmd += ["--resume", req.resume]
        else:
            cmd += ["--data", req.data, "--model", req.model, "--epochs", str(req.epochs), "--imgsz", str(req.imgsz),
                    "--batch", str(req.batch), "--lr0", str(req.lr0), "--workers", str(req.workers),
                    "--patience", str(req.patience), "--seed", str(req.seed), "--device", req.device]
            if req.name:
                cmd += ["--name", req.name]
        logs = cfg.paths.resolve("logs_dir")
        logs.mkdir(parents=True, exist_ok=True)
        log_path = unique_path(logs / f"train_api_{timestamp()}.log")
        fh = open(log_path, "w", encoding="utf-8")
        creation = subprocess.CREATE_NEW_PROCESS_GROUP if sys.platform == "win32" else 0
        env = dict(os.environ, PYTHONUNBUFFERED="1", PYTHONIOENCODING="utf-8")
        proc = subprocess.Popen(cmd, cwd=str(PROJECT_ROOT), stdout=fh, stderr=subprocess.STDOUT, env=env,
                                creationflags=creation)
        _train_proc.update(proc=proc, log=log_path, started=datetime.now().isoformat(timespec="seconds"))
        write_json(logs / "training_status.json", {"state": "starting", "pid": proc.pid, "name": req.name,
                                                    "data": None if req.resume else req.data, "epochs": req.epochs,
                                                    "progress": 0, "imgsz": req.imgsz,
                                                    "updated": datetime.now().isoformat(timespec="seconds")})
    return ok({"pid": proc.pid, "log_file": relpath(log_path), "command": " ".join(cmd[1:])},
              "Training started. Poll /training/status - it is NOT complete until state is 'completed'.", 202)


@app.get(f"{API_PREFIX}/training/status", tags=["training"])
def training_status():
    s = _training_status_payload()
    return ok(s, f"Training state: {s.get('state')}")


@app.get(f"{API_PREFIX}/training/log", tags=["training"])
def training_log(lines: int = Query(100, ge=1, le=5000)):
    log_path = _train_proc["log"]
    if log_path is None:
        candidates = sorted(cfg.paths.resolve("logs_dir").glob("train_*.log"), key=lambda p: p.stat().st_mtime)
        log_path = candidates[-1] if candidates else None
    if log_path is None or not Path(log_path).exists():
        raise ResourceNotFoundError("No training log found yet.", error_code="LOG_NOT_FOUND", error_title="Log not found")
    text = Path(log_path).read_text(encoding="utf-8", errors="replace").splitlines()
    return ok({"log_file": relpath(Path(log_path)), "lines": text[-lines:]}, "Training log tail")


@app.post(f"{API_PREFIX}/training/stop", tags=["training"])
def training_stop():
    proc = _train_proc["proc"]
    lock = read_train_lock(cfg)
    if (proc is None or proc.poll() is not None) and not lock:
        raise ConflictError("No training process is running.", error_code="TRAINING_NOT_RUNNING",
                            error_title="Training not running")
    pid = proc.pid if proc is not None and proc.poll() is None else int(lock["pid"])
    import psutil
    try:
        p = psutil.Process(pid)
        for child in p.children(recursive=True):
            child.terminate()
        p.terminate()
        p.wait(timeout=15)
    except psutil.NoSuchProcess:
        pass
    except psutil.TimeoutExpired:
        psutil.Process(pid).kill()
    (cfg.paths.resolve("logs_dir") / "train.lock").unlink(missing_ok=True)
    write_json(cfg.paths.resolve("logs_dir") / "training_status.json",
               {"state": "stopped", "pid": pid, "updated": datetime.now().isoformat(timespec="seconds"),
                "message": "Stopped by user. Resume from the run's weights/last.pt if needed."})
    return ok({"pid": pid}, "Training stopped")


# =========================================================================== models

class ExportRequest(BaseModel):
    model: str | None = None
    imgsz: int = Field(cfg.inference.imgsz, ge=64, le=2048)


@app.get(f"{API_PREFIX}/models", tags=["models"])
def models_list():
    files = [{"path": relpath(p), "size_mb": round(p.stat().st_size / 1e6, 2),
              "kind": "pretrained" if "pretrained" in p.parts else "trained",
              "modified": datetime.fromtimestamp(p.stat().st_mtime).isoformat(timespec="seconds")}
             for p in list_model_files(cfg)]
    try:
        default = relpath(resolve_model_path(cfg))
    except AppError:
        default = None
    return ok({"default_model": default, "registry": load_registry(cfg), "files": files},
              f"{len(files)} model file(s) found")


@app.post(f"{API_PREFIX}/models/export", tags=["models"])
def models_export(req: ExportRequest):
    from src.export_model import export_onnx
    report = export_onnx(cfg, req.model, req.imgsz)
    return ok(report, "Model exported to ONNX and validated", 201)


# =========================================================================== prediction

class PathPredictRequest(BaseModel):
    source: str = Field(..., description="server-side image file or folder")
    model: str | None = None
    conf: float = Field(cfg.inference.conf, ge=0, le=1)
    imgsz: int = Field(cfg.inference.imgsz, ge=32, le=4096)


_auto_models: dict[str, Detector] = {}
_auto_lock = threading.Lock()


def _auto_model(kind: str) -> Detector | None:
    """Models for the automatic chain, each loaded on first use and kept (shapes 5 MB, COCO 5 MB, extras 25 MB).
    "ft" = the optional fine-tuned model (models/everyday_ft/best.pt); None while it hasn't been trained."""
    with _auto_lock:
        if kind == "ft":
            path = cfg.paths.resolve("models_dir") / "everyday_ft" / "best.pt"
            if not path.is_file():
                return None
            if "ft" not in _auto_models:
                _auto_models["ft"] = Detector(path, cfg.device, 0.25, cfg.inference.iou, 640, cfg.inference.max_det)
            return _auto_models["ft"]
        if kind not in _auto_models:
            models_dir = cfg.paths.resolve("models_dir")
            if kind == "shapes":
                path = resolve_model_path(cfg, None)
                reg = {resolve_path(e["best"]): e.get("imgsz") for e in load_registry(cfg) if e.get("best")}
                size = reg.get(path) or cfg.inference.imgsz
            else:
                path = models_dir / ("pretrained/yolo11n.pt" if kind == "coco" else "everyday/everyday.pt")
                size = 640
            _auto_models[kind] = Detector(path, cfg.device, 0.25, cfg.inference.iou, size, cfg.inference.max_det)
        return _auto_models[kind]


def _predict_auto(img: np.ndarray, name: str, return_image: bool) -> dict:
    from src import everyday
    r = everyday.detect_auto(img, _auto_model)
    dets = []
    for d, info in zip(r["detections"], r["infos"]):
        x = d.to_dict()
        if info:
            x.update(object=info["object"], object_hi=info["object_hi"], shape_note=info["note"], source=info["source"])
        dets.append(x)
    data = {"image": name, "width": img.shape[1], "height": img.shape[0], "model": "auto", "stage": r["stage"],
            "device": resolve_device(cfg.device), "conf": None, "latency_ms": round(r["latency_ms"], 1), "count": len(dets),
            "detections": dets, "saved_path": None, "generic_pretrained_model": False,
            "class_info": {d.class_name: CLASS_KNOWLEDGE[d.class_name] for d in r["detections"] if d.class_name in CLASS_KNOWLEDGE},
            "model_classes": [], "note": "Everyday objects are shown as the shape they are closest to.",
            "object_names": sorted(set(everyday.OBJECTS) | set(everyday.COCO_OBJECTS))}
    if return_image:
        data["annotated_image_base64"] = _encode_jpeg_b64(r["annotated"])
    return data


@app.post(f"{API_PREFIX}/feedback/everyday", tags=["prediction"])
async def feedback_everyday(request: Request, file: UploadFile = File(...), items: str = Form("[]"),
                            extra: str = Form("[]"), lang: str = Form("en"), consent: bool = Form(False)):
    """Share a corrected Auto-mode photo for fine-tuning (stored only with consent; see src/feedback.py)."""
    from src import feedback
    raw = await file.read()
    if not raw or len(raw) > MAX_UPLOAD_MB * 1024 * 1024:
        raise InputValidationError(f"Photo missing or larger than {MAX_UPLOAD_MB} MB.", error_code="FILE_TOO_LARGE")
    try:
        it, ex = json.loads(items), json.loads(extra)
        assert isinstance(it, list) and isinstance(ex, list)
    except (ValueError, AssertionError):
        raise InputValidationError("items / extra must be JSON lists.", error_code="FEEDBACK_INVALID") from None
    r = feedback.save(raw, it, [str(x) for x in ex], lang, consent, request.client.host if request.client else None)
    return ok(r, "Thank you! Your correction will help Quantix recognise objects better.", 201)


@app.post(f"{API_PREFIX}/predict/image", tags=["prediction"])
async def predict_image_upload(file: UploadFile = File(...), model: str | None = Form(None),
                               conf: float = Form(cfg.inference.conf, ge=0, le=1),
                               imgsz: int = Form(cfg.inference.imgsz, ge=32, le=4096),
                               return_image: bool = Form(True), save: bool = Form(True)):
    name = Path(file.filename or "upload.jpg").name
    if Path(name).suffix.lower() not in IMAGE_EXTENSIONS:
        raise InputValidationError(f"Unsupported file type '{Path(name).suffix}'. Upload JPG, JPEG or PNG.",
                                   error_code="UNSUPPORTED_IMAGE_TYPE", error_title="Unsupported image type")
    raw = await file.read()
    if not raw:
        raise InputValidationError("Uploaded file is empty.", error_code="EMPTY_FILE", error_title="Empty file")
    if len(raw) > MAX_UPLOAD_MB * 1024 * 1024:
        raise InputValidationError(f"File exceeds {MAX_UPLOAD_MB} MB.", status_code=413,
                                   error_code="FILE_TOO_LARGE", error_title="File too large")
    img = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        raise InputValidationError("The uploaded file is not a readable image.", error_code="INVALID_IMAGE",
                                   error_title="Invalid image")

    if model == "auto":                              # shapes + everyday objects (src/everyday.py)
        data = _predict_auto(img, name, return_image)
        found = ", ".join(f"{x['object']} → {x['class_name']}" if x.get("object") else x["class_name"] for x in data["detections"])
        return ok(data, f"Prediction completed: {found or 'nothing recognised'}")
    if PUBLIC_MODE:
        if model:                                    # only our own models: a .pt file runs code when loaded
            mp, models_dir = resolve_path(model), cfg.paths.resolve("models_dir")
            if mp.suffix != ".pt" or models_dir not in mp.parents or not mp.is_file():
                raise InputValidationError("Choose one of the listed models.", error_code="MODEL_NOT_ALLOWED",
                                           error_title="Model not allowed")
        imgsz, save = min(imgsz, 1280), False        # bounded CPU time; visitors' photos are never stored
    det = get_detector(model, conf, imgsz)
    dets, annotated, latency = det.predict(img, conf=conf)
    saved = None
    if save:
        out_dir = cfg.paths.resolve("predictions_dir") / f"api_{datetime.now():%Y%m%d}"
        out_dir.mkdir(parents=True, exist_ok=True)
        stem = Path(name).stem
        saved = unique_path(out_dir / f"{datetime.now():%H%M%S}_{stem}_pred.jpg")
        cv2.imwrite(str(saved), annotated)
        with open(out_dir / "history.jsonl", "a", encoding="utf-8") as fh:
            fh.write(json.dumps({"time": datetime.now().isoformat(timespec="seconds"), "image": name,
                                 "annotated": relpath(saved), "model": str(det.model_path), "conf": conf,
                                 "detections": [d.to_dict() for d in dets]}) + "\n")
    data = {"image": name, "width": img.shape[1], "height": img.shape[0], "model": str(det.model_path),
            "device": det.device, "conf": conf, "latency_ms": round(latency, 1), "count": len(dets),
            "detections": [d.to_dict() for d in dets], "saved_path": relpath(saved) if saved else None,
            "generic_pretrained_model": det.is_generic_pretrained,
            "class_info": {d.class_name: CLASS_KNOWLEDGE[d.class_name] for d in dets if d.class_name in CLASS_KNOWLEDGE},
            "model_classes": det.names,
            "note": "Confidence scores are model scores, not calibrated probabilities."}
    if return_image:
        data["annotated_image_base64"] = _encode_jpeg_b64(annotated)
    return ok(data, f"Prediction completed: {len(dets)} object(s) detected")


@app.post(f"{API_PREFIX}/predict/path", tags=["prediction"])
def predict_path(req: PathPredictRequest):
    from src.predict_image import collect_images, predict_images
    images = collect_images(resolve_path(req.source))
    det = get_detector(req.model, req.conf, req.imgsz)
    out_dir = unique_dir(cfg.paths.resolve("predictions_dir"), f"pred_{timestamp()}")
    summary = predict_images(det, images, out_dir)
    return ok(summary, f"Processed {len(images)} image(s), {summary['total_detections']} detection(s)")


# =========================================================================== evaluation

class EvaluateRequest(BaseModel):
    model: str | None = None
    data: str = cfg.paths.data_yaml
    split: Literal["val", "test", "train"] = "val"
    imgsz: int = Field(cfg.inference.imgsz, ge=32, le=4096)
    batch: int = Field(cfg.train.batch, ge=1, le=256)
    benchmark_images: int = Field(50, ge=0, le=1000)


@app.post(f"{API_PREFIX}/evaluation/run", tags=["evaluation"])
def evaluation_run(req: EvaluateRequest):
    from src.evaluate import evaluate
    if read_train_lock(cfg):
        log.warning("Evaluation requested while training is running - both will be slower.")
    report = evaluate(cfg, req.model, req.data, req.split, req.imgsz, req.batch, None, req.benchmark_images)
    return ok(report, f"Evaluation on '{req.split}' split completed")


@app.get(f"{API_PREFIX}/evaluation/reports", tags=["evaluation"])
def evaluation_reports():
    d = cfg.paths.resolve("evaluations_dir")
    reports = []
    for f in sorted(d.glob("*/evaluation.json"), key=lambda p: p.stat().st_mtime, reverse=True) if d.exists() else []:
        try:
            r = json.loads(f.read_text(encoding="utf-8"))
            reports.append({"id": f.parent.name, "created": r.get("created"), "split": r.get("split"),
                            "model": r.get("model"), "overall": r.get("overall")})
        except json.JSONDecodeError:
            continue
    return ok(reports, f"{len(reports)} evaluation report(s)")


@app.get(f"{API_PREFIX}/evaluation/reports/{{report_id}}", tags=["evaluation"])
def evaluation_report(report_id: str):
    if not report_id.replace("_", "").replace("-", "").isalnum():
        raise InputValidationError("Invalid report id.", error_code="INVALID_REPORT_ID")
    f = cfg.paths.resolve("evaluations_dir") / report_id / "evaluation.json"
    if not f.exists():
        raise ResourceNotFoundError(f"Evaluation report '{report_id}' not found.", error_code="REPORT_NOT_FOUND",
                                    error_title="Report not found")
    return ok(json.loads(f.read_text(encoding="utf-8")), "Evaluation report")


# =========================================================================== camera

class CameraStartRequest(BaseModel):
    camera: int | None = Field(None, ge=0, le=16)
    video: str | None = None
    model: str | None = None
    conf: float = Field(cfg.inference.conf, ge=0.01, le=0.99)
    imgsz: int = Field(cfg.inference.imgsz, ge=32, le=4096)
    loop_video: bool = True


class CameraSettingsRequest(BaseModel):
    conf: float | None = Field(None, ge=0.01, le=0.99)
    paused: bool | None = None


_camera: dict[str, Any] = {"session": None}
_camera_lock = threading.Lock()


def _require_session():
    s = _camera["session"]
    if s is None:
        raise ConflictError("Camera is not running. Start it with POST /camera/start.",
                            error_code="CAMERA_NOT_RUNNING", error_title="Camera not running")
    return s


@app.post(f"{API_PREFIX}/camera/start", tags=["camera"])
def camera_start(req: CameraStartRequest):
    from src.predict_camera import open_session
    if req.camera is not None and req.video:
        raise InputValidationError("Provide either 'camera' or 'video', not both.")
    with _camera_lock:
        if _camera["session"] is not None:
            if _camera["session"].running:
                raise ConflictError("A camera session is already running. Stop it first.",
                                    error_code="CAMERA_ALREADY_RUNNING", error_title="Camera already running")
            _camera["session"].stop()
            _camera["session"] = None
        session = open_session(cfg, req.model, req.camera, req.video, req.conf, req.imgsz, loop_video=req.loop_video)
        _camera["session"] = session
    return ok(session.stats() | {"stream_url": f"{API_PREFIX}/camera/stream"}, "Camera session started", 201)


@app.get(f"{API_PREFIX}/camera/status", tags=["camera"])
def camera_status():
    s = _camera["session"]
    if s is None:
        return ok({"running": False}, "Camera is not running")
    return ok(s.stats(), "Camera session status")


@app.patch(f"{API_PREFIX}/camera/settings", tags=["camera"])
def camera_settings(req: CameraSettingsRequest):
    s = _require_session()
    if req.conf is not None:
        s.conf = req.conf
    if req.paused is not None:
        s.paused = req.paused
    return ok(s.stats(), "Camera settings updated")


@app.get(f"{API_PREFIX}/camera/detections", tags=["camera"])
def camera_detections():
    s = _require_session()
    _, dets = s.latest()
    return ok({"detections": [d.to_dict() for d in dets], "stats": s.stats()}, f"{len(dets)} detection(s)")


@app.get(f"{API_PREFIX}/camera/frame", tags=["camera"], responses={200: {"content": {"image/jpeg": {}}}})
def camera_frame():
    s = _require_session()
    img, _ = s.latest()
    if img is None:
        raise CameraUnavailableError("No frame processed yet - try again in a moment.", error_code="NO_FRAME_YET",
                                     error_title="No frame yet")
    okk, buf = cv2.imencode(".jpg", s.overlay(img))
    return Response(content=buf.tobytes(), media_type="image/jpeg")


@app.get(f"{API_PREFIX}/camera/stream", tags=["camera"])
def camera_stream():
    s = _require_session()

    def gen():
        last = -1
        while _camera["session"] is s and s.running:
            if s.frames_processed == last:
                time.sleep(0.01)
                continue
            last = s.frames_processed
            img, _ = s.latest()
            if img is None:
                continue
            okk, buf = cv2.imencode(".jpg", s.overlay(img), [cv2.IMWRITE_JPEG_QUALITY, 80])
            if okk:
                yield b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + buf.tobytes() + b"\r\n"

    return StreamingResponse(gen(), media_type="multipart/x-mixed-replace; boundary=frame")


@app.post(f"{API_PREFIX}/camera/snapshot", tags=["camera"])
def camera_snapshot():
    return ok(_require_session().snapshot(), "Snapshot saved", 201)


@app.post(f"{API_PREFIX}/camera/stop", tags=["camera"])
def camera_stop():
    with _camera_lock:
        s = _require_session()
        stats = s.stats()
        s.stop()
        _camera["session"] = None
    stats["running"] = False
    stats["detection_log"] = relpath(s.csv_path) if getattr(s, "csv_path", None) else None
    return ok(stats, "Camera session stopped and released")


# =========================================================================== history & files

@app.get(f"{API_PREFIX}/history/predictions", tags=["history"])
def history_predictions(limit: int = Query(50, ge=1, le=1000)):
    d = cfg.paths.resolve("predictions_dir")
    items: list[dict] = []
    for f in d.glob("api_*/history.jsonl") if d.exists() else []:
        for line in f.read_text(encoding="utf-8").splitlines():
            try:
                items.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    for f in d.glob("pred_*/summary.json") if d.exists() else []:
        try:
            s = json.loads(f.read_text(encoding="utf-8"))
            for im in s.get("images", []):
                if "annotated" in im:
                    items.append({"time": datetime.fromtimestamp(f.stat().st_mtime).isoformat(timespec="seconds"),
                                  "image": im["image"], "annotated": im["annotated"], "model": s.get("model"),
                                  "detections": im.get("detections", [])})
        except json.JSONDecodeError:
            continue
    items.sort(key=lambda x: x.get("time", ""), reverse=True)
    return ok(items[:limit], f"{min(len(items), limit)} prediction(s)")


@app.get(f"{API_PREFIX}/history/snapshots", tags=["history"])
def history_snapshots(limit: int = Query(50, ge=1, le=1000)):
    d = cfg.paths.resolve("snapshots_dir")
    files = sorted(d.glob("*_annotated.jpg"), key=lambda p: p.stat().st_mtime, reverse=True) if d.exists() else []
    data = [{"annotated": relpath(f), "raw": relpath(f.with_name(f.name.replace("_annotated", "_raw"))),
             "time": datetime.fromtimestamp(f.stat().st_mtime).isoformat(timespec="seconds")} for f in files[:limit]]
    return ok(data, f"{len(data)} snapshot(s)")


@app.get(f"{API_PREFIX}/files", tags=["history"])
def get_file(path: str = Query(..., description="project-relative path under outputs/, samples/ or models/")):
    return FileResponse(_safe_output_path(path))


def main() -> None:
    import argparse
    import uvicorn
    p = argparse.ArgumentParser(description="Run the REST API server")
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=8000)
    p.add_argument("--reload", action="store_true",
                   help="restart automatically when code in src/ changes (development / after updates)")
    a = p.parse_args()
    if a.host not in ("127.0.0.1", "localhost"):
        log.warning("Binding to %s exposes this unauthenticated API to the network.", a.host)
    # Open browser tabs keep connections alive (the Train page polls every few seconds); without a timeout a
    # reload can wait forever for them to close and the old code keeps running.
    if a.reload:
        uvicorn.run("src.api:app", host=a.host, port=a.port, reload=True, timeout_graceful_shutdown=3,
                    reload_dirs=[str(PROJECT_ROOT / "src")], reload_includes=["*.py"])
    else:
        uvicorn.run("src.api:app", host=a.host, port=a.port, reload=False, timeout_graceful_shutdown=3)


if __name__ == "__main__":
    main()
