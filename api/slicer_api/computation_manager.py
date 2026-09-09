from typing import Any
import math

from slicer_api.calculation_registry import load_calculation_registry
from slicer_api.systems_registry import (
    load_systems_registry,
    system_plugin_ready,
    validate_system_name,
)


class ComputationValidationError(ValueError):
    pass


def validate_system_available(system: str) -> dict:
    validate_system_name(system)
    registry = load_systems_registry()
    if system not in registry:
        raise ComputationValidationError(f"Unknown system: {system}")
    if not system_plugin_ready(system):
        raise ComputationValidationError(f"Plugin for system '{system}' is not installed")
    return registry[system]


def validate_run_request(
    calculation_type: str,
    system: str,
    parameters: dict[str, Any],
) -> None:
    threshold = parameters.get("escape_threshold")
    if threshold is not None and (isinstance(threshold, bool) or not isinstance(threshold, (int, float)) or not math.isfinite(threshold) or threshold <= 0):
        raise ComputationValidationError("escape_threshold must be positive and finite")
    calculations = load_calculation_registry()
    if calculation_type not in calculations:
        raise ComputationValidationError(f"Unknown calculation_type: {calculation_type}")

    system_def = validate_system_available(system)
    _validate_parameters(calculations[calculation_type], parameters, system_def)


def _validate_parameters(
    calculation_def: dict,
    parameters: dict[str, Any],
    system_def: dict,
) -> None:
    param_defs = calculation_def.get("parameters")
    if not isinstance(param_defs, list):
        return

    for param_def in param_defs:
        if not isinstance(param_def, dict):
            continue
        name = param_def.get("name")
        if not isinstance(name, str) or not name:
            continue

        required = bool(param_def.get("required", False))
        has_default = "default" in param_def
        if name not in parameters:
            if required and not has_default:
                raise ComputationValidationError(f"Missing required parameter: {name}")
            continue

        value = parameters[name]
        _validate_parameter_value(name, value, param_def, system_def)


def _validate_parameter_value(
    name: str,
    value: Any,
    param_def: dict,
    system_def: dict,
) -> None:
    param_type = param_def.get("type")
    if param_type == "string":
        if not isinstance(value, str):
            raise ComputationValidationError(f"Parameter '{name}' must be a string")
        allowed = param_def.get("allowed_values")
        if isinstance(allowed, list) and value not in allowed:
            raise ComputationValidationError(
                f"Parameter '{name}' must be one of: {', '.join(allowed)}"
            )
        options_source = param_def.get("options_source")
        if options_source == "system.parameters":
            options = system_def.get("parameters", [])
            if isinstance(options, list) and value not in options:
                raise ComputationValidationError(
                    f"Parameter '{name}' must be a system parameter ({', '.join(options)})"
                )
        elif options_source == "system.variables":
            options = system_def.get("variables", [])
            if isinstance(options, list) and value not in options:
                raise ComputationValidationError(
                    f"Parameter '{name}' must be a system variable ({', '.join(options)})"
                )
    elif param_type == "boolean":
        if not isinstance(value, bool):
            raise ComputationValidationError(f"Parameter '{name}' must be a boolean")
    elif param_type == "number":
        if not isinstance(value, (int, float)) or isinstance(value, bool):
            raise ComputationValidationError(f"Parameter '{name}' must be a number")
        _validate_range(name, float(value), param_def.get("range"))
    elif param_type == "integer":
        if not isinstance(value, int) or isinstance(value, bool):
            raise ComputationValidationError(f"Parameter '{name}' must be an integer")
        _validate_range(name, value, param_def.get("range"))
    elif param_type == "array":
        if not isinstance(value, list):
            raise ComputationValidationError(f"Parameter '{name}' must be an array")
    elif param_type == "object":
        if not isinstance(value, dict):
            raise ComputationValidationError(f"Parameter '{name}' must be an object")


def _validate_range(name: str, value: float, raw_range: Any) -> None:
    if not isinstance(raw_range, list) or len(raw_range) != 2:
        return
    low, high = raw_range
    if not isinstance(low, (int, float)) or not isinstance(high, (int, float)):
        return
    if value < low or value > high:
        raise ComputationValidationError(
            f"Parameter '{name}' must be between {low} and {high}"
        )
