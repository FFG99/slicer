import os
from functools import lru_cache
from pathlib import Path

import yaml

_REPO_ROOT = Path(__file__).resolve().parents[2]

DEFAULT_REGISTRY = _REPO_ROOT / "schemas" / "calculation-registry.yaml"


def registry_path() -> Path:
    return Path(os.environ.get("REGISTRY_PATH", DEFAULT_REGISTRY))


@lru_cache
def load_calculation_registry() -> dict:
    path = registry_path()
    with path.open(encoding="utf-8") as handle:
        data = yaml.safe_load(handle)
    return data if isinstance(data, dict) else {}


def invalidate_calculation_registry_cache() -> None:
    load_calculation_registry.cache_clear()
