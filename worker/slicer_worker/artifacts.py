import json
import uuid
from pathlib import Path

import h5py
from minio import Minio

from slicer_worker.config import settings


def get_minio_client() -> Minio:
    return Minio(
        settings.minio_endpoint,
        access_key=settings.minio_access_key,
        secret_key=settings.minio_secret_key,
        secure=settings.minio_secure,
    )


def ensure_bucket(client: Minio | None = None) -> None:
    client = client or get_minio_client()
    if not client.bucket_exists(settings.minio_bucket):
        client.make_bucket(settings.minio_bucket)


def artifact_object_key(run_id: uuid.UUID) -> str:
    return f"runs/{run_id}/result.h5"


def write_job_file(
    run_id: uuid.UUID,
    calculation_type: str,
    system: str,
    parameters: dict,
    work_dir: Path,
) -> Path:
    work_dir.mkdir(parents=True, exist_ok=True)
    job_path = work_dir / f"{run_id}.job.json"
    payload = {
        "calculation_type": calculation_type,
        "system": system,
        "parameters": parameters,
    }
    job_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return job_path


def read_frame_from_artifact(artifact_path: Path) -> dict:
    with h5py.File(artifact_path, "r") as handle:
        raw = handle["metadata"].attrs["frame"]
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8")
    return json.loads(raw)


def upload_artifact(local_path: Path, run_id: uuid.UUID, client: Minio | None = None) -> str:
    client = client or get_minio_client()
    key = artifact_object_key(run_id)
    client.fput_object(
        settings.minio_bucket,
        key,
        str(local_path),
        content_type="application/x-hdf5",
    )
    return key
