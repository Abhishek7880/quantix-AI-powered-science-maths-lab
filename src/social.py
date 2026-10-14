"""Public social-media links shown in the site footer and on the Contact page (config.yaml → social:).

Each setting takes a full profile URL or just the username / handle. Only https links to the platform's own
domain are published, so a typo or a pasted "javascript:" link can never end up on the page.
"""

from __future__ import annotations

import logging
import re
from urllib.parse import urlsplit

log = logging.getLogger(__name__)

# id: (display name, the platform's domains, profile URL for a bare handle) — also the order shown on the site
PLATFORMS: dict[str, tuple[str, tuple[str, ...], str]] = {
    "github": ("GitHub", ("github.com",), "https://github.com/{}"),
    "linkedin": ("LinkedIn", ("linkedin.com",), "https://www.linkedin.com/in/{}"),
    "instagram": ("Instagram", ("instagram.com",), "https://www.instagram.com/{}"),
    "youtube": ("YouTube", ("youtube.com", "youtu.be"), "https://www.youtube.com/@{}"),
    "x": ("X (Twitter)", ("x.com", "twitter.com"), "https://x.com/{}"),
    "facebook": ("Facebook", ("facebook.com", "fb.com"), "https://www.facebook.com/{}"),
    "threads": ("Threads", ("threads.net", "threads.com"), "https://www.threads.net/@{}"),
    "telegram": ("Telegram", ("t.me", "telegram.me"), "https://t.me/{}"),
    "whatsapp": ("WhatsApp", ("wa.me", "whatsapp.com"), "https://wa.me/{}"),   # phone number with country code
    "discord": ("Discord", ("discord.gg", "discord.com"), "https://discord.gg/{}"),
}
_HANDLE = re.compile(r"[A-Za-z0-9._-]{1,100}")


def profile_url(platform: str, value: str) -> str | None:
    """A safe https profile URL for one setting, or None when it is empty or not a link to that platform."""
    value = str(value or "").strip()          # YAML reads a bare phone number as an int
    if not value or platform not in PLATFORMS:
        return None
    _, domains, template = PLATFORMS[platform]
    low = value.lower()
    looks_like_url = "://" in value or "/" in value or any(low.startswith((d, "www." + d)) for d in domains)
    if looks_like_url:
        parts = urlsplit(value if "://" in value else "https://" + value)
        host = (parts.hostname or "").lower()
        if parts.scheme.lower() not in ("http", "https") or not any(host == d or host.endswith("." + d) for d in domains):
            log.warning("social.%s ignored: not a %s link (%r)", platform, PLATFORMS[platform][0], value)
            return None
        return parts._replace(scheme="https", query="", fragment="").geturl()   # drops share trackers like ?si=…
    handle = value.lstrip("@")
    if platform == "whatsapp":
        handle = re.sub(r"[\s+()-]", "", handle)
        if not re.fullmatch(r"\d{8,15}", handle):
            log.warning("social.whatsapp ignored: use the phone number with country code, e.g. 919876543210")
            return None
    elif not _HANDLE.fullmatch(handle):
        log.warning("social.%s ignored: %r is neither a profile link nor a username", platform, value)
        return None
    return template.format(handle)


def author(settings) -> dict[str, str] | None:
    """The footer signature: name, title, email (mailto), phone (tel) and link — each only when valid."""
    name = re.sub(r"\s+", " ", str(getattr(settings, "name", "") or "")).strip()[:60]
    if not name:
        return None
    out = {"name": name, "title": re.sub(r"\s+", " ", str(getattr(settings, "title", "") or "")).strip()[:80]}
    email = str(getattr(settings, "email", "") or "").strip()
    if re.fullmatch(r"[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}", email):
        out["email"] = email
    digits = re.sub(r"[\s()-]", "", str(getattr(settings, "phone", "") or ""))
    if re.fullmatch(r"\+?\d{8,15}", digits):
        d = digits.lstrip("+")
        out["phone_tel"] = "+" + d
        out["phone"] = f"+{d[:-10]} {d[-10:-5]} {d[-5:]}" if len(d) > 10 else "+" + d    # +91 70803 97264
    url = str(getattr(settings, "url", "") or "").strip()
    parts = urlsplit(url)
    if parts.scheme == "https" and parts.hostname:
        out["url"] = url
    return out


def links(settings) -> list[dict[str, str]]:
    """[{id, name, url}] for every platform that has a valid setting, in display order."""
    out = []
    for pid, (name, _, _) in PLATFORMS.items():
        url = profile_url(pid, getattr(settings, pid, ""))
        if url:
            out.append({"id": pid, "name": name, "url": url})
    return out
