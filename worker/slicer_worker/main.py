import logging
import time

from prometheus_client import start_http_server

from slicer_worker.artifacts import ensure_bucket
from slicer_worker.config import settings
from slicer_worker.processor import (
    process_once,
    recover_orphaned_runs,
    register_shutdown_handlers,
    shutdown_requested,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


def main() -> None:
    ensure_bucket()
    start_http_server(settings.metrics_port)
    register_shutdown_handlers()
    recovered = recover_orphaned_runs()
    if recovered:
        logger.info("Recovered %s orphaned run(s)", recovered)
    logger.info(
        "Worker started (poll=%ss, timeout=%ss, metrics=:%s, slicer=%s, systems=%s)",
        settings.poll_interval_seconds,
        settings.run_timeout_seconds,
        settings.metrics_port,
        settings.slicer_bin,
        settings.systems_dir,
    )

    while not shutdown_requested():
        processed = process_once()
        if not processed:
            time.sleep(settings.poll_interval_seconds)


if __name__ == "__main__":
    main()
