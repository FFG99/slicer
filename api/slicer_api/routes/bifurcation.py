"""Bifurcation samples along a straight parameter-space segment."""
import asyncio
import json
import subprocess
from pathlib import Path
from tempfile import TemporaryDirectory

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field, model_validator

from slicer_api.config import settings
from slicer_api.computation_manager import validate_system_available, ComputationValidationError

router = APIRouter(prefix="/bifurcation", tags=["bifurcation"])


class BifurcationRequest(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)
    system: str
    start: dict[str, float]
    end: dict[str, float]
    initial_conditions: list[float]
    variable: str
    steps: int = Field(default=400, ge=2)
    num_iter_transient: int = Field(default=100000, ge=0)
    num_iter_attractor: int = Field(default=1000, ge=1)
    include_states: bool = False
    inherit: bool = False
    reset_after_escape: bool = False
    escape_threshold: float = Field(default=1e6, gt=0, le=1e300)

    @model_validator(mode="after")
    def distinct_endpoints(self):
        if self.start == self.end:
            raise ValueError("Выберите две разные точки на карте.")
        return self


@router.post("/compute")
def compute_bifurcation(payload: BifurcationRequest, stream: bool = False):
    try:
        definition = validate_system_available(payload.system)
    except ComputationValidationError as exc:
        raise HTTPException(400, str(exc)) from exc
    names = set(definition["parameters"])
    if set(payload.start) != names or set(payload.end) != names:
        raise HTTPException(400, "Both endpoints must specify every model parameter")
    if payload.variable not in definition["variables"] or len(payload.initial_conditions) != len(definition["variables"]):
        raise HTTPException(400, "Invalid variable or initial state dimension")
    parameters = payload.model_dump(exclude={"system"})
    if stream:
        return StreamingResponse(stream_tree(payload.system, parameters), media_type="application/x-ndjson",
                                 headers={"Cache-Control":"no-cache", "X-Accel-Buffering":"no"})
    Path(settings.work_dir).mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(prefix="bifurcation-", dir=settings.work_dir) as folder:
        job = Path(folder) / "job.json"
        output = Path(folder) / "tree.json"
        job.write_text(json.dumps({"calculation_type": "bifurcation", "system": payload.system, "parameters": parameters}))
        result = subprocess.run(
            [settings.slicer_bin, "run", "--job", str(job), "--output", str(output),
             "--systems-dir", settings.systems_dir], capture_output=True, text=True,
        )
        if result.returncode != 0:
            raise HTTPException(400, (result.stderr or "Bifurcation calculation failed").strip())
        return json.loads(output.read_text())


async def stream_tree(system: str, parameters: dict):
    Path(settings.work_dir).mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(prefix="bifurcation-", dir=settings.work_dir) as folder:
        job, output = Path(folder) / "job.json", Path(folder) / "tree.json"
        job.write_text(json.dumps({"calculation_type":"bifurcation", "system":system,
                                   "parameters":{**parameters, "report_progress":True}}))
        with (Path(folder) / "stderr.txt").open("w+") as errors:
            process = await asyncio.create_subprocess_exec(
                settings.slicer_bin, "run", "--job", str(job), "--output", str(output),
                "--systems-dir", settings.systems_dir, stdout=asyncio.subprocess.PIPE, stderr=errors,
            )
            try:
                yield json.dumps({"type":"progress", "completed":0, "total":parameters["steps"]}) + "\n"
                async for line in process.stdout:
                    try:
                        event = json.loads(line)
                    except (ValueError, UnicodeDecodeError):
                        continue
                    if isinstance(event, dict) and event.get("type") == "progress":
                        yield json.dumps(event) + "\n"
                await process.wait()
                if process.returncode:
                    errors.seek(0)
                    yield json.dumps({"type":"error", "message":errors.read().strip() or "Не удалось построить дерево."}) + "\n"
                else:
                    yield '{"type":"result","data":'
                    with output.open() as result:
                        while chunk := result.read(65536):
                            yield chunk
                    yield '}\n'
            finally:
                if process.returncode is None:
                    process.kill()
                    await process.wait()


class ExportSample(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)
    t: float
    values: list[float]
    states: list[list[float]]
    diverged: bool


class TreeExport(BaseModel):
    system: str
    variable: str
    variables: list[str]
    parameters: dict
    samples: list[ExportSample]


@router.post("/export/hdf5")
def export_hdf5(payload: TreeExport):
    import io
    import h5py
    import numpy as np
    from fastapi.responses import Response

    if not payload.variables or any(len(row) != len(payload.variables)
        for sample in payload.samples for row in sample.states):
        raise HTTPException(400, "Invalid state dimensions")
    if any(len(s.states) != len(s.values) for s in payload.samples):
        raise HTTPException(400, "State and value counts differ")
    buffer = io.BytesIO()
    with h5py.File(buffer, "w") as file:
        file.attrs["format"] = "slicer.segment.v1"
        file.attrs["system"] = payload.system
        file.attrs["variable"] = payload.variable
        file.attrs["variables"] = np.asarray(payload.variables, dtype=h5py.string_dtype())
        parameters = file.create_group("parameters")
        for name, value in payload.parameters.items():
            if isinstance(value, dict):
                group = parameters.create_group(name)
                for key, number in value.items():
                    group.attrs[key] = number
            elif isinstance(value, (str, int, float, bool, list)):
                parameters.attrs[name] = value
        samples = file.create_group("samples")
        samples.create_dataset("t", data=[s.t for s in payload.samples])
        samples.create_dataset("diverged", data=[s.diverged for s in payload.samples], dtype=np.bool_)
        offsets = np.concatenate(([0], np.cumsum([len(s.values) for s in payload.samples], dtype=np.int64)))
        samples.create_dataset("offsets", data=offsets)
        count = int(offsets[-1])
        values = samples.create_dataset("values", shape=(count,), dtype="f8", compression="gzip")
        states = samples.create_dataset("states", shape=(count,len(payload.variables)), dtype="f8", compression="gzip")
        for i, sample in enumerate(payload.samples):
            if sample.values:
                values[offsets[i]:offsets[i+1]] = sample.values
                states[offsets[i]:offsets[i+1]] = sample.states
    return Response(buffer.getvalue(), media_type="application/x-hdf5",
                    headers={"Content-Disposition":'attachment; filename="bifurcation.h5"'})
