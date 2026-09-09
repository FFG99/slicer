from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from slicer_api.computation_manager import (
    ComputationValidationError,
    validate_run_request,
    validate_system_available,
)
from slicer_api.compute import PHASE_PORTRAIT_TYPE, run_phase_portrait
from slicer_api.schemas import TrajectoryResponse
from slicer_api.systems_registry import load_systems_registry

router = APIRouter(prefix="/phase-portrait", tags=["phase-portrait"])


class PhasePortraitComputeRequest(BaseModel):
    system: str = Field(..., min_length=1)
    parameters: dict[str, Any] = Field(default_factory=dict)


def _ensure_system_visible(system: str) -> None:
    entry = load_systems_registry().get(system)
    if not isinstance(entry, dict):
        raise HTTPException(status_code=404, detail="Unknown system")


@router.post("/compute", response_model=TrajectoryResponse)
def compute_phase_portrait(
    payload: PhasePortraitComputeRequest
) -> TrajectoryResponse:
    _ensure_system_visible(payload.system)
    try:
        validate_system_available(payload.system)
        validate_run_request(PHASE_PORTRAIT_TYPE, payload.system, payload.parameters)
    except ComputationValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    try:
        data = run_phase_portrait(payload.system, payload.parameters)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return TrajectoryResponse(**data)


@router.post("/export")
def export_phase_portrait(
    payload: PhasePortraitComputeRequest
) -> JSONResponse:
    _ensure_system_visible(payload.system)
    try:
        validate_system_available(payload.system)
        validate_run_request(PHASE_PORTRAIT_TYPE, payload.system, payload.parameters)
    except ComputationValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    try:
        trajectory = run_phase_portrait(payload.system, payload.parameters)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    export_payload = {
        "calculation_type": PHASE_PORTRAIT_TYPE,
        "system": payload.system,
        "parameters": payload.parameters,
        "trajectory": trajectory,
    }
    return JSONResponse(
        content=export_payload,
        headers={
            "Content-Disposition": 'attachment; filename="phase_portrait.json"',
        },
    )
