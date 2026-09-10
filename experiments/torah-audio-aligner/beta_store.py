"""Private correction revisions over immutable alignment evidence."""

from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
import json
import math
from pathlib import Path
import re
import subprocess
import threading
import uuid
import wave

import numpy as np

from aligner import (HERE, REPO, WORK, file_hash, input_for_result, load_json,
                     recording_for, verify_sources, work_path, write_json)
from core import AlignmentError, digest_json, reviewed_draft, validate_result


class RevisionConflict(AlignmentError):
    pass


def now():
    return datetime.now(timezone.utc).isoformat()


def initial_state(proposal):
    return {
        "basisSha256": digest_json(proposal), "reviewer": "",
        "playbackLeadSamples": 3648, "replayLeadSamples": 4000,
        "performanceReviewedLinear": False, "includeAcousticEnds": False,
        "occurrences": [{"occurrenceId": row["occurrenceId"], "tokenKey": row["tokenKey"],
                         "startSample": row["sourceStartSample"], "endSample": None,
                         "accepted": False, "endAccepted": False, "note": ""}
                        for row in proposal["occurrences"]],
        "eventReviews": {},
    }


def validate_state(recording, proposal, state):
    if not isinstance(state, dict) or state.get("basisSha256") != digest_json(proposal):
        raise AlignmentError("This edit belongs to a different model result. Reload the recording.")
    for key in ("reviewer",):
        if not isinstance(state.get(key), str) or len(state[key]) > 120:
            raise AlignmentError("Reviewer name must be at most 120 characters.")
    for key in ("playbackLeadSamples", "replayLeadSamples"):
        if type(state.get(key)) is not int or not 0 <= state[key] <= 16000:
            raise AlignmentError("Playback and replay lead must be between 0 and 1,000 ms.")
    for key in ("performanceReviewedLinear", "includeAcousticEnds"):
        if type(state.get(key)) is not bool:
            raise AlignmentError("Review declarations must be explicit.")
    items = state.get("occurrences")
    if not isinstance(items, list) or not 1 <= len(items) <= len(recording["tokens"]) * 4:
        raise AlignmentError("Keep at least one word; the private editor supports up to four performances per token.")
    known = {token["tokenKey"] for token in recording["tokens"]}
    seen, previous_start, previous_end = set(), -1, 0
    duration = math.ceil(recording["durationSeconds"] * 16000)
    for item in items:
        if not isinstance(item, dict):
            raise AlignmentError("Invalid word edit.")
        identifier = item.get("occurrenceId")
        if not isinstance(identifier, str) or not re.fullmatch(r"[a-zA-Z0-9:_-]{1,150}", identifier) or identifier in seen:
            raise AlignmentError("Each performed word needs a unique identity.")
        seen.add(identifier)
        if item.get("tokenKey") not in known:
            raise AlignmentError("A word edit references a different passage.")
        start, end = item.get("startSample"), item.get("endSample")
        if type(start) is not int or not previous_start < start < duration or start < previous_end:
            raise AlignmentError("Word starts must stay in audio order and outside the previous reviewed end.")
        if end is not None and (type(end) is not int or not start < end <= duration):
            raise AlignmentError("Word end must follow its start and remain within the recording.")
        for key in ("accepted", "endAccepted"):
            if type(item.get(key)) is not bool:
                raise AlignmentError("Word review must be explicit.")
        if item["endAccepted"] and end is None:
            raise AlignmentError("Set an end time before accepting it.")
        if not isinstance(item.get("note"), str) or len(item["note"]) > 2000:
            raise AlignmentError("Word notes must be at most 2,000 characters.")
        previous_start, previous_end = start, end if end is not None else start + 1
    reviews = state.get("eventReviews")
    if not isinstance(reviews, dict):
        raise AlignmentError("Review notes must preserve the event identifiers.")
    for key, value in reviews.items():
        if key not in {str(i) for i in range(len(proposal["events"]))}:
            raise AlignmentError("Unknown review flag.")
        if not isinstance(value, str) or not 3 <= len(value.strip()) <= 2000:
            raise AlignmentError("Explain each reviewed flag in at least three characters.")
    return deepcopy(state)


def corrected_proposal(proposal, state):
    result = deepcopy(proposal)
    originals = {item["occurrenceId"]: item for item in proposal["occurrences"]}
    result["occurrences"] = []
    for item in state["occurrences"]:
        original = originals.get(item["occurrenceId"])
        row = deepcopy(original) if original else {"occurrenceId": item["occurrenceId"], "tokenKey": item["tokenKey"]}
        row.update({"tokenKey": item["tokenKey"], "sourceStartSample": item["startSample"],
                    "sourceEndSample": item["endSample"], "reviewState": "reviewed" if item["accepted"] else "unreviewed",
                    "reviewNote": item["note"], "calibratedConfidence": None,
                    "pronunciationAssessment": None, "cantillationAssessment": None})
        if original:
            row["originalAcousticSpan"] = {"startSample": original["sourceStartSample"], "endSample": original.get("sourceEndSample")}
        if not original or original["sourceStartSample"] != item["startSample"]:
            row["rawAcousticScore"] = None
        if item["accepted"]:
            row["completeDisplayToken"] = True
        result["occurrences"].append(row)
    result["events"] = [deepcopy(event) for index, event in enumerate(proposal["events"]) if str(index) not in state["eventReviews"]]
    result["humanRevision"] = {"basisSha256": state["basisSha256"], "reviewer": state["reviewer"],
                               "eventReviews": state["eventReviews"], "originalEvents": proposal["events"]}
    result["status"] = "private-human-revision"
    # Lexical spans and diagnostics remain original model evidence, not edited labels.
    result["humanRevision"]["uneditedEvidenceFields"] = ["lexicalUnits", "reviewDiagnostics", "greedyAcousticText"]
    return result


def cue_payload(bundle, recording, proposal, state):
    validate_state(recording, proposal, state)
    result = corrected_proposal(proposal, state)
    review = {"resultSha256": digest_json(result), "reviewer": state["reviewer"],
              "performanceReviewedLinear": state["performanceReviewedLinear"],
              "acceptedOccurrenceIds": [row["occurrenceId"] for row in state["occurrences"] if row["accepted"]],
              "playbackLeadSamples": state["playbackLeadSamples"],
              "includeAcousticEnds": state["includeAcousticEnds"],
              "acceptedEndOccurrenceIds": [row["occurrenceId"] for row in state["occurrences"] if row["endAccepted"]]}
    return reviewed_draft(bundle, recording, result, review)


class BetaStore:
    def __init__(self, root=None, entries=None):
        self.root = work_path(root or "private-beta")
        self.root.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()
        self.entries = entries if entries is not None else self.discover()
        self.verified = set()
        self.peaks = {}

    def discover(self):
        graph = load_json(work_path(load_json(work_path("latest-graph-confirmation.json"))["path"]))
        pilot = load_json(work_path("baseline-pilot.json"))
        seeds = {row["audioId"]: work_path(row["runDirectory"]) / "proposal.json" for row in pilot["recordings"]}
        confirmation_path = work_path(load_json(work_path("latest-confirmation.json"))["path"])
        confirmation = load_json(confirmation_path)
        for row in confirmation["recordings"]:
            seeds[row["audioId"]] = confirmation_path.parent / row["audioId"] / "original-proposal.json"
        entries = {}
        for row in graph["recordings"]:
            entries[row["audioId"]] = self.entry(row["audioId"], work_path(row["directory"]) / "proposal.json", seeds[row["audioId"]])
        uncued = load_json(work_path("latest-uncued-run.json"))
        seed = work_path(uncued["directory"]) / "proposal.json"
        # The uncued diagnostic is selected by its seed identity, not a mutable latest pointer.
        seed_hash = digest_json(load_json(seed))
        candidates = [p for p in (WORK / "diagnostics").glob("*/proposal.json")
                      if load_json(p).get("seedProposalSha256") == seed_hash]
        selected = max(candidates, key=lambda p: p.stat().st_mtime) if candidates else seed
        entries[uncued["audioId"]] = self.entry(uncued["audioId"], selected, seed)
        for path in (self.root / "generated").glob("*.json"):
            data = load_json(path)
            entries[data["id"]] = self.entry(data["id"], work_path(data["proposal"]), work_path(data["seed"]), generated=True)
        return entries

    @staticmethod
    def entry(identifier, proposal_path, seed_path, generated=False):
        proposal = load_json(proposal_path)
        bundle, _ = input_for_result(proposal)
        recording = recording_for(bundle, proposal["audioId"])
        validate_result(bundle, recording, proposal)
        return {"id": identifier, "proposalPath": proposal_path, "proposal": proposal,
                "seedPath": seed_path, "wavePath": seed_path.parent / "analysis.wav",
                "bundle": bundle, "recording": recording, "generated": generated}

    def get(self, identifier):
        if identifier not in self.entries:
            raise AlignmentError("Recording not found in this private beta.")
        return self.entries[identifier]

    def catalog(self):
        with self.lock:
            return [{"id": identifier, "audioId": entry["recording"]["audioId"], "title": entry["recording"]["title"],
                     "durationSeconds": entry["recording"]["durationSeconds"], "wordCount": len(entry["recording"]["tokens"]),
                     "flags": len(entry["proposal"]["events"]), "uncued": entry["recording"]["split"] == "uncued-demonstration",
                     "generated": entry.get("generated", False)} for identifier, entry in self.entries.items()]

    def directory(self, identifier):
        self.get(identifier)
        return self.root / "edits" / identifier

    def saved(self, identifier):
        head = self.directory(identifier) / "head.json"
        if not head.exists():
            return {"revision": None, "state": initial_state(self.get(identifier)["proposal"]), "savedAt": None}
        reference = load_json(head)
        saved = self.revision(identifier, reference["revision"])
        if digest_json(saved) != reference["sha256"]:
            raise AlignmentError("Saved revision identity changed. Preserve the file for review.")
        return saved

    def revision(self, identifier, revision):
        if not re.fullmatch(r"[a-f0-9]{32}", revision):
            raise AlignmentError("Invalid revision identifier.")
        saved = load_json(self.directory(identifier) / "revisions" / (revision + ".json"))
        entry = self.get(identifier)
        validate_state(entry["recording"], entry["proposal"], saved["state"])
        return saved

    def history(self, identifier):
        rows = [load_json(path) for path in (self.directory(identifier) / "revisions").glob("*.json")]
        return [{"revision": row["revision"], "savedAt": row["savedAt"], "reviewer": row["state"]["reviewer"]}
                for row in sorted(rows, key=lambda row: row["savedAt"], reverse=True)[:100]]

    def save(self, identifier, state, base_revision):
        entry = self.get(identifier)
        state = validate_state(entry["recording"], entry["proposal"], state)
        with self.lock:
            previous = self.saved(identifier)
            if base_revision != previous["revision"]:
                raise RevisionConflict("Another tab saved a newer revision. Download your edits, then reload before continuing.")
            if state == previous["state"]:
                return previous
            revision = uuid.uuid4().hex
            saved = {"schemaVersion": "torah-private-review-v1", "id": identifier,
                     "revision": revision, "parentRevision": base_revision, "savedAt": now(), "state": state}
            write_json(self.directory(identifier) / "revisions" / (revision + ".json"), saved)
            write_json(self.directory(identifier) / "head.json", {"revision": revision, "sha256": digest_json(saved)}, replace=True)
            return saved

    def detail(self, identifier):
        entry = self.get(identifier)
        if identifier not in self.verified:
            verify_sources(entry["bundle"], entry["recording"])
            seed = load_json(entry["seedPath"])
            expected = seed["acoustics"].get("analysisWaveSha256")
            if expected and file_hash(entry["wavePath"]) != expected:
                raise AlignmentError("Cached waveform changed. Re-run alignment before reviewing.")
            if not expected:
                from diagnostics import verified_samples
                verified_samples(entry["seedPath"].parent, seed["acoustics"], entry["recording"])
            self.verified.add(identifier)
        return {"id": identifier, "recording": {key: value for key, value in entry["recording"].items() if key != "mediaPath"},
                "proposal": entry["proposal"], **self.saved(identifier)}

    def waveform(self, identifier):
        if identifier in self.peaks:
            return self.peaks[identifier]
        self.detail(identifier)
        with wave.open(str(self.get(identifier)["wavePath"]), "rb") as source:
            if source.getnchannels() != 1 or source.getsampwidth() != 2 or source.getframerate() != 16000:
                raise AlignmentError("Expected mono 16 kHz analysis audio.")
            samples = np.frombuffer(source.readframes(source.getnframes()), dtype="<i2")
        step = 160  # 10 ms bins preserve more detail than the model's 20 ms frames.
        padded = np.pad(samples.astype(np.int32), (0, (-len(samples)) % step))
        blocks = padded.reshape(-1, step)
        value = {"sampleRate": 16000, "stepSamples": step, "sampleCount": len(samples),
                 "min": blocks.min(axis=1).tolist(), "max": blocks.max(axis=1).tolist()}
        self.peaks[identifier] = value
        return value

    def export(self, identifier, revision, kind):
        with self.lock:
            saved = self.saved(identifier)
            if revision != saved["revision"]:
                raise RevisionConflict("Save the latest edits before exporting.")
            entry, state = self.get(identifier), saved["state"]
            self.detail(identifier)
            if kind == "review":
                return {"schemaVersion": "torah-private-review-package-v1", "published": False,
                        "revision": saved, "originalProposal": entry["proposal"],
                        "correctedProposal": corrected_proposal(entry["proposal"], state)}
            if kind not in {"cues", "generated-cues"}:
                raise AlignmentError("Unknown export format.")
            if kind == "generated-cues":
                from generated_cues import generated_draft
                payload = generated_draft(entry["bundle"], entry["recording"], entry["proposal"], state,
                                          load_json(entry["seedPath"]))
            else:
                payload = cue_payload(entry["bundle"], entry["recording"], entry["proposal"], state)
            result = subprocess.run(["node", "--import", "tsx", str(HERE / "check-draft.mts")],
                                    input=json.dumps(payload), text=True, capture_output=True, cwd=REPO, timeout=30)
            if result.returncode:
                raise AlignmentError("Tikkun's cue validator rejected this private draft: " + result.stderr[-1500:])
            write_json(self.root / "exports" / f"{identifier}-{uuid.uuid4().hex}.json", payload)
            return payload
