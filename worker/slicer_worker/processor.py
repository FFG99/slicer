import logging
import signal
import subprocess
import time
import traceback
import uuid
from dataclasses import dataclass
from pathlib import Path
from threading import Event, Thread

from sqlalchemy import select
from prometheus_client import Counter, Gauge

from slicer_worker.artifacts import read_frame_from_artifact, upload_artifact, write_job_file
from slicer_worker.config import settings
from slicer_worker.db import get_session
from slicer_worker.models import Run

logger = logging.getLogger(__name__)

POLL_INTERVAL_SECONDS = 1.0
TERMINATE_TIMEOUT_SECONDS = 5.0
PROGRESS_PREFIX = "SLICER_PROGRESS "
INTERRUPTED_MESSAGE = (
    "Computation interrupted (worker stopped). Restart the run to try again."
)
RUNS_FINISHED = Counter("slicer_worker_runs_finished_total", "Finished runs", ["status"])
RUNS_RUNNING = Gauge("slicer_worker_current_run", "Whether this worker is executing a run")

_current_run_id: uuid.UUID | None = None
_current_process: subprocess.Popen[str] | None = None
_shutdown_handlers_registered = False
_shutdown_requested = False


@dataclass
class RunRecord:
    id: uuid.UUID
    calculation_type: str
    system: str
    parameters: dict


def parse_progress_line(line: str) -> float | None:
    stripped = line.strip()
    if not stripped.startswith(PROGRESS_PREFIX):
        return None
    try:
        value = float(stripped[len(PROGRESS_PREFIX) :])
    except ValueError:
        return None
    return max(0.0, min(1.0, value))


def update_run_progress(run_id: uuid.UUID, progress: float) -> None:
    session = get_session()
    try:
        run = session.get(Run, run_id)
        if run is None or run.status not in {"queued", "running"}:
            return
        current = run.progress if run.progress is not None else -1.0
        if progress < current:
            return
        run.progress = progress
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def get_run_status(run_id: uuid.UUID) -> str | None:
    session = get_session()
    try:
        run = session.get(Run, run_id)
        return run.status if run is not None else None
    finally:
        session.close()


def claim_next_run() -> RunRecord | None:
    session = get_session()
    try:
        run = session.scalar(
            select(Run)
            .where(Run.status == "queued")
            .order_by(Run.created_at.asc())
            .with_for_update(skip_locked=True)
            .limit(1)
        )
        if run is None:
            session.rollback()
            return None

        run.status = "running"
        run.progress = 0.0
        session.commit()
        return RunRecord(
            id=run.id,
            calculation_type=run.calculation_type,
            system=run.system,
            parameters=run.parameters,
        )
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def mark_run_done(run_id: uuid.UUID, artifact_key: str, frame: dict) -> None:
    session = get_session()
    try:
        run = session.get(Run, run_id)
        if run is None:
            raise RuntimeError(f"Run {run_id} disappeared")
        if run.status == "cancelled":
            return
        run.status = "done"
        run.progress = 1.0
        run.artifact_key = artifact_key
        run.frame = frame
        run.error_message = None
        session.commit()
        RUNS_FINISHED.labels("done").inc()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def mark_run_failed(run_id: uuid.UUID, error_message: str) -> None:
    session = get_session()
    try:
        run = session.get(Run, run_id)
        if run is None:
            return
        if run.status == "cancelled":
            return
        run.status = "failed"
        run.error_message = error_message[:4000]
        session.commit()
        RUNS_FINISHED.labels("failed").inc()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def recover_orphaned_runs() -> int:
    """Mark runs left in `running` after a previous worker died."""
    session = get_session()
    try:
        runs = session.scalars(select(Run).where(Run.status == "running")).all()
        if not runs:
            session.rollback()
            return 0

        for run in runs:
            run.status = "failed"
            run.error_message = INTERRUPTED_MESSAGE
            logger.warning("Recovered orphaned run %s (was running)", run.id)

        session.commit()
        return len(runs)
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def _set_current_run(run_id: uuid.UUID | None) -> None:
    global _current_run_id
    _current_run_id = run_id


def _set_current_process(process: subprocess.Popen[str] | None) -> None:
    global _current_process
    _current_process = process


def _interrupt_current_run() -> None:
    process = _current_process
    if process is not None and process.poll() is None:
        terminate_process(process)
    if _current_run_id is None:
        return
    mark_run_failed(_current_run_id, INTERRUPTED_MESSAGE)
    logger.warning("Interrupted active run %s during worker shutdown", _current_run_id)


def _handle_shutdown(signum: int, _frame: object | None) -> None:
    global _shutdown_requested
    signal_name = signal.Signals(signum).name
    logger.info("Worker received %s", signal_name)
    _shutdown_requested = True
    _interrupt_current_run()


def register_shutdown_handlers() -> None:
    global _shutdown_handlers_registered
    if _shutdown_handlers_registered:
        return
    signal.signal(signal.SIGTERM, _handle_shutdown)
    signal.signal(signal.SIGINT, _handle_shutdown)
    _shutdown_handlers_registered = True


def shutdown_requested() -> bool:
    return _shutdown_requested


def terminate_process(process: subprocess.Popen[str]) -> None:
    process.terminate()
    try:
        process.wait(timeout=TERMINATE_TIMEOUT_SECONDS)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait()


def drain_process_stderr(
    process: subprocess.Popen[str],
    run_id: uuid.UUID,
    stop_event: Event,
    error_lines: list[str],
) -> None:
    if process.stderr is None:
        return
    for line in process.stderr:
        if stop_event.is_set():
            break
        progress = parse_progress_line(line)
        if progress is not None:
            update_run_progress(run_id, progress)
            continue
        stripped = line.strip()
        if stripped:
            error_lines.append(stripped)


def wait_for_process(
    process: subprocess.Popen[str],
    run_id: uuid.UUID,
    error_lines: list[str],
) -> int | None:
    stop_event = Event()
    stderr_thread = Thread(
        target=drain_process_stderr,
        args=(process, run_id, stop_event, error_lines),
        daemon=True,
    )
    stderr_thread.start()
    started_at = time.monotonic()
    try:
        while True:
            try:
                return process.wait(timeout=POLL_INTERVAL_SECONDS)
            except subprocess.TimeoutExpired:
                if time.monotonic() - started_at >= settings.run_timeout_seconds:
                    terminate_process(process)
                    mark_run_failed(run_id, f"Computation exceeded {settings.run_timeout_seconds} second limit")
                    logger.warning("Run %s exceeded its time limit", run_id)
                    return None
                if _shutdown_requested:
                    return None
                if get_run_status(run_id) == "cancelled":
                    terminate_process(process)
                    logger.info("Run %s cancelled during execution", run_id)
                    return None
    finally:
        stop_event.set()
        stderr_thread.join(timeout=1.0)


def execute_run(run: RunRecord) -> None:
    if get_run_status(run.id) == "cancelled":
        logger.info("Run %s was cancelled before execution", run.id)
        return

    work_dir = Path(settings.work_dir)
    artifact_path = work_dir / f"{run.id}.h5"
    job_path = write_job_file(
        run.id,
        run.calculation_type,
        run.system,
        run.parameters,
        work_dir,
    )

    command = [
        settings.slicer_bin,
        "run",
        "--job",
        str(job_path),
        "--output",
        str(artifact_path),
        "--systems-dir",
        settings.systems_dir,
    ]
    logger.info("Running %s", " ".join(command))

    process: subprocess.Popen[str] | None = None
    stderr_errors: list[str] = []
    _set_current_run(run.id)
    RUNS_RUNNING.set(1)
    try:
        process = subprocess.Popen(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        _set_current_process(process)
        returncode = wait_for_process(process, run.id, stderr_errors)
        if returncode is None:
            if _shutdown_requested and get_run_status(run.id) == "running":
                mark_run_failed(run.id, INTERRUPTED_MESSAGE)
            return

        if returncode != 0:
            details = "\n".join(stderr_errors).strip()
            if not details and process.stdout:
                details = process.stdout.read().strip()
            details = details or f"slicer exited with code {returncode}"
            mark_run_failed(run.id, details)
            logger.error("Run %s failed: %s", run.id, details)
            return

        frame = read_frame_from_artifact(artifact_path)
        artifact_key = upload_artifact(artifact_path, run.id)
        mark_run_done(run.id, artifact_key, frame)
        logger.info("Run %s completed, artifact %s", run.id, artifact_key)
    except Exception:
        if get_run_status(run.id) != "cancelled":
            mark_run_failed(run.id, traceback.format_exc(limit=5))
            logger.exception("Run %s failed", run.id)
    finally:
        _set_current_process(None)
        _set_current_run(None)
        RUNS_RUNNING.set(0)
        if process is not None and process.poll() is None:
            terminate_process(process)
        job_path.unlink(missing_ok=True)
        artifact_path.unlink(missing_ok=True)


def process_once() -> bool:
    run = claim_next_run()
    if run is None:
        return False
    execute_run(run)
    return True
