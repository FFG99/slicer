import subprocess
import sys
import tempfile
import unittest
import uuid
from unittest.mock import MagicMock, patch

from slicer_worker.config import settings
from slicer_worker.processor import (
    INTERRUPTED_MESSAGE,
    RunRecord,
    execute_run,
    parse_progress_line,
    recover_orphaned_runs,
)


class ProcessOutputTest(unittest.TestCase):
    def run_child(
        self, script: str, statuses: list[str] | None = None
    ) -> tuple[MagicMock, MagicMock]:
        popen = subprocess.Popen
        with (
            tempfile.TemporaryDirectory() as directory,
            patch.object(settings, "work_dir", directory),
            patch.object(settings, "run_timeout_seconds", 3),
            patch(
                "slicer_worker.processor.get_run_status",
                return_value="running",
                side_effect=statuses,
            ),
            patch("slicer_worker.processor.read_frame_from_artifact", return_value={}),
            patch("slicer_worker.processor.upload_artifact", return_value="artifact"),
            patch("slicer_worker.processor.mark_run_done") as done,
            patch("slicer_worker.processor.mark_run_failed") as failed,
            patch("slicer_worker.processor.logger"),
            patch(
                "slicer_worker.processor.subprocess.Popen",
                side_effect=lambda *args, **kwargs: popen(
                    [sys.executable, "-c", script], **kwargs
                ),
            ),
        ):
            execute_run(RunRecord(uuid.uuid4(), "integrate", "custom", {}))
        return done, failed

    def test_noisy_system_and_next_run_complete(self) -> None:
        for script in ("import sys; sys.stdout.write('x' * (4 * 1024 * 1024))", "pass"):
            with self.subTest(script=script):
                done, failed = self.run_child(script)
                done.assert_called_once()
                failed.assert_not_called()

    def test_failure_preserves_stdout_tail(self) -> None:
        done, failed = self.run_child(
            "import sys; sys.stdout.write('x' * (4 * 1024 * 1024)); "
            "print('failure detail'); sys.exit(1)"
        )
        done.assert_not_called()
        failed.assert_called_once()
        message = failed.call_args.args[1]
        self.assertTrue(message.endswith("failure detail"))
        self.assertLessEqual(len(message), 64 * 1024)

    def test_noisy_system_still_times_out(self) -> None:
        done, failed = self.run_child(
            "import sys, time; sys.stdout.write('x' * (4 * 1024 * 1024)); "
            "sys.stdout.flush(); time.sleep(30)"
        )
        done.assert_not_called()
        failed.assert_called_once()
        self.assertIn("second limit", failed.call_args.args[1])

    def test_noisy_system_can_be_cancelled(self) -> None:
        done, failed = self.run_child(
            "import sys, time; sys.stdout.write('x' * (4 * 1024 * 1024)); "
            "sys.stdout.flush(); time.sleep(30)",
            statuses=["running", "cancelled"],
        )
        done.assert_not_called()
        failed.assert_not_called()


class ParseProgressLineTest(unittest.TestCase):
    def test_parses_fraction(self) -> None:
        self.assertEqual(parse_progress_line("SLICER_PROGRESS 0.42\n"), 0.42)

    def test_clamps_to_unit_interval(self) -> None:
        self.assertEqual(parse_progress_line("SLICER_PROGRESS 1.5"), 1.0)
        self.assertEqual(parse_progress_line("SLICER_PROGRESS -0.2"), 0.0)

    def test_ignores_other_lines(self) -> None:
        self.assertIsNone(parse_progress_line("some log line"))


class RecoverOrphanedRunsTest(unittest.TestCase):
    @patch("slicer_worker.processor.get_session")
    def test_marks_running_runs_failed(self, get_session_mock: MagicMock) -> None:
        session = MagicMock()
        get_session_mock.return_value = session
        run = MagicMock()
        run.id = uuid.uuid4()
        run.status = "running"
        session.scalars.return_value.all.return_value = [run]

        recovered = recover_orphaned_runs()

        self.assertEqual(recovered, 1)
        self.assertEqual(run.status, "failed")
        self.assertEqual(run.error_message, INTERRUPTED_MESSAGE)
        session.commit.assert_called_once()

    @patch("slicer_worker.processor.get_session")
    def test_no_running_runs_is_noop(self, get_session_mock: MagicMock) -> None:
        session = MagicMock()
        get_session_mock.return_value = session
        session.scalars.return_value.all.return_value = []

        recovered = recover_orphaned_runs()

        self.assertEqual(recovered, 0)
        session.rollback.assert_called_once()
        session.commit.assert_not_called()


if __name__ == "__main__":
    unittest.main()
