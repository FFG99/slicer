import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from minio.error import S3Error
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from slicer_api.artifacts import download_artifact, read_grid_from_hdf5, read_trajectory_from_hdf5
from slicer_api.computation_manager import ComputationValidationError, validate_run_request
from slicer_api.db import get_db
from slicer_api.models import Run
from slicer_api.schemas import GridResponse, RunCreate, RunListResponse, RunResponse, TrajectoryResponse
from slicer_api.storage import delete_artifact
from slicer_api.systems_registry import load_systems_registry

router = APIRouter(prefix="/runs", tags=["runs"])


def _get_visible_run(run_id: uuid.UUID, db: Session) -> Run:
    run = db.get(Run, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    return run


def _artifact_download_url(run: Run) -> str | None:
    if not run.artifact_key:
        return None
    return f"/api/runs/{run.id}/artifact"


def _to_response(run: Run) -> RunResponse:
    data = RunResponse.model_validate(run)
    data.artifact_url = _artifact_download_url(run)
    return data


@router.post("", response_model=RunResponse, status_code=201)
def create_run(payload: RunCreate, db: Session = Depends(get_db)) -> RunResponse:
    system_entry = load_systems_registry().get(payload.system)
    if not isinstance(system_entry, dict):
        raise HTTPException(status_code=404, detail="Unknown system")
    try:
        validate_run_request(payload.calculation_type, payload.system, payload.parameters)
    except ComputationValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if payload.parent_run_id is not None:
        _get_visible_run(payload.parent_run_id, db)

    run = Run(
        calculation_type=payload.calculation_type,
        system=payload.system,
        parameters=payload.parameters,
        parent_run_id=payload.parent_run_id,
        status="queued",
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    return _to_response(run)


@router.get("", response_model=RunListResponse)
def list_runs(
    system: str | None = Query(default=None),
    calculation_type: str | None = Query(default=None),
    status: str | None = Query(default=None),
    parent_run_id: uuid.UUID | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> RunListResponse:
    filters = []
    if system is not None:
        filters.append(Run.system == system)
    if calculation_type is not None:
        filters.append(Run.calculation_type == calculation_type)
    if status is not None:
        filters.append(Run.status == status)
    if parent_run_id is not None:
        filters.append(Run.parent_run_id == parent_run_id)
    total = db.scalar(select(func.count()).select_from(Run).where(*filters)) or 0
    runs = db.scalars(
        select(Run)
        .where(*filters)
        .order_by(Run.created_at.desc())
        .limit(limit)
        .offset(offset)
    ).all()

    return RunListResponse(
        items=[_to_response(run) for run in runs],
        total=total,
    )


@router.post("/{run_id}/cancel", response_model=RunResponse)
def cancel_run(run_id: uuid.UUID, db: Session = Depends(get_db)) -> RunResponse:
    run = _get_visible_run(run_id, db)
    if run.status not in {"queued", "running"}:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot cancel run with status {run.status}",
        )
    run.status = "cancelled"
    run.error_message = None
    db.commit()
    db.refresh(run)
    return _to_response(run)


@router.delete("/{run_id}")
def delete_run(run_id: uuid.UUID, db: Session = Depends(get_db)) -> dict:
    run = _get_visible_run(run_id, db)
    if run.status == "running":
        raise HTTPException(
            status_code=409,
            detail="Cannot delete a running computation — cancel it first",
        )

    artifact_key = run.artifact_key
    db.delete(run)
    db.commit()

    if artifact_key:
        try:
            delete_artifact(artifact_key)
        except S3Error:
            pass

    return {"deleted": str(run_id)}


@router.get("/{run_id}", response_model=RunResponse)
def get_run(run_id: uuid.UUID, db: Session = Depends(get_db)) -> RunResponse:
    run = _get_visible_run(run_id, db)
    return _to_response(run)


@router.get("/{run_id}/artifact")
def download_run_artifact(run_id: uuid.UUID, db: Session = Depends(get_db)) -> Response:
    run = _get_visible_run(run_id, db)
    if run.status != "done":
        raise HTTPException(status_code=409, detail=f"Run status is {run.status}, not done")
    if not run.artifact_key:
        raise HTTPException(status_code=404, detail="Artifact not available")

    try:
        data = download_artifact(run.artifact_key)
    except S3Error as exc:
        raise HTTPException(status_code=404, detail="Artifact not found in storage") from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return Response(
        content=data,
        media_type="application/x-hdf5",
        headers={"Content-Disposition": f'attachment; filename="{run_id}.h5"'},
    )


@router.get("/{run_id}/grid", response_model=GridResponse)
def get_run_grid(
    run_id: uuid.UUID,
    dataset: str = Query(default="values", pattern="^(values|composition|periods)$"),
    max_dim: int = Query(default=512, ge=8, le=8192),
    row_start: int = Query(default=0, ge=0),
    row_end: int | None = Query(default=None, ge=1),
    col_start: int = Query(default=0, ge=0),
    col_end: int | None = Query(default=None, ge=1),
    downsample: int | None = Query(default=None, ge=1, le=1024),
    db: Session = Depends(get_db),
) -> GridResponse:
    run = _get_visible_run(run_id, db)
    if run.status != "done":
        raise HTTPException(status_code=409, detail=f"Run status is {run.status}, not done")
    if not run.artifact_key:
        raise HTTPException(status_code=404, detail="Artifact not available")

    try:
        payload = read_grid_from_hdf5(
            download_artifact(run.artifact_key),
            dataset=dataset,
            max_dim=max_dim,
            row_start=row_start,
            row_end=row_end,
            col_start=col_start,
            col_end=col_end,
            downsample=downsample,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return GridResponse(**payload)


@router.get("/{run_id}/trajectory", response_model=TrajectoryResponse)
def get_run_trajectory(
    run_id: uuid.UUID,
    max_points: int = Query(default=5000, ge=16, le=100000),
    start: int = Query(default=0, ge=0),
    end: int | None = Query(default=None, ge=1),
    downsample: int | None = Query(default=None, ge=1, le=1024),
    db: Session = Depends(get_db),
) -> TrajectoryResponse:
    run = _get_visible_run(run_id, db)
    if run.status != "done":
        raise HTTPException(status_code=409, detail=f"Run status is {run.status}, not done")
    if not run.artifact_key:
        raise HTTPException(status_code=404, detail="Artifact not available")

    try:
        payload = read_trajectory_from_hdf5(
            download_artifact(run.artifact_key),
            max_points=max_points,
            start=start,
            end=end,
            downsample=downsample,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return TrajectoryResponse(**payload)
