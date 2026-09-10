import sys
from pathlib import Path
import unittest
import json
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from reading_graph import GraphConfig, reading_graph

VOCAB = {"|": 0, "א": 1, "ב": 2, "ג": 3, "ד": 4, "ה": 5, "ו": 6, "ז": 7, "ח": 8}
BLANK = 9
TOKENS = [{"tokenKey": str(index), "annotatedText": text} for index, text in enumerate(["אב", "גד", "הו"])]


def emitted(words):
    sequence = [BLANK] * 3
    for word in words:
        for character in word:
            sequence += [VOCAB[character]] * 2 + [BLANK] * 2
        sequence += [0] * 2 + [BLANK] * 2
    values = np.full((len(sequence), 10), -12, dtype=np.float32)
    values[np.arange(len(sequence)), sequence] = -0.001
    return values


class ReadingGraphTests(unittest.TestCase):
    def test_clean_reading_has_one_occurrence_per_word(self):
        result = reading_graph(emitted(["אב", "גד", "הו"]), TOKENS, VOCAB, BLANK)
        self.assertEqual([item["tokenKey"] for item in result["lexicalOccurrences"]], ["0", "1", "2"])
        self.assertEqual(result["events"], [])

    def test_phrase_repeat_backtracks_canonical_position_but_not_time(self):
        result = reading_graph(emitted(["אב", "גד", "אב", "גד", "הו"]), TOKENS, VOCAB, BLANK)
        self.assertEqual([item["tokenKey"] for item in result["lexicalOccurrences"]], ["0", "1", "0", "1", "2"])
        self.assertTrue(any(item["kind"] == "candidate_repeat" for item in result["events"]))
        json.dumps(result, allow_nan=False)
        starts = [item["sourceStartSample"] for item in result["lexicalOccurrences"]]
        self.assertEqual(starts, sorted(set(starts)))

    def test_skip_has_no_fabricated_audio_interval(self):
        result = reading_graph(emitted(["אב", "הו"]), TOKENS, VOCAB, BLANK)
        self.assertEqual([item["tokenKey"] for item in result["lexicalOccurrences"]], ["0", "2"])
        skipped = next(item for item in result["events"] if item["kind"] == "candidate_skip")
        self.assertEqual(skipped["tokenKey"], "1")
        self.assertNotIn("sourceStartSample", skipped)

    def test_unassigned_speech_recovers_at_following_word(self):
        result = reading_graph(emitted(["אב", "זחזח", "גד", "הו"]), TOKENS, VOCAB, BLANK)
        self.assertEqual([item["tokenKey"] for item in result["lexicalOccurrences"]], ["0", "1", "2"])
        self.assertTrue(any(item["kind"] == "unassigned_audio" for item in result["events"]))

    def test_partial_attempt_is_preserved(self):
        result = reading_graph(emitted(["א", "אב", "גד", "הו"]), TOKENS, VOCAB, BLANK,
                               config=GraphConfig(partial_restart_penalty=5))
        self.assertEqual([item["tokenKey"] for item in result["lexicalOccurrences"]], ["0", "0", "1", "2"])
        self.assertFalse(result["lexicalOccurrences"][0]["completeWord"])
        json.dumps(result, allow_nan=False)

    def test_long_held_vowel_does_not_create_repeat(self):
        evidence = emitted(["אב", "גד", "הו"])
        evidence = np.concatenate([evidence[:4], np.repeat(evidence[4:5], 300, axis=0), evidence[4:]])
        result = reading_graph(evidence, TOKENS, VOCAB, BLANK)
        self.assertEqual([item["tokenKey"] for item in result["lexicalOccurrences"]], ["0", "1", "2"])
        self.assertEqual(result["events"], [])

    def test_silence_can_abstain_instead_of_inventing_words(self):
        evidence = np.full((100, 10), -12, dtype=np.float32)
        evidence[:, BLANK] = -.001
        result = reading_graph(evidence, TOKENS, VOCAB, BLANK)
        self.assertEqual(result["lexicalOccurrences"], [])
        self.assertEqual([item["tokenKey"] for item in result["events"]], ["0", "1", "2"])

    def test_trailing_skip_is_preserved(self):
        result = reading_graph(emitted(["אב", "גד"]), TOKENS, VOCAB, BLANK)
        self.assertEqual([item["tokenKey"] for item in result["lexicalOccurrences"]], ["0", "1"])
        self.assertIn({"kind": "candidate_skip", "lexicalKey": "2/0", "tokenKey": "2"}, result["events"])


if __name__ == "__main__":
    unittest.main()
