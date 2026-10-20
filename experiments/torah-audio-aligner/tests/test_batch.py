"""Batch lifecycle tests use synthetic work, never synthetic user approvals."""

from copy import deepcopy
import io
import json
from pathlib import Path
import tempfile
import threading
import time
import unittest
from unittest.mock import patch
import uuid
import zipfile

from aligner import WORK, load_json, write_json
from batch_import import BatchStore, RecordingLibrary, MAX_UPLOAD
from batch_queue import BatchQueue
from batch_server import BatchApp
from beta_store import BetaStore, RevisionConflict, initial_state
from core import AlignmentError, digest_json
from test_core import fixture


class Library:
    def __init__(self, recording, bundle):
        self.text_hash = bundle["textPagesSha256"]
        self.recording = recording
        self.sources = {identifier: recording for identifier in ("first", "second", "third")}

    def get(self, identifier):
        if identifier not in {"first", "second", "third"}:
            raise AlignmentError("Unknown test source")
        return self.recording

    def selection(self, identifier, upload_id=None):
        self.get(identifier)
        return {"sourceId": identifier, "uploadId": None, "title": identifier,
                "mediaIdentity": self.recording["mediaIdentity"], "sourceKey": identifier}


class BatchTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix="batch-tests-", dir=WORK)
        self.bundle, self.recording, self.proposal, _ = fixture()
        self.entry = {"bundle": self.bundle, "recording": self.recording, "proposal": self.proposal}
        self.store = BetaStore(self.directory.name, {"fixture-1": self.entry})
        self.library = Library(self.recording, self.bundle)
        self.queues = []

    def tearDown(self):
        for queue in self.queues:
            queue.close()
            if queue.thread:
                queue.thread.join(timeout=3)
        self.directory.cleanup()

    def queue(self, runner=None, budget=None):
        queue = BatchQueue(self.store, self.library, runner=runner, budget=budget or (lambda _: 3600))
        self.queues.append(queue)
        return queue

    def test_library_reload_adds_sources_without_resetting_the_queue(self):
        source = {**self.recording, "id": "first", "title": "First aliyah", "available": True}
        catalog = {"textPagesSha256": "0" * 64, "sources": [source]}
        library = RecordingLibrary(self.store.root, catalog)
        queue = BatchQueue(self.store, library)
        self.queues.append(queue)
        self.add(queue, "first")
        before = deepcopy(queue.state)
        updated = {**catalog, "sources": catalog["sources"] + [{**source, "id": "new"}]}
        with patch("batch_import.subprocess.run") as run:
            run.return_value.stdout = json.dumps(updated)
            library.reload()
        self.assertEqual(library.get("new")["id"], "new")
        self.assertIs(queue.library, library)
        self.assertEqual(queue.state, before)
        self.assertIsNone(queue.thread)
        with self.assertRaisesRegex(AlignmentError, "Duplicate recording"):
            library.reload({**catalog, "sources": catalog["sources"] * 2})
        self.assertEqual(set(library.sources), {"first", "new"})

    def add(self, queue, *ids, force=True, request_id=None):
        return queue.enqueue([{"sourceId": identifier} for identifier in ids], request_id or uuid.uuid4().hex, force)

    def wait(self, condition):
        end = time.monotonic() + 3
        while time.monotonic() < end:
            if condition():
                return
            time.sleep(.01)
        self.fail("Queue state did not settle")

    def test_double_submission_and_inflight_duplicates_are_idempotent(self):
        queue = self.queue()
        request = uuid.uuid4().hex
        first = self.add(queue, "first", "first", request_id=request)
        second = self.add(queue, "first", "first", request_id=request)
        self.assertEqual(first, second)
        self.assertEqual(len(queue.state["items"]), 1)
        self.add(queue, "first")
        self.assertEqual(len(queue.state["items"]), 1)
        with self.assertRaises(RevisionConflict):
            self.add(queue, "second", request_id=request)

    def test_bad_batch_does_not_enqueue_valid_prefix(self):
        queue = self.queue()
        with self.assertRaises(AlignmentError):
            self.add(queue, "first", "unknown")
        self.assertEqual(queue.state["items"], [])

    def test_reuse_preserves_approval_and_does_not_invoke_worker(self):
        queue = self.queue()
        before = self.store.saved("fixture-1")
        with patch.object(self.store, "detail", return_value={}):
            self.add(queue, "first", force=False)
        self.assertEqual(queue.state["items"][0]["resultId"], "fixture-1")
        self.assertTrue(queue.state["items"][0]["reused"])
        self.assertEqual(self.store.saved("fixture-1"), before)
        self.assertFalse(queue.snapshot()["items"][0]["review"]["exportReady"])

    def test_pause_finishes_current_then_resume_runs_next_serially(self):
        entered, release = threading.Event(), threading.Event()
        calls = []
        def runner(item, phase):
            calls.append(item["sourceId"])
            if len(calls) == 1:
                entered.set(); release.wait(2)
            return "fixture-1"
        queue = self.queue(runner)
        self.add(queue, "first", "second")
        with patch.object(self.store, "detail", return_value={}):
            queue.control("start")
            self.assertTrue(entered.wait(1))
            queue.control("pause"); release.set()
            self.wait(lambda: queue.thread is None)
            self.assertEqual(calls, ["first"])
            self.assertEqual([row["status"] for row in queue.state["items"]], ["ready", "queued"])
            queue.control("start")
            self.wait(lambda: queue.thread is None)
            self.assertEqual(calls, ["first", "second"])

    def test_clear_downloads_persists_and_saved_cues_can_be_reused(self):
        queue = self.queue()
        request_id = uuid.uuid4().hex
        saved = self.store.save("fixture-1", initial_state(self.proposal), None)
        archive = self.store.root / "exports/batches/download.zip"
        archive.parent.mkdir(parents=True)
        archive.write_bytes(b"existing download")
        with patch.object(self.store, "detail", return_value={}):
            ready = self.add(queue, "first", "second", force=False, request_id=request_id)["itemIds"]
        waiting = self.add(queue, "third")["itemIds"][0]
        self.assertEqual(queue.clear_downloads([ready[0]]), 1)
        self.assertEqual(queue.clear_downloads([ready[0]]), 0)
        self.assertEqual(queue.state["requests"][request_id]["itemIds"], [ready[1]])
        self.assertEqual(self.store.saved("fixture-1"), saved)
        self.assertEqual(archive.read_bytes(), b"existing download")
        recovered = self.queue()
        self.assertEqual([row["id"] for row in recovered.snapshot()["items"]], [ready[1], waiting])
        self.assertTrue(recovered.snapshot()["clearDownloadsSupported"])
        with patch.object(self.store, "detail", return_value={}):
            restored = self.add(recovered, "first", force=False)["itemIds"][0]
        self.assertNotEqual(restored, ready[0])
        self.assertEqual(recovered.state["items"][-1]["resultId"], "fixture-1")
        self.assertTrue(recovered.state["items"][-1]["reused"])
        recovered.clear_downloads([ready[1], restored])
        self.assertNotIn(request_id, recovered.state["requests"])

    def test_clear_downloads_rejects_invalid_or_unfinished_selections_without_partial_changes(self):
        queue = self.queue()
        with patch.object(self.store, "detail", return_value={}):
            ready = self.add(queue, "first", force=False)["itemIds"][0]
        waiting = self.add(queue, "second")["itemIds"][0]
        for selection in (None, [], "all", [None], [[]], [""], [ready, ready], [str(i) for i in range(2001)]):
            with self.subTest(selection=str(selection)[:60]), self.assertRaises(AlignmentError):
                queue.clear_downloads(selection)
        for status in ("queued", "running", "failed", "interrupted", "cancelled"):
            queue.state["items"][1]["status"] = status
            before = deepcopy(queue.state)
            with self.subTest(status=status), self.assertRaises(RevisionConflict):
                queue.clear_downloads([ready, waiting])
            self.assertEqual(queue.state, before)

    def test_clear_queue_removes_every_status_and_preserves_saved_results(self):
        queue = self.queue()
        saved = self.store.save("fixture-1", initial_state(self.proposal), None)
        archive = self.store.root / "exports/batches/download.zip"
        archive.parent.mkdir(parents=True)
        archive.write_bytes(b"existing download")
        self.add(queue, "first")
        original = queue.state["items"][0]
        statuses = ("ready", "failed", "interrupted", "cancelled", "queued", "running")
        queue.state["items"] = [{**original, "id": uuid.uuid4().hex, "status": status,
                                 "resultId": "fixture-1" if status == "ready" else None}
                                for status in statuses]
        queue.state["paused"] = False
        queue.state["pauseReason"] = "An earlier failure"
        queue.persist()
        self.assertEqual(queue.clear(), len(statuses))
        self.assertEqual(queue.clear(), 0)
        recovered = self.queue()
        self.assertEqual(recovered.state["items"], [])
        self.assertEqual(recovered.state["requests"], {})
        self.assertTrue(recovered.state["paused"])
        self.assertIsNone(recovered.state["pauseReason"])
        self.assertTrue(recovered.snapshot()["clearQueueSupported"])
        self.assertFalse(recovered.snapshot()["clearPending"])
        self.assertEqual(self.store.saved("fixture-1"), saved)
        self.assertEqual(archive.read_bytes(), b"existing download")
        with patch.object(self.store, "detail", return_value={}):
            self.add(recovered, "first", force=False)
        self.assertEqual(recovered.state["items"][0]["resultId"], "fixture-1")
        self.assertTrue(recovered.state["items"][0]["reused"])

    def test_clear_queue_write_failure_preserves_queue_and_execution_state(self):
        queue = self.queue()
        self.add(queue, "first", "second")
        queue.stop_at = 123
        before = deepcopy(queue.state)
        with patch("batch_queue.write_json", side_effect=OSError("Disk full")):
            with self.assertRaisesRegex(OSError, "Disk full"):
                queue.clear()
        self.assertEqual(queue.state, before)
        self.assertEqual(load_json(queue.path), before)
        self.assertEqual(queue.stop_at, 123)
        self.assertFalse(queue.clearing)

    def test_clear_queue_detaches_active_work_without_resuming_or_restoring_rows(self):
        for fails in (False, True):
            entered, release = threading.Event(), threading.Event()
            calls = []
            def runner(item, phase):
                calls.append(item["sourceId"])
                entered.set()
                release.wait(3)
                phase("Finishing after clear")
                if fails:
                    raise AlignmentError("Deliberate test failure after clear")
                return "fixture-1"
            queue = self.queue(runner)
            self.add(queue, "first", "second")
            with self.subTest(fails=fails), patch.object(self.store, "detail", return_value={}), patch("traceback.print_exc"):
                try:
                    queue.control("start")
                    self.assertTrue(entered.wait(1))
                    self.assertEqual(queue.clear(), 2)
                    self.assertEqual(queue.snapshot()["items"], [])
                    self.assertTrue(queue.snapshot()["clearPending"])
                    self.assertTrue(queue.snapshot()["running"])
                    self.add(queue, "third")
                    with self.assertRaisesRegex(RevisionConflict, "current recording finish"):
                        queue.control("start")
                finally:
                    release.set()
                self.wait(lambda: queue.thread is None)
                self.assertEqual(calls, ["first"])
                self.assertEqual([row["sourceId"] for row in queue.state["items"]], ["third"])
                self.assertEqual(queue.state["items"][0]["status"], "queued")
                self.assertTrue(queue.state["paused"])
                self.assertFalse(queue.snapshot()["clearPending"])
                self.assertFalse(queue.snapshot()["running"])
                self.assertEqual(load_json(queue.path), queue.state)
                queue.control("start")
                self.wait(lambda: queue.thread is None)
                self.assertEqual(calls, ["first", "third"])
                queue.clear()

    def test_clear_downloads_write_failure_keeps_in_memory_and_saved_queue(self):
        queue = self.queue()
        with patch.object(self.store, "detail", return_value={}):
            identifier = self.add(queue, "first", force=False)["itemIds"][0]
        before = deepcopy(queue.state)
        with patch("batch_queue.write_json", side_effect=OSError("Disk write failed")):
            with self.assertRaisesRegex(OSError, "Disk write failed"):
                queue.clear_downloads([identifier])
        self.assertEqual(queue.state, before)
        self.assertEqual(load_json(queue.path), before)

    def test_clear_downloads_preserves_active_worker_and_newly_finished_result(self):
        entered, release = threading.Event(), threading.Event()
        def runner(item, phase):
            entered.set(); release.wait(2)
            return "fixture-1"
        queue = self.queue(runner)
        with patch.object(self.store, "detail", return_value={}):
            completed = self.add(queue, "first", force=False)["itemIds"][0]
            active = self.add(queue, "second")["itemIds"][0]
            queue.control("start")
            try:
                self.assertTrue(entered.wait(1))
                live_row = queue.state["items"][1]
                self.assertEqual(queue.clear_downloads([completed]), 1)
                self.assertIs(queue.state["items"][0], live_row)
                self.assertEqual(live_row["status"], "running")
            finally:
                release.set()
            self.wait(lambda: queue.thread is None)
        self.assertEqual([(row["id"], row["status"]) for row in load_json(queue.path)["items"]], [(active, "ready")])

    def test_restart_preserves_completed_work_and_requires_explicit_retry(self):
        queue = self.queue()
        self.add(queue, "first", "second")
        queue.state["paused"] = False
        queue.state["items"][0]["status"] = "running"
        queue.persist()
        recovered = self.queue()
        self.assertTrue(recovered.state["paused"])
        self.assertIsNone(recovered.thread)
        self.assertEqual(recovered.state["items"][0]["status"], "interrupted")
        old_id = recovered.state["items"][0]["id"]
        recovered.control("retry", old_id)
        self.assertEqual(recovered.state["items"][-1]["retryOf"], old_id)
        self.assertEqual(recovered.state["items"][0]["status"], "interrupted")

    def test_later_success_resolves_old_failure_even_after_completed_queue_row_is_cleared(self):
        queue = self.queue()
        self.add(queue, "first")
        failed = queue.state["items"][0]
        failed.update(status="failed", phase="Needs attention", error="Original failure",
                      createdAt="2026-09-01T00:00:00+00:00", finishedAt="2026-09-01T00:01:00+00:00")
        queue.persist()
        write_json(self.store.root / "generated/fixture-1.json", {
            "id": "fixture-1", "createdAt": "2026-09-02T00:00:00+00:00"})
        recovered = self.queue()
        visible = recovered.snapshot()["items"][0]
        self.assertEqual(visible["status"], "resolved")
        self.assertEqual(visible["resultId"], "fixture-1")
        self.assertIsNone(visible["error"])
        self.assertEqual(recovered.state["items"][0]["error"], "Original failure")

    def test_existing_older_or_different_audio_result_does_not_hide_a_new_failure(self):
        queue = self.queue()
        self.add(queue, "first")
        failed = queue.state["items"][0]
        failed.update(status="failed", finishedAt="2026-09-03T00:00:00+00:00")
        queue.resolve_failures("fixture-1", "2026-09-02T00:00:00+00:00")
        self.assertEqual(queue.snapshot()["items"][0]["status"], "failed")
        failed["mediaIdentity"] = {**failed["mediaIdentity"], "digest": "c" * 64}
        queue.resolve_failures("fixture-1", "2026-09-04T00:00:00+00:00")
        self.assertEqual(queue.snapshot()["items"][0]["status"], "failed")

    def test_one_failure_does_not_lose_following_recording(self):
        def runner(item, phase):
            if item["sourceId"] == "first":
                raise AlignmentError("Deliberate test failure")
            return "fixture-1"
        queue = self.queue(runner)
        self.add(queue, "first", "second")
        with patch.object(self.store, "detail", return_value={}), patch("traceback.print_exc"):
            queue.control("start")
            self.wait(lambda: queue.thread is None)
        self.assertEqual([row["status"] for row in queue.state["items"]], ["failed", "ready"])

    def test_cancel_waiting_and_budget_failure_never_start_work(self):
        def budget(seconds):
            if seconds:
                raise AlignmentError("Testing allowance exhausted")
            return 0
        queue = self.queue(budget=budget)
        self.add(queue, "first", "second")
        with self.assertRaises(AlignmentError):
            queue.control("start")
        self.assertIsNone(queue.thread)
        queue.control("cancel-waiting")
        self.assertTrue(all(row["status"] == "cancelled" for row in queue.state["items"]))

    def test_saved_review_migration_is_once_and_keeps_original_history(self):
        state = initial_state(self.proposal)
        state["reviewer"] = "SYNTHETIC MIGRATION TEST"
        saved = self.store.save("fixture-1", state, None)
        target = BatchStore(Path(self.directory.name) / "destination", {"fixture-1": self.entry})
        with patch("batch_import.BetaStore", return_value=self.store):
            target.import_reviews(self.store.root)
            state["reviewer"] = "SYNTHETIC NEW SOURCE EDIT"
            self.store.save("fixture-1", state, saved["revision"])
            target.import_reviews(self.store.root)
        self.assertEqual(target.saved("fixture-1"), saved)
        self.assertNotEqual(self.store.saved("fixture-1"), saved)

    def test_zip_has_only_validated_requested_results_and_rejects_stale_head(self):
        queue = self.queue()
        app = BatchApp(self.store, self.library, queue)
        payload = {"audioId": "fixture-1", "mediaIdentity": self.recording["mediaIdentity"], "cueCount": 2,
                   "cues": [{"review": {"status": "pending", "flags": [{"status": "pending"}]}}, {}]}
        with patch.object(self.store, "export", return_value=payload) as export:
            content = app.export_zip([{"id": "fixture-1", "revision": "current"}])
            export.assert_called_once_with("fixture-1", "current", "generated-cues")
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            self.assertEqual(set(archive.namelist()), {"fixture-1-tikkun-cues.json", "manifest.json"})
            self.assertEqual(json.loads(archive.read("manifest.json"))["recordings"][0]["revision"], "current")
            self.assertEqual(json.loads(archive.read("manifest.json"))["recordings"][0]["pendingFlags"], 1)
        with patch.object(self.store, "export", side_effect=RevisionConflict("stale")):
            with self.assertRaises(RevisionConflict):
                app.export_zip([{"id": "fixture-1", "revision": "stale"}])

    def test_upload_requires_supported_format_bound_size_and_known_passage(self):
        source = {"id": "first", "available": True}
        library = RecordingLibrary(self.store.root, {"textPagesSha256": "0" * 64, "sources": [source]})
        for length, filename, source_id in [(MAX_UPLOAD + 1, "a.mp3", "first"), (1, "a.exe", "first"), (1, "a.mp3", "unknown")]:
            with self.assertRaises(AlignmentError):
                library.upload(io.BytesIO(b"x"), length, filename, source_id)
        with self.assertRaisesRegex(AlignmentError, "ended"):
            library.upload(io.BytesIO(b""), 100, "a.mp3", "first")
        with self.assertRaises(AlignmentError):
            library.upload_record("../outside", "first")


if __name__ == "__main__":
    unittest.main()
