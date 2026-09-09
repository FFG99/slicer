import json
import tempfile

import h5py
import numpy as np
import pytest

from slicer_api.artifacts import read_grid_from_hdf5, read_trajectory_from_hdf5


def _write_grid_h5(rows: int, cols: int) -> bytes:
    frame = {
        "system": "henon",
        "space": "parameter_plane",
        "axes": [
            {"name": "a", "role": "sweep", "min": 1.0, "max": 1.5, "steps": rows},
            {"name": "b", "role": "sweep", "min": 0.2, "max": 0.4, "steps": cols},
        ],
    }
    with tempfile.NamedTemporaryFile(suffix=".h5") as tmp:
        with h5py.File(tmp.name, "w") as handle:
            handle.create_dataset(
                "artifacts/main/values",
                data=np.arange(rows * cols, dtype=np.uint64).reshape(rows, cols),
            )
            handle.create_group("metadata").attrs["frame"] = json.dumps(frame)
        with open(tmp.name, "rb") as handle:
            return handle.read()


def _write_trajectory_h5(points: int, dim: int = 2) -> bytes:
    frame = {
        "system": "henon",
        "space": "phase_plane",
        "parameters": {"a": 1.25, "b": 0.3},
        "axes": [
            {"name": "x", "role": "state_variable", "index": 0, "min": -1, "max": 1},
            {"name": "y", "role": "state_variable", "index": 1, "min": -1, "max": 1},
        ],
    }
    state = np.stack(
        [np.linspace(0, 1, points), np.linspace(0, 0.5, points)], axis=1
    )
    t = np.linspace(0, points - 1, points)
    with tempfile.NamedTemporaryFile(suffix=".h5") as tmp:
        with h5py.File(tmp.name, "w") as handle:
            handle.create_dataset("artifacts/main/state", data=state)
            handle.create_dataset("artifacts/main/t", data=t)
            handle.create_group("metadata").attrs["frame"] = json.dumps(frame)
        with open(tmp.name, "rb") as handle:
            return handle.read()


def test_read_grid_float64():
    frame = {
        "system": "henon",
        "space": "parameter_plane",
        "axes": [
            {"name": "a", "role": "sweep", "min": 1.0, "max": 1.5, "steps": 4},
            {"name": "b", "role": "sweep", "min": 0.2, "max": 0.4, "steps": 4},
        ],
    }
    with tempfile.NamedTemporaryFile(suffix=".h5") as tmp:
        with h5py.File(tmp.name, "w") as handle:
            handle.create_dataset(
                "artifacts/main/values",
                data=np.linspace(0, 1, 16, dtype=np.float64).reshape(4, 4),
            )
            handle.create_group("metadata").attrs["frame"] = json.dumps(frame)
        with open(tmp.name, "rb") as handle:
            data = handle.read()

    payload = read_grid_from_hdf5(data)
    assert payload["value_dtype"] == "float64"
    assert isinstance(payload["values"][0][0], float)


def test_read_grid_float64_divergence_becomes_null():
    frame = {
        "system": "henon",
        "space": "parameter_plane",
        "axes": [
            {"name": "a", "role": "sweep", "min": 1.0, "max": 1.5, "steps": 2},
            {"name": "b", "role": "sweep", "min": 0.2, "max": 0.4, "steps": 2},
        ],
    }
    grid = np.array([[0.0, np.nan], [np.inf, -0.5]], dtype=np.float64)
    with tempfile.NamedTemporaryFile(suffix=".h5") as tmp:
        with h5py.File(tmp.name, "w") as handle:
            handle.create_dataset("artifacts/main/values", data=grid)
            handle.create_group("metadata").attrs["frame"] = json.dumps(frame)
        with open(tmp.name, "rb") as handle:
            data = handle.read()

    payload = read_grid_from_hdf5(data)
    assert payload["value_dtype"] == "float64"
    # NaN / inf divergence sentinels are serialized as JSON null, finite values kept.
    assert payload["values"][0][0] == 0.0
    assert payload["values"][0][1] is None
    assert payload["values"][1][0] is None
    assert payload["values"][1][1] == -0.5


def test_read_trajectory_empty_is_graceful():
    frame = {"system": "henon", "space": "phase_plane", "axes": []}
    with tempfile.NamedTemporaryFile(suffix=".h5") as tmp:
        with h5py.File(tmp.name, "w") as handle:
            handle.create_dataset("artifacts/main/state", data=np.zeros((0, 2), dtype=np.float64))
            handle.create_dataset("artifacts/main/t", data=np.zeros((0,), dtype=np.float64))
            handle.create_group("metadata").attrs["frame"] = json.dumps(frame)
        with open(tmp.name, "rb") as handle:
            data = handle.read()

    payload = read_trajectory_from_hdf5(data)
    assert payload["points"] == 0
    assert payload["full_points"] == 0
    assert payload["state"] == []
    assert payload["t"] == []


def test_read_grid_downsample():
    data = _write_grid_h5(1024, 1024)
    payload = read_grid_from_hdf5(data, max_dim=512)
    assert payload["full_rows"] == 1024
    assert payload["full_cols"] == 1024
    assert payload["rows"] <= 512
    assert payload["cols"] <= 512
    assert payload["downsample"] >= 2


def test_read_grid_tile():
    data = _write_grid_h5(16, 16)
    payload = read_grid_from_hdf5(data, row_start=4, row_end=8, col_start=2, col_end=6)
    assert payload["rows"] == 4
    assert payload["cols"] == 4
    assert payload["row_offset"] == 4
    assert payload["col_offset"] == 2


def test_read_attraction_composition_grid_reindexes_and_labels_categories():
    frame = {"system": "henon", "space": "parameter_plane", "axes": []}
    # EP + P, NP, and divergence (0).
    raw = np.array([[0, 0x11], [0x100, 0x11]], dtype=np.uint64)
    with tempfile.NamedTemporaryFile(suffix=".h5") as tmp:
        with h5py.File(tmp.name, "w") as handle:
            handle.create_dataset("artifacts/main/values", data=np.zeros((2, 2), dtype=np.uint64))
            handle.create_dataset("artifacts/main/composition", data=raw)
            handle.create_group("metadata").attrs["frame"] = json.dumps(frame)
        with open(tmp.name, "rb") as handle:
            data = handle.read()

    payload = read_grid_from_hdf5(data, dataset="composition")
    assert payload["values"] == [[0, 1], [2, 1]]
    assert payload["categories"] == [
        {"value": 1, "label": "EP + P"},
        {"value": 2, "label": "NP"},
    ]


def test_read_attraction_period_grid_uses_exact_period_signatures():
    frame = {"system": "henon", "space": "parameter_plane", "axes": []}
    raw = np.array([[0, 2], [1, 2]], dtype=np.uint64)
    with tempfile.NamedTemporaryFile(suffix=".h5") as tmp:
        with h5py.File(tmp.name, "w") as handle:
            handle.create_dataset("artifacts/main/values", data=np.zeros((2, 2), dtype=np.uint64))
            handle.create_dataset("artifacts/main/periods", data=raw)
            main = handle["artifacts/main"]
            main.attrs["periods_categories"] = json.dumps({"1": "1+1+3", "2": "2+5+7+11"})
            handle.create_group("metadata").attrs["frame"] = json.dumps(frame)
        with open(tmp.name, "rb") as handle:
            data = handle.read()

    payload = read_grid_from_hdf5(data, dataset="periods")
    assert payload["values"] == [[0, 2], [1, 2]]
    assert payload["categories"] == [
        {"value": 1, "label": "1+1+3"},
        {"value": 2, "label": "2+5+7+11"},
    ]


def test_read_trajectory_downsample():
    data = _write_trajectory_h5(10000)
    payload = read_trajectory_from_hdf5(data, max_points=1000)
    assert payload["full_points"] == 10000
    assert payload["points"] <= 1000
    assert payload["dim"] == 2
    assert len(payload["t"]) == payload["points"]
