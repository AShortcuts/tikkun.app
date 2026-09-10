#!/usr/bin/env python3
"""Private batch extension; the original review service can remain running."""

import argparse
import fcntl
from http.server import ThreadingHTTPServer
import io
import json
import os
import re
import signal
import threading
from urllib.error import URLError
from urllib.parse import parse_qs, urlsplit
from urllib.request import urlopen
import uuid
import zipfile

from aligner import HERE, work_path
from batch_import import BatchStore, MAX_UPLOAD, RecordingLibrary
from batch_queue import BatchQueue, review_status
from beta_server import BetaApp, handler_for
from core import AlignmentError, digest_json

APP_ID = "torah-aligner-private-batch-v1"


class BatchApp(BetaApp):
    def __init__(self, store, library=None, queue=None):
        super().__init__(store)
        self.library = library or RecordingLibrary(store.root)
        self.queue = queue or BatchQueue(store, self.library)

    def run_alignment(self, identifier):
        entry = self.store.get(identifier)
        match = next((row for row in reversed(self.queue.state["items"]) if row.get("resultId") == identifier), None)
        if match:
            source = {"sourceId": match["sourceId"], "uploadId": match.get("uploadId")}
        else:
            source = {"sourceId": f"{entry['recording']['narratorId']}--{entry['recording']['audioId']}"}
        queued = self.queue.enqueue([source], uuid.uuid4().hex, force=True)
        return {"queued": queued, "message": "Added to the private queue. Start it from Batch & review."}

    def export_zip(self, selections):
        if not isinstance(selections, list) or not 1 <= len(selections) <= 100:
            raise AlignmentError("Choose between 1 and 100 generated recordings to download.")
        identifiers = [row.get("id") for row in selections if isinstance(row, dict)]
        if (len(identifiers) != len(selections) or any(not isinstance(value, str) for value in identifiers)
                or len(set(identifiers)) != len(identifiers)):
            raise AlignmentError("Choose each generated result once.")
        output = io.BytesIO()
        manifest = []
        size = 0
        with self.store.lock, zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for row in selections:
                payload = self.store.export(row["id"], row.get("revision"), "generated-cues")
                content = json.dumps(payload, ensure_ascii=False, indent=2).encode()
                size += len(content)
                if size > 25 * 1024 * 1024:
                    raise AlignmentError("This export exceeds 25 MB. Select fewer recordings.")
                filename = f"{row['id']}-tikkun-cues.json"
                archive.writestr(filename, content)
                manifest.append({"filename": filename, "revision": row["revision"], "audioId": payload["audioId"],
                                 "mediaIdentity": payload["mediaIdentity"], "cueCount": payload["cueCount"],
                                 "pendingFlags": sum(flag["status"] == "pending" for cue in payload["cues"]
                                                     for flag in cue.get("review", {}).get("flags", [])),
                                 "unreviewedCues": sum(cue.get("review", {}).get("status") == "pending" for cue in payload["cues"])})
            archive.writestr("manifest.json", json.dumps({"private": True, "reviewRequired": True, "recordings": manifest}, indent=2))
        return output.getvalue()


def batch_handler_for(app):
    class Handler(handler_for(app)):
        def bytes(self, body, content_type, filename=None):
            self.send_response(200)
            self.common_headers()
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            if filename:
                self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(body)

        def route(self):
            self.origin()
            parsed = urlsplit(self.path)
            path, params = parsed.path, parse_qs(parsed.query)
            if self.command in {"GET", "HEAD"}:
                if path == "/":
                    shell = (HERE / "private-ui/index.html").read_text()
                    shell = shell.replace('src="/app.js"', 'src="/batch.js"')
                    shell = shell.replace('</head>', '<link rel="stylesheet" href="/batch.css"></head>')
                    shell = shell.replace('<main id="workspace"', (HERE / "batch-ui/panel.html").read_text() + '\n<main id="workspace"')
                    return self.bytes(shell.encode(), "text/html; charset=utf-8")
                if path in {"/batch.js", "/batch.css"}:
                    return self.file(HERE / "batch-ui" / path[1:], "text/javascript; charset=utf-8" if path.endswith('.js') else "text/css; charset=utf-8")
                if path == "/api/health":
                    return self.json({"app": APP_ID, "workspace": digest_json(str(HERE)),
                                      "storage": digest_json(str(app.store.root)), "status": "ready"})
                if path == "/api/batch/library":
                    return self.json({"sources": list(app.library.sources.values()), "maxUploadBytes": MAX_UPLOAD})
                if path == "/api/batch/queue":
                    return self.json(app.queue.snapshot())
                if path == "/api/batch/reviews":
                    return self.json({"results": [{"id": identifier, "title": entry["recording"]["title"],
                                                   **review_status(app.store, identifier)}
                                                  for identifier, entry in list(app.store.entries.items())]})
                if re.fullmatch(r"/api/batch/downloads/[0-9a-f]{32}\.zip", path):
                    archive = app.store.root / "exports/batches" / path.rsplit("/", 1)[1]
                    if not archive.is_file():
                        raise AlignmentError("This private ZIP is missing. Prepare the download again.")
                    return self.bytes(archive.read_bytes(), "application/zip", "tikkun-generated-cues.zip")
            elif self.command == "POST":
                if path == "/api/batch/upload":
                    try:
                        length = int(self.headers.get("Content-Length", "0"))
                    except ValueError:
                        raise AlignmentError("Upload must include its file length.") from None
                    value = app.library.upload(self.rfile, length, params.get("filename", [""])[0], params.get("sourceId", [""])[0])
                    return self.json(value, 201)
                if path == "/api/batch/queue":
                    value = self.body()
                    return self.json(app.queue.enqueue(value.get("selections"), value.get("requestId"), value.get("force", False)))
                if path == "/api/batch/control":
                    value = self.body()
                    app.queue.control(value.get("action"), value.get("itemId"), value.get("minutes", 10))
                    return self.json(app.queue.snapshot())
                if path == "/api/batch/export":
                    content = app.export_zip(self.body().get("selections"))
                    if params.get("prepare") == ["1"]:
                        identifier = uuid.uuid4().hex + ".zip"
                        directory = app.store.root / "exports/batches"
                        directory.mkdir(parents=True, exist_ok=True)
                        with (directory / identifier).open("xb") as output:
                            output.write(content); output.flush(); os.fsync(output.fileno())
                        return self.json({"downloadUrl": f"/api/batch/downloads/{identifier}"})
                    return self.bytes(content, "application/zip", "tikkun-generated-cues.zip")
            return super().route()
    return Handler


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8769)
    parser.add_argument("--review-dir", default="private-batch")
    parser.add_argument("--import-reviews", help="Copy saved reviews once from another private workspace")
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535:
        parser.error("Choose a port from 1024 to 65535.")
    url = f"http://127.0.0.1:{args.port}"
    try:
        with urlopen(url + "/api/health", timeout=2) as response:
            health = json.load(response)
    except URLError:
        health = None
    if health:
        if health.get("app") == APP_ID and health.get("storage") == digest_json(str(work_path(args.review_dir))):
            print(f"Private batch beta already running: {url}", flush=True); return
        raise SystemExit("Port belongs to another service. Choose --port without stopping it.")
    root = work_path(args.review_dir)
    root.mkdir(parents=True, exist_ok=True)
    with (root / "server.lock").open("a+") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise SystemExit("This private batch workspace already has a running server.") from None
        store = BatchStore(root)
        previous = args.import_reviews or ("private-beta" if args.review_dir == "private-batch" else None)
        if previous:
            if work_path(previous) == root:
                raise SystemExit("Choose a different source workspace for importing reviews.")
            store.import_reviews(previous)
        app = BatchApp(store)
        server = ThreadingHTTPServer(("127.0.0.1", args.port), batch_handler_for(app))
        def stop(signum, frame):
            app.queue.close()
            threading.Thread(target=server.shutdown, daemon=True).start()
        signal.signal(signal.SIGTERM, stop)
        signal.signal(signal.SIGINT, stop)
        print(f"Private batch beta ready: {url}", flush=True)
        try:
            server.serve_forever()
        finally:
            app.queue.close()
            server.server_close()


if __name__ == "__main__":
    main()
