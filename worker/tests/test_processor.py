import unittest
import uuid
from unittest.mock import MagicMock, patch

from slicer_worker.processor import (
    INTERRUPTED_MESSAGE,
    parse_progress_line,
    recover_orphaned_runs,
)


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
