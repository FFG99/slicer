import os
from pathlib import Path

import yaml
from fastapi import APIRouter, HTTPException

from slicer_api.calculation_registry import load_calculation_registry

router = APIRouter(prefix="/registry", tags=["registry"])


@router.get("")
def get_registry():
    return load_calculation_registry()


@router.get("/{calculation_type}")
def get_calculation(calculation_type: str):
    registry = load_calculation_registry()
    if calculation_type not in registry:
        raise HTTPException(status_code=404, detail="Unknown calculation_type")
    return {calculation_type: registry[calculation_type]}
