import json
import math
import tempfile
from typing import Any

import h5py
import numpy as np
from minio import Minio

from slicer_api.config import settings
from slicer_api.storage import get_minio_client


def download_artifact(artifact_key: str, client: Minio | None = None) -> bytes:
    client = client or get_minio_client()
    response = client.get_object(settings.minio_bucket, artifact_key)
    try:
        return response.read()
    finally:
        response.close()
        response.release_conn()


def _read_frame(handle: h5py.File) -> dict[str, Any]:
    frame_raw = handle["metadata"].attrs["frame"]
    if isinstance(frame_raw, bytes):
        frame_raw = frame_raw.decode("utf-8")
    return json.loads(frame_raw)


def _downsample_stride(full_rows: int, full_cols: int, max_dim: int) -> int:
    longest = max(full_rows, full_cols)
    if longest <= max_dim:
        return 1
    return int(math.ceil(longest / max_dim))


def read_grid_from_hdf5(
    data: bytes,
    *,
    dataset: str = "values",
    max_dim: int = 512,
    row_start: int = 0,
    row_end: int | None = None,
    col_start: int = 0,
    col_end: int | None = None,
    downsample: int | None = None,
) -> dict[str, Any]:
    if dataset not in {"values", "composition", "periods"}:
        raise ValueError("Unknown grid dataset")
    with tempfile.NamedTemporaryFile(suffix=".h5") as tmp:
        tmp.write(data)
        tmp.flush()
        with h5py.File(tmp.name, "r") as handle:
            path = f"artifacts/main/{dataset}"
            if path not in handle:
                raise ValueError("Artifact has no grid dataset")
            values = handle[path][...]
            frame = _read_frame(handle)
            period_categories_raw = (
                handle["artifacts/main"].attrs.get("periods_categories")
                if dataset == "periods"
                else None
            )

    array = np.asarray(values)
    if array.ndim != 2:
        raise ValueError("Expected 2D grid dataset")

    value_dtype = "float64" if np.issubdtype(array.dtype, np.floating) else "uint64"

    full_rows, full_cols = array.shape
    row_end = full_rows if row_end is None else min(row_end, full_rows)
    col_end = full_cols if col_end is None else min(col_end, full_cols)

    if row_start < 0 or col_start < 0 or row_start >= row_end or col_start >= col_end:
        raise ValueError("Invalid grid tile bounds")

    tile = array[row_start:row_end, col_start:col_end]
    stride = downsample or _downsample_stride(tile.shape[0], tile.shape[1], max_dim)
    if stride > 1:
        tile = tile[::stride, ::stride]

    rows, cols = tile.shape
    categories: list[dict[str, Any]] | None = None
    if dataset == "composition":
        # Reindex sparse packed composition codes so the frontend can use a
        # compact categorical palette. Zero remains the divergence sentinel.
        codes = sorted(int(code) for code in np.unique(array) if int(code) != 0)
        code_to_index = {code: index + 1 for index, code in enumerate(codes)}
        tile = np.asarray(
            [[code_to_index.get(int(code), 0) for code in row] for row in tile],
            dtype=np.uint64,
        )

        def composition_label(code: int) -> str:
            parts: list[str] = []
            for count, name in ((code & 0xF, "EP"), ((code >> 4) & 0xF, "P"), ((code >> 8) & 0xF, "NP")):
                if count:
                    parts.append(name if count == 1 else f"{count}+ {name}")
            return " + ".join(parts)

        categories = [
            {"value": index, "label": composition_label(code)}
            for code, index in code_to_index.items()
        ]
    elif dataset == "periods":
        if period_categories_raw is None:
            raise ValueError("Artifact has no period category labels")
        if isinstance(period_categories_raw, bytes):
            period_categories_raw = period_categories_raw.decode("utf-8")
        labels = json.loads(period_categories_raw)
        categories = [
            {"value": int(code), "label": str(label)}
            for code, label in sorted(labels.items(), key=lambda item: int(item[0]))
        ]

    if value_dtype == "float64":
        float_tile = tile.astype(np.float64)
        # Non-finite cells (divergence sentinel / overflow) become JSON null so the
        # response stays valid JSON and the client can render them as divergence.
        values_out = [
            [None if not math.isfinite(v) else float(v) for v in row]
            for row in float_tile.tolist()
        ]
    else:
        values_out = tile.astype(np.uint64).tolist()

    payload = {
        "rows": int(rows),
        "cols": int(cols),
        "full_rows": int(full_rows),
        "full_cols": int(full_cols),
        "row_offset": int(row_start),
        "col_offset": int(col_start),
        "row_end": int(row_end),
        "col_end": int(col_end),
        "downsample": int(stride),
        "value_dtype": value_dtype,
        "values": values_out,
        "frame": frame,
    }
    if categories is not None:
        payload["categories"] = categories
    return payload


def read_trajectory_from_hdf5(
    data: bytes,
    *,
    max_points: int = 5000,
    start: int = 0,
    end: int | None = None,
    downsample: int | None = None,
) -> dict[str, Any]:
    with tempfile.NamedTemporaryFile(suffix=".h5") as tmp:
        tmp.write(data)
        tmp.flush()
        with h5py.File(tmp.name, "r") as handle:
            if "artifacts/main/state" not in handle or "artifacts/main/t" not in handle:
                raise ValueError("Artifact has no trajectory datasets")
            state = handle["artifacts/main/state"][...]
            t_values = handle["artifacts/main/t"][...]
            frame = _read_frame(handle)

    state_array = np.asarray(state, dtype=np.float64)
    t_array = np.asarray(t_values, dtype=np.float64)
    if state_array.ndim != 2:
        raise ValueError("Expected state dataset with shape [N, D]")

    full_points, dim = state_array.shape

    # A diverged / empty trajectory has no points; return an empty slice instead of
    # erroring so the client can render it as "diverged" rather than failing.
    if full_points == 0:
        return {
            "points": 0,
            "dim": int(dim),
            "full_points": 0,
            "start": 0,
            "end": 0,
            "downsample": 1,
            "t": [],
            "state": [],
            "frame": frame,
        }

    end = full_points if end is None else min(end, full_points)
    if start < 0 or start >= end:
        raise ValueError("Invalid trajectory slice bounds")

    state_slice = state_array[start:end]
    t_slice = t_array[start:end]
    stride = downsample or _downsample_stride(state_slice.shape[0], 1, max_points)
    if stride > 1:
        state_slice = state_slice[::stride]
        t_slice = t_slice[::stride]

    points = int(state_slice.shape[0])
    return {
        "points": points,
        "dim": int(dim),
        "full_points": int(full_points),
        "start": int(start),
        "end": int(end),
        "downsample": int(stride),
        "t": t_slice.astype(np.float64).tolist(),
        "state": state_slice.astype(np.float64).tolist(),
        "frame": frame,
    }
