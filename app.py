"""Streamlit dashboard - a thin client over the REST API (src/api.py).

Start the API first, then the dashboard:
  python -m src.api
  streamlit run app.py

Override the API location with the IAV_API_URL environment variable
(default http://127.0.0.1:8000/api/v1).
"""

from __future__ import annotations

import base64
import os
import time

import pandas as pd
import requests
import streamlit as st

API = os.environ.get("IAV_API_URL", "http://127.0.0.1:8000/api/v1").rstrip("/")

st.set_page_config(page_title="Industrial AI Vision", page_icon="🏭", layout="wide")


# --------------------------------------------------------------------------- API client

def call(method: str, path: str, show_error: bool = True, timeout: float = 30, **kwargs) -> dict | None:
    """Call the API and return the envelope's data, or None on error (error shown in the UI)."""
    try:
        r = requests.request(method, f"{API}{path}", timeout=timeout, **kwargs)
    except requests.ConnectionError:
        if show_error:
            st.error(f"**API not reachable** at `{API}`.\n\nStart it in another terminal:  `python -m src.api`")
        return None
    except requests.Timeout:
        if show_error:
            st.error(f"**Request timed out** after {timeout:.0f}s: `{method} {path}`")
        return None
    try:
        body = r.json()
    except ValueError:
        if show_error:
            st.error(f"Unexpected non-JSON response ({r.status_code}) from `{path}`")
        return None
    if not body.get("success"):
        if show_error:
            err = body.get("error", {})
            st.error(f"**{err.get('errorTitle', 'Error')}** (`{err.get('errorCode', r.status_code)}`, "
                     f"HTTP {body.get('code', r.status_code)})\n\n{err.get('errorContent', body.get('message', ''))}")
        st.session_state["_last_error_body"] = body
        return None
    return {"_message": body.get("message"), **({"data": body.get("data")})}


def file_bytes(rel_path: str) -> bytes | None:
    try:
        r = requests.get(f"{API}/files", params={"path": rel_path}, timeout=15)
        return r.content if r.status_code == 200 else None
    except requests.RequestException:
        return None


def show_detections(dets: list[dict]) -> None:
    if dets:
        st.dataframe(pd.DataFrame(dets), width="stretch", hide_index=True)
    else:
        st.info("No objects detected above the confidence threshold.")


# --------------------------------------------------------------------------- pages

def page_home() -> None:
    st.title("🏭 Industrial AI Vision")
    st.caption("Custom YOLO object / defect detection - training, evaluation and live camera inference")
    health = call("GET", "/health", show_error=False)
    if health is None:
        call("GET", "/health")
        return
    info = (call("GET", "/system/info") or {}).get("data", {})
    models = (call("GET", "/models") or {}).get("data", {})
    status = (call("GET", "/training/status") or {}).get("data", {})
    cam = (call("GET", "/camera/status") or {}).get("data", {})
    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Compute device", str(info.get("selected_device", "?")).upper())
    c2.metric("Trained models", len(models.get("registry", [])))
    c3.metric("Training", status.get("state", "idle"))
    c4.metric("Camera", "running" if cam.get("running") else "stopped")
    st.write("**Default model:**", models.get("default_model") or "_none trained yet_")
    with st.expander("Environment"):
        st.json(info)
    st.warning("⚠️ Validate any model on representative industrial images from your own line before production "
               "use. Do **not** connect this system to machinery, PLCs or emergency-stop circuits without a "
               "separately engineered and safety-validated integration. Confidence scores are not calibrated "
               "probabilities.")


def page_dataset() -> None:
    st.header("📁 Dataset")
    tab1, tab2, tab3, tab4 = st.tabs(["Validate", "Split labeled images", "data.yaml", "Synthetic demo"])
    with tab1:
        data_yaml = st.text_input("data.yaml path", "dataset/data.yaml", key="val_yaml")
        dup = st.checkbox("Check duplicates / split leakage", True)
        if st.button("Validate dataset", type="primary"):
            with st.spinner("Validating..."):
                try:
                    r = requests.post(f"{API}/dataset/validate", json={"data_yaml": data_yaml,
                                                                       "check_duplicates": dup}, timeout=600)
                    body = r.json()
                except requests.RequestException as exc:
                    st.error(f"API not reachable: {exc}")
                    return
            d = body.get("data") or {}
            if body.get("success"):
                st.success(body["message"])
            else:
                err = body.get("error", {})
                st.error(f"**{err.get('errorTitle')}** (`{err.get('errorCode')}`)\n\n{err.get('errorContent')}")
            if d.get("stats", {}).get("splits"):
                st.dataframe(pd.DataFrame(d["stats"]["splits"]).T, width="stretch")
            if d.get("stats", {}).get("class_counts"):
                st.bar_chart(pd.Series(d["stats"]["class_counts"], name="boxes"))
            for e in d.get("errors", [])[:100]:
                st.write("❌", e)
            for w in d.get("warnings", [])[:100]:
                st.write("⚠️", w)
    with tab2:
        st.caption("Source folder: images with YOLO .txt labels side-by-side, or images/ + labels/ subfolders.")
        src = st.text_input("Source folder (on the API machine)")
        dest = st.text_input("Destination dataset folder", "dataset")
        c1, c2, c3 = st.columns(3)
        tr = c1.number_input("train", 0.0, 1.0, 0.7, 0.05)
        va = c2.number_input("val", 0.0, 1.0, 0.2, 0.05)
        te = c3.number_input("test", 0.0, 1.0, 0.1, 0.05)
        classes = st.text_input("Class names (comma separated, order = class id)", "defect")
        skip = st.checkbox("Skip unlabeled images (otherwise they cause an error)")
        if st.button("Split dataset") and src:
            r = call("POST", "/dataset/split", timeout=600, json={
                "source": src, "dest": dest, "ratios": [tr, va, te], "skip_unlabeled": skip,
                "classes": [c.strip() for c in classes.split(",") if c.strip()]})
            if r:
                st.success(r["_message"])
                st.json(r["data"])
    with tab3:
        dest = st.text_input("data.yaml destination", "dataset/data.yaml")
        classes = st.text_area("Class names (one per line, order = class id)", "defect")
        overwrite = st.checkbox("Overwrite if exists")
        if st.button("Write data.yaml"):
            r = call("POST", "/dataset/data-yaml", json={"dest": dest, "overwrite": overwrite,
                                                         "classes": [c.strip() for c in classes.splitlines() if c.strip()]})
            if r:
                st.success(r["_message"])
    with tab4:
        st.info("Generates coloured geometric shapes. This is **NOT industrial data** - it only demonstrates the "
                "folder layout and lets you smoke-test the pipeline.")
        if st.button("Generate synthetic dataset (overwrite)"):
            r = call("POST", "/dataset/synthetic", timeout=300, json={"overwrite": True})
            if r:
                st.success(f"{r['_message']}: {r['data']['data_yaml']}")
        if st.button("Generate sample images + video"):
            r = call("POST", "/dataset/samples", timeout=300)
            if r:
                st.success(r["_message"])


def page_training() -> None:
    st.header("🧠 Training")
    status = (call("GET", "/training/status") or {}).get("data", {})
    state = status.get("state", "idle")
    running = status.get("process_alive", False)
    st.write(f"**Current state:** `{state}`" + (" ⏳" if running else ""))
    if state == "completed":
        st.success(f"Last training completed: best model `{status.get('best')}` - validation metrics "
                   f"{status.get('metrics')}")
    elif state == "failed":
        st.error(f"Last training failed: {status.get('error')}\n\n{status.get('hint', '')}")

    with st.form("train"):
        c1, c2, c3 = st.columns(3)
        data = c1.text_input("data.yaml", "dataset/data.yaml")
        model = c2.text_input("Pretrained checkpoint", "yolo11n.pt")
        device = c3.text_input("Device (auto / cpu / 0)", "auto")
        c4, c5, c6, c7 = st.columns(4)
        epochs = c4.number_input("Epochs", 1, 2000, 50)
        imgsz = c5.number_input("Image size", 64, 2048, 640, 32)
        batch = c6.number_input("Batch", 1, 512, 8)
        lr0 = c7.number_input("Learning rate", 0.00001, 1.0, 0.01, format="%.5f")
        c8, c9, c10 = st.columns(3)
        patience = c8.number_input("Early-stop patience", 0, 1000, 15)
        workers = c9.number_input("Workers", 0, 32, 0 if os.name == "nt" else 2)
        name = c10.text_input("Run name (optional, letters/digits/_-)")
        resume = st.text_input("Resume from last.pt (optional - other fields ignored)")
        submitted = st.form_submit_button("🚀 Start training", type="primary", disabled=running)
    if submitted:
        payload = {"data": data, "model": model, "device": device, "epochs": int(epochs), "imgsz": int(imgsz),
                   "batch": int(batch), "lr0": float(lr0), "patience": int(patience), "workers": int(workers)}
        if name:
            payload["name"] = name
        if resume:
            payload["resume"] = resume
        r = call("POST", "/training/start", json=payload)
        if r:
            st.success(r["_message"])
            time.sleep(1)
            st.rerun()

    c1, c2, c3 = st.columns([1, 1, 3])
    if c1.button("🔄 Refresh"):
        st.rerun()
    if running and c2.button("⏹ Stop training"):
        r = call("POST", "/training/stop")
        if r:
            st.warning(r["_message"])
    auto = c3.checkbox("Auto-refresh every 5 s while running", value=running)
    logs = call("GET", "/training/log", show_error=False, params={"lines": 60})
    if logs:
        st.code("\n".join(logs["data"]["lines"]), language="text")
    if auto and running:
        time.sleep(5)
        st.rerun()


def page_models() -> None:
    st.header("📦 Models")
    r = call("GET", "/models")
    if not r:
        return
    d = r["data"]
    st.write("**Default model (used when none is selected):**", d.get("default_model") or "_none_")
    if d["registry"]:
        rows = [{"name": e["name"], "created": e["created"], "best": e["best"], "data": e["data"],
                 **{f"val_{k}": v for k, v in (e.get("validation_metrics") or {}).items()}} for e in d["registry"]]
        st.dataframe(pd.DataFrame(rows[::-1]), width="stretch", hide_index=True)
    else:
        st.info("No trained models yet - use the Training page.")
    st.subheader("Export to ONNX")
    opts = [f["path"] for f in d["files"] if f["path"].endswith(".pt")]
    if opts:
        sel = st.selectbox("Checkpoint", opts)
        imgsz = st.number_input("Export image size", 64, 2048, 640, 32)
        if st.button("Export + validate ONNX"):
            with st.spinner("Exporting..."):
                e = call("POST", "/models/export", timeout=900, json={"model": sel, "imgsz": int(imgsz)})
            if e:
                st.success(e["_message"])
                st.json(e["data"])


def _model_selector(key: str) -> str | None:
    r = call("GET", "/models", show_error=False)
    files = [f["path"] for f in (r or {}).get("data", {}).get("files", [])]
    default = (r or {}).get("data", {}).get("default_model")
    options = ["(default: latest trained)"] + files
    sel = st.selectbox("Model checkpoint", options, key=key,
                       help=f"Default resolves to {default}" if default else "No trained model yet")
    return None if sel.startswith("(default") else sel


def page_predict() -> None:
    st.header("🖼️ Image prediction")
    model = _model_selector("pred_model")
    c1, c2 = st.columns(2)
    conf = c1.slider("Confidence threshold", 0.05, 0.95, 0.25, 0.05)
    imgsz = c2.number_input("Image size", 32, 4096, 640, 32)
    up = st.file_uploader("Upload JPG / PNG", type=["jpg", "jpeg", "png"])
    if up and st.button("Run prediction", type="primary"):
        form = {"conf": str(conf), "imgsz": str(int(imgsz)), "return_image": "true"}
        if model:
            form["model"] = model
        with st.spinner("Running inference..."):
            r = call("POST", "/predict/image", timeout=120, files={"file": (up.name, up.getvalue(), up.type)},
                     data=form)
        if r:
            d = r["data"]
            st.success(f"{r['_message']} in {d['latency_ms']} ms on {d['device'].upper()}")
            if d.get("generic_pretrained_model"):
                st.warning("This is a generic COCO-pretrained model, not trained on your classes.")
            c1, c2 = st.columns(2)
            c1.image(up, caption="Input", width="stretch")
            c2.image(base64.b64decode(d["annotated_image_base64"]), caption="Prediction", width="stretch")
            show_detections(d["detections"])
            st.caption(d["note"])


def page_camera() -> None:
    st.header("🎥 Live camera")
    st.info("The live stream runs inside the API process (OpenCV capture → YOLO → MJPEG). For the lowest latency "
            "use the standalone window instead:  `python -m src.predict_camera`")
    status = (call("GET", "/camera/status") or {}).get("data", {})
    running = status.get("running", False)
    if not running:
        model = _model_selector("cam_model")
        src = st.radio("Source", ["Camera", "Video file"], horizontal=True)
        c1, c2 = st.columns(2)
        cam_idx = c1.number_input("Camera index", 0, 16, 0) if src == "Camera" else None
        video = c1.text_input("Video path", "samples/sample_conveyor.mp4") if src == "Video file" else None
        conf = c2.slider("Confidence", 0.05, 0.95, 0.25, 0.05, key="cam_conf")
        if st.button("▶ Start", type="primary"):
            payload = {"conf": conf, "model": model}
            if src == "Camera":
                payload["camera"] = int(cam_idx)
            else:
                payload["video"] = video
            with st.spinner("Opening source and loading model..."):
                r = call("POST", "/camera/start", timeout=120, json=payload)
            if r:
                st.rerun()
    else:
        c1, c2, c3, c4 = st.columns(4)
        c1.metric("FPS (measured)", status["fps"])
        c2.metric("Latency ms", status["latency_ms"])
        c3.metric("Frames", status["frames_processed"])
        c4.metric("Objects (last frame)", status["detections_in_last_frame"])
        if status.get("error"):
            st.error(status["error"])
        st.markdown(f'<img src="{API}/camera/stream" style="width:100%;max-width:960px;border-radius:6px">',
                    unsafe_allow_html=True)
        b1, b2, b3, b4 = st.columns(4)
        new_conf = b1.slider("Confidence", 0.05, 0.95, float(status["conf"]), 0.05, key="live_conf")
        if abs(new_conf - status["conf"]) > 1e-6:
            call("PATCH", "/camera/settings", json={"conf": new_conf})
        if b2.button("📸 Snapshot"):
            r = call("POST", "/camera/snapshot")
            if r:
                st.success(f"Saved {r['data']['annotated']}")
        if b3.button("⏯ Pause / resume"):
            call("PATCH", "/camera/settings", json={"paused": not status["paused"]})
            st.rerun()
        if b4.button("⏹ Stop camera"):
            r = call("POST", "/camera/stop")
            if r:
                st.success(r["_message"])
                st.rerun()
        if st.button("🔄 Refresh stats / detections"):
            st.rerun()
        dets = call("GET", "/camera/detections", show_error=False)
        if dets:
            show_detections(dets["data"]["detections"])

    st.divider()
    st.subheader("Browser webcam (single frame)")
    shot = st.camera_input("Take a picture with the browser camera")
    if shot is not None:
        r = call("POST", "/predict/image", timeout=120, files={"file": ("browser.jpg", shot.getvalue(), "image/jpeg")},
                 data={"conf": "0.25", "return_image": "true"})
        if r:
            st.image(base64.b64decode(r["data"]["annotated_image_base64"]), caption=r["_message"])
            show_detections(r["data"]["detections"])


def page_evaluation() -> None:
    st.header("📊 Evaluation")
    st.caption("**val** = used for model selection (optimistic). **test** = held out → estimate of generalisation. "
               "**train** = debugging only, never a measure of real accuracy.")
    model = _model_selector("eval_model")
    c1, c2, c3 = st.columns(3)
    data = c1.text_input("data.yaml", "dataset/data.yaml", key="eval_yaml")
    split = c2.selectbox("Split", ["test", "val", "train"])
    imgsz = c3.number_input("Image size", 32, 4096, 640, 32, key="eval_imgsz")
    if st.button("Run evaluation", type="primary"):
        with st.spinner("Evaluating (this can take a while on CPU)..."):
            r = call("POST", "/evaluation/run", timeout=3600, json={"model": model, "data": data, "split": split,
                                                                   "imgsz": int(imgsz)})
        if r:
            st.session_state["eval_report"] = r["data"]
    reports = (call("GET", "/evaluation/reports", show_error=False) or {}).get("data", [])
    if reports:
        ids = [f"{x['id']}  ({x['split']}, {x['model']})" for x in reports]
        sel = st.selectbox("Saved reports", ids)
        if st.button("Load report"):
            rid = sel.split("  ")[0]
            rr = call("GET", f"/evaluation/reports/{rid}")
            if rr:
                st.session_state["eval_report"] = rr["data"]
    rep = st.session_state.get("eval_report")
    if rep:
        st.subheader(f"{rep['split'].upper()} split - {rep['images']} images")
        st.caption(rep["split_note"])
        o = rep["overall"]
        c = st.columns(4)
        c[0].metric("Precision", o["precision"])
        c[1].metric("Recall", o["recall"])
        c[2].metric("mAP@0.5", o["mAP50"])
        c[3].metric("mAP@0.5:0.95", o["mAP50_95"])
        if rep["per_class"]:
            st.dataframe(pd.DataFrame(rep["per_class"]), width="stretch", hide_index=True)
        if rep.get("benchmark"):
            st.write("**Latency (measured on the API machine):**", rep["benchmark"])
        if rep.get("confusion_matrix"):
            lbl = rep["confusion_matrix_labels"]
            st.write("**Confusion matrix** (rows = predicted, columns = true)")
            st.dataframe(pd.DataFrame(rep["confusion_matrix"], index=lbl, columns=lbl), width="stretch")
        plots = [p for p in rep.get("plots", []) if any(k in p for k in ("confusion_matrix_normalized", "PR_curve",
                                                                          "BoxPR", "per_class"))]
        cols = st.columns(2)
        for i, p in enumerate(plots[:4]):
            b = file_bytes(p)
            if b:
                cols[i % 2].image(b, caption=p.split("/")[-1], width="stretch")
        st.caption(rep["disclaimer"])


def page_history() -> None:
    st.header("🗂️ History")
    t1, t2 = st.tabs(["Predictions", "Snapshots"])
    with t1:
        items = (call("GET", "/history/predictions", params={"limit": 30}) or {}).get("data", [])
        if not items:
            st.info("No predictions yet.")
        for it in items:
            with st.expander(f"{it.get('time')} - {it.get('image')} - {len(it.get('detections', []))} object(s)"):
                b = file_bytes(it["annotated"])
                if b:
                    st.image(b, width=480)
                show_detections(it.get("detections", []))
    with t2:
        snaps = (call("GET", "/history/snapshots", params={"limit": 30}) or {}).get("data", [])
        if not snaps:
            st.info("No snapshots yet - press 's' in the camera window or 📸 on the Live camera page.")
        cols = st.columns(3)
        for i, s in enumerate(snaps):
            b = file_bytes(s["annotated"])
            if b:
                cols[i % 3].image(b, caption=s["time"], width="stretch")


PAGES = {"Home": page_home, "Dataset": page_dataset, "Training": page_training, "Models": page_models,
         "Image prediction": page_predict, "Live camera": page_camera, "Evaluation": page_evaluation,
         "History": page_history}

with st.sidebar:
    st.title("Industrial AI Vision")
    page = st.radio("Navigate", list(PAGES))
    st.caption(f"API: `{API}`")
PAGES[page]()
