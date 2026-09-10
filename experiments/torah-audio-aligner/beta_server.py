#!/usr/bin/env python3
"""Loopback-only, dependency-free web service for the private aligner beta."""

from __future__ import annotations

import argparse
import fcntl
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import re
import secrets
import subprocess
import sys
import threading
import time
import traceback
from types import SimpleNamespace
from urllib.error import URLError
from urllib.parse import parse_qs, unquote, urlsplit
from urllib.request import urlopen
import uuid

from aligner import HERE, REPO, align, diagnose_cli, load_json, work_path, write_json
from beta_store import BetaStore, RevisionConflict, now
from core import AlignmentError, digest_json

APP_ID = "torah-aligner-private-beta-v1"
MAX_BODY = 1_000_000


def byte_range(header, size):
    if header is None:
        return 0, size - 1, False
    match = re.fullmatch(r"bytes=(\d*)-(\d*)", header)
    if not match or not any(match.groups()):
        raise ValueError("Invalid byte range")
    left, right = match.groups()
    if left:
        start, end = int(left), min(int(right), size - 1) if right else size - 1
    else:
        count = int(right)
        if count == 0:
            raise ValueError("Empty byte range")
        start, end = max(0, size - count), size - 1
    if start > end or start >= size:
        raise ValueError("Unsatisfiable byte range")
    return start, end, True


class BetaApp:
    def __init__(self, store):
        self.store = store
        self.csrf = secrets.token_urlsafe(32)
        self.job = None
        self.job_lock = threading.Lock()

    def run_alignment(self, identifier):
        entry = self.store.get(identifier)
        from analysis_runs import require_budget
        require_budget(360)
        with self.job_lock:
            if self.job and self.job["status"] == "running":
                raise RevisionConflict("One alignment is already running. Wait for it to finish.")
            job = {"id": uuid.uuid4().hex, "status": "running", "startedAt": now(),
                   "title": entry["recording"]["title"], "phase": "Aligning audio", "sourceId": identifier}
            self.job = job
            threading.Thread(target=self.worker, args=(entry, job), daemon=False).start()
            return dict(job)

    def worker(self, entry, job):
        from analysis_runs import record_elapsed
        started = time.monotonic()
        try:
            try:
                result = align(SimpleNamespace(input=f"inputs/{digest_json(entry['bundle'])}/input.json",
                                               audio_id=entry["recording"]["audioId"], timeout=180, max_audio_seconds=900))
            finally:
                record_elapsed("private-beta-alignment", time.monotonic() - started)
            seed = work_path(result["directory"]) / "proposal.json"
            with self.job_lock:
                job["phase"] = "Checking reading structure"
            diagnostic = diagnose_cli(SimpleNamespace(proposal=str(seed)))
            proposal_path = work_path(diagnostic["directory"]) / "proposal.json"
            identifier = entry["recording"]["audioId"] + "--" + job["id"][:12]
            generated = self.store.entry(identifier, proposal_path, seed, generated=True)
            with self.store.lock:
                write_json(self.store.root / "generated" / (identifier + ".json"),
                           {"id": identifier, "proposal": str(proposal_path.relative_to(work_path('.'))),
                            "seed": str(seed.relative_to(work_path('.'))), "createdAt": now()})
                self.store.entries[identifier] = generated
            with self.job_lock:
                job.update(status="complete", phase="Ready to review", resultId=identifier,
                           elapsedSeconds=round(time.monotonic() - started, 2))
        except (AlignmentError, OSError, ValueError, KeyError, subprocess.SubprocessError) as error:
            traceback.print_exc()
            with self.job_lock:
                job.update(status="failed", phase="Alignment stopped", error=str(error))
        finally:
            write_json(self.store.root / "jobs" / (job["id"] + ".json"), job)


def handler_for(app):
    class Handler(BaseHTTPRequestHandler):
        server_version = "TorahPrivateBeta/1"

        def log_message(self, fmt, *args):
            if args and str(args[1] if len(args) > 1 else "").startswith(("4", "5")):
                super().log_message(fmt, *args)

        def common_headers(self):
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Referrer-Policy", "no-referrer")
            self.send_header("Cross-Origin-Resource-Policy", "same-origin")
            self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")

        def json(self, value, status=200, filename=None):
            body = json.dumps(value, ensure_ascii=False, allow_nan=False).encode()
            self.send_response(status)
            self.common_headers()
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            if filename:
                self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(body)

        def file(self, path, content_type, ranges=False):
            size = path.stat().st_size
            try:
                start, end, partial = byte_range(self.headers.get("Range") if ranges else None, size)
            except ValueError:
                self.send_response(416)
                self.common_headers()
                self.send_header("Content-Range", f"bytes */{size}")
                self.send_header("Content-Length", "0")
                self.end_headers()
                return
            self.send_response(206 if partial else 200)
            self.common_headers()
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(end - start + 1))
            if ranges:
                self.send_header("Accept-Ranges", "bytes")
            if partial:
                self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
            self.end_headers()
            if self.command == "HEAD":
                return
            with path.open("rb") as source:
                source.seek(start)
                remaining = end - start + 1
                while remaining:
                    chunk = source.read(min(65536, remaining))
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    remaining -= len(chunk)

        def origin(self):
            host = self.headers.get("Host", "")
            valid = {f"127.0.0.1:{self.server.server_port}", f"localhost:{self.server.server_port}"}
            if host not in valid:
                raise PermissionError("Open the beta through its localhost link.")
            origin = self.headers.get("Origin")
            if origin and origin != f"http://{host}":
                raise PermissionError("Cross-origin access is disabled.")
            if self.command == "POST":
                if origin != f"http://{host}" or not secrets.compare_digest(self.headers.get("X-Private-Token", ""), app.csrf):
                    raise PermissionError("The private session changed. Reload this page before saving.")

        def body(self):
            try:
                length = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                raise AlignmentError("Invalid request length.") from None
            if not 0 < length <= MAX_BODY or self.headers.get_content_type() != "application/json":
                raise AlignmentError("Send a JSON edit smaller than 1 MB.")
            value = json.loads(self.rfile.read(length))
            if not isinstance(value, dict):
                raise AlignmentError("Expected a JSON object.")
            return value

        def route(self):
            self.origin()
            parsed = urlsplit(self.path)
            path = unquote(parsed.path)
            params = parse_qs(parsed.query)
            if self.command in {"GET", "HEAD"}:
                if path == "/api/health":
                    return self.json({"app": APP_ID, "workspace": digest_json(str(HERE)),
                                      "storage": digest_json(str(app.store.root)), "status": "ready"})
                if path == "/api/catalog":
                    return self.json({"recordings": app.store.catalog(), "csrf": app.csrf, "defaultId": "behalotecha-1", "generatedCueExport": True})
                if path == "/api/job":
                    with app.job_lock:
                        return self.json({"job": dict(app.job) if app.job else None})
                assets = {"/": (HERE / "private-ui/index.html", "text/html; charset=utf-8"),
                          "/app.js": (HERE / "private-ui/app.js", "text/javascript; charset=utf-8"),
                          "/style.css": (HERE / "private-ui/style.css", "text/css; charset=utf-8"),
                          "/fonts/stam.ttf": (REPO / "site/assets/fonts/ShlomosemiStam.ttf", "font/ttf"),
                          "/fonts/lora.ttf": (REPO / "site/assets/fonts/Lora-Regular.ttf", "font/ttf")}
                if path in assets:
                    return self.file(*assets[path])
            match = re.fullmatch(r"/api/recordings/([a-z0-9_-]+)/(detail|waveform|audio|save|history|revision|export|align)", path)
            if not match:
                return self.json({"error": "This page is not part of the private beta."}, 404)
            identifier, action = match.groups()
            if self.command in {"GET", "HEAD"}:
                if action == "detail":
                    return self.json(app.store.detail(identifier))
                if action == "waveform":
                    return self.json(app.store.waveform(identifier))
                if action == "history":
                    return self.json({"revisions": app.store.history(identifier)})
                if action == "revision":
                    return self.json(app.store.revision(identifier, params.get("id", [""])[0]))
                if action == "audio":
                    app.store.detail(identifier)
                    return self.file(app.store.get(identifier)["wavePath"], "audio/wav", ranges=True)
            elif self.command == "POST":
                value = self.body()
                if action == "save":
                    return self.json(app.store.save(identifier, value.get("state"), value.get("baseRevision")))
                if action == "export":
                    kind = value.get("kind")
                    return self.json(app.store.export(identifier, value.get("revision"), kind), filename=f"{identifier}-{kind}.json")
                if action == "align":
                    return self.json(app.run_alignment(identifier), 202)
            return self.json({"error": "Method not allowed."}, 405)

        def dispatch(self):
            self.connection.settimeout(15)
            try:
                self.route()
            except (BrokenPipeError, ConnectionResetError, TimeoutError):
                # Playback routinely abandons a range request when seeking.
                return
            except RevisionConflict as error:
                self.json({"error": str(error)}, 409)
            except PermissionError as error:
                self.json({"error": str(error)}, 403)
            except (AlignmentError, ValueError, KeyError) as error:
                self.json({"error": str(error)}, 422)
            except FileNotFoundError as error:
                self.json({"error": "A private artifact is missing: " + error.filename}, 404)
            except Exception:
                # HTTP is the error boundary; failures are logged and never reported as saves.
                traceback.print_exc()
                self.json({"error": "Private service error. Your last saved revision is retained; inspect the server log."}, 500)

        do_GET = dispatch
        do_HEAD = dispatch
        do_POST = dispatch

    return Handler


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8767)
    parser.add_argument("--review-dir", default="private-beta", help="Private review directory inside work/; use a separate directory for QA")
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
        if (health.get("app") == APP_ID and health.get("workspace") == digest_json(str(HERE))
                and health.get("storage") == digest_json(str(work_path(args.review_dir)))):
            print(f"Private beta already running: {url}", flush=True)
            return
        raise SystemExit("This port belongs to another service. Choose --port; do not stop that service.")
    lock_path = work_path(args.review_dir) / "server.lock"
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    with lock_path.open("a+") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise SystemExit("A private beta is already running for this workspace. Check port 8767.") from None
        server = ThreadingHTTPServer(("127.0.0.1", args.port), handler_for(BetaApp(BetaStore(args.review_dir))))
        print(f"Private beta ready: {url}", flush=True)
        print("Local access only. Saves and exports stay in the experiment. Ctrl-C stops this server.", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
        finally:
            server.server_close()


if __name__ == "__main__":
    main()
