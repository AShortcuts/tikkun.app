"""Offline alignment experiment. Nothing in this module writes project files."""

from __future__ import annotations

import hashlib
import json
import math
import re

import numpy as np


class AlignmentError(ValueError):
    pass


def digest_json(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"),
                                     allow_nan=False).encode()).hexdigest()


def frame_geometry(kernels, strides):
    if len(kernels) != len(strides) or not kernels:
        raise AlignmentError("Missing convolution geometry")
    step, receptive = 1, 1
    for kernel, stride in zip(kernels, strides):
        if type(kernel) is not int or type(stride) is not int or min(kernel, stride) < 1:
            raise AlignmentError("Invalid convolution geometry")
        receptive += (kernel - 1) * step
        step *= stride
    return step, receptive


def lexical_units(tokens, profile="orthographic"):
    """Unpointed orthographic baseline, never a phonetic transcription."""
    if profile not in {"orthographic", "torah-spoken-v1"}:
        raise AlignmentError("Unknown reference pronunciation profile")
    units = []
    for token in tokens:
        parts = token["annotatedText"].split("\u05be")
        for part_index, part in enumerate(parts):
            letters = "".join(re.findall(r"[\u05d0-\u05ea]", part))
            if not letters:
                if part.strip() and re.search(r"[A-Za-z0-9]", part):
                    raise AlignmentError(f"Unexpected non-Hebrew text: {token['tokenKey']}")
                continue
            alignment_text = letters
            mappings = []
            if profile == "torah-spoken-v1":
                if "\u05d9\u05d4\u05d5\u05d4" in letters:
                    spoken = "\u05d0\u05dc\u05d5\u05d4\u05d9\u05dd" if re.search(r"\u05d5[\u0591-\u05c7]*\u05b4", part) else "\u05d0\u05d3\u05d5\u05e0\u05d9"
                    alignment_text = alignment_text.replace("\u05d9\u05d4\u05d5\u05d4", spoken)
                    mappings.append("liturgical-divine-name-hypothesis")
                if "\u05d0\u05dc\u05d4" in alignment_text:
                    alignment_text = alignment_text.replace("\u05d0\u05dc\u05d4\u05d9", "\u05d0\u05dc\u05d5\u05d4\u05d9")
                    if alignment_text != letters and not mappings:
                        mappings.append("elohim-plene-acoustic-spelling")
            units.append({
                "lexicalKey": f"{token['tokenKey']}/{part_index}",
                "tokenKey": token["tokenKey"], "annotatedText": part,
                "alignmentText": alignment_text, "referenceMappings": mappings,
                "needsSpokenFormReview": "\u05d9\u05d4\u05d5\u05d4" in letters,
            })
        if not any(unit["tokenKey"] == token["tokenKey"] for unit in units):
            raise AlignmentError(f"Display token has no alignable letters: {token['tokenKey']}")
    return units


def ctc_viterbi(log_probs, labels, blank_id, max_cells=200_000_000):
    """CTC Viterbi baseline with explicit blanks and repeated-label constraints."""
    emissions = np.asarray(log_probs, dtype=np.float32)
    if emissions.ndim != 2 or not emissions.shape[0] or not labels:
        raise AlignmentError("CTC needs nonempty frames and reference labels")
    frames, vocabulary_size = emissions.shape
    if type(blank_id) is not int or not 0 <= blank_id < vocabulary_size:
        raise AlignmentError("Blank token is outside the vocabulary")
    if any(type(label) is not int or not 0 <= label < vocabulary_size or label == blank_id for label in labels):
        raise AlignmentError("Reference includes blank or unknown label IDs")
    if np.isnan(emissions).any() or np.isposinf(emissions).any() or emissions.max() > 0.0001:
        raise AlignmentError("Expected finite-or-negative-infinity log probabilities")
    minimum_frames = len(labels) + sum(a == b for a, b in zip(labels, labels[1:]))
    if frames < minimum_frames:
        raise AlignmentError("Too few acoustic frames for the reference, including repeated letters")
    states = len(labels) * 2 + 1
    if frames * states > max_cells:
        raise AlignmentError("Alignment exceeds the bounded trellis budget; use shorter anchored regions")
    expanded = np.full(states, blank_id, dtype=np.int32)
    expanded[1::2] = labels
    skip_allowed = np.zeros(states, dtype=bool)
    skip_allowed[2:] = (expanded[2:] != blank_id) & (expanded[2:] != expanded[:-2])
    previous = np.full(states, -np.inf, dtype=np.float32)
    previous[0] = 0
    back = np.zeros((frames, states), dtype=np.uint8)
    state_index = np.arange(states)
    for frame_index, emission in enumerate(emissions):
        candidates = np.full((3, states), -np.inf, dtype=np.float32)
        candidates[0] = previous
        candidates[1, 1:] = previous[:-1]
        candidates[2, 2:] = previous[:-2]
        candidates[2, ~skip_allowed] = -np.inf
        steps = np.argmax(candidates, axis=0)
        previous = candidates[steps, state_index] + emission[expanded]
        back[frame_index] = steps
    state = states - 1 if previous[-1] >= previous[-2] else states - 2
    if not np.isfinite(previous[state]):
        raise AlignmentError("No acoustic path covers the supplied reference")
    path = np.empty(frames, dtype=np.int32)
    for frame_index in range(frames - 1, -1, -1):
        path[frame_index] = state
        state -= int(back[frame_index, state])
    spans = []
    for index, label in enumerate(labels):
        assigned = np.flatnonzero(path == 2 * index + 1)
        if not assigned.size:
            raise AlignmentError("Incomplete CTC path")
        spans.append({"startFrame": int(assigned[0]), "endFrame": int(assigned[-1]) + 1,
                      "meanLogProbability": float(emissions[assigned, label].mean())})
    return spans


def greedy_text(log_probs, vocabulary, blank_id):
    reverse = {value: key for key, value in vocabulary.items()}
    result, previous = [], None
    for raw in np.asarray(log_probs).argmax(axis=1):
        label = int(raw)
        if label != previous and label != blank_id:
            result.append(reverse.get(label, f"[ID:{label}]").replace("|", " "))
        previous = label
    return "".join(result)


def propose(bundle, recording, emissions, frame_starts, metadata, checkpoint, profile="orthographic"):
    units = lexical_units(recording["tokens"], profile=profile)
    labels, owners = [], []
    for index, unit in enumerate(units):
        if labels:
            labels.append(checkpoint["vocabulary"]["|"])
            owners.append(None)
        for char in unit["alignmentText"]:
            if char not in checkpoint["vocabulary"]:
                raise AlignmentError(f"Unsupported acoustic character: {char}")
            labels.append(checkpoint["vocabulary"][char])
            owners.append(index)
    spans = ctc_viterbi(emissions, labels, checkpoint["blankId"])
    if len(frame_starts) != len(emissions) or len(frame_starts) == 0:
        raise AlignmentError("Missing frame-to-source mapping")
    step = metadata["frameStepSamples"]
    if any(int(b) - int(a) != step for a, b in zip(frame_starts, frame_starts[1:])):
        raise AlignmentError("Non-contiguous source frames")
    lexical = []
    for unit_index, unit in enumerate(units):
        parts = [span for span, owner in zip(spans, owners) if owner == unit_index]
        lexical.append({
            **unit,
            "sourceStartSample": int(frame_starts[parts[0]["startFrame"]]),
            "sourceEndSample": min(metadata["decodedSamples"], int(frame_starts[parts[-1]["endFrame"] - 1]) + step),
            "rawAcousticScore": math.exp(sum(part["meanLogProbability"] for part in parts) / len(parts)),
            "boundaryMethod": "ctc-label-span", "calibratedConfidence": None,
        })
    occurrences = []
    for index, token in enumerate(recording["tokens"]):
        parts = [part for part in lexical if part["tokenKey"] == token["tokenKey"]]
        occurrences.append({
            "occurrenceId": f"{recording['audioId']}:{index + 1}", "tokenKey": token["tokenKey"],
            "sourceStartSample": parts[0]["sourceStartSample"], "sourceEndSample": parts[-1]["sourceEndSample"],
            "rawAcousticScore": sum(part["rawAcousticScore"] for part in parts) / len(parts),
            "calibratedConfidence": None, "reviewState": "unreviewed",
            "pronunciationAssessment": None, "cantillationAssessment": None,
        })
    result = {
        "schemaVersion": "torah-aligner-proposal-v1", "status": "unreviewed-proposal",
        "inputSha256": digest_json(bundle), "audioId": recording["audioId"],
        "mediaIdentity": recording["mediaIdentity"], "textPagesSha256": bundle["textPagesSha256"],
        "tokenizationVersion": bundle["tokenizationVersion"], "sampleRate": checkpoint["sampleRate"],
        "checkpoint": {"id": checkpoint["id"], "revision": checkpoint["revision"]},
        "acoustics": metadata, "decoder": "numpy-ctc-viterbi-v1", "occurrences": occurrences,
        "lexicalUnits": lexical, "greedyAcousticText": greedy_text(emissions, checkpoint["vocabulary"], checkpoint["blankId"]),
        "events": [], "eventDetection": "not-implemented",
        "referenceProfile": profile,
        "limitations": ["Unpointed orthographic reference; spoken divine-name forms need review",
                        "CTC label spans are uncalibrated boundary estimates, especially word ends",
                        "Linear reference alignment does not detect repeats, skips, or unrelated speech",
                        "Human review of the complete performance is required before a draft export"],
    }
    validate_result(bundle, recording, result)
    return result


def validate_result(bundle, recording, result):
    if result.get("schemaVersion") != "torah-aligner-proposal-v1":
        raise AlignmentError("Unknown proposal version")
    for name, expected in [("inputSha256", digest_json(bundle)), ("audioId", recording["audioId"]),
                           ("mediaIdentity", recording["mediaIdentity"]),
                           ("textPagesSha256", bundle["textPagesSha256"]),
                           ("tokenizationVersion", bundle["tokenizationVersion"])]:
        if result.get(name) != expected:
            raise AlignmentError(f"Stale or mismatched proposal: {name}")
    sample_rate = result.get("sampleRate")
    if type(sample_rate) is not int or sample_rate != 16000:
        raise AlignmentError("Expected source coordinates at 16000 samples/second")
    duration = math.ceil(recording["durationSeconds"] * sample_rate)
    known_keys = {token["tokenKey"] for token in recording["tokens"]}
    seen, previous_end = set(), 0
    for item in result["occurrences"]:
        identifier = item["occurrenceId"]
        if not isinstance(identifier, str) or not identifier or identifier in seen:
            raise AlignmentError("Missing or duplicate occurrence ID")
        seen.add(identifier)
        if item["tokenKey"] is not None and item["tokenKey"] not in known_keys:
            raise AlignmentError("Occurrence references a different passage")
        start, end = item["sourceStartSample"], item.get("sourceEndSample")
        if type(start) is not int or start < previous_end or start >= duration:
            raise AlignmentError("Invalid or non-monotonic source start")
        if end is not None and (type(end) is not int or end <= start or end > duration):
            raise AlignmentError("Invalid source end")
        previous_end = end if end is not None else start + 1
    if not isinstance(result.get("events"), list):
        raise AlignmentError("Proposal must retain an explicit event list")


def replay_start(onset_sample, lead_samples=4000, segment_start=0):
    if any(type(value) is not int or value < 0 for value in [onset_sample, lead_samples, segment_start]):
        raise AlignmentError("Replay uses nonnegative integer sample coordinates")
    if segment_start > onset_sample:
        raise AlignmentError("Segment starts after the word")
    return max(segment_start, onset_sample - lead_samples)


def reviewed_draft(bundle, recording, result, review):
    validate_result(bundle, recording, result)
    if review.get("resultSha256") != digest_json(result):
        raise AlignmentError("Review does not identify this exact proposal")
    if not isinstance(review.get("reviewer"), str) or not review["reviewer"].strip():
        raise AlignmentError("Review needs an editor identity")
    if review.get("performanceReviewedLinear") is not True:
        raise AlignmentError("Complete audio needs review for repeats, skips, and insertions")
    items = result["occurrences"]
    if review.get("acceptedOccurrenceIds") != [item["occurrenceId"] for item in items]:
        raise AlignmentError("Every occurrence must be accepted in performance order")
    if result["events"] or [item["tokenKey"] for item in items] != [token["tokenKey"] for token in recording["tokens"]]:
        raise AlignmentError("Repeats, missing words, and unassigned speech cannot be flattened into v2")
    rate = result["sampleRate"]
    lead = review.get("playbackLeadSamples", 0)
    if type(lead) is not int or not 0 <= lead <= rate:
        raise AlignmentError("Playback lead must be an integer from zero to one second")
    include_ends = review.get("includeAcousticEnds", False)
    if type(include_ends) is not bool:
        raise AlignmentError("End-boundary export must be explicitly enabled or disabled")
    if include_ends and review.get("acceptedEndOccurrenceIds") != [item["occurrenceId"] for item in items]:
        raise AlignmentError("Every end boundary needs separate acceptance before export")
    cues = []
    for index, (item, token) in enumerate(zip(items, recording["tokens"])):
        cue = {**token["position"], "cueNumber": index + 1,
               "timeStart": 0 if index == 0 else max(0, item["sourceStartSample"] - lead) / rate}
        if include_ends and item.get("sourceEndSample") is not None:
            cue["timeEnd"] = item["sourceEndSample"] / rate
        if cues and (cue["timeStart"] <= cues[-1]["timeStart"] or
                     cues[-1].get("timeEnd", cues[-1]["timeStart"]) > cue["timeStart"]):
            raise AlignmentError("Draft cue times overlap")
        cues.append(cue)
    return {
        "audioId": recording["audioId"], "audioFormat": recording["audioFormat"],
        "narratorId": recording["narratorId"], "readingId": recording["readingId"], "aliyah": recording["aliyah"],
        "tokenCount": len(recording["tokens"]), "cueCount": len(cues),
        "tokenizationVersion": bundle["tokenizationVersion"], "mediaIdentity": recording["mediaIdentity"], "cues": cues,
    }


def timing_metrics(recording, result, reference):
    if reference["mediaIdentity"] != recording["mediaIdentity"] or reference["audioId"] != recording["audioId"]:
        raise AlignmentError("Evaluation reference belongs to different media")
    grouped = {}
    for item in result["occurrences"]:
        grouped.setdefault(item["tokenKey"], []).append(item)
    deltas, missing, ambiguous, excluded, unlabeled = [], 0, 0, 0, 0
    eligible = 0
    seen = set()
    for cue in reference["cues"]:
        key = cue["tokenKey"]
        if key in seen or key not in {token["tokenKey"] for token in recording["tokens"]}:
            raise AlignmentError("Duplicate or foreign evaluation token")
        seen.add(key)
        if cue.get("excludedFromTiming"):
            excluded += 1
            continue
        start = cue.get("timeStart")
        if start is None:
            unlabeled += 1
            continue
        if type(start) not in (float, int) or not math.isfinite(start) or not 0 <= start < recording["durationSeconds"]:
            raise AlignmentError("Invalid reference boundary")
        if reference["kind"] == "human-acoustic-boundaries" and (
                cue.get("reviewState") != "reviewed" or not isinstance(cue.get("reviewer"), str) or not cue["reviewer"].strip()):
            raise AlignmentError("Fresh acoustic labels need explicit human review provenance")
        eligible += 1
        matches = grouped.get(key, [])
        if not matches:
            missing += 1
        elif len(matches) != 1:
            ambiguous += 1
        else:
            deltas.append(matches[0]["sourceStartSample"] / result["sampleRate"] - start)
    absolute = np.abs(deltas)
    return {
        "referenceKind": reference["kind"], "referenceBoundaries": eligible,
        "unlabeled": unlabeled, "excluded": excluded, "matched": len(deltas),
        "missing": missing, "ambiguousOccurrences": ambiguous,
        "within200msFractionIncludingMissing": int(np.sum(absolute <= 0.2)) / eligible if eligible else None,
        "medianSignedDifferenceSeconds": float(np.median(deltas)) if deltas else None,
        "medianAbsoluteDifferenceSeconds": float(np.median(absolute)) if deltas else None,
        "p95AbsoluteDifferenceSeconds": float(np.quantile(absolute, 0.95)) if deltas else None,
        "maxAbsoluteDifferenceSeconds": float(np.max(absolute)) if deltas else None,
        "isAcousticAccuracy": reference["kind"] == "human-acoustic-boundaries" and eligible > 0,
    }
