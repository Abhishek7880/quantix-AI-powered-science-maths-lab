"""Deploy (or update) Quantix on your Oracle Cloud Always Free server.

    .venv\\Scripts\\python.exe tools\\deploy_oracle.py --host 140.238.1.2          # first time and every update
    .venv\\Scripts\\python.exe tools\\deploy_oracle.py --host 140.238.1.2 --domain quantix.example.com

What it does (over SSH with the key ~/.ssh/quantix_oracle):
  1. Builds the same clean folder as the local Docker test (tools/deploy_space.py --build-only) and adds
     docker-compose.yml + Caddyfile from deploy/oracle/.
  2. First run only: prepares the server (Docker, firewall ports 80/443, swap, security updates).
  3. Writes the private settings to ~/quantix/.env on the server (chmod 600): admin key, Gmail sending account +
     App Password (secrets/smtp.json), alert address (config.yaml). They never go into the uploaded folder.
  4. Uploads the folder, builds the image on the server and (re)starts it. Contact messages live in
     ~/quantix/data on the server and are kept across updates.
Without --domain the site gets a free name that points at the IP: https://<ip-with-dashes>.sslip.io
"""

from __future__ import annotations

import argparse
import json
import secrets
import shutil
import subprocess
import sys
import tarfile
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tools"))
from deploy_space import ADMIN_KEY_FILE, DEFAULT_OUT, build  # noqa: E402
from src.config import load_config  # noqa: E402

KEY = Path.home() / ".ssh" / "quantix_oracle"
REMOTE = "quantix"                       # folder in the server user's home
SSH_OPTS = ["-i", str(KEY), "-o", "StrictHostKeyChecking=accept-new", "-o", "ConnectTimeout=20",
            "-o", "ServerAliveInterval=30"]


def ssh(target: str, command: str, check: bool = True, quiet: bool = False) -> subprocess.CompletedProcess:
    r = subprocess.run(["ssh", *SSH_OPTS, target, command], text=True, capture_output=quiet)
    if check and r.returncode != 0:
        sys.exit(f"Server command failed ({r.returncode}): {command}\n{r.stderr or ''}")
    return r


def env_file(site_host: str, also: str | None = None) -> str:
    ADMIN_KEY_FILE.parent.mkdir(exist_ok=True)
    if not ADMIN_KEY_FILE.is_file():
        ADMIN_KEY_FILE.write_text(secrets.token_urlsafe(24), encoding="utf-8")
    hosts = site_host + (f", {also}" if also and also != site_host else "")   # Caddy serves (and certifies) each
    lines = [f"SITE_HOST={hosts}", f"IAV_ADMIN_TOKEN={ADMIN_KEY_FILE.read_text(encoding='utf-8').strip()}",
             f"IAV_INBOX_URL=https://{site_host}/contact/inbox"]
    notify = (load_config().contact.notify_to or "").strip()
    if notify:
        lines.append(f"IAV_NOTIFY_TO={notify}")
    smtp = ROOT / "secrets" / "smtp.json"
    if smtp.is_file():
        s = json.loads(smtp.read_text(encoding="utf-8"))
        if s.get("username") and s.get("password"):
            lines += [f"IAV_SMTP_USER={s['username']}", f"IAV_SMTP_PASSWORD={s['password'].replace(' ', '')}"]
    return "\n".join(lines) + "\n"


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--host", required=True, help="the server's public IP address")
    ap.add_argument("--user", default="ubuntu", help="SSH user (Ubuntu images: ubuntu)")
    ap.add_argument("--domain", help="your own domain pointing at the server (default: <ip>.sslip.io)")
    a = ap.parse_args()
    if not KEY.is_file():
        sys.exit(f"SSH key {KEY} not found.")
    target = f"{a.user}@{a.host}"
    ip_name = f"{a.host.replace('.', '-')}.sslip.io"
    site_host = a.domain or ip_name                 # main address (links in emails use this one)

    print(f"== 1/5 connecting to {target}")
    ssh(target, "echo connected: $(uname -m) $(. /etc/os-release; echo $PRETTY_NAME)")

    print("== 2/5 building the upload folder")
    folder = build(DEFAULT_OUT)
    for name in ("docker-compose.yml", "Caddyfile"):
        shutil.copy2(ROOT / "deploy" / "oracle" / name, folder / name)
    import build_seo_pages                          # fresh Learn pages + full sitemap, served by Caddy from ./seo
    build_seo_pages.main()
    shutil.copytree(build_seo_pages.OUT, folder / "seo")

    print("== 3/5 preparing the server (first time takes a few minutes)")
    if ssh(target, "command -v docker >/dev/null && docker compose version >/dev/null", check=False, quiet=True).returncode:
        subprocess.run(["scp", *SSH_OPTS, str(ROOT / "deploy" / "oracle" / "server_setup.sh"), f"{target}:/tmp/server_setup.sh"],
                       check=True)
        ssh(target, "sudo bash /tmp/server_setup.sh")
    else:
        print("   already prepared")

    print("== 4/5 uploading the site and its private settings")
    with tempfile.TemporaryDirectory() as tmp:
        tgz = Path(tmp) / "quantix.tgz"
        with tarfile.open(tgz, "w:gz") as tar:
            for p in sorted(folder.rglob("*")):
                if p.is_file():
                    tar.add(p, arcname=p.relative_to(folder).as_posix())
        envp = Path(tmp) / "env"
        envp.write_text(env_file(site_host, also=ip_name), encoding="utf-8", newline="\n")
        subprocess.run(["scp", *SSH_OPTS, str(tgz), str(envp), f"{target}:/tmp/"], check=True)
    # seo/ is bind-mounted into Caddy: empty it in place instead of deleting it, or Caddy keeps the old (deleted) folder
    ssh(target, f"set -e; mkdir -p ~/{REMOTE}/data ~/{REMOTE}/seo; cd ~/{REMOTE}; "
                "find . -mindepth 1 -maxdepth 1 ! -name data ! -name .env ! -name seo -exec rm -rf {} +; "
                "find seo -mindepth 1 -delete; "
                "tar -xzf /tmp/quantix.tgz; install -m 600 /tmp/env .env; rm -f /tmp/quantix.tgz /tmp/env; "
                "sudo chown -R 1000:1000 data")

    print("== 5/5 building and starting (first build ~5-10 min on the server)")
    ssh(target, f"cd ~/{REMOTE} && sudo docker compose up -d --build --remove-orphans && sudo docker image prune -f >/dev/null "
                "&& sudo docker compose restart caddy >/dev/null")      # re-read the Caddyfile and the fresh seo/ files
    ssh(target, "for i in $(seq 1 60); do "
                f"sudo docker compose -f ~/{REMOTE}/docker-compose.yml exec -T app python -c "
                "\"import urllib.request; urllib.request.urlopen('http://127.0.0.1:7860/api/v1/health')\" "
                "2>/dev/null && echo app healthy && break; sleep 5; done", check=False)
    print(f"""
Done.
  Website    : https://{site_host}
  Admin inbox: https://{site_host}/contact/inbox   (admin key: {ADMIN_KEY_FILE.relative_to(ROOT)})
  Logs       : ssh -i {KEY} {target} "cd {REMOTE} && sudo docker compose logs -f app"
The HTTPS certificate is issued on the first visit; if the browser warns in the first minute, wait and reload.""")


if __name__ == "__main__":
    main()
