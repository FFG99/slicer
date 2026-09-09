from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

_REPO_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql://slicer:slicer@localhost:5432/slicer"
    minio_endpoint: str = "localhost:9000"
    minio_access_key: str = "minio"
    minio_secret_key: str = "minio123"
    minio_bucket: str = "slicer-artifacts"
    minio_secure: bool = False

    slicer_bin: str = "slicer"
    systems_dir: str = Field(
        default_factory=lambda: str(_REPO_ROOT / "core" / "build" / "systems"),
        validation_alias="SLICER_SYSTEMS_DIR",
    )
    poll_interval_seconds: float = 2.0
    work_dir: str = "/tmp/slicer-worker"
    run_timeout_seconds: int = 3600
    metrics_port: int = 9101


settings = Settings()
