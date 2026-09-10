"""Observable uncertainty flags. These are review aids, never correctness scores."""

import numpy as np

from core import AlignmentError
from prosody import accent_names


def signal_quality(samples, sample_rate=16000):
    samples = np.asarray(samples, dtype=np.float32)
    if samples.ndim != 1 or not np.isfinite(samples).all() or len(samples) < 1024:
        raise AlignmentError("Signal diagnostics need finite mono audio of at least 1024 samples")
    chunks = samples[:len(samples) // 1024 * 1024].reshape(-1, 1024)
    energy = np.mean(chunks ** 2, axis=1)
    power = abs(np.fft.rfft(chunks * np.hanning(1024), axis=1)) ** 2
    frequencies = np.fft.rfftfreq(1024, 1 / sample_rate)
    active = energy >= max(float(np.quantile(energy, .2)), 1e-10)
    total = float(power[active].sum())
    high = float(power[active][:, frequencies > 1500].sum() / total) if total else 0.0
    low_frames = energy <= np.quantile(energy, .1)
    flatness = np.exp(np.mean(np.log(power + 1e-12), axis=1)) / np.maximum(power.mean(axis=1), 1e-12)
    floor_ratio = float(np.quantile(energy, .1) / max(np.quantile(energy, .5), 1e-12))
    flags = []
    if total == 0 or float(energy.max()) < 1e-10:
        flags.append("near-silent-input")
    elif high < .0001:
        flags.append("severely-restricted-spectral-bandwidth")
    if floor_ratio > .04 and float(np.median(flatness[low_frames])) > .2:
        flags.append("elevated-broadband-background")
    clipping = float(np.mean(abs(samples) >= .9999))
    if clipping > .01:
        flags.append("substantial-clipping")
    return {"flags": flags, "energyAbove1500HzFraction": high, "lowToMedianEnergyRatio": floor_ratio,
            "lowEnergySpectralFlatness": float(np.median(flatness[low_frames])), "clippedSampleFraction": clipping,
            "thresholdStatus": "Conservative engineering diagnostics; not population-calibrated"}


def repeated_prefixes(emissions, occurrences, vocabulary, blank_id, frame_step=320):
    """Keep a repeated initial acoustic label visible even when the graph merges it."""
    emissions = np.asarray(emissions)
    best = emissions.argmax(axis=1)
    events = []
    for index, word in enumerate(occurrences):
        if word.get("restarted"):
            continue
        start = word["sourceStartSample"] // frame_step
        limit = occurrences[index + 1]["sourceStartSample"] // frame_step if index + 1 < len(occurrences) else len(best)
        limit = min(limit, start + 80)
        initial = vocabulary[word["alignmentText"][0]]
        runs = []
        previous = blank_id
        for frame in range(start, limit):
            label = int(best[frame])
            if label != previous and label != blank_id:
                runs.append((frame, label, float(np.exp(emissions[frame, label]))))
            previous = label
        if (len(runs) >= 2 and runs[0][1] == runs[1][1] == initial
                and min(runs[0][2], runs[1][2]) >= .65
                and runs[1][0] - runs[0][0] >= 9
                and not word["alignmentText"].startswith(word["alignmentText"][0] * 2)):
            events.append({"kind": "ambiguous_repeated_prefix", "lexicalKey": word["lexicalKey"],
                           "tokenKey": word["tokenKey"], "sourceStartSample": runs[0][0] * frame_step,
                           "secondPrefixSample": runs[1][0] * frame_step,
                           "hypotheses": ["partial-restart", "sustained-or-rearticulated-reading", "acoustic-model-confusion"]})
    return events


def uncertain_word_events(graph, quality):
    degraded = bool(quality["flags"])
    missing = sum(event["kind"] == "candidate_skip" for event in graph["events"])
    coverage = len({item["lexicalKey"] for item in graph["lexicalOccurrences"]})
    weak_coverage = missing / max(1, coverage + missing) > .25
    events = []
    for event in graph["events"]:
        if event["kind"] == "candidate_skip":
            events.append({**event, "kind": "unresolved_word" if degraded or weak_coverage else "candidate_skip",
                           "hypotheses": ["omitted-reading", "masked-or-misaligned-audio"],
                           "pronunciationAssessment": None})
        else:
            events.append(event)
    if degraded:
        events.append({"kind": "unclear_audio", "reasons": quality["flags"], "pronunciationAssessment": None})
    return events


def sustained_tail_regions(lexical, track):
    regions = []
    rate, hop = track["sampleRate"], track["hopSamples"]
    centers, pitch = track["centerSamples"], track["f0Hz"]
    for word, following in zip(lexical, lexical[1:]):
        start, end = word["sourceEndSample"], following["sourceStartSample"]
        if end - start < .35 * rate:
            continue
        mask = (centers >= start) & (centers < end)
        voiced = np.isfinite(pitch[mask])
        if not len(voiced) or voiced.mean() < .6 or not voiced[:min(6, len(voiced))].any():
            continue
        regions.append({"kind": "possible_sustained_tail", "lexicalKey": word["lexicalKey"],
                        "tokenKey": word["tokenKey"], "followingLexicalKey": following["lexicalKey"],
                        "sourceStartSample": start, "sourceEndSample": end,
                        "voicedFrameFraction": float(voiced.mean()), "accentNames": accent_names(word["annotatedText"]),
                        "boundaryResolutionSamples": hop,
                        "assignment": "Unresolved between previous-word tail and following-word onset; raw label spans retained"})
    return regions
