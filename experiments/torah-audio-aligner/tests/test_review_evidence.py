import sys
from pathlib import Path
import unittest
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from core import AlignmentError
from prosody import pitch_track
from review_evidence import signal_quality, repeated_prefixes, sustained_tail_regions, uncertain_word_events


class ReviewEvidenceTests(unittest.TestCase):
    def test_band_limited_audio_is_unclear_not_a_proven_omission(self):
        t = np.arange(32000) / 16000
        quality = signal_quality(.2 * np.sin(2 * np.pi * 180 * t))
        self.assertIn("severely-restricted-spectral-bandwidth", quality["flags"])
        graph = {"lexicalOccurrences": [], "events": [{"kind": "candidate_skip", "tokenKey": "a"}]}
        event = uncertain_word_events(graph, quality)[0]
        self.assertEqual(event["kind"], "unresolved_word")
        self.assertIsNone(event["pronunciationAssessment"])

    def test_invalid_signal_and_silence_are_explicit(self):
        with self.assertRaises(AlignmentError):
            signal_quality(np.array([np.nan] * 2048))
        self.assertIn("near-silent-input", signal_quality(np.zeros(2048))["flags"])

    def test_repeated_acoustic_prefix_retains_two_source_times(self):
        values = np.full((70, 4), -12.0)
        values[:, 3] = -.001
        for frame in [5, 40]:
            values[frame, :] = -12
            values[frame, 0] = -.001
        occurrence = {"lexicalKey": "a/0", "tokenKey": "a", "alignmentText": "ab",
                      "sourceStartSample": 1600, "sourceEndSample": 21000}
        events = repeated_prefixes(values, [occurrence], {"a": 0, "b": 1}, 3)
        self.assertEqual(events[0]["sourceStartSample"], 1600)
        self.assertEqual(events[0]["secondPrefixSample"], 12800)
        self.assertEqual(events[0]["kind"], "ambiguous_repeated_prefix")

    def test_voiced_gap_is_a_review_region_without_rewriting_word_end(self):
        t = np.arange(48000) / 16000
        track = pitch_track(.2 * np.sin(2 * np.pi * 180 * t))
        words = [{"lexicalKey": "a/0", "tokenKey": "a", "annotatedText": "a",
                  "sourceStartSample": 1000, "sourceEndSample": 16000},
                 {"lexicalKey": "b/0", "tokenKey": "b", "annotatedText": "b",
                  "sourceStartSample": 32000, "sourceEndSample": 47000}]
        regions = sustained_tail_regions(words, track)
        self.assertEqual(regions[0]["sourceStartSample"], 16000)
        self.assertEqual(words[0]["sourceEndSample"], 16000)
        track["f0Hz"][:] = np.nan
        self.assertEqual(sustained_tail_regions(words, track), [])


if __name__ == "__main__":
    unittest.main()
