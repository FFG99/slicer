from pathlib import Path
from unittest.mock import patch

import pytest
import yaml
from fastapi.testclient import TestClient

from slicer_api.computation_manager import ComputationValidationError, validate_run_request
from slicer_api.main import app
from slicer_api.system_compile import CompiledSystem
from slicer_api.systems_registry import (
    invalidate_registry_cache,
    load_systems_registry,
    plugin_extension,
)


def test_systems_registry():
    client = TestClient(app)
    response = client.get("/systems/henon")
    assert response.status_code == 200
    data = response.json()
    assert "henon" in data
    assert data["henon"]["parameters"] == ["a", "b"]
    assert data["henon"]["variables"] == ["x", "y"]


def test_delete_builtin_system_rejected():
    client = TestClient(app)
    response = client.delete("/systems/henon")
    assert response.status_code == 403


def test_create_and_delete_system(tmp_path: Path):
    registry_path = tmp_path / "systems-registry.yaml"
    registry_path.write_text(
        yaml.safe_dump(
            {
                "henon": {
                    "parameters": ["a", "b"],
                    "variables": ["x", "y"],
                }
            },
            sort_keys=False,
        ),
        encoding="utf-8",
    )
    systems_directory = tmp_path / "systems"
    systems_directory.mkdir()

    invalidate_registry_cache()

    compiled = CompiledSystem(
        name="demo_map",
        parameters=["a", "b"],
        variables=["x", "y"],
        plugin_bytes=b"compiled-plugin",
    )

    with (
        patch("slicer_api.systems_registry.registry_path", return_value=registry_path),
        patch("slicer_api.systems_registry.systems_dir", return_value=systems_directory),
        patch("slicer_api.routes.systems.compile_and_probe", return_value=compiled),
    ):
        invalidate_registry_cache()
        client = TestClient(app)

        response = client.post(
            "/systems",
            data={
                "source": "class DemoMap {};",
                "description": "Demo system",
                "default_starting_point": "0.1, 0.0",
            },
        )
        assert response.status_code == 200
        payload = response.json()
        assert payload["demo_map"]["parameters"] == ["a", "b"]
        assert payload["demo_map"]["variables"] == ["x", "y"]

        registry = yaml.safe_load(registry_path.read_text(encoding="utf-8"))
        assert "demo_map" in registry
        assert (systems_directory / f"demo_map{plugin_extension()}").exists()

        list_response = client.get("/systems")
        assert "demo_map" in list_response.json()

        delete_response = client.delete("/systems/demo_map")
        assert delete_response.status_code == 200
        assert delete_response.json()["deleted"] == "demo_map"

        registry_after = yaml.safe_load(registry_path.read_text(encoding="utf-8"))
        assert "demo_map" not in registry_after

    invalidate_registry_cache()
    load_systems_registry.cache_clear()


def test_validate_run_unknown_calculation():
    with pytest.raises(ComputationValidationError, match="Unknown calculation_type"):
        validate_run_request("not_a_calc", "henon", {})


def test_validate_run_unknown_system():
    with pytest.raises(ComputationValidationError, match="Unknown system"):
        validate_run_request("attraction_map", "missing_system", {})


def test_validate_run_missing_required_parameter(tmp_path: Path):
    systems_directory = tmp_path / "systems"
    systems_directory.mkdir()
    (systems_directory / f"henon{plugin_extension()}").write_bytes(b"plugin")

    registry_path = tmp_path / "systems-registry.yaml"
    registry_path.write_text(
        yaml.safe_dump(
            {"henon": {"parameters": ["a", "b"], "variables": ["x", "y"]}},
            sort_keys=False,
        ),
        encoding="utf-8",
    )

    with (
        patch("slicer_api.systems_registry.registry_path", return_value=registry_path),
        patch("slicer_api.systems_registry.systems_dir", return_value=systems_directory),
    ):
        invalidate_registry_cache()
        with pytest.raises(ComputationValidationError, match="Missing required parameter"):
            validate_run_request("attraction_map", "henon", {"steps": 8})

    invalidate_registry_cache()
