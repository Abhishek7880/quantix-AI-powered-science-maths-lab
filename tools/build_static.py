"""Build "Quantix Lite" — the free static version of the site (Hugging Face Static Space, or any static host).

    .venv\\Scripts\\python.exe tools\\build_static.py                 # -> D:\\Abhishek\\Deploy\\quantix-static
    .venv\\Scripts\\python.exe tools\\build_static.py --serve         # build, then preview on http://127.0.0.1:8090
    .venv\\Scripts\\python.exe tools\\build_static.py --upload        # build + upload to the Space <you>/quantix

The pages are the same files as the full site. deploy/static/static_api.js (loaded first on every page) answers their
/api/v1/... requests in the browser, from:
  static-api/*.json    every read-only API answer, produced by calling the real app (FastAPI TestClient)
  api/v1/formulas/sketch/*.svg, pdf/*.pdf   sketches and every formula PDF (English + Hindi), made in advance
  py/                  src/formula_calc.py, src/eqsolve.py, src/chemistry.py (+ data) for Pyodide (calculator, equation
                       solver, molar mass run as real Python in the browser)
Links like /formulas become /formulas.html so any static host serves them. Photo AI shows a "full version" note.
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
from pathlib import Path
from urllib.parse import parse_qsl, urlsplit

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

DEFAULT_OUT = Path(r"D:\Abhishek\Deploy\quantix-static")
MARKER = ".quantix-static"
PAGES = ["index", "formulas", "converter", "graph", "elements", "measure", "physics", "handwriting", "contact"]
ROUTES = "formulas|converter|graph|elements|measure|physics|handwriting|contact"
LINK = re.compile(rf"""(["'`(])/({ROUTES})(?=["'`?#)])""")      # "/formulas" -> "/formulas.html" (not /api/v1/formulas)
PY_FILES = ["src/__init__.py", "src/errors.py", "src/formula_calc.py", "src/eqsolve.py", "src/chemistry.py",
            "src/knowledge/elements.json", "src/knowledge/formulas/calc_glossary.json"]
REPO = "https://github.com/Abhishek7880/quantix-AI-powered-science-maths-lab"
STATIC_URL = "https://abhishek7080-quantix.static.hf.space"


def data_name(url: str) -> str:
    """Same rule as static_api.js dataFile(): route + sorted query, unsafe characters -> '_'."""
    parts = urlsplit(url)
    route = parts.path.removeprefix("/api/v1/").strip("/")
    q = "&".join(f"{k}={v}" for k, v in sorted(parse_qsl(parts.query), key=lambda kv: f"{kv[0]}={kv[1]}"))
    return re.sub(r"[^A-Za-z0-9._-]", "_", route + (f"__{q}" if q else "")) + ".json"


def rewrite_links(text: str) -> str:
    return LINK.sub(r"\1/\2.html", text)


def build(out: Path) -> Path:
    from fastapi.testclient import TestClient
    from src import api, formulas
    from src.config import load_config
    from src.sketches import DRAW

    if out.exists():
        if not (out / MARKER).exists():
            sys.exit(f"{out} exists and is not a Quantix static build — refusing to delete it.")
        shutil.rmtree(out)
    out.mkdir(parents=True)
    (out / MARKER).write_text("built by tools/build_static.py\n", encoding="utf-8")

    print("== pages + scripts")
    shutil.copytree(ROOT / "src" / "web", out / "web", ignore=shutil.ignore_patterns("contact_inbox.html", "__pycache__"))
    shutil.copy2(ROOT / "deploy" / "static" / "static_api.js", out / "web" / "static_api.js")
    for name in PAGES:
        (out / "web" / f"{name}.html").unlink(missing_ok=True)       # pages live at the site root
        html = (ROOT / "src" / "web" / f"{name}.html").read_text(encoding="utf-8")
        html = html.replace("<head>", '<head>\n<script src="/web/static_api.js"></script>', 1)
        (out / f"{name}.html").write_text(rewrite_links(html), encoding="utf-8")
    for f in (out / "web").glob("*.js"):
        if f.name != "static_api.js":
            f.write_text(rewrite_links(f.read_text(encoding="utf-8")), encoding="utf-8")

    print("== API answers (from the real app)")
    sa = out / "static-api"
    sa.mkdir()
    cfg = load_config()
    lib = formulas.load_library("en")
    gets = ["/api/v1/health", "/api/v1/measure/presets", "/api/v1/social", "/api/v1/formulas", "/api/v1/formulas?lang=hi",
            "/api/v1/formulas?full=true&lang=en", "/api/v1/formulas?full=true&lang=hi", "/api/v1/formulas/calc/index",
            "/api/v1/elements"]
    gets += [f"/api/v1/formulas/{c['id']}" + q for c in lib for q in ("", "?lang=hi")]
    with TestClient(api.app) as client:
        for url in gets:
            r = client.get(url)
            if r.status_code != 200:
                sys.exit(f"{url} -> {r.status_code}")
            (sa / data_name(url)).write_text(r.text, encoding="utf-8")
        version = client.get("/api/v1/health").json()["data"].get("version", "")
        (sa / data_name("/api/v1/system/info")).write_text(json.dumps(
            {"code": 200, "success": True, "message": "System information", "data": {"selected_device": "lite", "public": True}}),
            encoding="utf-8")
        (sa / data_name("/api/v1/models")).write_text(json.dumps(
            {"code": 501, "success": False, "message": "Photo AI is available in the full version",
             "error": {"errorCode": "FULL_VERSION_ONLY", "errorTitle": "Available in the full version",
                       "errorContent": f"Run Quantix on your PC for shape detection: {REPO}"}}), encoding="utf-8")

        print("== sketches")
        sk = out / "api" / "v1" / "formulas" / "sketch"
        sk.mkdir(parents=True)
        for shape in DRAW:
            r = client.get(f"/api/v1/formulas/sketch/{shape}.svg")
            (sk / f"{shape}.svg").write_bytes(r.content)

        print("== PDFs (every category and section, English + Hindi)")
        pdf_dir, index = out / "pdf", {}
        pdf_dir.mkdir()
        queries = [{"category": "all"}] + [{"category": c["id"]} for c in lib] + \
                  [{"category": c["id"], "section": s["id"]} for c in lib for s in c["sections"]]
        for q in queries:
            for lang in ("en", "hi"):
                params = dict(q, **({"lang": "hi"} if lang == "hi" else {}))
                r = client.get("/api/v1/formulas/pdf", params=params)
                if r.status_code != 200:
                    print(f"   skipped {params}: {r.status_code}")
                    continue
                name = re.search(r'filename="([^"]+)"', r.headers.get("content-disposition", "")).group(1)
                key = "&".join(f"{k}={v}" for k, v in sorted(params.items()))
                # stored under its real name (e.g. algebra_hi.pdf): static hosts send the file name as the download name
                fname = re.sub(r"[^A-Za-z0-9._-]", "_", name)
                if (pdf_dir / fname).exists():
                    fname = re.sub(r"[^A-Za-z0-9._-]", "_", key) + ".pdf"
                (pdf_dir / fname).write_bytes(r.content)
                index[key] = {"url": f"/pdf/{fname}", "name": name}
        (sa / "pdf-index.json").write_text(json.dumps(index, ensure_ascii=False), encoding="utf-8")
        print(f"   {len(index)} PDFs")

    print("== Python for the browser (Pyodide)")
    for rel in PY_FILES:
        dst = out / "py" / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(ROOT / rel, dst)
    (out / "py" / "manifest.json").write_text(json.dumps(PY_FILES), encoding="utf-8")

    author_email = (cfg.author.email or "").strip()
    (sa / "site.json").write_text(json.dumps({"form_key": (cfg.contact.web3forms_key or "").strip(),
                                              "contact_email": author_email, "github": REPO, "version": version}),
                                  encoding="utf-8")
    shutil.copy2(ROOT / "deploy" / "static" / "README.md", out / "README.md")

    # favicon at the root + files search engines read (pages here end in .html)
    shutil.copy2(ROOT / "src" / "web" / "favicon.ico", out / "favicon.ico")
    base = STATIC_URL.rstrip("/")
    pages = ["/"] + [f"/{p}.html" for p in PAGES if p != "index"]
    (out / "robots.txt").write_text(f"User-agent: *\nAllow: /\nDisallow: /static-api/\nDisallow: /py/\n\nSitemap: {base}/sitemap.xml\n",
                                    encoding="utf-8")
    (out / "sitemap.xml").write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
                                     + "".join(f"  <url><loc>{base}{p}</loc></url>\n" for p in pages) + "</urlset>\n", encoding="utf-8")
    check(out, cfg)
    return out


def check(out: Path, cfg) -> None:
    """Refuse to publish private values (email password, admin keys, the private alert address)."""
    needles = []
    smtp = ROOT / "secrets" / "smtp.json"
    if smtp.is_file():
        pw = json.loads(smtp.read_text(encoding="utf-8")).get("password", "").replace(" ", "")
        needles += [pw] if pw else []
    for f in (ROOT / "outputs" / "contact" / "admin_token.txt", ROOT / "secrets" / "space_admin_key.txt"):
        if f.is_file():
            needles.append(f.read_text(encoding="utf-8").strip())
    if (cfg.contact.notify_to or "").strip():
        needles.append(cfg.contact.notify_to.strip())
    files = [p for p in out.rglob("*") if p.is_file()]
    hits = [f"{p.relative_to(out)}" for p in files if p.suffix in (".json", ".js", ".html", ".py", ".md")
            for n in needles if n and n in p.read_text(encoding="utf-8", errors="ignore")]
    if hits:
        sys.exit("Not publishing — private values found in:\n  " + "\n  ".join(sorted(set(hits))))
    size = sum(p.stat().st_size for p in files) / 1e6
    print(f"Static site ready: {out}  ({len(files)} files, {size:.1f} MB) — no private values inside.")


def upload(out: Path, space: str) -> None:
    from huggingface_hub import HfApi, get_token
    token = get_token()
    if not token:
        sys.exit("Sign in first:  .venv\\Scripts\\hf.exe auth login   (or set HF_TOKEN)")
    api = HfApi(token=token)
    user = api.whoami()["name"]
    repo_id = f"{user}/{space}"
    print(f"Uploading to the Static Space {repo_id} …")
    api.create_repo(repo_id, repo_type="space", space_sdk="static", exist_ok=True)
    api.upload_folder(repo_id=repo_id, repo_type="space", folder_path=str(out), commit_message="Deploy Quantix Lite",
                      delete_patterns=["*"], ignore_patterns=[MARKER])
    print(f"Done:  https://huggingface.co/spaces/{repo_id}   (site: https://{user.lower()}-{space.lower()}.static.hf.space)")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    ap.add_argument("--serve", action="store_true", help="preview on http://127.0.0.1:8090 after building")
    ap.add_argument("--upload", action="store_true", help="upload to the Hugging Face Static Space")
    ap.add_argument("--space", default="quantix")
    a = ap.parse_args()
    folder = build(a.out)
    if a.upload:
        upload(folder, a.space)
    if a.serve:
        import functools
        import http.server
        handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(folder))
        print("Preview: http://127.0.0.1:8090   (Ctrl+C to stop)")
        http.server.ThreadingHTTPServer(("127.0.0.1", 8090), handler).serve_forever()
