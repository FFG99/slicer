import uuid

import pytest
from pydantic import ValidationError

from slicer_api.schemas import GridResponse, RunCreate


def test_run_create_valid():
    payload = RunCreate(
        calculation_type="attraction_map",
        system="henon",
        parameters={"steps": 8},
    )
    assert payload.system == "henon"


def test_run_create_requires_system():
    with pytest.raises(ValidationError):
        RunCreate(calculation_type="attraction_map", system="", parameters={})


def test_run_create_parent_run_id():
    parent = uuid.uuid4()
    payload = RunCreate(
        calculation_type="phase_portrait",
        system="henon",
        parameters={},
        parent_run_id=parent,
    )
    assert payload.parent_run_id == parent


def test_grid_response_accepts_float64_values():
    payload = GridResponse(
        rows=2,
        cols=2,
        full_rows=2,
        full_cols=2,
        value_dtype="float64",
        values=[[0.1, -0.2], [0.3, 0.4]],
        frame={"system": "henon", "space": "parameter_plane", "axes": []},
    )
    assert payload.values[0][0] == pytest.approx(0.1)


def test_grid_response_accepts_uint64_values():
    payload = GridResponse(
        rows=2,
        cols=2,
        full_rows=2,
        full_cols=2,
        value_dtype="uint64",
        values=[[1, 2], [3, 4]],
        frame={"system": "henon", "space": "parameter_plane", "axes": []},
    )
    assert payload.values[1][1] == 4
