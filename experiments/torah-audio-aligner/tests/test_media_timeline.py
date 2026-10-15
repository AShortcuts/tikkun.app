"""Decode short local fixtures without running an acoustic model."""

import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import numpy as np

from acoustics import read_wave
from aligner import decode_audio, probe
from core import AlignmentError


class MediaTimelineTests(unittest.TestCase):
    def test_positive_aac_start_is_padded_to_original_playback_time(self):
        with tempfile.TemporaryDirectory() as directory:
            source, output = Path(directory) / "offset.m4a", Path(directory) / "analysis.wav"
            subprocess.run(["ffmpeg", "-v", "error", "-nostdin", "-f", "lavfi", "-i",
                            "sine=frequency=500:sample_rate=44100:duration=0.4", "-c:a", "aac",
                            "-output_ts_offset", "0.05", str(source)], check=True, timeout=10)
            info = json.loads(subprocess.check_output(["ffprobe", "-v", "error", "-show_format",
                                                       "-of", "json", str(source)], timeout=10))
            recording = {"mediaPath": str(source), "durationSeconds": float(info["format"]["duration"])}
            metadata = decode_audio(recording, output)
            origin = metadata["presentationTimeMapping"]["audioStreamStartSeconds"]
            self.assertGreater(origin, .02)
            samples = read_wave(output)
            self.assertTrue(np.all(samples[:int((origin - .003) * 16000)] == 0))
            self.assertGreater(float(np.max(np.abs(samples[int((origin + .02) * 16000):]))), .01)
            self.assertLess(abs(len(samples) / 16000 - recording["durationSeconds"]), .1)
            self.assertEqual(metadata["presentationTimeMapping"]["sampleZeroPlaybackSeconds"], 0)

    def test_zero_origin_pcm_keeps_every_sample(self):
        import wave
        with tempfile.TemporaryDirectory() as directory:
            source, output = Path(directory) / "source.wav", Path(directory) / "analysis.wav"
            pcm = np.arange(8000, dtype="<i2")
            with wave.open(str(source), "wb") as audio:
                audio.setparams((1, 2, 16000, 0, "NONE", "not compressed"))
                audio.writeframes(pcm.tobytes())
            decode_audio({"mediaPath": str(source), "durationSeconds": .5}, output)
            with wave.open(str(output), "rb") as audio:
                self.assertEqual(audio.readframes(audio.getnframes()), pcm.tobytes())

    def test_nonfinite_or_out_of_range_origins_are_rejected(self):
        for origin in ("nan", "inf", "-inf", "50", "-50"):
            info = {"streams": [{"start_time": origin}], "format": {"duration": "2", "start_time": origin}}
            with self.subTest(origin=origin), patch("aligner.subprocess.check_output", return_value=json.dumps(info)):
                with self.assertRaisesRegex(AlignmentError, "presentation origin"):
                    probe({"mediaPath": "unused", "durationSeconds": 2})
