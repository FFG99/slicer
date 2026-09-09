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
    presigned_url_expiry_seconds: int = 3600
    slicer_bin: str = "slicer"
    systems_dir: str = Field(
        default_factory=lambda: str(_REPO_ROOT / "core" / "build" / "systems"),
        validation_alias="SLICER_SYSTEMS_DIR",
    )
    work_dir: str = "/tmp/slicer-api"
    slicer_core_include: str = Field(
        default_factory=lambda: str(_REPO_ROOT / "core" / "include"),
        validation_alias="SLICER_CORE_INCLUDE",
    )
    slicer_probe_bin: str = Field(
        default_factory=lambda: str(_REPO_ROOT / "core" / "build" / "slicer-probe-system"),
        validation_alias="SLICER_PROBE_BIN",
    )
    compiler_bin: str = Field(default="g++", validation_alias="SLICER_COMPILER_BIN")


settings = Settings()
