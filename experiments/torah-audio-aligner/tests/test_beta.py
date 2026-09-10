"""Private revision and export contracts; these labels are synthetic test data."""

from copy import deepcopy
from pathlib import Path
import tempfile
import unittest

from aligner import WORK, load_json, write_json
from beta_server import byte_range
from beta_store import (BetaStore, RevisionConflict, corrected_proposal, cue_payload,
                        initial_state, validate_state)
from core import AlignmentError, digest_json
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

    def test_initial_state_never_claims_review_and_omits_model_ends(self):
        self.assertFalse(self.state["performanceReviewedLinear"])
        self.assertTrue(all(not row["accepted"] and row["endSample"] is None for row in self.state["occurrences"]))
        with self.assertRaisesRegex(AlignmentError, "identity"):
            cue_payload(self.bundle, self.recording, self.proposal, self.state)

    def test_corrected_start_preserves_original_evidence_and_does_not_gain_confidence(self):
        original = deepcopy(self.proposal)
        self.state["occurrences"][0]["startSample"] += 320
        corrected = corrected_proposal(self.proposal, self.state)
        self.assertEqual(self.proposal, original)
        self.assertEqual(corrected["occurrences"][0]["originalAcousticSpan"]["startSample"], 4000)
        self.assertIsNone(corrected["occurrences"][0]["rawAcousticScore"])
        self.assertIsNone(corrected["occurrences"][0]["pronunciationAssessment"])

    def test_wrong_basis_nonfinite_and_overlapping_edits_are_rejected(self):
        for mutate in [lambda s: s.update(basisSha256="0" * 64),
                       lambda s: s["occurrences"][0].update(startSample=float("nan")),
                       lambda s: s["occurrences"][0].update(startSample=True),
                       lambda s: s["occurrences"][0].update(endSample=20000),
                       lambda s: s["occurrences"][1].update(startSample=4000),
                       lambda s: s["occurrences"][0].update(endAccepted=True),
                       lambda s: s["occurrences"][0].update(tokenKey="unknown")]:
            state = deepcopy(self.state); mutate(state)
            with self.assertRaises(AlignmentError):
                validate_state(self.recording, self.proposal, state)

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

    def test_flag_decision_needs_note_and_original_flag_survives(self):
        self.proposal["events"] = [{"kind": "ambiguous_repeated_prefix", "tokenKey": "1:0:0:0"}]
        self.state = initial_state(self.proposal); self.reviewed()
        with self.assertRaisesRegex(AlignmentError, "flattened"):
            cue_payload(self.bundle, self.recording, self.proposal, self.state)
        self.state["eventReviews"] = {"0": " "}
        with self.assertRaisesRegex(AlignmentError, "Explain"):
            validate_state(self.recording, self.proposal, self.state)
        self.state["eventReviews"] = {"0": "Synthetic decision: steady vowel, no repetition."}
        self.assertEqual(len(cue_payload(self.bundle, self.recording, self.proposal, self.state)["cues"]), 2)
        result = corrected_proposal(self.proposal, self.state)
        self.assertEqual(len(result["humanRevision"]["originalEvents"]), 1)

    def test_ends_need_independent_review_and_cannot_overlap_lead(self):
        self.reviewed(); self.state["includeAcousticEnds"] = True
        with self.assertRaisesRegex(AlignmentError, "end boundary"):
            cue_payload(self.bundle, self.recording, self.proposal, self.state)
        for row, end in zip(self.state["occurrences"], [8000, 20000]):
            row.update(endSample=end, endAccepted=True)
        payload = cue_payload(self.bundle, self.recording, self.proposal, self.state)
        self.assertEqual(payload["cues"][0]["timeEnd"], .5)
        self.state["occurrences"][0]["endSample"] = 15000
        with self.assertRaisesRegex(AlignmentError, "overlap"):
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
    def test_browser_seeking_and_suffix_ranges(self):
        self.assertEqual(byte_range(None, 100), (0, 99, False))
        self.assertEqual(byte_range("bytes=0-1", 100), (0, 1, True))
        self.assertEqual(byte_range("bytes=50-", 100), (50, 99, True))
        self.assertEqual(byte_range("bytes=-20", 100), (80, 99, True))
        self.assertEqual(byte_range("bytes=0-200", 100), (0, 99, True))

    def test_invalid_ranges_fail_without_serving_entire_audio(self):
        for header in ["bytes=100-", "bytes=2-1", "bytes=-0", "bytes=0-1,4-5", "bytes=-", "garbage"]:
            with self.assertRaises(ValueError):
                byte_range(header, 100)


if __name__ == "__main__":
    unittest.main()
