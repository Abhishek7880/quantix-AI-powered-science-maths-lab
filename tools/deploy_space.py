"""Publish Quantix to a free Hugging Face Space (Docker, CPU).

    .venv\\Scripts\\python.exe tools\\deploy_space.py --build-only      # just assemble the folder and check it
    .venv\\Scripts\\python.exe tools\\deploy_space.py                   # assemble + upload (asks for your HF token)

What it does:
  1. Builds a clean folder (default D:\\Abhishek\\Deploy\\quantix-space) with only what the website needs: src/, the
     shape + handwriting models, config.yaml, Dockerfile, README. Never included: datasets, outputs (contact
     messages, admin key), secrets, tests, training tools, the virtual env.
  2. Uploads it to https://huggingface.co/spaces/<you>/quantix (created if missing).
  3. Stores the private settings as Space *secrets* (never in the public files): admin key for /contact/inbox,
     Gmail sending account + App Password (from secrets/smtp.json) and the alert address (config.yaml).

The token: huggingface.co -> Settings -> Access Tokens -> Create new token -> type "Write". Either sign in once with
    .venv\\Scripts\\hf.exe auth login        (saves it in your user profile, outside this project)
or paste it when asked (hidden input, used only for that upload). It is never written into this project.
"""

from __future__ import annotations

import argparse
import getpass
import json
import re
import secrets
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from src.config import load_config  # noqa: E402

DEFAULT_OUT = Path(r"D:\Abhishek\Deploy\quantix-space")
DEPLOY_FILES = ROOT / "deploy" / "huggingface"
MODELS = ["shapes_mensuration/best.pt", "shapes_mensuration/experiment.json",
          "handwriting/symbols.pt", "handwriting/symbols.json",
          "pretrained/yolo11n.pt", "everyday/everyday.pt", "everyday/everyday.json"]   # Auto mode: everyday objects
ADMIN_KEY_FILE = ROOT / "secrets" / "space_admin_key.txt"
NEVER = re.compile(r"(^|/)(__pycache__|\.pytest_cache|secrets|outputs|datasets|dataset|\.venv)(/|$)|\.pyc$")


def build(out: Path) -> Path:
    if out.exists():
        if not (out / "Dockerfile").is_file():
            sys.exit(f"{out} exists and is not a deploy folder — refusing to delete it. Choose another --out.")
        shutil.rmtree(out)
    out.mkdir(parents=True)
    for name in ("Dockerfile", "requirements-deploy.txt", "README.md"):
        shutil.copy2(DEPLOY_FILES / name, out / name)
    shutil.copytree(ROOT / "src", out / "src", ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
    for rel in MODELS:
        (out / "models" / rel).parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(ROOT / "models" / rel, out / "models" / rel)
    reg = json.loads((ROOT / "models" / "registry.json").read_text(encoding="utf-8"))
    reg = [e for e in reg if e.get("name") == "shapes_mensuration"]
    (out / "models" / "registry.json").write_text(json.dumps(reg, indent=2), encoding="utf-8")

    # config.yaml: same settings, but the alert address and local inbox link come from Space secrets / variables
    cfg_text = (ROOT / "config.yaml").read_text(encoding="utf-8")
    cfg_text = re.sub(r"(?m)^(\s*notify_to:)\s*\S+.*$", r'\1 ""                # set by the IAV_NOTIFY_TO secret', cfg_text)
    cfg_text = re.sub(r"(?m)^(\s*inbox_url:)\s*\S+.*$", r'\1 ""                # set by the IAV_INBOX_URL variable', cfg_text)
    cfg_text = re.sub(r"(?m)^device:\s*\S+", "device: cpu", cfg_text)
    (out / "config.yaml").write_text(cfg_text, encoding="utf-8")
    (out / ".dockerignore").write_text("__pycache__\n*.pyc\nseo\n", encoding="utf-8")   # seo/ is served by Caddy, not the app
    check(out)
    return out


def check(out: Path) -> None:
    """Refuse to publish anything private."""
    files = [p for p in out.rglob("*") if p.is_file()]
    bad = [p for p in files if NEVER.search(p.relative_to(out).as_posix())]
    private = []
    smtp = ROOT / "secrets" / "smtp.json"
    needles = []
    if smtp.is_file():
        pw = json.loads(smtp.read_text(encoding="utf-8")).get("password", "").replace(" ", "")
        if pw:
            needles.append(pw)
    notify = (load_config().contact.notify_to or "").strip()
    if notify:
        needles.append(notify)
    for p in files:
        if p.suffix in (".py", ".yaml", ".json", ".md", ".txt", ".html", ".js", ".css"):
            text = p.read_text(encoding="utf-8", errors="ignore")
            private += [f"{p.relative_to(out)} contains a private value" for n in needles if n in text]
    if bad or private:
        sys.exit("Not publishing — private files found:\n  " + "\n  ".join([str(b) for b in bad] + private))
    size = sum(p.stat().st_size for p in files) / 1e6
    print(f"Deploy folder ready: {out}  ({len(files)} files, {size:.1f} MB) — no private files inside.")


def upload(out: Path, space: str) -> None:
    from huggingface_hub import HfApi, get_token
    token = get_token()                           # saved by `hf auth login`, if you signed in that way
    if token:
        print("Using your saved Hugging Face login.")
    else:
        token = getpass.getpass("Hugging Face token (type Write; hidden while you type): ").strip()
    if not token.startswith("hf_"):
        sys.exit("That does not look like a Hugging Face token (they start with hf_).")
    api = HfApi(token=token)
    user = api.whoami()["name"]
    repo_id = f"{user}/{space}"
    host = f"https://{user.lower()}-{space.lower()}.hf.space"
    print(f"Signed in as {user}. Creating / updating the Space {repo_id} …")
    api.create_repo(repo_id, repo_type="space", space_sdk="docker", exist_ok=True)

    # private settings -> Space secrets (encrypted, never visible in the public files)
    ADMIN_KEY_FILE.parent.mkdir(exist_ok=True)
    if not ADMIN_KEY_FILE.is_file():
        ADMIN_KEY_FILE.write_text(secrets.token_urlsafe(24), encoding="utf-8")
    api.add_space_secret(repo_id, "IAV_ADMIN_TOKEN", ADMIN_KEY_FILE.read_text(encoding="utf-8").strip())
    notify = (load_config().contact.notify_to or "").strip()
    if notify:
        api.add_space_secret(repo_id, "IAV_NOTIFY_TO", notify)
    smtp = ROOT / "secrets" / "smtp.json"
    if smtp.is_file():
        s = json.loads(smtp.read_text(encoding="utf-8"))
        if s.get("username") and s.get("password"):
            api.add_space_secret(repo_id, "IAV_SMTP_USER", s["username"])
            api.add_space_secret(repo_id, "IAV_SMTP_PASSWORD", s["password"].replace(" ", ""))
    else:
        print("  (no secrets/smtp.json — email alerts stay off until you run tools/setup_email.py and deploy again)")
    api.add_space_variable(repo_id, "IAV_INBOX_URL", f"{host}/contact/inbox")

    print("Uploading files (first time ~20 MB) …")
    api.upload_folder(repo_id=repo_id, repo_type="space", folder_path=str(out),
                      commit_message="Deploy Quantix", delete_patterns=["*"])
    print(f"""
Done. Hugging Face now builds the app (first build about 5-10 minutes; watch the "Logs" tab):
  Space page : https://huggingface.co/spaces/{repo_id}
  Website    : {host}
  Admin inbox: {host}/contact/inbox   (admin key: {ADMIN_KEY_FILE.relative_to(ROOT)})""")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT, help=f"deploy folder (default {DEFAULT_OUT})")
    ap.add_argument("--space", default="quantix", help="Space name (default quantix)")
    ap.add_argument("--build-only", action="store_true", help="assemble and check the folder, do not upload")
    a = ap.parse_args()
    folder = build(a.out)
    if not a.build_only:
        upload(folder, a.space)
