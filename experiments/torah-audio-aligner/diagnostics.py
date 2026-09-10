"""Turn verified cached audio into bounded reading hypotheses and a review queue."""

import json
import math
import subprocess
import time
import uuid
import numpy as np

from acoustics import read_wave
from aligner import (HERE, REPO, WORK, CHECKPOINT, current_input, recording_for, verify_sources,
                     file_hash, work_path, write_json, input_for_result)
from analysis_runs import require_budget, record_elapsed
from core import AlignmentError, digest_json, lexical_units, validate_result
from prosody import pitch_track
from reading_graph import reading_graph
from review_evidence import signal_quality, repeated_prefixes, sustained_tail_regions, uncertain_word_events


def verified_samples(directory, metadata, recording):
    waveform = directory / "analysis.wav"
    samples = read_wave(waveform)
    if len(samples) != metadata["decodedSamples"]:
        raise AlignmentError("Cached waveform duration changed")
    expected = metadata.get("analysisWaveSha256")
    if expected:
        if file_hash(waveform) != expected:
            raise AlignmentError("Cached waveform identity changed")
    else:
        # Older pilot caches predate the WAV digest. Re-derive PCM from the hashed original.
        raw = subprocess.check_output(["ffmpeg", "-v", "error", "-nostdin", "-threads", "1", "-i",
            str(REPO / recording["mediaPath"]), "-map", "0:a:0", "-vn", "-ac", "1", "-ar", "16000",
            "-f", "s16le", "pipe:1"], timeout=60)
        original = np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768
        if not np.array_equal(original, samples):
            raise AlignmentError("Legacy cached waveform differs from the immutable source")
    return samples


def region_boundaries(tokens, occurrences, samples, frame_count, frame_step=320):
    if len(tokens) != len(occurrences) or [item["tokenKey"] for item in occurrences] != [token["tokenKey"] for token in tokens]:
        raise AlignmentError("Region anchors need a complete linear seed, with one start per display token")
    breaks, first = [0], 0
    for index in range(1, len(tokens)):
        new_verse = tokens[index].get("verse") != tokens[index - 1].get("verse")
        span = (occurrences[index]["sourceStartSample"] - occurrences[first]["sourceStartSample"]) / 16000
        if new_verse and (index - first >= 40 or span >= 60):
            breaks.append(index)
            first = index
    breaks.append(len(tokens))
    frame_breaks, anchors = [0], []
    for index in breaks[1:-1]:
        left = occurrences[index - 1]["sourceEndSample"]
        right = occurrences[index]["sourceStartSample"]
        candidates = list(range(math.ceil(left / frame_step), right // frame_step))
        if candidates:
            levels = [float(np.mean(samples[max(0, frame * frame_step - 320):frame * frame_step + 320] ** 2)) for frame in candidates]
            selected = candidates[int(np.argmin(levels))]
            quiet = min(levels) < .0001
        else:
            selected, quiet = right // frame_step, False
        if not frame_breaks[-1] < selected < frame_count:
            raise AlignmentError("Acoustic region anchors collapsed; explicit review is required")
        frame_breaks.append(selected)
        anchors.append({"beforeTokenKey": tokens[index]["tokenKey"], "sourceSample": selected * frame_step,
                        "quietAnchorFound": quiet, "origin": "Unreviewed linear acoustic seed; never a legacy cue"})
    frame_breaks.append(frame_count)
    return [(breaks[i], breaks[i + 1], frame_breaks[i], frame_breaks[i + 1]) for i in range(len(breaks) - 1)], anchors


def display_occurrences(recording, lexical):
    expected = {}
    for unit in lexical_units(recording["tokens"], profile="torah-spoken-v1"):
        expected.setdefault(unit["tokenKey"], []).append(unit["lexicalKey"])
    groups = []
    for unit in lexical:
        if not groups or groups[-1][0]["tokenKey"] != unit["tokenKey"] or unit.get("restarted"):
            groups.append([])
        groups[-1].append(unit)
    occurrences, events = [], []
    for index, group in enumerate(groups):
        key = group[0]["tokenKey"]
        complete = [item["lexicalKey"] for item in group] == expected[key] and all(item["completeWord"] for item in group)
        occurrence = {"occurrenceId": f"{recording['audioId']}:graph:{index + 1}", "tokenKey": key,
                      "sourceStartSample": group[0]["sourceStartSample"], "sourceEndSample": group[-1]["sourceEndSample"],
                      "rawAcousticScore": sum(item["rawAcousticScore"] for item in group) / len(group),
                      "completeDisplayToken": complete, "calibratedConfidence": None, "reviewState": "unreviewed",
                      "pronunciationAssessment": None, "cantillationAssessment": None}
        occurrences.append(occurrence)
        if not complete:
            events.append({"kind": "partial_display_token", "occurrenceId": occurrence["occurrenceId"], "tokenKey": key,
                           "sourceStartSample": occurrence["sourceStartSample"]})
    return occurrences, events


def diagnose(args):
    require_budget(180)
    started = time.monotonic()
    directory = work_path("diagnostics/" + uuid.uuid4().hex[:12])
    try:
        seed_path = work_path(args.proposal)
        seed = json.loads(seed_path.read_text())
        bundle, _ = input_for_result(seed)
        recording = recording_for(bundle, seed["audioId"])
        verify_sources(bundle, recording)
        validate_result(bundle, recording, seed)
        metadata = seed["acoustics"]
        cache_path = seed_path.parent / "emissions.npz"
        if file_hash(cache_path) != metadata["emissionsSha256"]:
            raise AlignmentError("Source emissions changed")
        samples = verified_samples(seed_path.parent, metadata, recording)
        with np.load(cache_path, allow_pickle=False) as cache:
            evidence = cache[metadata.get("emissionArray", "log_probs")].copy()
            starts = cache["frame_starts"].copy()
        step = metadata["frameStepSamples"]
        if not np.array_equal(starts, np.arange(len(evidence), dtype=np.int64) * step):
            raise AlignmentError("Diagnostic source map is not contiguous from the original origin")
        quality = signal_quality(samples)
        regions, anchors = region_boundaries(recording["tokens"], seed["occurrences"], samples, len(evidence), step)
        lexical, events, hypotheses = [], [], []
        for token_start, token_end, first_frame, end_frame in regions:
            if time.monotonic() - started > 150:
                raise TimeoutError("Diagnostic worker exceeded its bounded runtime")
            local = evidence[first_frame:end_frame]
            graph = reading_graph(local, recording["tokens"][token_start:token_end], CHECKPOINT["vocabulary"], CHECKPOINT["blankId"], step)
            local_quality = signal_quality(samples[first_frame * step:min(len(samples), end_frame * step)])
            local_events = uncertain_word_events(graph, local_quality)
            local_events += repeated_prefixes(local, graph["lexicalOccurrences"], CHECKPOINT["vocabulary"], CHECKPOINT["blankId"], step)
            for item in [*graph["lexicalOccurrences"], *local_events]:
                for key in ["sourceStartSample", "sourceEndSample", "secondPrefixSample"]:
                    if key in item:
                        item[key] += first_frame * step
            unit_offset = len(lexical_units(recording["tokens"][:token_start], profile="torah-spoken-v1"))
            for item in graph["lexicalOccurrences"]:
                item["unitIndex"] += unit_offset
            lexical.extend(graph["lexicalOccurrences"])
            events.extend(local_events)
            hypotheses.append({"tokenRange": [token_start, token_end], "frameRange": [first_frame, end_frame],
                               "pathLogScore": graph["pathLogScore"], "signalQuality": local_quality})
        occurrences, grouping_events = display_occurrences(recording, lexical)
        events += grouping_events
        for anchor in anchors:
            if not anchor["quietAnchorFound"]:
                events.append({"kind": "uncertain_region_anchor", **anchor})
        track = pitch_track(samples)
        tails = sustained_tail_regions(lexical, track)
        result = {**seed, "decoder": "bounded-torah-reading-graph-v1", "referenceProfile": "torah-spoken-v1",
                  "seedProposalSha256": digest_json(seed), "occurrences": occurrences, "lexicalUnits": lexical,
                  "events": events, "eventDetection": "experimental-local-graph-and-acoustic-ambiguity-flags",
                  "reviewDiagnostics": {"signalQuality": quality, "possibleTails": tails, "regionAnchors": anchors,
                                        "regions": hypotheses},
                  "limitations": ["Local region anchors come from an unreviewed linear seed; long jumps across anchors can be missed",
                                  "Candidate skips can also mean masked or misaligned speech; uncertain regions require review",
                                  "CTC word ends may precede sustained cantillation; tail intervals remain unassigned",
                                  "No calibrated pronunciation or cantillation correctness score",
                                  "One-reader development; natural-error accuracy not established"]}
        validate_result(bundle, recording, result)
        write_json(directory / "proposal.json", result)
        write_json(directory / "review.template.json", {"resultSha256": digest_json(result), "reviewer": None,
                   "performanceReviewedLinear": False, "acceptedOccurrenceIds": [],
                   "playbackLeadSamples": 0, "includeAcousticEnds": False, "acceptedEndOccurrenceIds": []})
        report = {"status": "ready-for-review", "audioId": recording["audioId"], "directory": str(directory),
                  "occurrences": len(occurrences), "events": len(events), "possibleTails": len(tails), "regions": len(regions),
                  "elapsedSeconds": time.monotonic() - started,
                  "implementation": {name: file_hash(HERE / name) for name in ["diagnostics.py", "reading_graph.py", "review_evidence.py"]}}
        write_json(directory / "summary.json", report)
        return report
    finally:
        record_elapsed("cached-reading-diagnostics", time.monotonic() - started, {"directory": str(directory)})
