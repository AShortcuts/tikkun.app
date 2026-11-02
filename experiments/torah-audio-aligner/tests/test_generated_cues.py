"""Generated exports retain uncertainty without inventing human approval."""

from copy import deepcopy
import json
import subprocess
import unittest

import numpy as np

from aligner import HERE, REPO
from beta_store import initial_state, validate_state
from core import AlignmentError
from generated_cues import generated_draft
from held_notes import late_start_hints
from test_core import fixture


class GeneratedCueTests(unittest.TestCase):
    def setUp(self):
        self.bundle, self.recording, self.proposal, _ = fixture()
        self.seed = deepcopy(self.proposal)

    def export(self, state=None):
        state = state or initial_state(self.proposal)
        validate_state(self.recording, self.proposal, state)
        return generated_draft(self.bundle, self.recording, self.proposal, state, self.seed)

    def test_unreviewed_export_passes_tikkun_and_keeps_state_unchanged(self):
        state = initial_state(self.proposal)
        before = deepcopy(state)
        payload = self.export(state)
        self.assertEqual(state, before)
        self.assertEqual(payload["cues"][0]["timeStart"], 0)
        self.assertEqual(payload["cues"][1]["timeStart"], .772)
        self.assertTrue(all(cue["review"]["status"] == "pending" for cue in payload["cues"]))
        result = subprocess.run(["node", "--import", "tsx", str(HERE / "check-draft.mts")],
                                input=json.dumps(payload), text=True, capture_output=True, cwd=REPO)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_pending_and_resolved_flags_survive_with_notes_and_original_time(self):
        self.proposal["events"] = [{"kind": "candidate_skip", "tokenKey": "1:0:0:1"},
                                   {"kind": "unclear_audio", "sourceStartSample": 17000}]
        state = initial_state(self.proposal)
        state["eventReviews"] = {"1": "Listened; timing corrected."}
        flags = self.export(state)["cues"][1]["review"]["flags"]
        self.assertEqual([flag["status"] for flag in flags], ["pending", "reviewed"])
        self.assertEqual(flags[1]["note"], state["eventReviews"]["1"])
        self.assertEqual(flags[1]["sourceTime"], 17000 / 16000)
        self.assertEqual(len(self.proposal["events"]), 2)

    def test_missing_word_uses_saved_seed_and_remains_flagged(self):
        self.proposal["occurrences"].pop()
        payload = self.export()
        self.assertEqual(payload["cueCount"], 2)
        self.assertEqual(payload["cues"][1]["timeStart"], .772)
        self.assertEqual(payload["cues"][1]["review"]["flags"][0]["kind"], "unresolved_word")

    def test_conflicting_seed_is_an_explicit_provisional_estimate(self):
        self.proposal["occurrences"].pop(0)
        self.seed["occurrences"][0].update(sourceStartSample=17000, sourceEndSample=19000)
        self.seed["occurrences"][1].update(sourceStartSample=20000, sourceEndSample=24000)
        cue = self.export()["cues"][0]
        self.assertIn("estimated between neighboring words", cue["review"]["flags"][0]["message"])

    def test_repeated_occurrence_is_preserved_as_flag_at_its_source_time(self):
        state = initial_state(self.proposal)
        state["occurrences"].append({**state["occurrences"][0], "occurrenceId": "repeat", "startSample": 24000})
        flag = self.export(state)["cues"][0]["review"]["flags"][0]
        self.assertEqual(flag["kind"], "repeated_word")
        self.assertEqual(flag["sourceTime"], 1.5)
        self.assertEqual(flag["status"], "pending")

    def test_missing_word_without_saved_seed_is_not_silently_fabricated(self):
        self.proposal["occurrences"].pop()
        self.seed["occurrences"].pop()
        with self.assertRaisesRegex(AlignmentError, "No saved timing"):
            self.export()


class ReviewerFlagTests(unittest.TestCase):
    def setUp(self):
        self.bundle, self.recording, self.proposal, _ = fixture()
        self.seed = deepcopy(self.proposal)

    def flags(self, hints=()):
        payload = generated_draft(self.bundle, self.recording, self.proposal, initial_state(self.proposal), self.seed, hints)
        return [[flag["kind"] for flag in cue["review"]["flags"]] for cue in payload["cues"]], payload

    def test_region_anchors_and_close_restarts_are_not_shown(self):
        self.proposal["events"] = [
            {"kind": "uncertain_region_anchor", "beforeTokenKey": "1:0:0:1", "sourceSample": 15000, "quietAnchorFound": False},
            {"kind": "ambiguous_repeated_prefix", "tokenKey": "1:0:0:1", "sourceStartSample": 16000, "secondPrefixSample": 16000 + 9280},
            {"kind": "ambiguous_repeated_prefix", "tokenKey": "1:0:0:1", "sourceStartSample": 16000, "secondPrefixSample": 16000 + 12000},
            {"kind": "candidate_skip", "tokenKey": "1:0:0:1"},
        ]
        kinds, payload = self.flags()
        self.assertEqual(kinds, [[], ["ambiguous_repeated_prefix", "candidate_skip"]])
        # Flag ids keep the original event positions, so saved reviews still match.
        self.assertEqual([flag["id"].rsplit(":", 1)[1] for flag in payload["cues"][1]["review"]["flags"]], ["2", "3"])

    def test_late_start_hint_becomes_a_pending_flag_at_the_suggested_time(self):
        kinds, payload = self.flags([{"kind": "possible_late_start", "tokenKey": "1:0:0:1",
                                      "sourceStartSample": 9600, "alignedStartSample": 16000}])
        self.assertEqual(kinds, [[], ["possible_late_start"]])
        flag = payload["cues"][1]["review"]["flags"][0]
        self.assertEqual((flag["status"], flag["sourceTime"]), ("pending", 0.6))
        self.assertIn("0.4 s earlier", flag["message"])
        self.assertEqual(payload["cues"][1]["review"]["status"], "pending")


class HeldNoteHintTests(unittest.TestCase):
    """A held note (loud), a dip, then the next word's consonant before the aligned start."""
    rate = 16000

    def signals(self, dip_db=-40.0, letters=0.2):
        frames = 200  # 2 s of 10 ms loudness frames
        db = np.full(frames, -15.0)
        db[100:105] = dip_db                     # dip at 1.00-1.05 s
        model_frames = np.arange(0, frames * 160, 320)
        letter = np.full(len(model_frames), letters)
        return db, letter, model_frames

    def hints(self, **options):
        tokens = [{"tokenKey": "a"}, {"tokenKey": "b"}]
        occurrences = [{"tokenKey": "a", "sourceStartSample": 0, "sourceEndSample": int(0.5 * self.rate)},
                       {"tokenKey": "b", "sourceStartSample": int(1.6 * self.rate), "sourceEndSample": int(1.9 * self.rate)}]
        db, letter, starts = self.signals(**options)
        return late_start_hints(tokens, occurrences, db, letter, starts, self.rate)

    def test_dip_and_letter_evidence_flag_an_earlier_start(self):
        [hint] = self.hints()
        self.assertEqual(hint["tokenKey"], "b")
        self.assertAlmostEqual(hint["sourceStartSample"] / self.rate, 1.05, places=2)

    def test_needs_both_a_clear_dip_and_letter_evidence(self):
        self.assertEqual(self.hints(dip_db=-18.0), [])
        self.assertEqual(self.hints(letters=0.01), [])


if __name__ == "__main__":
    unittest.main()
