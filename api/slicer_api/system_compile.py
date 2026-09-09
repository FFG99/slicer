import json
import os
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

from slicer_api.config import settings
from slicer_api.systems_registry import plugin_extension, validate_system_name

MAX_SOURCE_BYTES = 100 * 1024
COMPILE_TIMEOUT_SECONDS = 30
PROBE_TIMEOUT_SECONDS = 5


def _resource_limits() -> None:
    """Keep accidental compiler/probe runaway work bounded on Linux hosts."""
    if os.name != "posix":
        return
    import resource

    resource.setrlimit(resource.RLIMIT_CPU, (COMPILE_TIMEOUT_SECONDS, COMPILE_TIMEOUT_SECONDS + 1))
    resource.setrlimit(resource.RLIMIT_FSIZE, (20 * 1024 * 1024, 20 * 1024 * 1024))
    resource.setrlimit(resource.RLIMIT_AS, (1024 * 1024 * 1024, 1024 * 1024 * 1024))


@dataclass(frozen=True)
class CompiledSystem:
    name: str
    parameters: list[str]
    variables: list[str]
    plugin_bytes: bytes


def core_include_dir() -> Path:
    return Path(os.environ.get("SLICER_CORE_INCLUDE", settings.slicer_core_include))


def probe_bin() -> Path:
    return Path(os.environ.get("SLICER_PROBE_BIN", settings.slicer_probe_bin))


def compile_and_probe(source: str) -> CompiledSystem:
    source_bytes = source.encode("utf-8")
    if not source.strip():
        raise ValueError("Source code is empty")
    if len(source_bytes) > MAX_SOURCE_BYTES:
        raise ValueError("Source code is too large")

    include_dir = core_include_dir()
    if not include_dir.is_dir():
        raise ValueError(f"Slicer headers not found at {include_dir}")

    probe_path = probe_bin()
    if not probe_path.is_file():
        raise ValueError(f"System probe binary not found at {probe_path}")

    with tempfile.TemporaryDirectory(prefix="slicer-system-") as tmp:
        tmp_path = Path(tmp)
        source_path = tmp_path / "system.cpp"
        plugin_path = tmp_path / f"system{plugin_extension()}"
        source_path.write_bytes(source_bytes)

        compile_cmd = [
            settings.compiler_bin,
            "-shared",
            "-fPIC",
            "-std=c++20",
            "-O2",
            f"-I{include_dir}",
            str(source_path),
            "-o",
            str(plugin_path),
        ]
        try:
            compile_result = subprocess.run(
                compile_cmd,
                capture_output=True,
                text=True,
                timeout=COMPILE_TIMEOUT_SECONDS,
                check=False,
                preexec_fn=_resource_limits,
            )
        except subprocess.TimeoutExpired as exc:
            raise ValueError("Compilation timed out") from exc

        if compile_result.returncode != 0:
            details = compile_result.stderr.strip() or compile_result.stdout.strip()
            raise ValueError(f"Compilation failed:\n{details}")

        try:
            probe_result = subprocess.run(
                [str(probe_path), str(plugin_path)],
                capture_output=True,
                text=True,
                timeout=PROBE_TIMEOUT_SECONDS,
                check=False,
                preexec_fn=_resource_limits,
            )
        except subprocess.TimeoutExpired as exc:
            raise ValueError("Plugin probe timed out") from exc

        if probe_result.returncode != 0:
            details = probe_result.stderr.strip() or probe_result.stdout.strip()
            raise ValueError(f"Plugin probe failed:\n{details}")

        try:
            metadata = json.loads(probe_result.stdout)
        except json.JSONDecodeError as exc:
            raise ValueError("Failed to read system metadata from plugin") from exc

        name = str(metadata.get("name", "")).strip()
        parameters = metadata.get("parameters")
        variables = metadata.get("variables")
        if not isinstance(name, str):
            raise ValueError("Plugin metadata is missing a valid name")
        if not isinstance(parameters, list) or not parameters:
            raise ValueError("Plugin must define at least one parameter")
        if not isinstance(variables, list) or not variables:
            raise ValueError("Plugin must define at least one variable")

        validate_system_name(name)
        param_names = [str(item) for item in parameters]
        var_names = [str(item) for item in variables]

        return CompiledSystem(
            name=name,
            parameters=param_names,
            variables=var_names,
            plugin_bytes=plugin_path.read_bytes(),
        )
