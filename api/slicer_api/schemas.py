import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class RunCreate(BaseModel):
    calculation_type: str = Field(..., min_length=1)
    system: str = Field(..., min_length=1)
    parameters: dict[str, Any] = Field(default_factory=dict)
    parent_run_id: uuid.UUID | None = None


class RunResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    calculation_type: str
    system: str
    parameters: dict[str, Any]
    frame: dict[str, Any] | None
    status: str
    progress: float | None = None
    artifact_key: str | None
    artifact_url: str | None = None
    parent_run_id: uuid.UUID | None
    error_message: str | None
    created_at: datetime
    updated_at: datetime


class RunListResponse(BaseModel):
    items: list[RunResponse]
    total: int


class GridResponse(BaseModel):
    rows: int
    cols: int
    full_rows: int
    full_cols: int
    row_offset: int = 0
    col_offset: int = 0
    row_end: int | None = None
    col_end: int | None = None
    downsample: int = 1
    value_dtype: str | None = None
    # float64 grids may contain null for divergent / non-finite cells.
    values: list[list[float | None]]
    categories: list[dict[str, int | str]] | None = None
    frame: dict[str, Any]


class TrajectoryResponse(BaseModel):
    points: int
    dim: int
    full_points: int
    start: int = 0
    end: int | None = None
    downsample: int = 1
    t: list[float]
    state: list[list[float]]
    frame: dict[str, Any]
