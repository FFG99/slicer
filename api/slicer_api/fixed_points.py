"""Validation and bounded reads for fixed-point bifurcation diagrams."""
import io
import json
import math

import h5py


def validate_fixed_points(parameters: dict, system: dict) -> None:
    dimension = len(system.get("variables", []))
    if dimension not in (1, 2):
        raise ValueError("Fixed-point diagrams support only 1D and 2D maps")

    def finite(value):
        return not isinstance(value, bool) and isinstance(value, (int, float)) and math.isfinite(value)

    if "start" in parameters or "end" in parameters:
        start, end = parameters.get("start"), parameters.get("end")
        if any(not isinstance(endpoint, dict) or set(endpoint) != set(system["parameters"]) for endpoint in (start, end)):
            raise ValueError("Both endpoints must specify exactly the model parameters")
        if not all(finite(v) for endpoint in (start, end) for v in endpoint.values()):
            raise ValueError("Endpoint parameters must be finite numbers")
        if start == end or any(not math.isfinite(end[k] - start[k]) for k in start):
            raise ValueError("Choose distinct finite parameter endpoints")
    else:
        model = parameters.get("model_parameters")
        if not isinstance(model, dict) or set(model) != set(system["parameters"]):
            raise ValueError("Specify exactly the model parameters")
        if not all(finite(v) for v in model.values()):
            raise ValueError("Model parameters must be finite numbers")
        if parameters.get("parameter") not in system["parameters"]:
            raise ValueError("Unknown sweep parameter")
        lo, hi = parameters.get("parameter_min"), parameters.get("parameter_max")
        if not finite(lo) or not finite(hi) or lo >= hi or not math.isfinite(hi - lo):
            raise ValueError("Parameter bounds must be finite and ordered")
    lower, upper = parameters.get("state_min"), parameters.get("state_max")
    if not isinstance(lower, list) or not isinstance(upper, list) or len(lower) != dimension or len(upper) != dimension:
        raise ValueError("State bounds must match map dimension")
    if any(not finite(a) or not finite(b) or a >= b or not math.isfinite(b - a) for a, b in zip(lower, upper)):
        raise ValueError("State bounds must be finite and ordered")
    for name, default, low, high in [
        ("steps", 201, 2, 1000), ("seeds_per_axis", 9, 2, 32), ("max_iterations", 40, 1, 100),
        ("tolerance", 1e-10, 1e-13, 1e-4), ("derivative_step", 1e-5, 1e-7, 1e-2),
        ("stability_tolerance", 1e-6, 1e-9, .01),
    ]:
        value = parameters.get(name, default)
        if not finite(value) or not low <= value <= high:
            raise ValueError(f"{name} must be between {low} and {high}")
        if name in {"steps", "seeds_per_axis", "max_iterations"} and not isinstance(value, int):
            raise ValueError(f"{name} must be an integer")
    work = parameters.get("steps", 201) * (parameters.get("seeds_per_axis", 9) ** dimension + 64) * parameters.get("max_iterations", 40)
    if work > 2_000_000:
        raise ValueError("Newton work limit exceeded; reduce steps, seeds or iterations")


def read_fixed_points(data: bytes, offset: int = 0, limit: int = 1000) -> dict:
    if offset < 0 or not 1 <= limit <= 1000:
        raise ValueError("Invalid sample range")
    with h5py.File(io.BytesIO(data), "r") as handle:
        path = "artifacts/main/fixed_points_json"
        if path not in handle:
            raise ValueError("Artifact is not a fixed-point diagram")
        raw = handle[path][()]
        result = json.loads(raw.decode("utf-8") if isinstance(raw, bytes) else raw)
    samples = result.pop("samples")
    selected = samples[offset:offset + limit]
    if len(result.get("variables", [])) == 1:
        legacy_types = {"stable": "attracting", "stable_node": "attracting",
                        "repeller": "repelling", "repeller_node": "repelling"}
        for sample in selected:
            for point in sample["points"]:
                stored_type = point.get("type")
                if stored_type in legacy_types:
                    point["stored_type"] = stored_type
                    point["type"] = legacy_types[stored_type]
    return {**result, "total": len(samples), "offset": offset, "samples": selected}
