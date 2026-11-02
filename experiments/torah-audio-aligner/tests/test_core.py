import json
import copy
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from core import (
    AlignmentError,
    ctc_viterbi,
    digest_json,
    lexical_units,
    propose,
    replay_start,
    reviewed_draft,
    validate_result,
)
from aligner import (
    InferenceWorker,
    InferenceWorkerFailed,
    assert_no_cue_labels,
    bounded_worker,
    work_path,
    write_json,
)

HERE = Path(__file__).resolve().parents[1]


def emissions(sequence, size=4):
    probabilities = np.full((len(sequence), size), 0.01, dtype=np.float32)
    for frame, token in enumerate(sequence):
        probabilities[frame, token] = 0.97
    return np.log(probabilities)


def fixture():
    tokens = [{"tokenKey": f"1:0:0:{index}", "annotatedText": text,
               "position": {"pageNumber": 1, "lineIndex": 0, "fragmentIndex": 0, "wordIndex": index},
               "verse": {"book": 1, "chapter": 1, "verse": 1}}
              for index, text in enumerate(["א", "ב"])]
    recording = {"audioId": "fixture-1", "mediaIdentity": {"algorithm": "sha256", "digest": "a" * 64, "byteLength": 100},
                 "tokens": tokens, "durationSeconds": 2, "narratorId": "test", "readingId": "fixture",
                 "aliyah": 1, "audioFormat": "m4a", "split": "evaluation"}
    bundle = {"textPagesSha256": "b" * 64, "tokenizationVersion": "v2", "recordings": [recording]}
    result = {"schemaVersion": "torah-aligner-proposal-v1", "inputSha256": digest_json(bundle),
              "audioId": recording["audioId"], "mediaIdentity": recording["mediaIdentity"],
              "textPagesSha256": bundle["textPagesSha256"], "tokenizationVersion": "v2", "sampleRate": 16000,
              "events": [], "occurrences": [
                  {"occurrenceId": "one", "tokenKey": tokens[0]["tokenKey"], "sourceStartSample": 4000, "sourceEndSample": 8000},
                  {"occurrenceId": "two", "tokenKey": tokens[1]["tokenKey"], "sourceStartSample": 16000, "sourceEndSample": 20000},
              ]}
    review = {"resultSha256": digest_json(result), "reviewer": "fixture-reviewer", "performanceReviewedLinear": True,
              "acceptedOccurrenceIds": ["one", "two"]}
    return bundle, recording, result, review


class AcousticDecoderTests(unittest.TestCase):
    def test_leading_and_trailing_silence_do_not_move_start_to_zero(self):
        spans = ctc_viterbi(emissions([0, 0, 1, 1, 0, 2, 2, 0]), [1, 2], 0)
        self.assertEqual([(item["startFrame"], item["endFrame"]) for item in spans], [(2, 4), (5, 7)])

    def test_sustained_letter_stays_one_occurrence(self):
        spans = ctc_viterbi(emissions([0] + [1] * 35 + [0]), [1], 0)
        self.assertEqual(len(spans), 1)
        self.assertEqual(spans[0]["endFrame"] - spans[0]["startFrame"], 35)

    def test_checkpointed_traceback_matches_full_path_including_ties_and_repeats(self):
        rng = np.random.default_rng(147)
        labels = [1, 1, 2, 0, 2, 2, 1]
        for frames in (200, 219, 400):
            probabilities = rng.uniform(.001, 1, (frames, 4)).astype(np.float32)
            probabilities /= probabilities.sum(axis=1, keepdims=True)
            for matrix in (np.log(probabilities), np.full((frames, 4), -np.log(4), dtype=np.float32)):
                with self.subTest(frames=frames, tied=bool(np.all(matrix == matrix[0, 0]))):
                    full = ctc_viterbi(matrix, labels, 3)
                    checkpointed = ctc_viterbi(matrix, labels, 3, max_cells=1500)
                    self.assertEqual(checkpointed, full)

    def test_end_to_end_synthetic_emissions_produce_unreviewed_proposal(self):
        bundle, recording, _, _ = fixture()
        checkpoint = {"id": "synthetic", "revision": "test", "vocabulary": {"א": 1, "ב": 2, "|": 0},
                      "blankId": 3, "sampleRate": 16000}
        values = emissions([3, 1, 1, 0, 2, 2, 3])
        result = propose(bundle, recording, values, np.arange(7) * 320,
                         {"frameStepSamples": 320, "decodedSamples": 2600}, checkpoint)
        self.assertEqual(result["occurrences"][0]["sourceStartSample"], 320)
        self.assertEqual(result["occurrences"][1]["sourceStartSample"], 1280)
        self.assertIsNone(result["occurrences"][0]["calibratedConfidence"])
        self.assertIsNone(result["occurrences"][0]["pronunciationAssessment"])
        self.assertEqual(result["eventDetection"], "not-implemented")


class TorahMappingTests(unittest.TestCase):
    def test_maqaf_preserves_group_and_separate_lexical_ids(self):
        tokens = [{"tokenKey": "1:0:0:0", "annotatedText": "אֶת־כָּל־הָעָם׃"}]
        units = lexical_units(tokens)
        self.assertEqual([unit["alignmentText"] for unit in units], ["את", "כל", "העם"])
        self.assertEqual(len({unit["tokenKey"] for unit in units}), 1)
        self.assertEqual(len({unit["lexicalKey"] for unit in units}), 3)

    def test_trailing_maqaf_and_paseq_make_no_phantom_words(self):
        self.assertEqual(len(lexical_units([{"tokenKey": "1", "annotatedText": "אֶת־"}])), 1)
        self.assertEqual(lexical_units([{"tokenKey": "1", "annotatedText": "הַיּוֹם ׀"}])[0]["alignmentText"], "היום")

    def test_input_leakage_and_output_path_escape_are_rejected(self):
        with self.assertRaisesRegex(AlignmentError, "leaked"):
            assert_no_cue_labels({"tokens": [{"timeStart": 1.5}]})
        with self.assertRaisesRegex(AlignmentError, "inside"):
            work_path("../../../audio-cues/test.json")


class DraftContractTests(unittest.TestCase):
    def test_export_normalizes_only_playback_copy_and_passes_real_validator(self):
        bundle, recording, result, review = fixture()
        payload = reviewed_draft(bundle, recording, result, review)
        self.assertEqual(payload["cues"][0]["timeStart"], 0)
        self.assertEqual(result["occurrences"][0]["sourceStartSample"], 4000)
        self.assertNotIn("timeEnd", payload["cues"][0])
        process = subprocess.run(["node", "--import", "tsx", str(HERE / "check-draft.mts")],
                                 cwd=HERE.parent.parent, input=json.dumps(payload), text=True, capture_output=True)
        self.assertEqual(process.returncode, 0, process.stderr)

    def test_repeated_occurrences_are_retained_but_export_is_blocked(self):
        bundle, recording, result, review = fixture()
        result["occurrences"].append({"occurrenceId": "repeat", "tokenKey": "1:0:0:0", "sourceStartSample": 22000, "sourceEndSample": 24000})
        validate_result(bundle, recording, result)
        review.update(resultSha256=digest_json(result), acceptedOccurrenceIds=["one", "two", "repeat"])
        with self.assertRaisesRegex(AlignmentError, "flattened"):
            reviewed_draft(bundle, recording, result, review)

    def test_missing_words_insertions_and_events_block_export(self):
        for kind in ["missing", "unassigned", "event"]:
            bundle, recording, result, review = fixture()
            if kind == "missing":
                result["occurrences"].pop()
            elif kind == "unassigned":
                result["occurrences"][1]["tokenKey"] = None
            else:
                result["events"] = [{"kind": "restart", "sourceStartSample": 10000}]
            review.update(resultSha256=digest_json(result), acceptedOccurrenceIds=[item["occurrenceId"] for item in result["occurrences"]])
            with self.assertRaisesRegex(AlignmentError, "flattened"):
                reviewed_draft(bundle, recording, result, review)

    def test_stale_review_and_unreviewed_performance_are_rejected(self):
        bundle, recording, result, review = fixture()
        result["occurrences"][0]["sourceStartSample"] += 1
        with self.assertRaisesRegex(AlignmentError, "exact proposal"):
            reviewed_draft(bundle, recording, result, review)
        review.update(resultSha256=digest_json(result), performanceReviewedLinear=False)
        with self.assertRaisesRegex(AlignmentError, "Complete audio"):
            reviewed_draft(bundle, recording, result, review)

    def test_mismatched_media_text_and_invalid_coordinates_are_rejected(self):
        for mutation in ["mediaIdentity", "textPagesSha256", "overlap", "nan", "outside", "duplicate"]:
            bundle, recording, result, _ = fixture()
            if mutation in {"mediaIdentity", "textPagesSha256"}:
                result[mutation] = "wrong"
            elif mutation == "overlap":
                result["occurrences"][1]["sourceStartSample"] = 7999
            elif mutation == "nan":
                result["occurrences"][0]["sourceStartSample"] = float("nan")
            elif mutation == "outside":
                result["occurrences"][1]["sourceEndSample"] = 99999
            else:
                result["occurrences"][1]["occurrenceId"] = "one"
            with self.assertRaises(AlignmentError):
                validate_result(bundle, recording, result)

    def test_preroll_never_alters_onset_and_respects_segment_start(self):
        self.assertEqual(replay_start(16000), 12000)
        self.assertEqual(replay_start(1000), 0)
        self.assertEqual(replay_start(16000, segment_start=15000), 15000)

    def test_playback_lead_changes_only_export_and_ends_need_separate_review(self):
        bundle, recording, result, review = fixture()
        original = copy.deepcopy(result)
        review["playbackLeadSamples"] = 3648
        draft = reviewed_draft(bundle, recording, result, review)
        self.assertEqual(draft["cues"][1]["timeStart"], .772)
        self.assertEqual(result, original)
        review["includeAcousticEnds"] = True
        with self.assertRaisesRegex(AlignmentError, "end boundary"):
            reviewed_draft(bundle, recording, result, review)
        review["acceptedEndOccurrenceIds"] = ["one", "two"]
        self.assertIn("timeEnd", reviewed_draft(bundle, recording, result, review)["cues"][0])


class EvaluationTests(unittest.TestCase):
    def reference(self, recording):
        return {"audioId": recording["audioId"], "mediaIdentity": recording["mediaIdentity"],
                "kind": "legacy-playback-starts-not-acoustic-ground-truth", "cues": [
                    {"tokenKey": "1:0:0:0", "timeStart": 0, "excludedFromTiming": True},
                    {"tokenKey": "1:0:0:1", "timeStart": 1.0}]}

class ProcessAndStorageTests(unittest.TestCase):

    def test_output_refuses_public_destination(self):
        with self.assertRaisesRegex(AlignmentError, "inside"):
            write_json(HERE.parent.parent / "audio-cues/forbidden.json", {})

    def test_run_returns_failures_without_success_fallback(self):
        result = bounded_worker([sys.executable, "-c", "import sys; print('expected', file=sys.stderr); sys.exit(7)"], timeout=2)
        self.assertEqual(result.returncode, 7)
        self.assertIn("expected", result.stderr)


# Speaks the inference server's line protocol without loading a model.
FAKE_INFERENCE_SERVER = r"""
import json, os, subprocess, sys, time
from pathlib import Path
print(json.dumps({"ready": True, "implementation": {"version": Path(sys.argv[1]).read_text()}}), flush=True)
for line in sys.stdin:
    request = json.loads(line)
    if request.get("crash"):
        print("ERROR: simulated crash", file=sys.stderr, flush=True)
        sys.exit(3)
    if request.get("child"):
        subprocess.Popen([sys.executable, "-c", request["child"]])
    time.sleep(request.get("sleep", 0))
    if request.get("fail"):
        print("simulated traceback", file=sys.stderr, flush=True)
        print(json.dumps({"ok": False, "error": "bad input"}), flush=True)
        continue
    print(json.dumps({"ok": True, "result": {"pid": os.getpid()}}), flush=True)
"""


class InferenceWorkerTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name)
        self.version = self.root / "version"
        self.version.write_text("1")
        self.worker = self.make_worker(idle_seconds=60)

    def make_worker(self, idle_seconds):
        worker = InferenceWorker([sys.executable, "-c", FAKE_INFERENCE_SERVER, str(self.version)], idle_seconds,
                                 lambda: {"implementation": {"version": self.version.read_text()}, "weights": [0]})
        self.addCleanup(worker.stop)
        return worker

    def pid(self, worker=None, timeout=5):
        return (worker or self.worker).run({}, timeout)["result"]["pid"]

    def test_reuses_one_process_until_the_code_changes(self):
        first = self.pid()
        self.assertEqual(self.pid(), first)
        self.version.write_text("2")
        self.assertNotEqual(self.pid(), first)

    def test_timeout_stops_the_process_group_and_the_next_recording_starts_fresh(self):
        first = self.pid()
        marker = self.root / "should-not-exist"
        child = "import time; from pathlib import Path; time.sleep(.35); Path(" + repr(str(marker)) + ").write_text('orphan')"
        with self.assertRaises(subprocess.TimeoutExpired):
            self.worker.run({"child": child, "sleep": 3}, .15)
        time.sleep(.3)
        self.assertFalse(marker.exists())
        self.assertNotEqual(self.pid(), first)

    def test_a_crash_reports_its_stderr_and_the_next_recording_starts_fresh(self):
        first = self.pid()
        with self.assertRaises(InferenceWorkerFailed) as raised:
            self.worker.run({"crash": True}, 5)
        self.assertIn("ERROR: simulated crash", raised.exception.stderr)
        self.assertNotEqual(self.pid(), first)

if __name__ == "__main__":
    unittest.main()
