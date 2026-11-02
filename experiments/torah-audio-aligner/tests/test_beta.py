"""Private revision and export contracts; these labels are synthetic test data."""

from pathlib import Path
import tempfile
import unittest

from aligner import WORK, load_json, write_json
from beta_server import byte_range
from beta_store import (BetaStore, RevisionConflict, corrected_proposal, cue_payload,
                        initial_state, validate_state)
from core import AlignmentError
from test_core import fixture


class PrivateReviewTests(unittest.TestCase):

    def setUp(self):
        self.bundle, self.recording, self.proposal, _ = fixture()
        self.state = initial_state(self.proposal)

    def reviewed(self):
        self.state.update(reviewer="SYNTHETIC TEST ONLY", performanceReviewedLinear=True)
        for row in self.state["occurrences"]:
            row["accepted"] = True
        return self.state

    def test_reviewed_export_normalizes_playback_only(self):
        payload = cue_payload(self.bundle, self.recording, self.proposal, self.reviewed())
        self.assertEqual(payload["cues"][0]["timeStart"], 0)
        self.assertEqual(payload["cues"][1]["timeStart"], (16000 - 3648) / 16000)
        self.assertNotIn("timeEnd", payload["cues"][0])
        self.assertEqual(self.state["occurrences"][0]["startSample"], 4000)

    def test_repeat_is_retained_in_review_package_but_blocks_cues(self):
        self.reviewed()
        self.state["occurrences"].append({**self.state["occurrences"][0], "occurrenceId": "repeat", "startSample": 24000})
        validate_state(self.recording, self.proposal, self.state)
        self.assertEqual(len(corrected_proposal(self.proposal, self.state)["occurrences"]), 3)
        with self.assertRaisesRegex(AlignmentError, "flattened"):
            cue_payload(self.bundle, self.recording, self.proposal, self.state)

    def test_revisions_survive_reload_and_stale_tabs_cannot_overwrite(self):
        with tempfile.TemporaryDirectory(prefix="beta-test-", dir=WORK) as directory:
            entry = {"proposal": self.proposal, "recording": self.recording, "bundle": self.bundle}
            store = BetaStore(directory, {"fixture-1": entry})
            self.state["occurrences"][0]["note"] = "Synthetic edit"
            first = store.save("fixture-1", self.state, None)
            self.state["occurrences"][0]["startSample"] += 320
            second = store.save("fixture-1", self.state, first["revision"])
            self.assertNotEqual(first["revision"], second["revision"])
            restarted = BetaStore(directory, {"fixture-1": entry})
            self.assertEqual(restarted.saved("fixture-1"), second)
            self.assertEqual(restarted.revision("fixture-1", first["revision"]), first)
            with self.assertRaises(RevisionConflict):
                restarted.save("fixture-1", self.state, first["revision"])
            with self.assertRaises(AlignmentError):
                restarted.revision("fixture-1", "../../../outside")
            self.assertEqual(len(restarted.history("fixture-1")), 2)
            path = Path(directory) / "edits/fixture-1/revisions" / (second["revision"] + ".json")
            damaged = load_json(path); damaged["state"]["reviewer"] = "tampered"
            write_json(path, damaged, replace=True)
            with self.assertRaisesRegex(AlignmentError, "identity changed"):
                restarted.saved("fixture-1")


class AudioRangeTests(unittest.TestCase):

    def test_invalid_ranges_fail_without_serving_entire_audio(self):
        for header in ["bytes=100-", "bytes=2-1", "bytes=-0", "bytes=0-1,4-5", "bytes=-", "garbage"]:
            with self.assertRaises(ValueError):
                byte_range(header, 100)


if __name__ == "__main__":
    unittest.main()
