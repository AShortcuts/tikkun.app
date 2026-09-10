"""Generated exports retain uncertainty without inventing human approval."""

from copy import deepcopy
import json
import subprocess
import unittest

from aligner import HERE, REPO
from beta_store import initial_state, validate_state
from core import AlignmentError
from generated_cues import generated_draft
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


if __name__ == "__main__":
    unittest.main()
