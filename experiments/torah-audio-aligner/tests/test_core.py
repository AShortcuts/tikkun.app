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
from core import (AlignmentError, ctc_viterbi, digest_json, frame_geometry, greedy_text,
                  lexical_units, propose, replay_start, reviewed_draft, timing_metrics, validate_result)
from aligner import assert_no_cue_labels, annotation_template, bounded_worker, work_path, write_json

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

    def test_repeated_reference_letters_require_blank(self):
        spans = ctc_viterbi(emissions([0, 1, 1, 0, 1, 1, 0]), [1, 1], 0)
        self.assertEqual([item["startFrame"] for item in spans], [1, 4])
        with self.assertRaisesRegex(AlignmentError, "Too few"):
            ctc_viterbi(emissions([1, 1]), [1, 1], 0)

    def test_sustained_letter_stays_one_occurrence(self):
        spans = ctc_viterbi(emissions([0] + [1] * 35 + [0]), [1], 0)
        self.assertEqual(len(spans), 1)
        self.assertEqual(spans[0]["endFrame"] - spans[0]["startFrame"], 35)

    def test_real_checkpoint_blank_is_not_the_space_token(self):
        matrix = emissions([3, 1, 0, 2, 3])
        spans = ctc_viterbi(matrix, [1, 0, 2], 3)
        self.assertEqual([item["startFrame"] for item in spans], [1, 2, 3])

    def test_invalid_and_oversized_trellises_fail(self):
        for matrix, labels, blank in [(np.array([[np.nan, 0]]), [1], 0),
                                       (np.array([[1.0, -1]]), [1], 0),
                                       (emissions([0, 1]), [0], 0),
                                       (emissions([0, 1]), [8], 0)]:
            with self.assertRaises(AlignmentError):
                ctc_viterbi(matrix, labels, blank)
        with self.assertRaisesRegex(AlignmentError, "budget"):
            ctc_viterbi(emissions([0, 1, 0, 2]), [1, 2], 0, max_cells=5)

    def test_greedy_decode_does_not_use_reference(self):
        self.assertEqual(greedy_text(emissions([3, 1, 1, 3, 1, 0, 2, 3]), {"|": 0, "א": 1, "ב": 2}, 3), "אא ב")

    def test_known_geometry_uses_stride_not_duration_divided_by_frames(self):
        self.assertEqual(frame_geometry([10, 3, 3, 3, 3, 2, 2], [5, 2, 2, 2, 2, 2, 2]), (320, 400))

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

    def test_divine_name_mapping_is_explicitly_unresolved(self):
        self.assertTrue(lexical_units([{"tokenKey": "1", "annotatedText": "לַיהֹוָה"}])[0]["needsSpokenFormReview"])

    def test_annotations_begin_empty_and_first_start_is_eligible(self):
        bundle, _, _, _ = fixture()
        labels = annotation_template(bundle)["recordings"][0]["cues"]
        self.assertTrue(all(label["timeStart"] is None and label["timeEnd"] is None for label in labels))
        self.assertTrue(labels[0]["firstPlaybackCueWasNormalized"])
        self.assertNotIn("excludedFromTiming", labels[0])

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

    def test_legacy_zero_is_excluded_and_difference_is_not_accuracy(self):
        _, recording, result, _ = fixture()
        metrics = timing_metrics(recording, result, self.reference(recording))
        self.assertEqual(metrics["excluded"], 1)
        self.assertEqual(metrics["referenceBoundaries"], 1)
        self.assertEqual(metrics["medianSignedDifferenceSeconds"], 0)
        self.assertFalse(metrics["isAcousticAccuracy"])

    def test_missing_and_ambiguous_predictions_stay_in_denominator(self):
        _, recording, result, _ = fixture()
        reference = self.reference(recording)
        result["occurrences"].pop()
        metrics = timing_metrics(recording, result, reference)
        self.assertEqual(metrics["missing"], 1)
        self.assertEqual(metrics["within200msFractionIncludingMissing"], 0)
        result["occurrences"] = [{"tokenKey": "1:0:0:1", "sourceStartSample": 16000}] * 2
        metrics = timing_metrics(recording, result, reference)
        self.assertEqual(metrics["ambiguousOccurrences"], 1)
        self.assertEqual(metrics["within200msFractionIncludingMissing"], 0)

    def test_unlabeled_human_template_cannot_report_accuracy(self):
        bundle, recording, result, _ = fixture()
        reference = annotation_template(bundle)["recordings"][0]
        metrics = timing_metrics(recording, result, reference)
        self.assertEqual(metrics["referenceBoundaries"], 0)
        self.assertIsNone(metrics["within200msFractionIncludingMissing"])
        self.assertFalse(metrics["isAcousticAccuracy"])
        reference["cues"][0]["timeStart"] = 0.25
        with self.assertRaisesRegex(AlignmentError, "provenance"):
            timing_metrics(recording, result, reference)


class ProcessAndStorageTests(unittest.TestCase):
    def test_worker_timeout_stops_its_descendants(self):
        with tempfile.TemporaryDirectory() as temporary:
            marker = str(Path(temporary) / "should-not-exist")
            child = "import time; from pathlib import Path; time.sleep(.35); Path(" + repr(marker) + ").write_text('orphan')"
            parent = "import subprocess, sys, time; subprocess.Popen([sys.executable, '-c', " + repr(child) + "]); time.sleep(3)"
            with self.assertRaises(subprocess.TimeoutExpired):
                bounded_worker([sys.executable, "-c", parent], timeout=.15)
            time.sleep(.3)
            self.assertFalse(Path(marker).exists())

    def test_output_refuses_public_destination(self):
        with self.assertRaisesRegex(AlignmentError, "inside"):
            write_json(HERE.parent.parent / "audio-cues/forbidden.json", {})

    def test_run_returns_failures_without_success_fallback(self):
        result = bounded_worker([sys.executable, "-c", "import sys; print('expected', file=sys.stderr); sys.exit(7)"], timeout=2)
        self.assertEqual(result.returncode, 7)
        self.assertIn("expected", result.stderr)


if __name__ == "__main__":
    unittest.main()
