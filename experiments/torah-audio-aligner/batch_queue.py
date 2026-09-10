"""Durable serial work queue. Restarting never silently resumes acoustic work."""

from copy import deepcopy
import fcntl
import subprocess
import threading
import time
import traceback
from types import SimpleNamespace
import uuid

from aligner import align, diagnose_cli, load_json, work_path, write_json
from analysis_runs import record_elapsed, require_budget
from beta_store import RevisionConflict, cue_payload, now
from core import AlignmentError, digest_json


def review_status(store, identifier):
    entry, saved = store.get(identifier), store.saved(identifier)
    state = saved["state"]
    accepted = sum(row["accepted"] for row in state["occurrences"])
    flags = len(entry["proposal"]["events"]) - len(state["eventReviews"])
    try:
        cue_payload(entry["bundle"], entry["recording"], entry["proposal"], state)
        ready = True
    except AlignmentError:
        ready = False
    return {"revision": saved["revision"], "reviewed": accepted, "words": len(state["occurrences"]),
            "flags": flags, "exportReady": ready}


class BatchQueue:
    def __init__(self, store, library, runner=None, budget=None):
        self.store, self.library = store, library
        self.path = store.root / "queue.json"
        self.lock = threading.RLock()
        self.runner = runner or self.run_recording
        self.budget = budget or require_budget
        self.thread = None
        self.closed = False
        self.stop_at = None
        self.state = load_json(self.path) if self.path.exists() else {
            "schemaVersion": "torah-private-batch-v1", "paused": True, "items": [], "requests": {}}
        if self.state.get("schemaVersion") != "torah-private-batch-v1":
            raise AlignmentError("Unsupported private batch queue. Preserve it before upgrading.")
        for item in self.state["items"]:
            if item["status"] == "running":
                item.update(status="interrupted", error="The service stopped during this recording. Retry when ready.")
            if item["status"] == "ready" and item["resultId"] not in store.entries:
                item.update(status="failed", error="Saved result is missing. Preserve the queue and retry this recording.")
        self.state["paused"] = True
        self.persist()

    def persist(self):
        write_json(self.path, self.state, replace=True)

    def reusable(self, selection):
        matches = []
        source = self.library.get(selection["sourceId"])
        with self.store.lock:
            entries = list(self.store.entries.items())
        for identifier, entry in entries:
            record = entry["recording"]
            if (record["readingId"] == source["readingId"] and record["aliyah"] == source["aliyah"]
                    and record["mediaIdentity"] == selection["mediaIdentity"]
                    and entry["bundle"]["textPagesSha256"] == self.library.text_hash):
                review = review_status(self.store, identifier)
                matches.append((review["exportReady"], review["reviewed"], identifier))
        return max(matches)[2] if matches else None

    def enqueue(self, selections, request_id, force=False):
        if not isinstance(request_id, str) or len(request_id) != 32 or any(c not in "0123456789abcdef" for c in request_id):
            raise AlignmentError("A batch request needs its unique request identity.")
        if type(force) is not bool or not isinstance(selections, list) or not 1 <= len(selections) <= 25:
            raise AlignmentError("Choose between 1 and 25 recordings for a batch.")
        prepared = []
        for item in selections:
            if not isinstance(item, dict):
                raise AlignmentError("Invalid recording selection.")
            prepared.append(self.library.selection(item.get("sourceId"), item.get("uploadId")))
        fingerprint = digest_json({"selections": selections, "force": force})
        with self.lock:
            previous = self.state["requests"].get(request_id)
            if previous:
                if previous["fingerprint"] != fingerprint:
                    raise RevisionConflict("This request identity belongs to another batch.")
                return deepcopy(previous)
            if len(self.state["items"]) + len(prepared) > 2000:
                raise AlignmentError("This queue has reached 2,000 retained entries. Preserve its history before starting a new workspace.")
            ids, new_items = [], []
            for selection in prepared:
                duplicate = next((row for row in reversed(self.state["items"] + new_items)
                                  if row["sourceKey"] == selection["sourceKey"] and
                                  (row["status"] in {"queued", "running"} or not force and row["status"] == "ready")), None)
                if duplicate:
                    ids.append(duplicate["id"]); continue
                result_id = None if force else self.reusable(selection)
                if result_id:
                    self.store.detail(result_id)
                row = {**selection, "id": uuid.uuid4().hex, "createdAt": now(),
                       "status": "ready" if result_id else "queued", "phase": "Existing result" if result_id else "Waiting",
                       "resultId": result_id, "reused": bool(result_id), "error": None}
                new_items.append(row); ids.append(row["id"])
            response = {"fingerprint": fingerprint, "itemIds": ids}
            self.state["items"].extend(new_items)
            self.state["requests"][request_id] = response
            self.persist()
            return deepcopy(response)

    def snapshot(self):
        with self.lock:
            result = deepcopy(self.state)
        result.pop("requests", None)
        result["remainingTestingSeconds"] = max(0, self.budget(0))
        result["running"] = any(item["status"] == "running" for item in result["items"])
        for item in result["items"]:
            if item["status"] == "ready":
                item["review"] = review_status(self.store, item["resultId"])
        return result

    def control(self, action, item_id=None, minutes=10):
        with self.lock:
            if action == "start":
                if type(minutes) is not int or not 1 <= minutes <= 60:
                    raise AlignmentError("Choose a run limit from 1 to 60 minutes.")
                if self.thread and self.thread.is_alive() and not self.state["paused"]:
                    return
                if not any(row["status"] == "queued" for row in self.state["items"]):
                    raise AlignmentError("Add a recording or retry an interrupted item before starting.")
                self.budget(360)
                self.stop_at = time.monotonic() + minutes * 60
                self.state.update(paused=False, pauseReason=None)
                self.persist()
                if not self.thread or not self.thread.is_alive():
                    self.thread = threading.Thread(target=self.worker, name="torah-batch", daemon=False)
                    self.thread.start()
                return
            if action == "pause":
                self.state.update(paused=True, pauseReason="Paused. The current recording finishes before the queue stops.")
            elif action == "cancel-waiting":
                for item in self.state["items"]:
                    if item["status"] == "queued":
                        item.update(status="cancelled", phase="Cancelled")
            elif action == "retry":
                if len(self.state["items"]) >= 2000:
                    raise AlignmentError("Queue history is full. Preserve it before starting a new workspace.")
                item = next((row for row in self.state["items"] if row["id"] == item_id), None)
                if not item or item["status"] not in {"failed", "interrupted", "cancelled"}:
                    raise AlignmentError("Only failed, interrupted, or cancelled items can be retried.")
                if any(row["sourceKey"] == item["sourceKey"] and row["status"] in {"queued", "running"} for row in self.state["items"]):
                    raise RevisionConflict("This recording is already waiting or running.")
                retried = {**item, "id": uuid.uuid4().hex, "status": "queued", "phase": "Waiting", "error": None,
                           "resultId": None, "reused": False, "retryOf": item_id, "createdAt": now()}
                self.state["items"].append(retried)
            else:
                raise AlignmentError("Unknown queue action.")
            self.persist()

    def worker(self):
        while True:
            with self.lock:
                if self.closed or self.state["paused"]:
                    self.thread = None
                    return
                item = next((row for row in self.state["items"] if row["status"] == "queued"), None)
                if not item:
                    self.state.update(paused=True, pauseReason=None); self.persist(); self.thread = None; return
                if time.monotonic() >= self.stop_at:
                    self.state.update(paused=True, pauseReason="Run time limit reached. Remaining recordings are saved for later.")
                    self.persist(); self.thread = None; return
                try:
                    self.budget(360)
                except AlignmentError as error:
                    self.state.update(paused=True, pauseReason=str(error)); self.persist(); self.thread = None; return
                item.update(status="running", startedAt=now(), phase="Preparing recording")
                self.persist()
            started = time.monotonic()
            def phase(message):
                with self.lock:
                    item["phase"] = message; self.persist()
            try:
                result_id = self.runner(deepcopy(item), phase)
                self.store.detail(result_id)
                with self.lock:
                    item.update(status="ready", resultId=result_id, phase="Ready to review", finishedAt=now(),
                                elapsedSeconds=round(time.monotonic() - started, 2))
            except (AlignmentError, OSError, ValueError, KeyError, subprocess.SubprocessError) as error:
                traceback.print_exc()
                with self.lock:
                    item.update(status="failed", phase="Needs attention", error=str(error), finishedAt=now())
            finally:
                with self.lock:
                    if item["status"] == "running":
                        item.update(status="failed", phase="Worker stopped", error="Unexpected worker failure. Preserve the service log before retrying.")
                        self.state["paused"] = True
                    self.persist()

    def run_recording(self, item, phase):
        with work_path("batch-acoustic.lock").open("a+") as lock:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                raise AlignmentError("Another batch workspace is aligning. Pause it before retrying.") from None
            bundle, directory = self.library.prepare(item)
            phase("Aligning audio")
            started = time.monotonic()
            try:
                result = align(SimpleNamespace(input=str(directory / "input.json"), audio_id=bundle["recordings"][0]["audioId"],
                                               timeout=180, max_audio_seconds=900))
            finally:
                record_elapsed("private-batch-alignment", time.monotonic() - started, {"queueItem": item["id"]})
            phase("Checking reading flags")
            seed = work_path(result["directory"]) / "proposal.json"
            diagnostic = diagnose_cli(SimpleNamespace(proposal=str(seed)))
            proposal = work_path(diagnostic["directory"]) / "proposal.json"
            identifier = bundle["recordings"][0]["audioId"] + "--" + item["id"][:12]
            entry = self.store.entry(identifier, proposal, seed, generated=True)
            with self.store.lock:
                write_json(self.store.root / "generated" / f"{identifier}.json", {
                    "id": identifier, "proposal": str(proposal.relative_to(work_path('.'))),
                    "seed": str(seed.relative_to(work_path('.'))), "createdAt": now(), "queueItem": item["id"]})
                self.store.entries[identifier] = entry
            return identifier

    def close(self):
        with self.lock:
            self.closed = True
            self.state["paused"] = True
            self.persist()
