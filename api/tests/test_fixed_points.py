import io
import json
from unittest.mock import patch
from uuid import UUID

import h5py
import pytest
from fastapi.testclient import TestClient

from slicer_api.fixed_points import read_fixed_points, validate_fixed_points
from slicer_api.computation_manager import ComputationValidationError, validate_run_request
from slicer_api.db import get_db
from slicer_api.main import app


def parameters():
    return dict(parameter="a", model_parameters={"a": 1.4, "b": .3},
                parameter_min=1., parameter_max=2., state_min=[-2., -2.], state_max=[2., 2.])


SYSTEM = dict(parameters=["a", "b"], variables=["x", "y"])


def artifact():
    result = dict(format="slicer.fixed_points.v1", system="henon", samples=[
        dict(parameter=1., points=[]), dict(parameter=2., points=[dict(state=[.5, .15], multipliers=[[.4, 0], [-.75, 0]])])])
    buffer = io.BytesIO()
    with h5py.File(buffer, "w") as f:
        f.create_dataset("artifacts/main/fixed_points_json", data=json.dumps(result).encode())
    return buffer.getvalue()


def test_accepts_one_and_two_dimensions():
    validate_fixed_points(parameters(), SYSTEM)
    p = parameters(); p.update(model_parameters={"a": 2.}, state_min=[0.], state_max=[1.])
    validate_fixed_points(p, dict(parameters=["a"], variables=["x"]))


def test_accepts_parameter_segment_with_both_parameters_varying_and_reverse_direction():
    p = dict(start={"a": 2., "b": .4}, end={"a": 1., "b": .2}, state_min=[-2., -2.], state_max=[2., 2.])
    validate_fixed_points(p, SYSTEM)
    validate_run_request_with_segment(p)


@patch("slicer_api.computation_manager.validate_system_available", return_value=SYSTEM)
def validate_run_request_with_segment(p, _system):
    validate_run_request("fixed_point_diagram", "henon", p)


@pytest.mark.parametrize("change", [
    {"end": {"a": 2.}}, {"end": {"a": 1., "b": .3}},
    {"end": {"a": float("nan"), "b": .5}}, {"start": None},
])
def test_rejects_invalid_segment(change):
    p = dict(start={"a": 1., "b": .3}, end={"a": 2., "b": .4}, state_min=[-2., -2.], state_max=[2., 2.])
    with pytest.raises(ValueError):
        validate_fixed_points(p | change, SYSTEM)


@pytest.mark.parametrize("change", [
    {"state_min": [-2.]}, {"state_min": [0., 3.]}, {"parameter_max": 0},
    {"state_max": [True, 2.]}, {"model_parameters": {"a": 1.}},
    {"model_parameters": {"a": float("nan"), "b": .3}},
    {"tolerance": float("nan")}, {"derivative_step": float("inf")},
    {"steps": True}, {"seeds_per_axis": 3.5}, {"parameter": "c"},
    {"steps": 1000, "seeds_per_axis": 32, "max_iterations": 100},
])
def test_invalid_settings(change):
    with pytest.raises(ValueError):
        validate_fixed_points(parameters() | change, SYSTEM)


def test_rejects_higher_dimensions():
    with pytest.raises(ValueError, match="1D and 2D"):
        validate_fixed_points(parameters(), SYSTEM | {"variables": ["x", "y", "z"]})


@patch("slicer_api.computation_manager.validate_system_available", return_value=SYSTEM)
def test_run_validation_uses_newton_validation(_system):
    validate_run_request("fixed_point_diagram", "henon", parameters())
    with pytest.raises(ComputationValidationError, match="State bounds"):
        validate_run_request("fixed_point_diagram", "henon", parameters() | {"state_min": [0.]})


def test_bounded_read_preserves_multipliers():
    result = read_fixed_points(artifact(), offset=1, limit=1)
    assert result["total"] == 2
    assert len(result["samples"]) == 1
    assert result["samples"][0]["points"][0]["multipliers"] == [[.4, 0], [-.75, 0]]
    assert read_fixed_points(artifact(), offset=9)["samples"] == []
    with pytest.raises(ValueError):
        read_fixed_points(artifact(), limit=1001)


@pytest.mark.parametrize("dimension", [1, 2])
@pytest.mark.parametrize("stored_types", [
    ["stable_node", "repeller_node", "nonhyperbolic"],
    ["stable", "repeller", "nonhyperbolic"],
])
def test_legacy_node_names_are_converted_only_for_scalar_results(dimension, stored_types):
    points = [dict(type=kind, state=[i / 10] * dimension, residual=1e-12,
                   multipliers=[[mu, 0]] * dimension)
              for i, (kind, mu) in enumerate(zip(stored_types, [.5, 2., 1.]))]
    stored = dict(format="slicer.fixed_points.v1", variables=["x", "y"][:dimension],
                  samples=[dict(parameter=1., points=points)])
    buffer = io.BytesIO()
    with h5py.File(buffer, "w") as handle:
        handle.create_dataset("artifacts/main/fixed_points_json", data=json.dumps(stored).encode())
    raw = buffer.getvalue()
    result = read_fixed_points(raw)
    rows = result["samples"][0]["points"]
    assert [p["type"] for p in rows] == (["attracting", "repelling", "nonhyperbolic"] if dimension == 1 else stored_types)
    for before, after in zip(points, rows):
        assert before["state"] == after["state"]
        assert before["multipliers"] == after["multipliers"]
        assert before["residual"] == after["residual"]
    if dimension == 1:
        assert rows[0]["stored_type"] == stored_types[0]
        assert rows[1]["stored_type"] == stored_types[1]
    else:
        assert all("stored_type" not in p for p in rows)
    with h5py.File(io.BytesIO(raw), "r") as handle:
        assert json.loads(handle["artifacts/main/fixed_points_json"][()].decode()) == stored


@pytest.mark.parametrize("status,calculation_type,expected", [
    ("done", "fixed_point_diagram", 200), ("running", "fixed_point_diagram", 409),
    ("done", "phase_portrait", 400),
])
def test_result_endpoint(status, calculation_type, expected):
    run = type("Run", (), dict(id=UUID("ade5e02b-5b5e-4e90-8df3-481643751d3d"),
                              status=status, calculation_type=calculation_type, artifact_key="test.h5"))()
    class Session:
        def get(self, *_args):
            return run
    app.dependency_overrides[get_db] = lambda: Session()
    try:
        with patch("slicer_api.routes.runs.download_artifact", return_value=artifact()):
            response = TestClient(app).get(f"/runs/{run.id}/fixed-points?offset=1&limit=1")
        assert response.status_code == expected
        if expected == 200:
            assert response.json()["total"] == 2
            assert len(response.json()["samples"]) == 1
    finally:
        app.dependency_overrides.clear()
