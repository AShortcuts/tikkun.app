"""Preparation failures retain the compiler's useful diagnostic without writing results."""

import subprocess
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from aligner import prepare
from core import AlignmentError


class PrepareTests(unittest.TestCase):
    def test_compiler_error_reaches_the_queue_without_stack_trace_noise(self):
        for diagnostic in (
            "Error: Text changed since pilot preparation; refresh the pilot explicitly",
            "[Error: ENOENT: no such file or directory, open '/missing/source.ts']",
        ):
            failure = subprocess.CalledProcessError(
                1, ["node"], stderr=f"node:internal/modules/run_main:111\n\n{diagnostic}\n    at compile\n")
            with self.subTest(diagnostic=diagnostic), \
                    patch("aligner.subprocess.run", side_effect=failure), \
                    patch("aligner.verify_sources") as verify, \
                    patch("aligner.write_json") as write:
                with self.assertRaises(AlignmentError) as raised:
                    prepare(SimpleNamespace(manifest=None, keep_current=True))
                self.assertEqual(str(raised.exception), f"Could not prepare recording text: {diagnostic}")
                self.assertIs(raised.exception.__cause__, failure)
                verify.assert_not_called()
                write.assert_not_called()

    def test_unstructured_compiler_output_is_bounded_and_empty_output_reports_exit_status(self):
        for stderr, expected in (("x" * 5000, "x" * 4000), (None, "Compiler exited with status 1")):
            with self.subTest(stderr=bool(stderr)), patch("aligner.subprocess.run", side_effect=
                    subprocess.CalledProcessError(1, ["node"], stderr=stderr)):
                with self.assertRaises(AlignmentError) as raised:
                    prepare(SimpleNamespace(manifest=None, keep_current=True))
                self.assertEqual(str(raised.exception), f"Could not prepare recording text: {expected}")


if __name__ == "__main__":
    unittest.main()
