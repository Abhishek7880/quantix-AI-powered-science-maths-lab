"""REST API envelope + error handling tests."""

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from src import api
from src.config import PROJECT_ROOT

P = api.API_PREFIX


@pytest.fixture
def client(tmp_cfg, monkeypatch):
    monkeypatch.setattr(api, "cfg", tmp_cfg)
    api._detector_cache.clear()
    with TestClient(api.app) as c:
        yield c


def assert_error(r, code, error_code):
    body = r.json()
    assert r.status_code == code, body
    assert body["code"] == code and body["success"] is False and body["message"]
    assert set(body["error"]) == {"errorCode", "errorTitle", "errorContent"}
    assert body["error"]["errorCode"] == error_code
    return body


def test_health_envelope(client):
    r = client.get(f"{P}/health")
    body = r.json()
    assert r.status_code == 200 and body["code"] == 200 and body["success"] is True
    assert body["message"] and body["data"]["status"] == "up"


def test_upload_page_served(client):
    r = client.get("/")
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/html")
    assert "Image Inspection" in r.text and "/predict/image" in r.text


def test_knowledge_all_and_one(client):
    from src.shapes_dataset import SHAPE_CLASSES
    r = client.get(f"{P}/knowledge")
    data = r.json()["data"]
    assert r.status_code == 200 and set(SHAPE_CLASSES) <= set(data)
    for key, info in data.items():
        assert info["name"] and info["dimension"] in ("2D", "3D") and info["formulas"], key
        assert all(f["label"] and f["formula"] for f in info["formulas"]), key
    cone = client.get(f"{P}/knowledge", params={"class_name": "cone"}).json()["data"]
    assert cone["dimension"] == "3D" and any("Volume" in f["label"] for f in cone["formulas"])
    assert_error(client.get(f"{P}/knowledge", params={"class_name": "dodecahedron"}), 404, "CLASS_INFO_NOT_FOUND")


def test_graph_page_and_scripts_served(client):
    r = client.get("/graph")
    assert r.status_code == 200 and "Graph Plotter" in r.text
    for path in ("/web/graph.js", "/web/mathexpr.js", "/web/shapes3d.js", "/web/vendor/three.min.js"):
        assert client.get(path).status_code == 200, path


def test_unknown_route(client):
    assert_error(client.get(f"{P}/nope"), 404, "ROUTE_NOT_FOUND")


def test_method_not_allowed(client):
    assert_error(client.delete(f"{P}/health"), 405, "METHOD_NOT_ALLOWED")


def test_request_validation_error(client):
    body = assert_error(client.post(f"{P}/dataset/data-yaml", json={"classes": []}), 422, "VALIDATION_ERROR")
    assert "classes" in body["error"]["errorContent"]


def test_dataset_validate_missing_yaml(client, tmp_path):
    r = client.post(f"{P}/dataset/validate", json={"data_yaml": str(tmp_path / "missing.yaml")})
    body = assert_error(r, 422, "DATASET_INVALID")
    assert body["data"]["valid"] is False


def test_dataset_validate_ok(client, tiny_dataset):
    r = client.post(f"{P}/dataset/validate", json={"data_yaml": str(tiny_dataset)})
    assert r.status_code == 200 and r.json()["data"]["valid"] is True


def test_data_yaml_conflict(client, tmp_path):
    dest = str(tmp_path / "d.yaml")
    assert client.post(f"{P}/dataset/data-yaml", json={"dest": dest, "classes": ["a"]}).status_code == 201
    assert_error(client.post(f"{P}/dataset/data-yaml", json={"dest": dest, "classes": ["a"]}), 409, "FILE_EXISTS")


def test_predict_without_model(client):
    ok, buf = cv2.imencode(".jpg", np.zeros((64, 64, 3), np.uint8))
    r = client.post(f"{P}/predict/image", files={"file": ("a.jpg", buf.tobytes(), "image/jpeg")})
    assert_error(r, 404, "MODEL_NOT_FOUND")


def test_predict_bad_file_type(client):
    r = client.post(f"{P}/predict/image", files={"file": ("a.txt", b"hello", "text/plain")})
    assert_error(r, 400, "UNSUPPORTED_IMAGE_TYPE")


def test_predict_corrupt_image(client):
    r = client.post(f"{P}/predict/image", files={"file": ("a.jpg", b"not really a jpeg", "image/jpeg")})
    assert_error(r, 400, "INVALID_IMAGE")


def test_predict_conf_out_of_range(client):
    r = client.post(f"{P}/predict/image", files={"file": ("a.jpg", b"x", "image/jpeg")}, data={"conf": "3"})
    assert_error(r, 422, "VALIDATION_ERROR")


def test_camera_not_running(client):
    assert client.get(f"{P}/camera/status").json()["data"]["running"] is False
    assert_error(client.post(f"{P}/camera/snapshot"), 409, "CAMERA_NOT_RUNNING")
    assert_error(client.get(f"{P}/camera/frame"), 409, "CAMERA_NOT_RUNNING")


def test_camera_start_without_model(client):
    assert_error(client.post(f"{P}/camera/start", json={"video": "samples/sample_conveyor.mp4"}), 404,
                 "MODEL_NOT_FOUND")


def test_training_status_idle_and_stop_conflict(client):
    assert client.get(f"{P}/training/status").json()["data"]["state"] == "idle"
    assert_error(client.post(f"{P}/training/stop"), 409, "TRAINING_NOT_RUNNING")


def test_training_start_missing_data(client, tmp_path):
    assert_error(client.post(f"{P}/training/start", json={"data": str(tmp_path / "x.yaml")}), 404,
                 "DATA_YAML_NOT_FOUND")


def test_file_download_blocks_traversal(client):
    assert_error(client.get(f"{P}/files", params={"path": "../../Windows/win.ini"}), 400, "PATH_NOT_ALLOWED")
    assert_error(client.get(f"{P}/files", params={"path": str(PROJECT_ROOT / "src" / "api.py")}), 400,
                 "PATH_NOT_ALLOWED")


def test_evaluation_report_not_found(client):
    assert_error(client.get(f"{P}/evaluation/reports/none_here"), 404, "REPORT_NOT_FOUND")


# ------------------------------------------------------------------ with a trained model (integration)

def _trained_model():
    from src.config import load_config
    from src.utils import resolve_model_path
    try:
        return resolve_model_path(load_config())
    except Exception:
        return None


@pytest.mark.skipif(_trained_model() is None, reason="no trained model yet (run the synthetic demo training)")
def test_predict_sample_with_trained_model(client):
    sample = PROJECT_ROOT / "samples" / "sample_shapes_01.jpg"
    r = client.post(f"{P}/predict/image", files={"file": (sample.name, sample.read_bytes(), "image/jpeg")},
                    data={"model": str(_trained_model()), "save": "false"})
    body = r.json()
    assert r.status_code == 200 and body["success"], body
    assert body["data"]["count"] == len(body["data"]["detections"])
    assert body["data"]["annotated_image_base64"]
