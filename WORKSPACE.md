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
| 30 Oct 2026 (Circuit Lab like DCACLab, app 1.4) | **Realistic view** (`circuit_real.js`, default): canvas-drawn parts (colour-band resistors, glowing LEDs and bulbs, spinning fan/motor, batteries with their voltage, bench supply with live V/A, DIP chips, MCB, relay…) on a perforated board (6 colours) with insulated coloured wires (per wire, right-click) and solder joints; Schematic and 3D PCB views remain. **Damage like a real bench**: overload heats a part (heat bar green→red, smoke) and it burns after ~4 s (heavy) / 7 s (light), then stops working; tap it → 🔧 Repair (`burnCheck` stress model; new ratings for motor/fan/buzzer/bell/relay coil/pot/LDR/NTC/7-segment/DMM fuse). New parts: fan, bell, MCB breaker (B/C/D curves, thermal + magnetic trip, click to reset), optocoupler PC817, digital multimeter (V⎓ V~ A⎓ A~ Ω continuity; click turns the dial; OL), wattmeter (average power), **breadboard** (columns and rails really connect, rail gaps), text notes, IC pins. **IC creator**: a slide with ⊸ IC pins becomes a chip under My ICs (expanded into its parts by the engine, saved with the circuit / link). **Kirchhoff analysis** dialog (KCL per node, KVL per independent loop), **NGSpice netlist** export (.cir with models), conventional / electron-flow current, **slides** (several circuits, rename, duplicate), copy / paste (Ctrl+C/V), flip (F), keyboard shortcuts dialog. Fixed: stray drawing code in the arrow-key handler threw on arrow keys near a pin. Engine checks: +20 (breadboard, DMM, wattmeter, breaker, fan, opto, custom IC, Kirchhoff, SPICE, flip, 440 V fan burns at ~4 s and is repaired). |
| 29 Oct 2026 (Live camera measure, app 1.3) | **📹 Live camera** on /measure (web + app): full-screen camera, frames of 960 px to `POST /api/v1/measure/live` (`measure.live_frame`: coin / card finder -> scale, outline regions -> 2D shape / 3D solid + real sizes + formulas; the two small models (COCO, shapes) settle solids and name objects only on every 6th frame, the page sends their labels back as `hints` in between; own rate limit 150/min, 2 frames at once; models warmed up at start in public mode). Page: outlines drawn on the whole frame (object-fit contain), tap an outline to measure that object, median of the last 7 frames with ✓ steady at 4 %, torch, front/back camera, **Freeze & measure** loads the sharp full frame with the scale from the live coin and runs the full auto-measure. Speed: ~0.6 s / frame on the Oracle VM (model frames ~2.3 s), 0.13 s on a PC. Coin finder: rim polarity may change only a few times round the circle (checkerboards / textures halved), circles mostly outside the frame rejected. COCO names only for objects that look 3D (no "frisbee" for a paper disc). App 1.3 (versionCode 4): WebView camera permission (`onPermissionRequest`), launcher shortcut **Live measure** (`/measure?live=1`). Live benchmark: shape 47/51, 2D/3D 49/51; full benchmark unchanged (49 / 49 / 40). |
| 28 Oct 2026 (app 1.2) | **Android app works fully offline**: `tools/build_app_bundle.py` packs every page, script, style, image and read-only data (elements, formulas en/hi, sketches, presets, models) into `android/app/src/main/assets/site` (90 files, 2.8 MB, git-ignored; run it before every APK build); `MainActivity.intercept` serves them when Android reports no validated internet or the server can't be reached; live-only API calls (photo AI, auto-measure, solver, PDFs, contact) get a native **Internet needed** dialog with **Turn on internet** (Settings panel); offline web fonts fail at once (they blocked page scripts). App-like UI (`site.js` app mode): bottom tab bar Home / Measure / Labs (sheet with 8 labs & tools) / Formulas / More, pull to refresh (not on lab boards), tap haptics, back closes sheet / menu / drawers first, Offline badge, native snackbar for offline / back online, More menu: share page, reload, share app, check for updates, version. Native splash kept until the first page draws; web progress line removed (spinner only after 700 ms); no page pinch-zoom; dark dialogs; old service worker unregistered in the app. Measure: photo counts as loaded only once its upload blob is ready (+ toDataURL fallback). Pages: server-unreachable messages no longer mention start_ui.bat. App 1.2 (versionCode 3), tested on the emulator in airplane mode. |
| 28 Oct 2026 (unknown objects) | Photo AI / Measure no longer say "nothing recognised" for things no model knows (e.g. a Mitsubishi E500 inverter in a rack): `everyday.outline_fallback` traces the main subject with GrabCut seeded from the middle of the frame (`shape_geometry.main_object`; neighbours and rails cut by the frame stay background) and names its shape from geometry -> "Unknown object -> cuboid (3D)", outline drawn on the photo and reused by Measure. Boxes without a detector label are always cuboid (depth not visible); top-face removal only when one straight edge crosses >= 70 % of the box (a label edge no longer cuts the height); straight top + bottom outline -> box, not cylinder; Measure skips leftover regions cut off by the frame. |
| 28 Oct 2026 (Measure 2D/3D) | **Measure traces each object's exact outline** (`src/shape_geometry.py`: background-difference regions + GrabCut, shadow cut to the object box) and decides **2D flat shape or 3D solid** from shading / inner edges (+ the detector's label): circle, ellipse (ellipse-fit check), triangle, square, rectangle, rhombus, pentagon, hexagon, polygon / sphere, hemisphere, cylinder (rim-curve tilt correction, handle ignored), cone, cube, cuboid (top face removed). A flat disc the model calls a ball stays a circle; a shaded drawing-model triangle becomes a cone. Reference circles scored by rim edges (`circle_score`), coin left out of the results (`ref_cx/ref_cy/ref_r`). `/api/v1/measure/shapes` auto mode -> `measure.analyse_photo`; page draws outlines and a 2D · flat / 3D · solid tag. Benchmark `tools/make_measure_bench.py` + `tools/measure_bench.py` (51 three.js scenes with known sizes): shape 36 -> 49, 2D/3D 42 -> 49, sizes within 10 % 17 -> 41. |
| 29 Oct 2026 (mobile) | Phones: compact 61 px header with ☰ menu drawer on every page (`lab.css` + `site.js`), finger-sized controls (42 px buttons, 16 px inputs), labs first (board / beaker / PLC machine at the top, lists below), periodic table scrolls sideways with bigger cells; Circuit Lab touch: pinch-zoom + two-finger pan, long-press menu, bigger pin targets, tap a part to place it. Offline: `src/web/sw.js` (served at /sw.js) caches the labs, formulas, converter, graphs, elements + data; PWA `manifest.webmanifest`. App 1.1 (versionCode 2): update check via `/web/app/version.json`, status / navigation bars follow the page theme (`QuantixAndroid.theme`), native share (`QuantixAndroid.share`, menu "📤 Share" + lab share buttons), screen stays on in labs, Hindi app label. Audit: header 24–31 % → 7 % of the screen; small tap targets Chem 88 → 20, PLC 57 → 10, Circuit 37 → 19. |
| 28 Oct 2026 (Android app) | **Quantix for Android** in `android/` (Java, no libraries, 225 KB): full live site in a WebView (all pages and labs, localStorage, WebGL), camera or gallery for photo uploads (own `CameraFileProvider`), downloads — blob:/data: links via a JS bridge to Downloads/Quantix (MediaStore), http PDFs via DownloadManager — back button history + double-back exit, external links in their own apps, offline screen with retry (EN/HI), splash + adaptive icon, app shortcuts (Circuit, Chem, PLC, Photo AI), opens quantix links. Build: `cd android; $env:JAVA_HOME=~\.jdks\jdk-17.0.13+11; .\gradlew assembleRelease` (signing key + passwords in git-ignored `secrets/android-release.jks` / `android-keystore.properties` — back these up, updates need the same key). APK served at `/web/app/Quantix.apk`, footer link "📱 Android app" (hidden inside the app). Tested on the Medium_Phone_API_37 emulator. |
| 28 Oct 2026 (wires + more chemistry) | Circuit Lab: native drag & drop from the parts list (mouse) + pointer path (touch), part grabbed by its body (pins only on the dot), ✂ Cut tool / right-click wire menu (cut here, insert part here, delete), drag a free wire end to stretch it, dropping a 2-pin part on a wire aligns and splices it in; cache-busting ?v= on lab scripts. Chemistry: spontaneous reactions (KMnO4 + glycerol, Al/Zn + I2 + water violet smoke, metals burning in Cl2/Br2, fluorine, H2 + Cl2, KClO3 + sugar + acid, sugar + conc. H2SO4 carbon snake, Zn + NH4NO3), ignition temperatures (white P 30 °C, Rb/Cs, Na…), thermal decompositions (NaHCO3 80 °C, CuSO4·5H2O, I2 sublimation, (NH4)2Cr2O7 volcano, CaCO3, CuCO3, KMnO4, Pb(NO3)2, NH4Cl, sugar, KClO3, H2O2), tests (limewater, Fe3+/SCN-, thiosulfate cloudiness, iodide + peroxide + starch, Benedict/Fehling, Tollens mirror, amphoteric Al/Zn, chlorine water bleach), coloured flames/smoke, flame-test button (Li pink-crimson, Sr red, Ba green, Cu blue-green…), 21 new experiments. |
| 28 Oct 2026 (Chem Lab + easier labs) | **/chemlab** (new "Chem Lab" tab): `chem_engine.js` rule-based reactions (neutralisation, carbonates, metal + acid/water by reactivity series, oxidising acid, displacement, precipitation by solubility rules, ammonium + alkali, halogen displacement, catalysts, Cu–NH3 complex, permanganate, burning/synthesis/thermite when heated), auto-balanced equations, rates, heat → temperature, pH + 4 indicators; all 118 elements + 49 compounds. `chem_ui.js`: shelf with periodic table, quick amounts/concentrations, 3D bench (beaker/flask/tube/crucible on a Bunsen burner, liquid colours, bubbles, precipitate, metal pieces, flames, glow, smoke, sparks), 19 experiments, "no reaction" explanations, safety notes, Hindi. Circuit Lab: drag parts, pin-to-pin wiring with snapping, quick-value chips + log slider, colour bands/SMD code, LED Vf/size, IEC/ANSI symbols, settings, right-click menu, 3D board colour. PLC Lab: instruction toolbox, + buttons, address chips, timer units/presets, machine settings, scan time. Tests: `tests/test_chemlab.py` + Node `tests/chem_engine_check.js`. |
| 27 Oct 2026 (PLC Lab) | **/plc** (new "PLC" tab): ladder logic simulator — `plc_engine.js` (scan cycle 10 ms; NO/NC/rising/falling/compare contacts, parallel branches; OUT/SET/RST, TON/TOF/TP, CTU/CTD, RES; IEC 61131-3 Structured Text export; 6 example programs) + `plc_ui.js` (ladder editor with live power flow, add contact/branch/output/rung, properties, tag names, push-button/switch/sensor inputs, animated machines: motor, traffic junction, water tank with level sensors, conveyor with photo-eye, beacon, star–delta; save/open/share, Hindi, keyboard). Tests: `tests/test_plc.py` + Node `tests/plc_engine_check.js`. |
| 27 Oct 2026 (Circuit Lab) | **/circuit** (new "Circuits" tab on every page): browser-side circuit simulator (`circuit_sim.js`: nodal analysis, Norton sources, backward-Euler C/L/transformer, Newton–Raphson with junction limiting) with 40 parts (sources, R/C/L/pot/transformer, diodes/LED/Zener/BJT/MOSFET, op-amp, 555, gates, switches/relay/fuse, lamp/motor/buzzer/7-seg/meters, LDR/NTC), damage (parts burn), current-flow dots, 2-channel oscilloscope, 12 verified examples (`circuit_examples.js`), editor with undo/redo, save/open/share/PNG/BOM, Hindi, keyboard (`circuit_ui.js`), 3D PCB view loaded on demand (`circuit_3d.js`). Tests: `tests/test_circuit.py` + Node `tests/circuit_sim_check.js`. |
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
