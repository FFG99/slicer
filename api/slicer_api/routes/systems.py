from fastapi import APIRouter, Form, HTTPException

from slicer_api import systems_registry
from slicer_api.system_compile import compile_and_probe
from slicer_api.systems_registry import (
    build_system_entry,
    find_plugin_path,
    is_builtin_system,
    load_systems_registry,
    parse_optional_float_list,
    plugin_extension,
    save_systems_registry,
    system_response,
)

router = APIRouter(prefix="/systems", tags=["systems"])


@router.get("")
def list_systems():
    registry = load_systems_registry()
    return {
        name: system_response(entry)
        for name, entry in registry.items()
        if isinstance(entry, dict)
    }


@router.get("/{system_name}")
def get_system(system_name: str):
    registry = load_systems_registry()
    entry = registry.get(system_name)
    if not isinstance(entry, dict):
        raise HTTPException(status_code=404, detail="Unknown system")
    return {system_name: system_response(entry)}


@router.post("")
def create_system(
    source: str = Form(...),
    description: str | None = Form(None),
    default_starting_point: str | None = Form(None),
):
    try:
        compiled = compile_and_probe(source)
        starting_point = parse_optional_float_list(default_starting_point)
        if starting_point is not None and len(starting_point) != len(compiled.variables):
            raise ValueError(
                "default_starting_point must have the same number of values as variables"
            )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    name = compiled.name
    registry = load_systems_registry()
    if name in registry:
        raise HTTPException(status_code=409, detail=f"System '{name}' already exists")

    directory = systems_registry.systems_dir()
    directory.mkdir(parents=True, exist_ok=True)

    target_path = directory / f"{name}{plugin_extension()}"
    if target_path.exists():
        raise HTTPException(status_code=409, detail=f"Plugin file already exists for '{name}'")

    target_path.write_bytes(compiled.plugin_bytes)

    registry[name] = build_system_entry(
        description=description.strip() if description else None,
        parameters=compiled.parameters,
        variables=compiled.variables,
        default_starting_point=starting_point,
    )
    try:
        save_systems_registry(registry)
    except OSError as exc:
        target_path.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail="Failed to update systems registry") from exc

    return {name: system_response(registry[name])}


@router.delete("/{system_name}")
def delete_system(system_name: str):
    if is_builtin_system(system_name):
        raise HTTPException(status_code=403, detail=f"Built-in system '{system_name}' cannot be deleted")

    registry = load_systems_registry()
    entry = registry.get(system_name)
    if not isinstance(entry, dict):
        raise HTTPException(status_code=404, detail="Unknown system")
    plugin_path = find_plugin_path(system_name)
    updated = {key: value for key, value in registry.items() if key != system_name}

    try:
        save_systems_registry(updated)
    except OSError as exc:
        raise HTTPException(status_code=500, detail="Failed to update systems registry") from exc

    if plugin_path and plugin_path.exists():
        try:
            plugin_path.unlink()
        except OSError as exc:
            raise HTTPException(
                status_code=500,
                detail="Registry updated but plugin file could not be removed",
            ) from exc

    return {"deleted": system_name}
