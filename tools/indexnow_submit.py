"""Tell Bing, Yandex, Seznam and Naver about every page in the live sitemap (IndexNow; Google doesn't take part).

    .venv\\Scripts\\python.exe tools\\indexnow_submit.py

Reads https://<site>/sitemap.xml, checks the key file /<key>.txt is live, then sends all URLs in one request.
Run it after a deploy that adds or changes many pages. Key: config.yaml site.indexnow_key.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path
from urllib.parse import urlsplit

import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src.config import load_config  # noqa: E402

site = load_config().site
base, key = site.public_url.rstrip("/"), site.indexnow_key.strip()
if not base or not key:
    sys.exit("Set site.public_url and site.indexnow_key in config.yaml first.")
check = requests.get(f"{base}/{key}.txt", timeout=30)
if check.status_code != 200 or check.text.strip() != key:
    sys.exit(f"Key file {base}/{key}.txt is not live yet ({check.status_code}) — deploy first.")
urls = re.findall(r"<loc>([^<]+)</loc>", requests.get(f"{base}/sitemap.xml", timeout=60).text)
r = requests.post("https://api.indexnow.org/indexnow", timeout=60, json={
    "host": urlsplit(base).hostname, "key": key, "keyLocation": f"{base}/{key}.txt", "urlList": urls[:10000]})
meaning = {200: "accepted", 202: "accepted (key being checked)", 400: "bad request", 403: "key not valid",
           422: "URLs don't belong to the host", 429: "too many requests — try later"}
print(f"IndexNow: {r.status_code} {meaning.get(r.status_code, '')} — {len(urls)} URLs sent for {urlsplit(base).hostname}")
