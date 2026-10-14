"""Set up email alerts for contact-us messages (run once, in a terminal):

    .venv\\Scripts\\python.exe tools\\setup_email.py

It asks for the Gmail address that SENDS the alerts and its 16-character App Password (hidden while you type),
saves them in secrets\\smtp.json (git-ignored, left out of backups) and sends a test email to the address in
config.yaml -> contact.notify_to.

Gmail App Password: Google Account -> Security -> turn on 2-Step Verification -> "App passwords" -> create one
named "Quantix" -> copy the 16 letters. Your normal Gmail password will NOT work.
"""

from __future__ import annotations

import getpass
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from src import mailer  # noqa: E402
from src.config import load_config  # noqa: E402


def main() -> None:
    c = load_config().contact
    print("Quantix — email alerts for contact-us messages\n")
    print(f"Alerts will be sent TO : {c.notify_to or '(not set — edit contact.notify_to in config.yaml)'}")
    print(f"Mail server            : {c.smtp_host}:{c.smtp_port}\n")
    user = input("Gmail address that SENDS the alerts (Enter = same as above): ").strip() or c.notify_to
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[A-Za-z]{2,}", user or ""):
        sys.exit("That is not an email address.")
    pw = getpass.getpass("App Password (16 letters, hidden): ").replace(" ", "")
    if len(pw) < 8:
        sys.exit("That does not look like an App Password (16 letters from Google Account -> Security -> App passwords).")
    mailer.SECRETS.parent.mkdir(parents=True, exist_ok=True)
    mailer.SECRETS.write_text(json.dumps({"username": user, "password": pw, "from_name": "Quantix"}, indent=2),
                              encoding="utf-8")
    print(f"\nSaved to {mailer.SECRETS} (git-ignored, not in backups).")
    print("Sending a test email …")
    try:
        r = mailer.send_test()
    except mailer.MailError as exc:
        sys.exit(f"\n✗ {exc.error_title}: {exc.error_content}")
    print(f"✓ Test email sent from {r['from']} to {r['to']}. Check that inbox (and Spam the first time).")
    print("New contact messages will now be emailed automatically (the server picks this up immediately).")


if __name__ == "__main__":
    main()
