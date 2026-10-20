# Workspace notes — Quantix (industrial-ai-vision)

**Quantix — AI-powered science & maths lab** is the site's name (renamed from "AI Vision Lab" on 14 Oct 2026). The
folder, the `iav-*` browser-storage keys and the `IAV_*` environment variables keep their old names on purpose so
saved settings keep working.

Hand-over notes for this workspace: what exists, where it lives, how to run it, how to restore it from a backup,
and how to continue the work. The README explains each feature in depth; this file is the map.

*Last updated: 14 Oct 2026. Test suite: 262 passed.*

---

## 1. What this project is

A local web app + REST API for students and shop-floor use, running on `http://127.0.0.1:8000`:

| Page | URL | What it does |
|---|---|---|
| **Image Inspection** (home) | `/` | Upload a photo → YOLO detects 2D/3D shapes → name, rotatable 3D model, every mensuration formula with working; animated "science lab" hero, live counters, tool tiles, auto-flashing **formula cards** |
| **Formula Library** | `/formulas` | 1,022 formulas in 10 categories (maths, mensuration with sketches, physics units & formulas), search, PDF download per section/category/all, **English / हिन्दी** (page + PDFs), **🧮 calculator** (≈345 formulas, solve for any variable with steps, custom formulas) |
| **Measure** | `/measure` | Real sizes from a photo with a coin / card / A4 / ruler scale: distance, circle, area tools, auto-measure detected shapes with their formulas |
| **Periodic Table** | `/elements` | 118 elements, colour modes and heat-maps, temperature / discovery sliders, Bohr-model details, molar-mass calculator, EN/हिन्दी |
| **Physics Lab** | `/physics` | Projectile, pendulum, spring SHM, collisions, lens ray diagram, circuits — sliders + live values with formulas |
| **Equation Solver** | `/handwriting` | Write / photograph one line of maths → read (tap to correct) → solved step by step or plotted |
| **Contact us** | `/contact`, `/contact/inbox` | Contact form with ticket numbers (also a quick form on Home and a footer link on every page); admin inbox with the key from `outputs/contact/admin_token.txt` |
| **Unit Converter** | `/converter` | 17 quantities, 150 units incl. Indian (gaj, tola, quintal, lakh/crore/arab), quick convert ("5 km to mi"), all-units table, EN/हिन्दी |
| **Graph Plotter** | `/graph` | 2D Cartesian (lines, curves, trig, points, polygons, sliders) and 3D (planes, surfaces) |
| REST API docs | `/docs` | FastAPI Swagger; every JSON response uses `{code, success, message, data \| error{errorCode, errorTitle, errorContent}}` |

Also: CLI training / evaluation / ONNX export (`src/train.py`, `src/evaluate.py`, `src/export_model.py`), live camera
prediction (`src/predict_camera.py`) and a Streamlit dashboard (`app.py`).

## 2. Environment (the one that works)

| Item | Value |
|---|---|
| OS | Windows 10 Pro, CPU only |
| Python | 3.14.2, virtual env in `.venv\` (not in backups — recreate it) |
| Key packages | torch 2.9.1+cpu · ultralytics 8.4.176 (YOLO11) · fastapi 0.143 · sympy 1.14 · fpdf2 2.8.9 · uharfbuzz 0.56.3 · streamlit 1.65 |
| Exact versions | `requirements.lock.txt` (pip freeze); loose versions: `requirements.txt` |
| Fonts | `src/fonts/` Noto Sans Devanagari (Hindi PDFs, SIL OFL); DejaVu from matplotlib (maths symbols in PDFs); web pages load Space Grotesk + JetBrains Mono from Google Fonts with system-font fallback |

**torch DLL fix (Windows, needed once per new venv):** if `import torch` fails with `WinError 1114 … c10.dll`,
install the latest *Microsoft Visual C++ Redistributable x64*; on this machine the working fix was copying the
signed `msvcp140*.dll` (14.44) files into `.venv\Lib\site-packages\torch\lib\`.

## 3. Run / stop

```powershell
cd D:\Abhishek\Repos\industrial-ai-vision
.\start_ui.bat                 # stops any old server, starts the supervisor, prints the page URLs
# or:  .venv\Scripts\python.exe -m src.serve       (supervisor: restarts the API when src\*.py changes)
.\stop_server.ps1              # stops the server process tree (never touches a running training job)
.venv\Scripts\python.exe -m pytest -q              # 262 tests
```

**Publish / update the public site** (Hugging Face Space, free):
```powershell
.venv\Scripts\python.exe tools\deploy_space.py --build-only   # assemble + privacy check only
.venv\Scripts\python.exe tools\deploy_space.py                # + upload; asks for a Write token (hidden), sets Space secrets
```
Run the second line again after every change. The hosted copy runs in public mode (`IAV_PUBLIC=1`).

If PowerShell refuses `Activate.ps1` (execution policy), you don't need to activate: call `.venv\Scripts\python.exe`
directly as above. Static pages (`src\web\*`) are read per request — just refresh the browser after editing them.

## 4. Where things live

```
industrial-ai-vision/
├── WORKSPACE.md  README.md  requirements.txt  requirements.lock.txt  config.yaml  start_ui.bat  stop_server.ps1
├── models/                  trained weights: shapes_mensuration/best.pt (default shape model), handwriting/symbols.pt, synthetic_demo/, pretrained/
├── tools/                   build_elements.py, make_measure_sample.py, train_handwriting.py
├── datasets/  examples/     training data (shapes_dataset, synthetic_dataset) · dataset/ = your own YOLO dataset
├── samples/                 sample images + video for quick tests
├── outputs/                 runs, evaluations, predictions, logs (server_stdout.log / server_stderr.log)
├── src/
│   ├── api.py               all REST routes + page routes (/, /formulas, /converter, /graph)
│   ├── serve.py             dev supervisor (auto-restart)
│   ├── formulas.py          formula library loader, Hindi translation merge, PDF builder (fpdf2)
│   ├── formula_calc.py      🧮 calculator: library notation → SymPy, solve for any variable, steps, index of calculable formulas
│   ├── sketches.py          27 mensuration sketches (SVG for pages, PNG for PDFs)
│   ├── chemistry.py         periodic-table data + molar-mass parser
│   ├── measure.py           reference finding (coins / cards), real-size shape measurement
│   ├── handwriting.py       handwriting → symbols → equation; SymPy solving and plot points
│   ├── contact.py           contact messages: validation, spam limits, SQLite storage, admin key
│   ├── social.py            social links + footer signature (config.yaml social: / author:)
│   ├── mailer.py            email alerts over SMTP (Gmail App Password from secrets/smtp.json)
│   ├── inference.py train.py evaluate.py export_model.py predict_*.py dataset_utils.py shapes_dataset.py
│   ├── knowledge/
│   │   ├── mensuration.json                 shapes the detector knows (formulas + variables)
│   │   └── formulas/NN_*.json               one category per file: {id,title,icon,order,description,sections[{title,items:[[name,formula,note]]}]}
│   │       ├── mensuration_extra.json       extra shapes (sector, annulus, kite, frustum …)
│   │       ├── calc_glossary.json           calculator variable names per category: symbol → [English, Hindi, default]
│   │       └── i18n/hi/*.json               English string → Hindi (pure maths is left untranslated on purpose)
│   ├── fonts/               Noto Sans Devanagari + OFL licence
│   └── web/
│       ├── lab.css          SHARED THEME for every page (tokens, glass header, cards, buttons, dark/light, print, reduced motion)
│       ├── sci_bg.js        animated background (particles, floating equations) — included on every page
│       ├── index.html home_fx.js formula_cards.js shapes3d.js     home page, hero effects, formula cards, 3D viewer
│       ├── formulas.html    Formula Library + calculator drawer
│       ├── converter.html units.js                                 Unit Converter + unit data
│       ├── graph.html graph.js mathexpr.js                         Graph Plotter
│       ├── elements.html                                           Periodic Table
│       ├── measure.html  samples/measure_sample.jpg                Measure
│       ├── physics.html physics.js                                 Physics Lab
│       ├── handwriting.html                                        Equation Solver
│       └── vendor/three.min.js (r128)
└── tests/                   pytest (test_api, test_core, test_dataset_utils, test_shapes, test_formulas, test_formula_calc)
```

## 5. Conventions to keep

* **One theme:** visual changes go in `src/web/lab.css` (linked *after* each page's own `<style>`); pages keep only
  layout. `--accent`, `--ink`, `--muted` must stay plain hex — the 3D viewers read them into `THREE.Color`.
  `graph.js` paints its canvas with `--panel-solid`.
* **Layout:** full screen width on every page (`body > main { max-width: none }`); header = brand (fixed 272 px) →
  tabs → page controls, identical on all pages.
* **Language:** one shared key `localStorage["iav-formula-lang"]` = `"en"` / `"hi"` (plain string, not JSON).
  New formula text needs a Hindi entry in `i18n/hi/`; `tests/test_formulas.py` fails if worded strings lack one.
* **API errors:** raise the typed errors in `src/errors.py` (`InputValidationError`, `ResourceNotFoundError`,
  `CalcError` …); never return ad-hoc JSON.
* **Calculator safety:** formula text is normalised to a strict ASCII whitelist before SymPy; keep that check
  (`normalise()` in `formula_calc.py`) when extending the notation.
* **Accessibility:** every animation stops under `prefers-reduced-motion`. **Everything must work by keyboard:**
  one shared focus ring (`:focus-visible` in `lab.css`; don't fight it with `outline: none`), a "Skip to content"
  link added by `site.js`, anything clickable is a `<button>`/link or gets `tabindex="0"` + Enter/Space, dialogs move
  focus in, trap Tab, close on Esc and return focus to the opener. Keyboard routes: `/` search, ← → cards, arrow keys
  in the periodic table, 3D viewer and graphs; Measure canvas = arrows move a cross-hair, Enter places a point,
  Shift+Enter closes an area, Ctrl+arrows pan; Solver = type the equation instead of drawing, symbol menu with arrows.

## 6. Backup & restore

**Backups** are zip files in `D:\Abhishek\Backups\industrial-ai-vision\`, named
`industrial-ai-vision_YYYY-MM-DD_HHMM.zip`. They contain everything except `.venv\`, `__pycache__\` and
`.pytest_cache\` (models, datasets, samples, outputs and all code are included). Note: that includes the contact
messages and `outputs/contact/admin_token.txt` — keep backups private. `secrets/` (the email password) is left out:
after a restore, run `tools/setup_email.py` again.

> **Own git repository:** https://github.com/Abhishek7880/quantix-AI-powered-science-maths-lab (public, branch `main`,
> commits as Abhishek Yadav <abhishekyadav24991@gmail.com>). The folder sits inside the `D:\Abhishek\Repos` work
> repository, which ignores it through its local `.git/info/exclude` — never commit this project there.
> Save changes to GitHub: `git add -A`, `git commit -m "…"`, `git push`. Not on GitHub (see `.gitignore`): `.venv`,
> `outputs` (contact messages, admin key), `secrets`, datasets and training images, all models except the two the site needs.

**Make a new backup** (from the project folder; the zip is verified after writing):
```powershell
.venv\Scripts\python.exe make_backup.py                  # -> D:\Abhishek\Backups\industrial-ai-vision\
.venv\Scripts\python.exe make_backup.py --dest E:\USB     # e.g. a pen drive or cloud-synced folder
```
Keep at least one copy off this disk (pen drive / cloud) — a backup on the same drive does not survive a disk failure.

**Restore on this or a new PC:**
1. Unzip so you get `…\industrial-ai-vision\` (e.g. back into `D:\Abhishek\Repos\`).
2. Install Python 3.14 (64-bit), then in that folder:
   ```powershell
   py -3.14 -m venv .venv
   .venv\Scripts\python.exe -m pip install --upgrade pip
   .venv\Scripts\python.exe -m pip install -r requirements.lock.txt --extra-index-url https://download.pytorch.org/whl/cpu
   ```
   (`requirements.txt` instead of the lock file if a pinned version is no longer available.)
3. If `import torch` fails with WinError 1114, apply the DLL fix in §2.
4. `.venv\Scripts\python.exe -m pytest -q` → expect all tests to pass (262), then `.\start_ui.bat`.

## 7. Work log

| Date | Done |
|---|---|
| 13 Oct 2026 | Project built end to end: YOLO training/inference/camera/evaluation/ONNX, REST API with error envelope, upload page, 2D/3D shape recogniser with mensuration + rotatable transparent 3D model (labels, diagonals, manual lines), Graph Plotter (2D/3D, sliders), dev supervisor. Train page removed on request. Formula Library (1,022 formulas, sketches, PDFs). |
| 20–21 Oct 2026 (PDF branding) | Formula PDFs (every category, section, EN + HI): **brand card** header on every page (light gradient rounded card: Quantix atom drawn as vectors + "Quantix" + "AI-POWERED SCIENCE & MATHS LAB", "CRAFTED BY Abhishek Yadav" on the right, blue → violet line) + the same logo and text as a **16 % background watermark**, drawn last so tables don't hide it (`src/formulas.py` `header()` / `watermark()`, `WATERMARK_OPACITY`). |
| 17 Oct 2026 (main object) | Auto on photos asks both models and keeps the **main object** (large, central, confident: `main_subjects()`); background TV/keyboard dropped (tiffin → tin can → cylinder); 3D view follows the first (main) object. |
| 17 Oct 2026 (everyday fixes + measure + corrections) | **Photo vs drawing by colour flatness** (`everyday.flatness`: share of 4 most common colours; drawings 0.63–0.99, photos 0.26–0.68): < 0.55 photo, 0.55–0.80 photo unless shapes model ≥ 0.85, else drawing. Photos never use the shapes model's guess (it called a user's glass "cuboid 0.88"). **Measure auto-measure** now uses Auto (object name, shape, sizes, capacity in ml; explicit model keeps old path). **Corrections**: home "✏️ Wrong? Help Quantix learn" → `POST /api/v1/feedback/everyday` (`src/feedback.py`, consent required, EXIF-free JPEG, 10/h per visitor, max 3,000) stored in outputs/feedback/everyday (server: ~/quantix/data/feedback). `tools/train_everyday.py --pull/--train` fine-tunes yolo11n (≥20 examples per object) → `models/everyday_ft/best.pt`, which Auto then tries first on photos (deploy includes it when present). Saved "" model preference now opens Auto. 288 tests. |
| 17 Oct 2026 (everyday objects) | **Auto mode** (home page default "✨ Auto — shapes + everyday objects"): `src/everyday.py` decides photo vs drawing — YOLO11n confident (≥0.5) about anything ⇒ real photo ⇒ everyday objects (YOLO11n 33 mapped COCO objects, else open-vocabulary YOLO-World `models/everyday/everyday.pt` with 102 extra objects incl. Indian ones, built by `tools/build_everyday_model.py`), otherwise the shapes model if ≥0.85, else open vocabulary, else shapes. Each object → its shape (mug → cylinder…) so the 3D model + formulas work; duplicate boxes merged; notes like "tapered glass ≈ frustum". Measured on COCO128 (242 objects): open-vocab alone 29 % found / 37 % right vs YOLO11n 47 % / 64 % — hence the chain. Live: user's mug/cup/glass all → cylinder, drawings unchanged; ~1.2 s per photo warm on the Micro server, app 215 MB with all 3 models. Test images in `datasets/everyday_test/` (git-ignored). |
| 17 Oct 2026 (formula pages) | **690 per-formula pages** (`/learn/formulas/<cat>/<section>/<formula>/`, EN + HI) for every calculable formula: search-style title ("Volume of a Sphere" / "गोले का आयतन"), letters explained, **solved example computed by the real calculator** (682/690; values 7, 5, 10…), built-in calculator (`src/web/learn.js` → `/api/v1/formulas/calc/solve`, keyboard-friendly form), how-to steps, FAQ + FAQPage JSON-LD; topic pages link to them. Examples run in parallel processes with a 20 s limit and are cached in `build/formula-examples.json` (a stuck SymPy solve used to block the 2-thread pool for hours). Total 2,487 Learn pages, sitemap 2,496 URLs, IndexNow accepted. |
| 16 Oct 2026 (IndexNow) | IndexNow key in config.yaml `site.indexnow_key`, served at `/<key>.txt`; `tools/indexnow_submit.py` sends the live sitemap (1,806 URLs accepted) to Bing/Yandex/Seznam/Naver — run after big deploys. Google has no submit API: sitemap resubmit + URL inspection stay manual in Search Console. **Deploy fix:** `seo/` is bind-mounted into Caddy, so deploy now empties it in place (deleting it left Caddy serving a deleted folder → 404) and restarts Caddy. |
| 16 Oct 2026 (Learn pages / SEO) | **1,797 Google-readable "Learn" pages** from `tools/build_seo_pages.py` → `build/seo/` (git-ignored, rebuilt by every `deploy_oracle.py` run): 110 formula sections ×EN/HI (`/learn/formulas/<cat>/<section>/`, 🧮 links into the calculator), 118 elements ×EN/HI (`/learn/elements/<name>/`), 1,335 unit conversions (`/learn/convert/<a>-to-<b>/`, units read from units.js with Node) + hubs; canonical, hreflang, BreadcrumbList, shared `src/web/learn.css`; full `sitemap.xml` (1,806 URLs). On the server **Caddy serves them as files** (compose mounts `./seo`), the app never sees them; locally FastAPI mounts them for preview. Footer "📚 Learn" links on every page (Lite site links to the main domain). 270 tests. |
| 15 Oct 2026 (domain) | Free domain **https://quantix-ai-abhi.duckdns.org** (DuckDNS, A record → 144.24.129.250; DuckDNS fills in the PC's own IP when a name is added — change it to the server IP). `tools/deploy_oracle.py --host 144.24.129.250 --domain quantix-ai-abhi.duckdns.org` serves both it and the sslip.io name (Caddy certifies each). |
| 15 Oct 2026 (Oracle LIVE) | **Full Quantix online: https://144-24-129-250.sslip.io** — Oracle Cloud Always Free **VM.Standard.E2.1.Micro** (x86, 1 GB RAM + 4 GB swap, Ubuntu 24.04, Hyderabad; Ampere A1 was out of capacity at every size). Docker Compose: app (public mode) + Caddy (Let's Encrypt HTTPS, HTTP→HTTPS). Login `ssh -i ~/.ssh/quantix_oracle ubuntu@144.24.129.250`; site in `~/quantix`, contact messages in `~/quantix/data`; admin key `secrets/space_admin_key.txt`. Update: `tools/deploy_oracle.py --host 144.24.129.250`. Verified: all pages, photo AI (27 s cold, ~3 s warm), measure, handwriting, calculator, PDFs, Gmail alerts. `server_setup.sh`: swap first; firewall rule inserted above Oracle's REJECT rule. |
| 14 Oct 2026 (LIVE) | **Quantix Lite is online (free): https://abhishek7080-quantix.static.hf.space** — Hugging Face Static Space `Abhishek7080/quantix` (Docker Spaces need PRO, Oracle had no ARM capacity). `tools/build_static.py --upload` rebuilds + uploads (needs `hf auth login`). Works: everything except photo AI (shape detection, auto-measure, handwriting photos → "full version" note). Calculator, equation solver and molar mass run the project's own Python in the browser via Pyodide 0.28.3 (`deploy/static/static_api.js`); 242 PDFs pre-built; contact form via Web3Forms once `contact.web3forms_key` is set in config.yaml. `src/eqsolve.py` split out of handwriting.py. |
| 14 Oct 2026 (deploy + signature) | **Hosting prepared for Hugging Face Spaces** (free Docker CPU): public mode `IAV_PUBLIC=1` (owner-only routes 403, heavy AI routes 40/min per visitor, visitor photos not stored, only own `models/*.pt` loadable, minimal system info), `deploy/huggingface/` (Dockerfile on python:3.14-slim + CPU torch, pinned `requirements-deploy.txt`, Space README), `tools/deploy_space.py` (builds `D:\Abhishek\Deploy\quantix-space`, refuses to publish private values, uploads with `huggingface_hub`, sets Space secrets IAV_ADMIN_TOKEN / IAV_SMTP_USER / IAV_SMTP_PASSWORD / IAV_NOTIFY_TO and variable IAV_INBOX_URL; Space admin key saved in `secrets/space_admin_key.txt`). Image built and smoke-tested locally in Docker (all pages, prediction 3.8 s, measure, handwriting, EN/HI PDFs, calculator, contact + inbox). **Footer signature** on every page: "Designed & built by *Abhishek Yadav*" (handwriting font, writes itself once) + title, email, phone from `author:` in config.yaml (email/phone inserted by script, not in page source); `<meta name="author">`. |
| 14 Oct 2026 (social) | Social-media links: `social:` in config.yaml (GitHub, LinkedIn, YouTube set; Instagram, X, Facebook, Threads, Telegram, WhatsApp, Discord ready) → brand icons in the footer of every page + "Follow us" on the Contact page (EN/हिन्दी). `src/social.py` accepts a URL or username, publishes only https links to that platform's own domain, strips share trackers (?si=, ?utm_…); `GET /api/v1/social` re-reads config.yaml, so edits show on refresh. Icons: `src/web/social_icons.js` (Simple Icons, CC0). Footer stacks on phones. |
| 14 Oct 2026 (keyboard) | Full keyboard access, audited page by page with an automated Tab-through: shared focus ring + "Skip to content" (EN/हिन्दी) on every page, Measure canvas cross-hair (arrows / Enter / Shift+Enter / Ctrl+arrows), formula cells copy with Enter, home result images open the lightbox with Enter and focus returns on Esc, Solver symbol menu takes focus + arrow keys + Esc back to the symbol. |
| 14 Oct 2026 (late night) | Renamed the site to **Quantix — AI-powered science & maths lab**: header brand + kicker on every page, browser-tab titles ("Page · Quantix", kept when switching language), footer name + tagline (EN/हिन्दी), email sender name and subjects, Swagger title "Quantix API". Email alerts activated (sender = ay2276770@gmail.com) and verified live; SMTP send now retries once on a dropped connection. |
| 14 Oct 2026 (night) | Email alerts for contact messages to ay2276770@gmail.com (`src/mailer.py`, `tools/setup_email.py`, `secrets/smtp.json` — needs a Gmail App Password; Reply-To = visitor; test button in the inbox). |
| 14 Oct 2026 (evening) | Contact-us system: `/contact` form with ticket numbers, home quick form, footer on every page (`site.js`), admin inbox `/contact/inbox` (status, notes, reply by email, CSV, delete), SQLite storage, spam trap + rate limit. |
| 14 Oct 2026 (later) | Periodic Table (`/elements`, data built from mendeleev, Hindi names/uses, molar mass) · Measure (`/measure`, coin/card auto-scale ±1 %, real-size shape formulas, sample photo) · Physics Lab (`/physics`, 6 simulations verified against textbook answers) · Equation Solver (`/handwriting`, own CNN on HASYv2 + MNIST + synthetic parentheses, SymPy steps, plots, `/graph?e=`) · short 8-tab menu · cell text fits on any screen. |
| 14 Oct 2026 | Hindi for the whole library + Hindi PDFs · 🧮 formula calculator (SymPy, solve for any variable, degrees, steps, custom formulas) · Unit Converter page · home-page formula cards · "science lab" redesign (animated background, hero, tiles, glass UI) applied to every page through shared `lab.css` · bigger 3D viewer + ⛶ Big view · identical headers · full-screen-width layout · this file, lock file and first zip backup. |

## 8. Ideas not built yet (suggested earlier)

Practice quiz / flashcard deck with spaced repetition and score · solver for derivatives / integrals · shortcut / Vedic-maths tricks · previous-year-style question bank + mock tests · bookmarks → "my
revision sheet" PDF · NCERT chapter mapping · chemistry module (periodic table, molar mass, equation balancer) ·
matrix & statistics tools · more graph tools (intersections, area under curve, polar) · offline PWA · more Indian
languages · daily formula with streaks.
