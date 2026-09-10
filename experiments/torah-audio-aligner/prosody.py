"""Source-timeline acoustic features for exploratory cantillation analysis.

Pitch uses the cumulative-mean-normalized difference and first-trough ideas
from de Cheveigne and Kawahara's YIN (JASA 2002, doi:10.1121/1.1458024).
Periodicity here is a raw feature, not a calibrated voicing probability.
"""

import numpy as np
import unicodedata

from core import AlignmentError


def pitch_track(samples, sample_rate=16000, hop=320, frame_length=1024,
                fmin=70.0, fmax=550.0, trough_threshold=0.2):
    samples = np.asarray(samples, dtype=np.float32)
    if samples.ndim != 1 or not len(samples) or not np.isfinite(samples).all():
        raise AlignmentError("Pitch requires nonempty finite mono audio")
    if not 0 < fmin < fmax < sample_rate / 2 or frame_length < 2 * sample_rate / fmin:
        raise AlignmentError("Pitch window must contain at least two periods at fmin")
    if type(hop) is not int or hop <= 0 or type(frame_length) is not int or frame_length % 2:
        raise AlignmentError("Invalid pitch frame geometry")
    padded = np.pad(samples, frame_length // 2)
    frames = np.lib.stride_tricks.sliding_window_view(padded, frame_length)[::hop][: (len(samples) - 1) // hop + 1]
    minimum, maximum = max(2, int(sample_rate / fmax)), int(np.ceil(sample_rate / fmin))
    f0, periodicity, energy = [], [], []
    lags = np.arange(1, maximum + 2)
    for offset in range(0, len(frames), 512):
        batch = frames[offset:offset + 512].astype(np.float64)
        batch -= batch.mean(axis=1, keepdims=True)
        rms = np.sqrt(np.mean(batch * batch, axis=1))
        spectrum = np.fft.rfft(batch, n=frame_length * 2, axis=1)
        correlation = np.fft.irfft(spectrum * spectrum.conj(), n=frame_length * 2, axis=1)[:, :maximum + 2]
        squares = np.pad(np.cumsum(batch * batch, axis=1), ((0, 0), (1, 0)))
        difference = np.maximum(0, squares[:, -1, None] - squares[:, lags] + squares[:, frame_length - lags] - 2 * correlation[:, lags])
        cumulative = np.cumsum(difference, axis=1)
        normalized = np.ones((len(batch), maximum + 2))
        normalized[:, 1:] = difference * lags / np.maximum(cumulative, 1e-12)
        for row, level in zip(normalized, rms):
            candidates = np.flatnonzero((row[minimum:maximum + 1] < row[minimum - 1:maximum]) &
                                        (row[minimum:maximum + 1] <= row[minimum + 1:maximum + 2]) &
                                        (row[minimum:maximum + 1] <= trough_threshold)) + minimum
            if not len(candidates) or level < 0.0005:
                f0.append(np.nan)
                periodicity.append(0.0)
            else:
                period = int(candidates[0])
                left, center, right = row[period - 1:period + 2]
                curvature = left - 2 * center + right
                adjustment = np.clip((left - right) / (2 * curvature), -0.5, 0.5) if curvature > 1e-12 else 0
                estimate = sample_rate / (period + adjustment)
                f0.append(estimate if fmin <= estimate <= fmax else np.nan)
                periodicity.append(float(max(0, 1 - center)))
            energy.append(float(level))
    return {"centerSamples": np.arange(len(f0), dtype=np.int64) * hop,
            "f0Hz": np.asarray(f0), "periodicity": np.asarray(periodicity), "rms": np.asarray(energy),
            "sampleRate": sample_rate, "hopSamples": hop, "frameLengthSamples": frame_length}


def accent_names(text):
    return list(dict.fromkeys(unicodedata.name(char).removeprefix("HEBREW ACCENT ").lower().replace(" ", "-")
                             for char in text if "\u0591" <= char <= "\u05af"))


def interval_features(track, start_sample, end_sample, reference_hz):
    if not 0 <= start_sample < end_sample or not np.isfinite(reference_hz) or reference_hz <= 0:
        raise AlignmentError("Invalid prosody interval or pitch reference")
    mask = (track["centerSamples"] >= start_sample) & (track["centerSamples"] < end_sample)
    pitch = track["f0Hz"][mask]
    voiced = np.isfinite(pitch)
    result = {"durationSeconds": (end_sample - start_sample) / track["sampleRate"],
              "voicedFrameFraction": float(np.mean(voiced)) if len(pitch) else 0,
              "pitchMedianSemitones": None, "pitchRangeSemitones": None, "pitchChangeSemitones": None}
    if voiced.sum() >= 5 and voiced.mean() >= 0.35:
        semitones = 12 * np.log2(pitch[voiced] / reference_hz)
        width = max(1, len(semitones) // 3)
        result.update(pitchMedianSemitones=float(np.median(semitones)),
                      pitchRangeSemitones=float(np.quantile(semitones, .9) - np.quantile(semitones, .1)),
                      pitchChangeSemitones=float(np.median(semitones[-width:]) - np.median(semitones[:width])))
    return result
