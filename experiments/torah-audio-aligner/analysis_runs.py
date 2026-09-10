"""Verified cached emissions and shared analysis helpers."""

import json
import time
import uuid
from pathlib import Path
import numpy as np

from aligner import (WORK, CHECKPOINT, current_input, recording_for, file_hash, verify_sources,
                     write_json, work_path)
from core import AlignmentError, digest_json, validate_result


def baseline_records():
    bundle, input_dir = current_input()
    verify_sources(bundle)
    pilot = json.loads(work_path("baseline-pilot.json").read_text())
    if pilot["status"] != "complete" or pilot["inputSha256"] != digest_json(bundle):
        raise AlignmentError("A completed pilot for these exact inputs is required")
    legacy = json.loads((input_dir / "legacy-evaluation.json").read_text())
    records = []
    for row in pilot["recordings"]:
        directory = work_path(row["runDirectory"])
        metadata = json.loads((directory / "emissions.json").read_text())
        recording = recording_for(bundle, row["audioId"])
        if (metadata["inputSha256"] != digest_json(bundle) or metadata["mediaIdentity"] != recording["mediaIdentity"] or
                metadata["checkpointRevision"] != CHECKPOINT["revision"] or
                file_hash(directory / "emissions.npz") != metadata["emissionsSha256"]):
            raise AlignmentError("Cached acoustic evidence has a stale identity or modified bytes")
        result = json.loads((directory / "proposal.json").read_text())
        validate_result(bundle, recording, result)
        records.append({"recording": recording, "directory": directory, "metadata": metadata,
                        "baseline": result, "legacy": recording_for(legacy, row["audioId"])})
    return bundle, records


def differences(result, legacy):
    grouped = {}
    for item in result["occurrences"]:
        grouped.setdefault(item["tokenKey"], []).append(item)
    deltas = []
    for cue in legacy["cues"]:
        if cue.get("excludedFromTiming"):
            continue
        candidates = grouped.get(cue["tokenKey"], [])
        deltas.append(candidates[0]["sourceStartSample"] / result["sampleRate"] - cue["timeStart"] if len(candidates) == 1 else np.nan)
    return np.asarray(deltas)


def comparison_stats(deltas, lead=0.0):
    finite = np.isfinite(deltas)
    residuals = deltas[finite] - lead
    return {"boundaries": len(deltas), "missingOrAmbiguous": int((~finite).sum()),
            "playbackLeadSeconds": lead,
            "within200msIncludingMissing": float(np.sum(abs(residuals) <= .2) / len(deltas)) if len(deltas) else None,
            "within500msIncludingMissing": float(np.sum(abs(residuals) <= .5) / len(deltas)) if len(deltas) else None,
            "medianAbsoluteDifferenceSeconds": float(np.median(abs(residuals))) if len(residuals) else None,
            "p95AbsoluteDifferenceSeconds": float(np.quantile(abs(residuals), .95)) if len(residuals) else None,
            "overOneSecond": int(np.sum(abs(residuals) > 1)), "isAcousticAccuracy": False}


def record_elapsed(kind, seconds, details=None):
    path = work_path("testing-ledger.json")
    ledger = json.loads(path.read_text())
    ledger["events"].append({"kind": kind, "elapsedSeconds": seconds, **(details or {})})
    write_json(path, ledger, replace=True)


def require_budget(estimated_seconds):
    ledger = json.loads(work_path("testing-ledger.json").read_text())
    remaining = 3600 - sum(event["elapsedSeconds"] for event in ledger["events"])
    if estimated_seconds > remaining:
        raise AlignmentError(f"Estimated job exceeds remaining approved testing budget ({remaining:.1f}s)")
    return remaining
