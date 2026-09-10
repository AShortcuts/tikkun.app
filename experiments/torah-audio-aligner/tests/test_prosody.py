import sys
from pathlib import Path
import unittest
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from prosody import accent_names, interval_features, pitch_track


class PitchTests(unittest.TestCase):
    def test_sine_and_harmonic_voice_have_correct_fundamental(self):
        time = np.arange(16000) / 16000
        for signal in [0.3 * np.sin(2 * np.pi * 180 * time),
                       0.15 * np.sin(2 * np.pi * 180 * time) + 0.3 * np.sin(2 * np.pi * 360 * time)]:
            track = pitch_track(signal)
            self.assertLess(abs(np.nanmedian(track["f0Hz"][3:-3]) - 180), 1)
            self.assertTrue(np.all(np.diff(track["centerSamples"]) == 320))

    def test_silence_and_noise_do_not_get_confident_pitch(self):
        noise = np.random.default_rng(2).normal(0, .05, 16000)
        for signal in [np.zeros(16000), noise]:
            track = pitch_track(signal)
            self.assertLess(np.isfinite(track["f0Hz"]).mean(), .05)

    def test_rising_pitch_has_positive_relative_contour(self):
        time = np.arange(16000) / 16000
        signal = .3 * np.sin(2 * np.pi * (150 * time + 75 * time * time))
        track = pitch_track(signal)
        features = interval_features(track, 1600, 14400, 200)
        self.assertGreater(features["pitchChangeSemitones"], 5)
        self.assertGreater(features["voicedFrameFraction"], .9)

    def test_accent_extraction_does_not_confuse_vowels_and_meteg(self):
        self.assertEqual(accent_names("לֵאלֹהֵֽינוּ׃"), [])
        self.assertEqual(accent_names("הָב֥וּ"), ["merkha"])
        self.assertEqual(accent_names("הַצּוּר֙"), ["pashta"])


if __name__ == "__main__":
    unittest.main()
