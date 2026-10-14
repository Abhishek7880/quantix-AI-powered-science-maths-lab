# Industrial AI Vision

Train a custom **YOLO object / defect detector** on your own images, then run it on images, video files or a
**live camera**. Everything is available as a **REST API** (FastAPI), command-line tools, and an optional
**Streamlit dashboard**.

On top of that, a student-friendly web app, **Quantix — AI-powered science & maths lab** (`start_ui.bat` → http://127.0.0.1:8000):
shape recognition with a 3D model and mensuration, a 1,022-formula **Formula Library** (English / हिन्दी, PDFs,
🧮 step-by-step calculator), a **Unit Converter** and a **Graph Plotter** — all in one animated "science lab" design.

> 📒 **New here or restoring from a backup? Start with [WORKSPACE.md](WORKSPACE.md)** — the map of the project,
> the exact working environment, run / backup / restore steps and the work log.

> ⚠️ **Safety & validity**
> * A model is only as good as its data. **Validate it on representative images from your own line, lighting
>   and cameras before any production use.**
> * **Do not** connect this system to machinery, PLCs, interlocks or emergency-stop circuits without a separately
>   engineered and safety-validated integration.
> * Confidence scores are model scores, **not calibrated probabilities**.
> * FPS and latency figures are only meaningful when **measured on the target hardware**.

---

## 1. What's inside

```
industrial-ai-vision/
├── WORKSPACE.md                # hand-over notes: map, environment, run / backup / restore, work log
├── config.yaml                 # your settings (class names, device, training defaults, camera)
├── app.py                      # Streamlit dashboard (client of the REST API)
├── requirements.txt            # loose versions
├── requirements.lock.txt       # exact versions of the working environment (pip freeze)
├── make_backup.py              # zip backup of the project (without .venv)
├── start_ui.bat / stop_server.ps1   # start / stop the web app
├── pytest.ini
├── dataset/                    # YOUR dataset (YOLO format)
│   ├── images/{train,val,test}/
│   ├── labels/{train,val,test}/
│   └── data.yaml
├── examples/synthetic_dataset/ # SYNTHETIC shapes demo dataset (NOT industrial data)
├── samples/                    # sample images + sample video for prediction tests
├── models/                     # trained checkpoints (models/<run>/best.pt) + registry.json
├── outputs/
│   ├── runs/train/<run>/       # full training runs: weights, curves, plots, experiment.json
│   ├── evaluations/<split>_<ts>/  # evaluation reports, confusion matrix, PR curves
│   ├── predictions/            # annotated prediction images + CSV/JSON
│   ├── snapshots/              # camera snapshots (raw + annotated)
│   └── logs/                   # logs, detection CSVs, training status
├── src/
│   ├── config.py               # central configuration
│   ├── errors.py               # typed errors -> HTTP status + error code/title/content
│   ├── utils.py                # logging, device selection, safe paths, model registry, training lock
│   ├── dataset_utils.py        # validate / split / data.yaml / synthetic data
│   ├── train.py                # training (transfer learning)
│   ├── inference.py            # Detector class (model inference only)
│   ├── predict_image.py        # image / folder prediction
│   ├── predict_camera.py       # live camera / video prediction (OpenCV)
│   ├── evaluate.py             # metrics on val / test split + latency benchmark
│   ├── export_model.py         # ONNX export + validation
│   ├── api.py                  # REST API (FastAPI) + page routes
│   ├── serve.py                # dev supervisor (auto-restart on src/*.py changes)
│   ├── formulas.py             # Formula Library: data, Hindi merge, PDF builder
│   ├── formula_calc.py         # 🧮 formula calculator (SymPy)
│   ├── sketches.py             # mensuration sketches (SVG / PNG)
│   ├── knowledge/              # mensuration.json, formulas/*.json, calc_glossary.json, i18n/hi/*.json
│   ├── fonts/                  # Noto Sans Devanagari (Hindi PDFs, OFL)
│   └── web/                    # pages: index (home), formulas, converter, graph
│                               # shared theme lab.css + animated background sci_bg.js
└── tests/                      # pytest suite (209 tests)
```

Design: **acquisition** (`FrameSource`), **inference** (`Detector`) and **UI** (OpenCV window / REST / Streamlit)
are separate. The camera pipeline uses a capture thread that keeps only the newest frame (no backlog), an
inference thread, and a display that never blocks on inference.

---

## 2. Prerequisites

* **Python 3.10 – 3.14** (verified on 3.14.2; 3.11/3.12 have the widest wheel availability)
* Windows 10/11, Linux or macOS
* Optional NVIDIA GPU with a driver supported by current PyTorch CUDA builds.
  Very old GPUs (e.g. GeForce GT 710, Kepler) are **not** supported by current PyTorch — the code falls back to CPU.
* Internet access on first training run (downloads the pretrained `yolo11n.pt`, ~5 MB)

## 3. Installation

**Windows PowerShell**
```powershell
cd D:\Abhishek\Repos\industrial-ai-vision
python -m venv .venv
.\.venv\Scripts\Activate.ps1          # if blocked: Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
python -m pip install --upgrade pip
pip install torch==2.9.1 torchvision==0.24.1 --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements.txt
```

**Linux / macOS**
```bash
cd industrial-ai-vision
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu   # Linux CPU
# macOS: pip install torch torchvision   (Apple Silicon uses CPU/MPS)
pip install -r requirements.txt
```

**NVIDIA GPU:** install the CUDA build of PyTorch from <https://pytorch.org/get-started/locally/> instead of the
CPU line above, then check:
```bash
python -c "import torch; print(torch.cuda.is_available(), torch.cuda.get_device_name(0))"
```

Check everything works:
```bash
python -m pytest
```

---

## 4. Quick start with the synthetic demo (5–10 minutes on CPU)

```bash
python -m src.dataset_utils make-synthetic          # toy shapes dataset -> examples/synthetic_dataset
python -m src.dataset_utils make-samples            # sample images + video -> samples/
python -m src.train --data examples/synthetic_dataset/data.yaml --epochs 15 --imgsz 320 --batch 16 --workers 0 --name synthetic_demo
python -m src.predict_image --source samples
python -m src.predict_camera --video samples/sample_conveyor.mp4
python -m src.evaluate --data examples/synthetic_dataset/data.yaml --split test --imgsz 320
```

The synthetic dataset contains **coloured circles, squares and triangles**. It only demonstrates the folder
layout and proves the pipeline works; its metrics say **nothing** about industrial performance.

---

## 5. Your own dataset

### 5.1 Collect images
* Capture images with the **same camera, lens, distance and lighting** you will use in production.
* Include every class, plus **good/normal parts** (as images with empty label files = background).
* Include variation: shifts, part positions, reflections, dust, different batches/shifts.
* Start with **≥ 100–300 labeled instances per class**; more for subtle defects.
* Avoid consecutive near-identical video frames — they inflate metrics (the tools detect & group them).

### 5.2 Label images (object detection = supervised)
Every image must be annotated. Unlabeled images are **rejected**, never silently trained on.

Recommended tools (all export YOLO format):
* **Label Studio** — `pip install label-studio` then `label-studio start`; choose *Object Detection with
  Bounding Boxes*; export **YOLO**.
* **CVAT** (cvat.ai or self-hosted) — export *YOLO 1.1* / *Ultralytics YOLO Detection*.
* **Roboflow** — export *YOLOv8/YOLO11* format.

YOLO label format: one `.txt` per image, same file name, one line per object (values normalised 0–1):
```
<class_id> <x_center> <y_center> <width> <height>
0 0.512 0.430 0.120 0.085
```
An **empty** `.txt` = the image has no objects (background). A **missing** `.txt` = not labeled (error).

### 5.3 Set your class names
Edit `config.yaml`:
```yaml
class_names:
  - scratch
  - dent
  - crack
```
Order = class id (scratch = 0, dent = 1, crack = 2). It must match your labeling tool.

### 5.4 Organise / split
Put exported images + `.txt` labels in one folder (side by side, or `images/` + `labels/` subfolders), then:
```bash
python -m src.dataset_utils split --source path/to/exported_folder --dest dataset --ratios 0.7 0.2 0.1 --classes scratch dent crack
```
* Near-identical images are kept in the **same split** to prevent train/test leakage.
* Unlabeled images cause an error (add `--skip-unlabeled` to leave them out deliberately).
* Existing files are never overwritten.

Or create the folders and `data.yaml` manually:
```bash
python -m src.dataset_utils init
python -m src.dataset_utils make-yaml --overwrite      # uses class_names from config.yaml
```

`dataset/data.yaml` (no `path:` key, so paths resolve relative to the file and the dataset is portable):
```yaml
train: images/train
val: images/val
test: images/test
names:
  0: scratch
  1: dent
  2: crack
```

### 5.5 Validate
```bash
python -m src.dataset_utils validate --data dataset/data.yaml
```
Checks: missing/empty/malformed labels, class IDs, coordinates outside 0–1, boxes outside the image,
corrupt images, orphan labels, empty classes, exact duplicates and near-duplicates across splits (leakage).
Exit code 1 when errors are found. Training runs this automatically.

---

## 6. Training

```bash
python -m src.train --data dataset/data.yaml
python -m src.train --data dataset/data.yaml --epochs 100 --imgsz 640 --batch 16 --lr0 0.01 --device 0 --patience 20
python -m src.train --data dataset/data.yaml --model yolo11s.pt         # larger model, more accurate, slower
```

| Option | Default | Meaning |
|---|---|---|
| `--model` | `yolo11n.pt` | pretrained COCO detection checkpoint (transfer learning). `yolo11n/s/m/l/x.pt` |
| `--epochs` | 50 | max epochs |
| `--patience` | 15 | early stopping: stop after N epochs without val improvement |
| `--imgsz` | 640 | training image size (use larger for tiny defects) |
| `--batch` | 8 | reduce if you run out of memory |
| `--lr0` | 0.01 | initial learning rate |
| `--device` | auto | `auto`, `cpu`, `0`, `0,1` |
| `--workers` | 2 | dataloader workers (`0` if you see worker errors on Windows) |
| `--seed` | 42 | reproducibility (deterministic mode on) |

Outputs (each run gets a **new** folder, nothing is overwritten):
* `outputs/runs/train/<run>/` — `weights/best.pt`, `weights/last.pt`, `results.csv`, `results.png`,
  `training_curves.png`, confusion matrix, PR curves, `experiment.json` (settings, versions, metrics)
* `models/<run>/best.pt` + `last.pt` + `experiment.json`, registered in `models/registry.json`.
  The newest registered model becomes the default for prediction.

**Resume** an interrupted run:
```bash
python -m src.train --resume outputs/runs/train/<run>/weights/last.pt
```

Only one training process can run at a time (lock file `outputs/logs/train.lock`).

---

## 7. Image prediction

```bash
python -m src.predict_image --source samples/sample_shapes_01.jpg
python -m src.predict_image --source samples --conf 0.4 --imgsz 640
python -m src.predict_image --source path/to/folder --model models/<run>/best.pt --show
```
Results go to a new folder `outputs/predictions/pred_<timestamp>/`: annotated images, `detections.csv`,
`summary.json`.

## 8. Live camera prediction

```bash
python -m src.predict_camera                       # default webcam (camera.index in config.yaml)
python -m src.predict_camera --camera 1            # second camera
python -m src.predict_camera --conf 0.5 --imgsz 480
python -m src.predict_camera --video samples/sample_conveyor.mp4 --loop      # no camera? use a video
python -m src.predict_camera --video samples/sample_conveyor.mp4 --no-display --max-frames 100 --save-video
```

| Key | Action |
|---|---|
| `q` / `Esc` / close window | quit (camera released, windows destroyed) |
| `s` | save snapshot (raw + annotated) to `outputs/snapshots/` |
| `+` / `-` | confidence threshold ±0.05 |
| `p` | pause / resume |

The overlay shows **measured** FPS and inference latency. Detections are logged to
`outputs/logs/camera_detections_<ts>.csv`.

**Testing with a real camera:** plug in a USB/industrial UVC camera, close other apps using it (Teams, Zoom),
allow camera access (Windows: *Settings → Privacy → Camera → Let desktop apps access your camera*), then run
`python -m src.predict_camera --camera 0` (try 1, 2 … for additional cameras). For GigE/USB3 Vision
machine-vision cameras, use the vendor SDK to grab frames and feed them to `Detector.predict()`.

## 9. Evaluation

```bash
python -m src.evaluate --split val
python -m src.evaluate --split test --model models/<run>/best.pt --data dataset/data.yaml
```
Reports precision, recall, mAP@0.5, mAP@0.5:0.95, per-class metrics, confusion matrix (PNG + CSV), PR curves,
and latency/throughput measured on this machine. Saved to `outputs/evaluations/<split>_<timestamp>/`.

* **val** — used to pick the best epoch → optimistic.
* **test** — never used for training or selection → your estimate of generalisation.
* **train** — debugging only; never report it as accuracy.

## 10. Export to ONNX

```bash
python -m src.export_model --model models/<run>/best.pt --imgsz 640 --samples samples
python -m src.predict_image --model models/<run>/best.onnx --source samples
```
The export is validated by `onnx.checker` and by comparing ONNX vs PyTorch detections on the sample images
(matched boxes, IoU, confidence delta). A previous `.onnx` is renamed, never overwritten.

---

## 11. REST API

Start:
```bash
python -m src.api                       # http://127.0.0.1:8000 ; interactive docs: http://127.0.0.1:8000/docs
python -m src.api --port 9000
```
The API binds to localhost and has **no authentication** — put it behind auth + TLS before exposing it.

### Response envelope (all JSON endpoints)

Success:
```json
{ "code": 200, "success": true, "message": "Prediction completed: 3 object(s) detected", "data": { ... } }
```
Error:
```json
{
  "code": 404,
  "success": false,
  "message": "No usable model checkpoint was found.",
  "error": {
    "errorCode": "MODEL_NOT_FOUND",
    "errorTitle": "Model not found",
    "errorContent": "No trained model found. The model has not been trained yet. ..."
  }
}
```
`code` always equals the HTTP status. Binary endpoints (`/camera/stream`, `/camera/frame`, `/files`) return
image/file bytes on success and the same JSON error envelope on failure.

### Endpoints (prefix `/api/v1`)

| Method | Path | Purpose | Success |
|---|---|---|---|
| GET | `/health` | liveness | 200 |
| GET | `/system/info` | versions, device | 200 |
| GET | `/config` | active configuration | 200 |
| GET | `/knowledge[?class_name=cone]` | shape names + mensuration formulas | 200 |
| POST | `/dataset/validate` | validate a `data.yaml` dataset | 200 (422 if invalid, report in `data`) |
| POST | `/dataset/split` | split labeled folder into train/val/test | 201 |
| POST | `/dataset/data-yaml` | write `data.yaml` | 201 |
| POST | `/dataset/synthetic` | generate synthetic demo dataset | 201 |
| POST | `/dataset/samples` | generate sample images + video | 201 |
| POST | `/training/start` | start training in background | 202 |
| GET | `/training/status` | state: starting / running / completed / failed / stopped | 200 |
| GET | `/training/log?lines=100` | tail of training log | 200 |
| POST | `/training/stop` | stop training | 200 |
| GET | `/models` | registry + model files + default | 200 |
| POST | `/models/export` | export to ONNX + validate | 201 |
| POST | `/predict/image` | multipart upload (`file`, `model`, `conf`, `imgsz`, `return_image`, `save`) | 200 |
| POST | `/predict/path` | predict a server-side file/folder | 200 |
| POST | `/evaluation/run` | evaluate on val/test split | 200 |
| GET | `/evaluation/reports` | list saved reports | 200 |
| GET | `/evaluation/reports/{id}` | one report | 200 |
| POST | `/camera/start` | start camera (`camera`) or video (`video`) session | 201 |
| GET | `/camera/status` | FPS, latency, frames, conf | 200 |
| PATCH | `/camera/settings` | change `conf` / `paused` | 200 |
| GET | `/camera/detections` | detections in the latest frame | 200 |
| GET | `/camera/frame` | latest annotated JPEG | image/jpeg |
| GET | `/camera/stream` | MJPEG live stream (open in a browser / `<img>`) | multipart |
| POST | `/camera/snapshot` | save snapshot | 201 |
| POST | `/camera/stop` | stop & release camera | 200 |
| GET | `/history/predictions` | recent predictions | 200 |
| GET | `/history/snapshots` | recent snapshots | 200 |
| GET | `/files?path=` | download a file under outputs/, samples/ or models/ | file |

### Error codes

| HTTP | errorCode | When |
|---|---|---|
| 400 | `INVALID_INPUT`, `UNSUPPORTED_IMAGE_TYPE`, `INVALID_IMAGE`, `EMPTY_FILE`, `PATH_NOT_ALLOWED`, `WRONG_MODEL_TASK` | bad input |
| 404 | `ROUTE_NOT_FOUND`, `MODEL_NOT_FOUND`, `MODEL_LOAD_FAILED`, `IMAGE_NOT_FOUND`, `DATA_YAML_NOT_FOUND`, `CHECKPOINT_NOT_FOUND`, `SOURCE_NOT_FOUND`, `REPORT_NOT_FOUND`, `FILE_NOT_FOUND`, `LOG_NOT_FOUND` | missing resource |
| 405 | `METHOD_NOT_ALLOWED` | wrong HTTP method |
| 409 | `TRAINING_IN_PROGRESS`, `TRAINING_NOT_RUNNING`, `CAMERA_ALREADY_RUNNING`, `CAMERA_NOT_RUNNING`, `FILE_EXISTS` | state conflict |
| 413 | `FILE_TOO_LARGE` | upload > 25 MB |
| 422 | `VALIDATION_ERROR`, `DATASET_INVALID`, `SPLIT_MISSING`, `SPLIT_EMPTY` | request/dataset validation |
| 500 | `INTERNAL_ERROR`, `DEPENDENCY_MISSING` | server-side failure |
| 503 | `CAMERA_UNAVAILABLE`, `VIDEO_NOT_FOUND`, `FRAME_CAPTURE_FAILED`, `NO_FRAME_YET` | camera problems |

### Examples

**Windows PowerShell** (use `curl.exe`, not the `curl` alias):
```powershell
curl.exe http://127.0.0.1:8000/api/v1/health
curl.exe -X POST http://127.0.0.1:8000/api/v1/predict/image -F "file=@samples/sample_shapes_01.jpg" -F "conf=0.3" -F "return_image=false"
curl.exe -X POST http://127.0.0.1:8000/api/v1/training/start -H "Content-Type: application/json" -d '{\"data\":\"dataset/data.yaml\",\"epochs\":50}'
curl.exe -X POST http://127.0.0.1:8000/api/v1/camera/start -H "Content-Type: application/json" -d '{\"camera\":0}'
# then open http://127.0.0.1:8000/api/v1/camera/stream in a browser
```
**Linux / macOS**
```bash
curl http://127.0.0.1:8000/api/v1/health
curl -X POST http://127.0.0.1:8000/api/v1/predict/image -F "file=@samples/sample_shapes_01.jpg" -F "conf=0.3" -F "return_image=false"
curl -X POST http://127.0.0.1:8000/api/v1/training/start -H "Content-Type: application/json" -d '{"data":"dataset/data.yaml","epochs":50}'
curl -X POST http://127.0.0.1:8000/api/v1/evaluation/run -H "Content-Type: application/json" -d '{"split":"test"}'
```
**Python**
```python
import requests
r = requests.post("http://127.0.0.1:8000/api/v1/predict/image",
                  files={"file": open("samples/sample_shapes_01.jpg", "rb")}, data={"conf": 0.3})
body = r.json()
if body["success"]:
    print(body["data"]["detections"])
else:
    print(body["error"]["errorCode"], body["error"]["errorTitle"], body["error"]["errorContent"])
```

## 12. Upload page, shape recogniser & 3D calculator

Start everything with one command (or double-click `start_ui.bat`):
```powershell
.\start_ui.bat            # starts the API and opens http://127.0.0.1:8000
```

**Upload page** (`http://127.0.0.1:8000/`): drag & drop / browse / paste (Ctrl+V) one or more JPG/PNG images,
pick a model, set the confidence threshold, and see the original vs annotated image, per-class counts and a
detection table. Errors show the API's `errorTitle`, `errorCode` and `errorContent`.

**Mensuration shapes model** (`models/shapes_mensuration/best.pt`): recognises 19 textbook shapes —
2D: circle, semicircle, ellipse, square, rectangle, triangle, rhombus, parallelogram, trapezium, pentagon,
hexagon; 3D: cube, cuboid, sphere, hemisphere, cylinder, cone, square pyramid, triangular prism.
For every recognised shape the page shows its name, 2D/3D, variable meanings and formulas
(area / perimeter / volume / surface areas) from `src/knowledge/mensuration.json`
(also available at `GET /api/v1/knowledge`).

**3D Model & Calculator panel**: rotate the model with the mouse (drag), touch, or arrow keys; scroll to zoom;
double-click to reset. Every dimension (r, h, a, l, b, d₁, d₂ …) is editable by number box or slider — the
model is rebuilt with the new proportions and every formula is recalculated with the working shown
(e.g. `V = (1/3) × π × 6² × 5 = 188.5 cm³`). Units: cm, m, mm, in. The most confident detected shape is
loaded automatically; any shape can also be chosen from the dropdown. Three.js r128 (MIT) is bundled in
`src/web/vendor/` so it works offline.

Retrain or extend the shapes model:
```bash
python -m src.shapes_dataset --preview 36                 # look at generated training images
python -m src.shapes_dataset --overwrite                  # examples/shapes_dataset (1400/250/250 images)
python -m src.train --data examples/shapes_dataset/data.yaml --epochs 25 --imgsz 320 --batch 16 --workers 0 --name shapes_mensuration
python tests/make_shape_check_images.py                   # independent matplotlib check images -> samples/shapes/
```
The shapes model is trained on **synthetic drawings** (textbook-style diagrams). It works best on clean
diagrams; photos of real objects, hand sketches and unusual styles are a different domain — add labeled
examples of those to improve it.

### Starting / stopping the server

`start_ui.bat` runs `python -m src.serve`, a small supervisor that starts the API and **restarts it automatically
when code in `src/` changes** (a browser refresh shows updates), restarts it if it crashes, and never stops a
running training. It first stops any older copy of this server on port 8000. To stop everything:
`powershell -ExecutionPolicy Bypass -File stop_server.ps1`.

### Formula Library (`http://127.0.0.1:8000/formulas`)

1 000+ formulas in 10 categories: Arithmetic & Quantitative Aptitude, Algebra, Trigonometry, Geometry,
Coordinate Geometry, Calculus, Vectors/Probability/Statistics, Mensuration (27 shapes, each with a labelled sketch),
Physics — Units/Dimensions/Constants, Physics — Formulas (with SI units). Search across everything (press `/`),
click a formula to copy it, print, or **download a PDF** of a category, a single section (e.g. one shape — with its
sketch) or the whole library.

**English / हिन्दी:** the EN | हिन्दी switch in the header translates the page (names, notes, headings, labels)
and every PDF download (`&lang=hi`, file names end in `_hi.pdf`). The choice is remembered per browser;
`/formulas?lang=hi` opens straight in Hindi. Pure maths (`a² − b² = (a + b)(a − b)`) and SI symbols (m, kg, N)
stay as they are, as in Hindi textbooks.

* Data: `src/knowledge/formulas/*.json` (one file per category; items are `[name, formula, note]`),
  mensuration built from `src/knowledge/mensuration.json` + `formulas/mensuration_extra.json`.
* Sketches: `src/sketches.py` (matplotlib → SVG for the page, PNG for PDFs).
* PDF: `src/formulas.py` with fpdf2 + the DejaVu fonts bundled with matplotlib (full maths symbol coverage).
* Hindi: `src/knowledge/formulas/i18n/hi/*.json` map each English string to Hindi (missing entries fall back to
  English). Hindi PDFs use Noto Sans Devanagari (`src/fonts/`, SIL Open Font License — `src/fonts/OFL.txt`) with
  HarfBuzz text shaping (`uharfbuzz`) so conjuncts and matras render correctly.
* API: `GET /api/v1/formulas[?full=true]`, `GET /api/v1/formulas/{category}`,
  `GET /api/v1/formulas/sketch/{shape}.svg`, `GET /api/v1/formulas/pdf?category=<id|all>[&section=<id>]`.
  All formula endpoints take `lang=en|hi` (default `en`; anything else → 400 `UNSUPPORTED_LANGUAGE`).

#### Formula calculator (🧮)

About 345 library formulas have a 🧮 button (kinematics, gravitation, optics, electricity, mensuration, interest,
progressions, triangle rules, coordinate geometry …). It opens a side panel where you:

1. pick **which variable to solve for** — not only the left-hand side (`v = u + at` → solve for `t`),
2. type the known values (constants such as `g = 9.8` are pre-filled; `6.674e-11` and `3/4` are accepted),
3. get the answer live with **step-by-step working**: formula → rearranged for the unknown → values substituted → result.

Angles inside sin/cos/tan are typed in **degrees** (switchable to radians); angle answers show both. Equations with
two roots (`s = ut + ½at²`) list the positive one first. **🧮 Formula calculator** in the sidebar solves any formula
you type, e.g. `A = P(1 + R/100)^n`. Works in English and Hindi.

* Engine: `src/formula_calc.py` — converts the library notation (`½at²`, `√`, `π`, `ε₀`, `ΔT`, `p²/2m` = p²/(2m),
  `sin²θ`) to a strict ASCII expression, then SymPy solves it (exact rearrangement, numeric fallback, 8 s timeout).
  Free text is whitelisted to arithmetic, names and brackets before SymPy sees it; words, identities, derivatives,
  inequalities and unit tables are not offered.
* Variable names per category: `src/knowledge/formulas/calc_glossary.json` (English, Hindi, optional default);
  mensuration uses each shape's own "where" list.
* API:
  `GET  /api/v1/formulas/calc/index` → `{category: {section: [item indexes]}}`;
  `POST /api/v1/formulas/calc/describe` `{category, section, index}` or `{formula}` (+ `lang`) → equations and variables;
  `POST /api/v1/formulas/calc/solve` `{…, solve_for, values: {symbol: number}, equation, angle_unit: "deg"|"rad"}`
  → solutions + steps. Errors: `FORMULA_NOT_CALCULABLE` 422, `MISSING_VALUES` 400, `UNKNOWN_VARIABLE` 400,
  `NO_REAL_SOLUTION` 422, `SOLVE_TIMEOUT` 422, `FORMULA_NOT_FOUND` 404.

### Design ("science lab")

Every page shares one theme, `src/web/lab.css` (colours, glass header with the atom logo, glass cards,
gradient buttons, dark / light, print and reduced-motion rules), plus the animated background `src/web/sci_bg.js`.
Each page keeps only its own layout in its `<style>`; `lab.css` is linked after it. Every page uses the full
screen width, and the header is identical everywhere (brand → tabs → page controls). Tabs: Home · Measure · Formulas ·
Elements · Physics · Solver · Converter · Graphs (full names as tooltips).

The home page (`/`) adds: a live background (`src/web/sci_bg.js` — drifting particle network
that reaches toward the pointer, floating equations, blueprint grid, slow nebula glow), a glass header with an
animated atom logo, a hero with live counters (formulas, calculators, units, shapes — read from the API) and an
orbiting-atom illustration, tool tiles with a rotating light border, glass cards and reveal-on-scroll
(`src/web/home_fx.js`). Dark and light themes both work. With the system setting *reduce motion* everything is
shown still; the background pauses when the tab is hidden. Fonts: Space Grotesk and JetBrains Mono from Google Fonts,
with system fonts as offline fallback.

### Formula cards (home page)

A strip at the top of `http://127.0.0.1:8000` flashes every formula of the library (1 022), one card at a time:
category, section, name, formula, note and — for mensuration — the shape's sketch.

* Auto-advances every 3 / 6 / 10 / 15 s with a progress bar; pauses while the pointer or keyboard focus is on it,
  and when the browser tab is hidden. ❚❚ / ▶ to pause, ‹ › or ← → to move, Space to pause.
* Filter by category, shuffled or in order, EN / हिन्दी (shared with the other pages), ✕ to hide it.
  Settings are remembered per browser.
* **Open in library** jumps to the category; **🧮 Calculate** (shown for calculable formulas) opens the Formula
  Library with that formula already loaded in the calculator (`/formulas?calc=<category>/<section>/<index>`).
* Code: `src/web/formula_cards.js` (no build step; data from `GET /api/v1/formulas?full=true&lang=…`).

### Periodic Table (`http://127.0.0.1:8000/elements`)

All 118 elements in the 18-column layout, coloured by category (legend chips filter), s/p/d/f block, state of matter
or heat-maps (electronegativity, atomic radius, melting point, density — log scale — and discovery year). A **temperature
slider** (0–6000 K, presets: room, body, boiling water, lava, Sun's surface) shows what is solid / liquid / gas; a
**year slider** shows which elements were known by then. Hover / arrow keys preview an element in the empty top area;
Enter or click opens full details with an **animated Bohr model** (electrons per shell), configuration, ionisation
energy, oxidation states, discovery, abundance and everyday uses. **Molar-mass calculator**: `H2SO4`, `Ca(OH)2`,
`K4[Fe(CN)6]`, `CuSO4·5H2O` → g/mol with a % composition table. English / हिन्दी (all element names and uses).

* Data: `src/knowledge/elements.json`, generated by `tools/build_elements.py` from the mendeleev element database
  (MIT) — factual values only; Hindi names and the uses texts are hand-written in `src/knowledge/elements_text.json`.
* Code: `src/chemistry.py` (data + formula parser), page `src/web/elements.html`.
* API: `GET /api/v1/elements`, `GET /api/v1/elements/{number|symbol|name}`,
  `GET /api/v1/chemistry/molar-mass?formula=…` (errors `ELEMENT_NOT_FOUND`, `UNKNOWN_ELEMENT`, `FORMULA_INVALID`).

### Measure (`http://127.0.0.1:8000/measure`)

Real sizes from a photo. Put a reference next to the object — ₹1/₹2/₹5/₹10 coin, bank / ID card, A4 sheet or a ruler —
and set the scale with **✨ Auto-find** (OpenCV finds coins / cards; the coin's edge is refined to about ±1 %) or by
drawing across it. Then measure **distances, circles (Ø, r, area, circumference) and polygon areas** with a magnifier
for exact clicks, in mm / cm / m / in. **🔷 Auto-measure shapes** runs the shape detector and evaluates every
mensuration formula of each shape in real units (cone: slant height, then CSA, TSA, volume …), with the assumptions
shown (a photo cannot show depth). Export an annotated PNG or CSV. **🧪 Try a sample** loads
`src/web/samples/measure_sample.jpg` (made by `tools/make_measure_sample.py`, true sizes known): measured 8.06 cm for
8.0 cm, Ø 6.05 cm for 6.0 cm.

* Code: `src/measure.py`, page `src/web/measure.html`.
* API: `GET /api/v1/measure/presets`, `POST /api/v1/measure/references` (image),
  `POST /api/v1/measure/shapes` (image, `mm_per_px`, optional `depth_mm`).
* Accuracy depends on a square-on photo with the reference in the same plane as the object.

### Physics Lab (`http://127.0.0.1:8000/physics`)

Six interactive simulations driven by the real equations, each with sliders, play / pause / speed and live values next
to the textbook formula: **projectile** (gravity presets Earth / Moon / Mars / Jupiter, launch height, air drag,
compare shots), **simple pendulum** (measured period vs 2π√(L/g), energy bars), **spring–mass SHM** (x–t graph),
**1-D collisions** (any restitution e; momentum and kinetic energy before / after), **lens ray diagram** (convex /
concave, drag the object; real / virtual image) and **electric circuit** (series / parallel, moving current dots).
Checked against textbook answers (e.g. 25 m/s at 45° lands at 63.71 m; a 20° pendulum runs 0.8 % slower than the
small-angle formula). Code: `src/web/physics.js`, page `src/web/physics.html`.

### Equation Solver (`http://127.0.0.1:8000/handwriting`)

Write an equation on the pad (finger, pen or mouse) or snap a photo of one line of maths, then it is read, shown as
tappable symbols (orange = unsure — tap to correct) and solved: linear and quadratic equations with discriminant,
factorising, quadratic formula and a check; arithmetic; expressions expanded / factorised; `y = f(x)` and relations
such as `x^2 + y^2 = 25` plotted (both branches), with **📈 Open in Graph Plotter** (`/graph?e=…`). You can also just
type the equation. English / हिन्दी.

* Scope: one neat line — digits, x y z a b c n, + − × ÷ = ( ) /, π, decimal points, powers (small raised symbol) and
  simple fractions. Not: several lines, roots, integrals.
* Recognition: `src/handwriting.py` — ink extraction (lighting-corrected Otsu, ruled lines removed), rules for "=",
  "÷", "−", dots, powers and fractions, and a small CNN for the other symbols.
* Model: `models/handwriting/symbols.pt` (+ `symbols.json` with accuracy), trained by
  `python tools/train_handwriting.py --hasy <HASYv2 folder> --mnist <folder>` on **HASYv2** (Martin Thoma,
  ODC Open Database License 1.0, https://zenodo.org/records/259444), **MNIST** digits and synthetic parentheses,
  validated on writers it never saw.
* API: `POST /api/v1/handwriting/recognize` (image), `POST /api/v1/handwriting/relayout` (corrected symbols),
  `POST /api/v1/handwriting/solve` `{text, lang}`, `GET /api/v1/handwriting/model`.

### Contact us (`/contact`) and the admin inbox (`/contact/inbox`)

* **Contact page** — name, email, optional phone and subject, topic (general / bug / feature / formula-data / other)
  and message; checked in the browser and again on the server; the sender gets a **ticket number**
  (`AVL-YYYYMMDD-0001`, never reused). EN / हिन्दी. A **quick form** sits at the bottom of the home page and every page
  has a footer with a **Contact us** button (`src/web/site.js`).
* **Spam protection** — a hidden "website" field (bots fill it, people don't), at most 5 messages per sender address per
  10 minutes, at most 3 links per message.
* **Admin inbox** — open `/contact/inbox` and enter the **admin key**: the environment variable `IAV_ADMIN_TOKEN`, or the
  key created automatically in `outputs/contact/admin_token.txt` on first use (it is never sent by the API). Filter by
  status (new / read / replied / closed) with counts, search, sort, page through, open a message (marks it read),
  **Reply by email** (opens your mail app with the ticket in the subject and the message quoted; marks it replied),
  private notes, delete (with confirmation) and **CSV export** (spreadsheet formulas in user text are neutralised).
* Storage: SQLite `outputs/contact/messages.db` (`src/contact.py`).
* **Social-media links** (`social:` in `config.yaml`): GitHub, LinkedIn, YouTube, Instagram, X, Facebook, Threads,
  Telegram, WhatsApp (phone number) and Discord. Paste a profile link or just the username; empty = hidden. They show
  as brand icons in the footer of every page and as a **Follow us** block on the Contact page, open in a new tab and
  work by keyboard. `src/social.py` publishes only `https` links to that platform's own domain and strips share
  trackers (`?si=…`, `?utm_…`). `GET /api/v1/social` re-reads `config.yaml`, so a change shows after a browser refresh.
* **Email alerts** (`src/mailer.py`): every new message is emailed to `contact.notify_to` in `config.yaml`
  (now `ay2276770@gmail.com`) in the background, with **Reply-To = the visitor**, so pressing Reply in Gmail answers
  them. Optional automatic confirmation to the visitor: `contact.confirm_to_sender: true`. The sending account is set up
  once with `.venv\Scripts\python.exe tools\setup_email.py` (asks for the Gmail address and its 16-letter **App
  Password** — Google Account → Security → 2-Step Verification → App passwords — and sends a test). It is saved in
  `secrets/smtp.json` (git-ignored, left out of backups); `IAV_SMTP_USER` / `IAV_SMTP_PASSWORD` work too. The inbox shows
  whether alerts are on, has **Send test email**, and shows per message "emailed" / "failed: …".
  API (admin): `GET /api/v1/contact/email-status`, `POST /api/v1/contact/test-email` (`MAIL_AUTH_FAILED`,
  `MAIL_NOT_CONFIGURED`, `MAIL_FAILED`).
* API: `POST /api/v1/contact` (201 + ticket; errors `CONTACT_INVALID` with per-field codes, `TOO_MANY_MESSAGES` 429);
  admin (header `X-Admin-Key`, else 401 `ADMIN_KEY_REQUIRED`): `GET /api/v1/contact/messages[?status=&q=]`,
  `PATCH /api/v1/contact/messages/{id}` `{status, note}`, `DELETE /api/v1/contact/messages/{id}`,
  `GET /api/v1/contact/export.csv`.

### Unit Converter (`http://127.0.0.1:8000/converter`)

17 quantities, 150 units: length, area (incl. gaj / sq yard, acre, hectare), volume, mass (incl. tola, quintal),
time, speed, temperature, pressure, energy (incl. kWh "unit"), power (incl. AC ton), force, angle, digital storage,
frequency, density, fuel economy (km/L ↔ L/100 km ↔ mpg) and **Indian ↔ international numbers** (lakh, crore, arab,
kharab ↔ million, billion, trillion).

* Type a value, pick two units, swap with ⇄; the line below shows `1 km = 0.621371 mi` both ways.
* **All units** table: the value in every unit of the quantity — sortable, filterable, click a row to convert into it.
* **Quick convert**: type `5 km to mi`, `100 °F in °C`, `2.5 crore to million`, `72 kmph to m/s` (press `/`).
* Significant digits (4–12) and number format: `1,234,567.89`, Indian `12,34,567.89` or scientific.
* English / हिन्दी (shared with the Formula Library), dark mode, works on phones, remembers your last choices.
* Pure client-side: unit data and exact definitions in `src/web/units.js` (inch = 2.54 cm, lb = 0.45359237 kg,
  cal = 4.184 J, atm = 101 325 Pa).

### Graph Plotter (`http://127.0.0.1:8000/graph`)

Type one item per line; any letter other than x, y, z becomes a live slider (▶ animates it).

| Input | Shown |
|---|---|
| `A(3,4)` | point, quadrant, r, θ, sin/cos/tan θ, polar form, right-triangle + angle arc |
| `A(1,2) B(6,5)` | segment + line, distance, midpoint, slope, angle, y = mx + c, general form, Δx/Δy triangle |
| `(0,0) (4,0) (4,3)` | polygon, sides, perimeter, area (shoelace), centroid; triangles: angles (cosine rule) and type |
| `y = 2x + 1`, `2x + 3y = 6` | line, slope, intercepts, angle with x-axis, distance from origin, intersections |
| `x^2 + y^2 = 25` | circle centre/radius/area/circumference; other conics classified |
| `y = a sin(bx + c)`, `y = tan(x)` | amplitude, period, midline, max/min, x-intercepts |
| `x + y + z = 6` (3D) | plane, intercepts, normal, distance from origin |
| `P(1,2,3) Q(4,5,6)` (3D) | distance, midpoint, direction ratios/cosines, angles with axes, line equation |
| `x^2 + y^2 + z^2 = 16`, `z = x^2 - y^2` (3D) | sphere (centre, radius, volume, area); surfaces |

Trig input uses radians by default (switch to Deg for `sin(30) = 0.5`); every computed angle is shown in both
degrees and radians. The expression parser (`src/web/mathexpr.js`) is a safe recursive-descent parser — no `eval`.

## 13. Streamlit dashboard

Two terminals:
```bash
python -m src.api
streamlit run app.py          # opens http://localhost:8501
```
Pages: Home (status), Dataset (validate / split / data.yaml / synthetic), Training (launch, live log, stop —
duplicates are blocked; "completed" only appears after the process actually finishes), Models (registry,
ONNX export), Image prediction, Live camera (MJPEG stream from the API + snapshot + browser-camera single
frame), Evaluation (metrics, confusion matrix, plots), History (predictions + snapshots).

The dashboard calls only the REST API. For the most responsive live view, use the standalone OpenCV window
(`python -m src.predict_camera`) — that is the primary camera implementation.

---

## 14. Adding classes / retraining

1. Add the new class name **at the end** of `class_names` in `config.yaml` (never reorder existing ids).
2. Label the new class in new images **and** re-check old images that contain it.
3. Regenerate `data.yaml` (`python -m src.dataset_utils make-yaml --overwrite`) or re-run `split --classes ...`.
4. Validate, then train from the pretrained base (`--model yolo11n.pt`) or fine-tune from your previous model
   (`--model models/<run>/best.pt`). With a changed class list, the detection head is re-initialised automatically.
5. Evaluate on the **test** split and compare with the previous model's report before switching.

## 15. Configuration

`config.yaml` overrides defaults in `src/config.py`; CLI flags override both. Use another file with
`IAV_CONFIG=path/to/other.yaml` (PowerShell: `$env:IAV_CONFIG="path\to\other.yaml"`).
All relative paths are relative to the project folder — no machine-specific paths in code.

## 16. Troubleshooting

| Problem | Fix |
|---|---|
| `OSError: [WinError 1114] ... c10.dll` when importing torch (Windows) | Visual C++ runtime too old. Install the latest **Microsoft Visual C++ Redistributable x64** (https://aka.ms/vs/17/release/vc_redist.x64.exe) and reopen the terminal. |
| `CUDA is not available` / old GPU | Install a CUDA PyTorch build; GPUs older than the build supports fall back to CPU automatically. |
| `CUDA out of memory` | Lower `--batch` and/or `--imgsz`, or `--device cpu`. |
| Training crashes on Windows with worker/pickling errors | `--workers 0` |
| `No labels found` / `images not found` | Run `python -m src.dataset_utils validate`; labels/ must mirror images/. |
| `missing label file for ...` | Annotate the image, or create an empty `.txt` if it truly has no objects. |
| Pretrained weights download fails | Check internet/proxy, or download `yolo11n.pt` manually into `models/pretrained/` and pass `--model models/pretrained/yolo11n.pt`. |
| `Could not open camera 0` | Wrong index (try 1), another app is using it, or OS privacy blocks it. Test with `--video samples/sample_conveyor.mp4`. |
| Camera opens but black/no frames | Different backend/driver; try another index, reconnect, update camera driver. |
| Low FPS | Use `yolo11n.pt`, lower `--imgsz` (e.g. 416/320), use a GPU, or export to ONNX. |
| Many false positives | Raise `--conf`; add more background (good-part) images; label consistently. |
| `API not reachable` in dashboard | Start `python -m src.api` first, or set `IAV_API_URL`. |
| `TRAINING_IN_PROGRESS` | Another training run is active; check `/training/status` or stop it. A stale lock is cleared automatically when its process is gone. |

## 17. Backup & restore

```powershell
.venv\Scripts\python.exe make_backup.py                 # zip -> D:\Abhishek\Backups\industrial-ai-vision\
.venv\Scripts\python.exe make_backup.py --dest E:\USB    # any other folder (keep one copy off this disk)
```
The zip contains everything except `.venv\` and caches, and is verified after writing. To restore: unzip, create
`.venv`, `pip install -r requirements.lock.txt --extra-index-url https://download.pytorch.org/whl/cpu`, run the
tests, `start_ui.bat`. Full steps (and the Windows torch DLL note): [WORKSPACE.md §6](WORKSPACE.md#6-backup--restore).

This folder lives inside the `D:\Abhishek\Repos` git repository, which belongs to other work — don't commit it
there; use the zip backups or give the project its own repository.

## 18. Tests

```bash
python -m pytest            # unit + API tests (fast)
```
Covers label parsing, dataset validation, leakage/near-duplicate detection, splitting, data.yaml generation,
safe paths, training lock, missing/corrupt models, unavailable camera, missing video, and the REST error
envelope for every error class. The integration test for prediction runs only when a trained model exists.
Also: formula library completeness and Hindi coverage, sketches, PDFs (English and Hindi), the formula calculator
(parsing, safety, solving, API) and the web pages (converter, formula cards, home design).
