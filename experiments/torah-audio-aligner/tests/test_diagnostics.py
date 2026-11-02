import sys
from pathlib import Path
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from core import AlignmentError, lexical_units
from diagnostics import display_occurrences
from aligner import input_for_result


class DiagnosticContractTests(unittest.TestCase):
    def test_proposal_uses_its_immutable_bundle_not_latest_pointer(self):
        identity = "a" * 64
        with patch("aligner.current_input", return_value=({"version": "older"}, Path("unused"))) as load:
            result = input_for_result({"inputSha256": identity})
            load.assert_called_once_with("inputs/" + identity + "/input.json")
            self.assertEqual(result[0]["version"], "older")
        with self.assertRaises(AlignmentError):
            input_for_result({"inputSha256": "../../outside"})

    def test_repeated_maqaf_group_remains_two_display_occurrences(self):
        recording = {"audioId": "test", "tokens": [{"tokenKey": "a", "annotatedText": "אב־גד"}]}
        units = lexical_units(recording["tokens"])
        lexical = []
        for index, unit in enumerate(units + units):
            lexical.append({**unit, "sourceStartSample": index * 1000, "sourceEndSample": index * 1000 + 500,
                            "completeWord": True, "restarted": index == 2, "rawAcousticScore": .9})
        occurrences, events = display_occurrences(recording, lexical)
        self.assertEqual(len(occurrences), 2)
        self.assertTrue(all(item["completeDisplayToken"] for item in occurrences))
        self.assertEqual(events, [])

    def test_missing_maqaf_part_cannot_be_marked_complete(self):
        recording = {"audioId": "test", "tokens": [{"tokenKey": "a", "annotatedText": "אב־גד"}]}
        unit = lexical_units(recording["tokens"])[0]
        lexical = [{**unit, "sourceStartSample": 0, "sourceEndSample": 1000,
                    "completeWord": True, "rawAcousticScore": .9}]
        occurrences, events = display_occurrences(recording, lexical)
        self.assertFalse(occurrences[0]["completeDisplayToken"])
        self.assertEqual(events[0]["kind"], "partial_display_token")

if __name__ == "__main__":
    unittest.main()
