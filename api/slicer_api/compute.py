import json
import subprocess
import uuid
from pathlib import Path
from typing import Any

from slicer_api.artifacts import read_trajectory_from_hdf5
from slicer_api.config import settings

PHASE_PORTRAIT_TYPE = "phase_portrait"


def run_phase_portrait(system: str, parameters: dict[str, Any]) -> dict[str, Any]:
    work_dir = Path(settings.work_dir)
    work_dir.mkdir(parents=True, exist_ok=True)
    job_id = uuid.uuid4()
    job_path = work_dir / f"{job_id}.job.json"
    artifact_path = work_dir / f"{job_id}.h5"

    payload = {
        "calculation_type": PHASE_PORTRAIT_TYPE,
        "system": system,
        "parameters": parameters,
    }
    job_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    command = [
        settings.slicer_bin,
        "run",
        "--job",
        str(job_path),
        "--output",
        str(artifact_path),
        "--systems-dir",
        settings.systems_dir,
    ]

    try:
        result = subprocess.run(command, capture_output=True, text=True, check=False)
        if result.returncode != 0:
            details = (result.stderr or result.stdout or "").strip()
            raise RuntimeError(details or f"slicer exited with code {result.returncode}")

        attractor_iters = int(parameters.get("num_iter_attractor", 5000))
        max_points = max(16, min(attractor_iters, 100_000))
        return read_trajectory_from_hdf5(
            artifact_path.read_bytes(),
            max_points=max_points,
        )
    finally:
        job_path.unlink(missing_ok=True)
        artifact_path.unlink(missing_ok=True)
