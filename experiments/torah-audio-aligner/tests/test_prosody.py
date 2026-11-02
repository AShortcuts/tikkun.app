import sys
from pathlib import Path
import unittest
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from prosody import accent_names, pitch_track


class PitchTests(unittest.TestCase):
    def test_sine_and_harmonic_voice_have_correct_fundamental(self):
        time = np.arange(16000) / 16000
        for signal in [0.3 * np.sin(2 * np.pi * 180 * time),
                       0.15 * np.sin(2 * np.pi * 180 * time) + 0.3 * np.sin(2 * np.pi * 360 * time)]:
            track = pitch_track(signal)
            self.assertLess(abs(np.nanmedian(track["f0Hz"][3:-3]) - 180), 1)
            self.assertTrue(np.all(np.diff(track["centerSamples"]) == 320))

    def test_accent_extraction_does_not_confuse_vowels_and_meteg(self):
        self.assertEqual(accent_names("לֵאלֹהֵֽינוּ׃"), [])
        self.assertEqual(accent_names("הָב֥וּ"), ["merkha"])
        self.assertEqual(accent_names("הַצּוּר֙"), ["pashta"])


if __name__ == "__main__":
    unittest.main()
