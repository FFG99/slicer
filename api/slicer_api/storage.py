from datetime import timedelta

from minio import Minio
from minio.error import S3Error

from slicer_api.config import settings


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


def artifact_object_key(run_id: str) -> str:
    return f"runs/{run_id}/result.h5"


def presigned_artifact_url(artifact_key: str, client: Minio | None = None) -> str:
    client = client or get_minio_client()
    return client.presigned_get_object(
        settings.minio_bucket,
        artifact_key,
        expires=timedelta(seconds=settings.presigned_url_expiry_seconds),
    )


def artifact_url_for_key(artifact_key: str | None) -> str | None:
    if not artifact_key:
        return None
    try:
        return presigned_artifact_url(artifact_key)
    except S3Error:
        return None


def delete_artifact(artifact_key: str, client: Minio | None = None) -> None:
    client = client or get_minio_client()
    client.remove_object(settings.minio_bucket, artifact_key)


def delete_all_artifacts(client: Minio | None = None) -> int:
    client = client or get_minio_client()
    deleted = 0
    for item in client.list_objects(settings.minio_bucket, recursive=True):
        client.remove_object(settings.minio_bucket, item.object_name)
        deleted += 1
    return deleted
