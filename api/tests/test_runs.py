from unittest.mock import patch
from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from slicer_api.main import app
from slicer_api.routes.runs import _artifact_download_url


class _FakeRun:
    id = UUID("ade5e02b-5b5e-4e90-8df3-481643751d3d")
    artifact_key = "runs/ade5e02b-5b5e-4e90-8df3-481643751d3d/result.h5"
    status = "done"


def test_artifact_download_url():
    assert _artifact_download_url(_FakeRun()) == (
        "/api/runs/ade5e02b-5b5e-4e90-8df3-481643751d3d/artifact"
    )
    assert _artifact_download_url(type("Run", (), {"artifact_key": None})()) is None


@patch("slicer_api.routes.runs.download_artifact", return_value=b"\x89HDF\r\n")
def test_download_run_artifact(mock_download_artifact):
    run = _FakeRun()

    def override_get_db():
        class _Session:
            def get(self, _model, _run_id):
                return run

        yield _Session()

    from slicer_api.db import get_db

    app.dependency_overrides[get_db] = override_get_db
    try:
        client = TestClient(app)
        response = client.get(f"/runs/{run.id}/artifact")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.content == b"\x89HDF\r\n"
    assert response.headers["content-type"] == "application/x-hdf5"
    assert 'attachment; filename="ade5e02b-5b5e-4e90-8df3-481643751d3d.h5"' in response.headers[
        "content-disposition"
    ]
    mock_download_artifact.assert_called_once_with(run.artifact_key)


def test_health():
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_create_run_validation_error():
    client = TestClient(app)
    response = client.post("/runs", json={"system": "henon"})
    assert response.status_code == 422


@patch("slicer_api.main.ensure_bucket")
def test_create_run_with_database(mock_ensure_bucket):
    client = TestClient(app)
    payload = {
        "calculation_type": "attraction_map",
        "system": "henon",
        "parameters": {"steps": 8},
    }
    try:
        response = client.post("/runs", json=payload)
    except Exception as exc:
        pytest.skip(f"Database not available: {exc}")

    assert response.status_code == 400
