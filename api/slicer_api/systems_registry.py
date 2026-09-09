import os
import platform
import re
import shutil
from functools import lru_cache
from pathlib import Path

import yaml

from slicer_api.config import settings

_REPO_ROOT = Path(__file__).resolve().parents[2]

DEFAULT_REGISTRY = _REPO_ROOT / "schemas" / "systems-registry.yaml"
BUILTIN_SYSTEMS = frozenset({"henon", "chialvo", "universal2d"})
SYSTEM_NAME_PATTERN = re.compile(r"^[a-z][a-z0-9_]*$")
PLUGIN_EXTENSIONS = (".dylib", ".so")


def systems_dir() -> Path:
    return Path(settings.systems_dir)


def registry_path() -> Path:
    env = os.environ.get("SYSTEMS_REGISTRY_PATH")
    if env:
        return Path(env)
    return systems_dir() / "systems-registry.yaml"


def plugin_extension() -> str:
    return ".dylib" if platform.system() == "Darwin" else ".so"


def is_builtin_system(name: str) -> bool:
    if name in BUILTIN_SYSTEMS:
        return True
    registry = load_systems_registry()
    entry = registry.get(name)
    return isinstance(entry, dict) and bool(entry.get("builtin"))


def system_response(entry: dict) -> dict:
    return {**entry, "can_delete": not entry.get("builtin", False)}


@lru_cache
def load_systems_registry() -> dict:
    ensure_systems_storage()
    path = registry_path()
    with path.open(encoding="utf-8") as handle:
        data = yaml.safe_load(handle)
    return data if isinstance(data, dict) else {}


def invalidate_registry_cache() -> None:
    load_systems_registry.cache_clear()


def ensure_systems_storage() -> None:
    directory = systems_dir()
    directory.mkdir(parents=True, exist_ok=True)

    path = registry_path()
    if not path.exists():
        if DEFAULT_REGISTRY.is_file():
            path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(DEFAULT_REGISTRY, path)
        else:
            path.write_text("{}\n", encoding="utf-8")

    seed_dir = Path(os.environ.get("SLICER_SYSTEMS_SEED", "/usr/local/lib/slicer/seed"))
    seed_plugins = seed_dir / "systems"
    if seed_plugins.is_dir():
        for entry in seed_plugins.iterdir():
            if not entry.is_file() or entry.suffix.lower() not in PLUGIN_EXTENSIONS:
                continue
            if entry.stem not in BUILTIN_SYSTEMS:
                continue
            target = directory / entry.name
            if not target.exists():
                shutil.copy2(entry, target)

    built_in_dir = _REPO_ROOT / "core" / "build" / "systems"
    if built_in_dir.is_dir():
        for entry in built_in_dir.iterdir():
            if not entry.is_file() or entry.suffix.lower() not in PLUGIN_EXTENSIONS:
                continue
            if entry.stem not in BUILTIN_SYSTEMS:
                continue
            target = directory / entry.name
            if not target.exists():
                shutil.copy2(entry, target)

    remove_legacy_plugin_duplicates(directory)


def save_systems_registry(registry: dict) -> None:
    ensure_systems_storage()
    path = registry_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        yaml.safe_dump(
            registry,
            handle,
            default_flow_style=False,
            sort_keys=False,
            allow_unicode=True,
        )
    invalidate_registry_cache()


def parse_name_list(raw: str, field: str) -> list[str]:
    items = [item.strip() for item in raw.split(",") if item.strip()]
    if not items:
        raise ValueError(f"{field} must contain at least one name")
    for item in items:
        if not re.match(r"^[a-zA-Z_][a-zA-Z0-9_]*$", item):
            raise ValueError(f"Invalid {field} name: {item}")
    return items


def parse_optional_float_list(raw: str | None) -> list[float] | None:
    if raw is None or not raw.strip():
        return None
    values: list[float] = []
    for part in raw.split(","):
        part = part.strip()
        if not part:
            continue
        values.append(float(part))
    return values or None


def validate_system_name(name: str) -> None:
    if not SYSTEM_NAME_PATTERN.match(name):
        raise ValueError(
            "System name must start with a letter and contain only lowercase letters, digits, and underscores"
        )


def find_plugin_path(name: str) -> Path | None:
    directory = systems_dir()
    if not directory.exists():
        return None

    canonical = directory / f"{name}{plugin_extension()}"
    if canonical.is_file():
        return canonical

    legacy = directory / f"lib{name}_plugin{plugin_extension()}"
    if legacy.is_file():
        return legacy

    return None


def remove_legacy_plugin_duplicates(directory: Path) -> None:
    if not directory.is_dir():
        return
    for entry in directory.iterdir():
        if not entry.is_file():
            continue
        stem = entry.stem
        if not stem.startswith("lib") or not stem.endswith("_plugin"):
            continue
        canonical_name = stem[3:-7]
        canonical = directory / f"{canonical_name}{plugin_extension()}"
        if canonical.is_file():
            entry.unlink(missing_ok=True)


def system_plugin_ready(name: str) -> bool:
    plugin = find_plugin_path(name)
    return plugin is not None and plugin.is_file()


def build_system_entry(
    *,
    description: str | None,
    parameters: list[str],
    variables: list[str],
    default_starting_point: list[float] | None,
    builtin: bool = False,
) -> dict:
    entry: dict = {
        "parameters": parameters,
        "variables": variables,
    }
    if description:
        entry["description"] = description
    if default_starting_point is not None:
        entry["default_starting_point"] = default_starting_point
    if builtin:
        entry["builtin"] = True
    return entry
