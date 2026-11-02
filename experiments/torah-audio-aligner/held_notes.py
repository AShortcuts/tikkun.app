"""Review hints for words that may start earlier than aligned, after a long held note.

The acoustic model marks a word where it hears a clear consonant, so a word that
follows a sustained cantillation note can be placed late. Two independent signals
must agree before a word is flagged: a clear dip in loudness inside the unassigned
stretch before the word, and some letter evidence from the model in that stretch.
Measured on 46 reviewed aliyot, this flagged 60 words, 15 of which the reviewer
moved earlier.
"""

import sys
import wave

import numpy as np

ENERGY_HOP = 160             # 10 ms loudness frames at 16 kHz
MIN_STRETCH_FRAMES = 15      # ignore stretches shorter than 150 ms
MIN_VALLEY_DB = 6.0          # loudness must dip at least this far between the notes
MIN_EARLIER_SECONDS = 0.3    # the dip must point at least this much earlier
MIN_LETTER_EVIDENCE = 1.0    # summed non-blank probability inside the stretch


def loudness_db(path):
    with wave.open(str(path)) as source:
        if source.getsampwidth() != 2 or source.getnchannels() != 1:
            raise ValueError(f"Expected 16-bit mono analysis audio: {path}")
        samples = np.frombuffer(source.readframes(source.getnframes()), dtype=np.int16).astype(np.float32) / 32768
    count = len(samples) // ENERGY_HOP
    rms = np.sqrt(np.mean(samples[:count * ENERGY_HOP].reshape(count, ENERGY_HOP) ** 2, axis=1) + 1e-10)
    return np.convolve(20 * np.log10(rms), np.ones(3) / 3, mode="same")


def valley_onset(db, previous_end, start):
    """Sample where loudness recovers after the deepest dip, or None without a clear dip."""
    first, last = previous_end // ENERGY_HOP, start // ENERGY_HOP
    if last - first < MIN_STRETCH_FRAMES:
        return None
    stretch = db[first:last + 1]
    lowest = int(np.argmin(stretch))
    depth = min(stretch[:lowest + 1].max(), stretch[lowest:].max()) - stretch[lowest]
    if depth < MIN_VALLEY_DB:
        return None
    rise = lowest
    while rise < len(stretch) - 1 and stretch[rise] < stretch[lowest] + depth / 2:
        rise += 1
    return (first + rise) * ENERGY_HOP


def late_start_hints(tokens, occurrences, db, letter_probability, frame_starts, sample_rate):
    """One hint per word whose aligned start may be late; occurrences are in audio order."""
    first_by_token = {}
    for occurrence in occurrences:
        first_by_token.setdefault(occurrence["tokenKey"], occurrence)
    hints = []
    for previous_token, token in zip(tokens, tokens[1:]):
        previous, current = first_by_token.get(previous_token["tokenKey"]), first_by_token.get(token["tokenKey"])
        if not previous or not current or previous["sourceEndSample"] >= current["sourceStartSample"]:
            continue
        onset = valley_onset(db, previous["sourceEndSample"], current["sourceStartSample"])
        if onset is None or (current["sourceStartSample"] - onset) / sample_rate <= MIN_EARLIER_SECONDS:
            continue
        frames = slice(*np.searchsorted(frame_starts, [previous["sourceEndSample"], current["sourceStartSample"]]))
        if float(letter_probability[frames].sum()) <= MIN_LETTER_EVIDENCE:
            continue
        hints.append({"kind": "possible_late_start", "tokenKey": token["tokenKey"], "sourceStartSample": int(onset),
                      "alignedStartSample": int(current["sourceStartSample"])})
    return hints


def late_start_hints_for_run(tokens, occurrences, run_directory, blank_id, sample_rate):
    """Hints from a run's cached analysis audio and model output; none when that cache is gone."""
    wave_path, emissions_path = run_directory / "analysis.wav", run_directory / "emissions.npz"
    if not wave_path.exists() or not emissions_path.exists():
        print(f"Held-note hints skipped: analysis cache missing in {run_directory}", file=sys.stderr)
        return []
    with np.load(emissions_path) as emissions:
        letter_probability = 1 - np.exp(emissions["log_probs"][:, blank_id].astype(np.float32))
        frame_starts = emissions["frame_starts"]
    return late_start_hints(tokens, occurrences, loudness_db(wave_path), letter_probability, frame_starts, sample_rate)
