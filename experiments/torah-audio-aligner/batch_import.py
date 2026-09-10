"""Register existing recordings and bounded local uploads without public writes."""

from copy import deepcopy
import hashlib
import json
import math
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
from types import SimpleNamespace

from aligner import (HERE, REPO, WORK, current_input, file_hash, load_json, prepare,
                     probe, verify_sources, work_path, write_json)
from beta_store import BetaStore, now
from core import AlignmentError, digest_json

MAX_UPLOAD = 100 * 1024 * 1024
MAX_DURATION = 900
FORMATS = {"m4a", "mp3"}


def media_duration(path):
    completed = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                                "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
                               capture_output=True, text=True, timeout=15, check=True)
    duration = float(completed.stdout.strip())
    if not math.isfinite(duration) or not 0 < duration <= MAX_DURATION:
        raise AlignmentError("Each recording must be between 0 and 15 minutes. Split longer audio first.")
    return duration


class RecordingLibrary:
    def __init__(self, root, catalog=None):
        self.root = work_path(root)
        if catalog is None:
            result = subprocess.run(["node", "--import", "tsx", str(HERE / "batch-library.mts")],
                                    cwd=REPO, capture_output=True, text=True, timeout=90, check=True)
            catalog = json.loads(result.stdout)
        self.text_hash = catalog["textPagesSha256"]
        self.sources = {row["id"]: row for row in catalog["sources"]}
        if len(self.sources) != len(catalog["sources"]):
            raise AlignmentError("Duplicate recording identities in the Tikkun library.")

    def get(self, identifier):
        if not isinstance(identifier, str) or identifier not in self.sources:
            raise AlignmentError("Choose a recording from the Tikkun library.")
        source = self.sources[identifier]
        if not source["available"]:
            raise AlignmentError("Recording size differs from its registered identity. Restore the original audio first.")
        return source

    def upload(self, stream, length, filename, source_id):
        self.get(source_id)
        if type(length) is not int or not 0 < length <= MAX_UPLOAD:
            raise AlignmentError("Choose an audio file smaller than 100 MB.")
        suffix = Path(filename).suffix.lower().lstrip(".")
        if suffix not in FORMATS:
            raise AlignmentError("Choose M4A or MP3 audio, the formats supported by Tikkun cue exports.")
        directory = work_path("imported-audio")
        directory.mkdir(parents=True, exist_ok=True)
        if shutil.disk_usage(directory).free < length + 512 * 1024 * 1024:
            raise AlignmentError("Not enough free disk space for this upload and audio analysis.")
        descriptor, temporary = tempfile.mkstemp(prefix=".upload-", dir=directory)
        try:
            digest = hashlib.sha256()
            with os.fdopen(descriptor, "wb") as output:
                remaining = length
                while remaining:
                    chunk = stream.read(min(1024 * 1024, remaining))
                    if not chunk:
                        raise AlignmentError("Upload ended before the complete audio arrived. Try again.")
                    output.write(chunk); digest.update(chunk); remaining -= len(chunk)
                output.flush(); os.fsync(output.fileno())
            duration = media_duration(temporary)
            info = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=format_name",
                                   "-of", "json", temporary], capture_output=True, text=True, timeout=15, check=True)
            actual = json.loads(info.stdout)["format"]["format_name"].split(",")
            if (suffix == "mp3" and "mp3" not in actual) or (suffix == "m4a" and not {"mov", "mp4", "m4a"}.intersection(actual)):
                raise AlignmentError("Audio contents do not match the M4A or MP3 filename.")
            identity = {"algorithm": "sha256", "digest": digest.hexdigest(), "byteLength": length}
            audio_path = directory / f"{identity['digest']}.{suffix}"
            if audio_path.exists():
                if file_hash(audio_path) != identity["digest"]:
                    raise AlignmentError("An imported audio copy changed. Preserve it for investigation.")
            else:
                os.link(temporary, audio_path)
            value = {"sourceId": source_id, "mediaIdentity": identity, "durationSeconds": duration,
                     "mediaPath": str(audio_path.relative_to(REPO)), "format": suffix,
                     "filename": Path(filename).name[:200]}
            identifier = digest_json(value)
            destination = self.root / "uploads" / f"{identifier}.json"
            if not destination.exists():
                write_json(destination, value)
            return {"uploadId": identifier, **value}
        finally:
            Path(temporary).unlink(missing_ok=True)

    def upload_record(self, identifier, source_id):
        if not isinstance(identifier, str) or not re.fullmatch(r"[a-f0-9]{64}", identifier):
            raise AlignmentError("Invalid uploaded recording identity.")
        value = load_json(self.root / "uploads" / f"{identifier}.json")
        if digest_json(value) != identifier or value["sourceId"] != source_id:
            raise AlignmentError("Upload does not match the selected passage.")
        return value

    def selection(self, source_id, upload_id=None):
        source = self.get(source_id)
        upload = self.upload_record(upload_id, source_id) if upload_id else None
        identity = upload["mediaIdentity"] if upload else source["mediaIdentity"]
        return {"sourceId": source_id, "uploadId": upload_id,
                "title": f"{source['title']} · {upload['filename']}" if upload else source["title"],
                "mediaIdentity": identity,
                "sourceKey": digest_json({"source": source_id, "audio": identity, "text": self.text_hash})}

    def prepare(self, selection):
        source = self.get(selection["sourceId"])
        checked = self.selection(selection["sourceId"], selection.get("uploadId"))
        if checked["sourceKey"] != selection["sourceKey"]:
            raise AlignmentError("The selected recording changed after it was queued.")
        duration = media_duration(REPO / source["mediaPath"])
        manifest = {"textPagesSha256": self.text_hash, "inputs": [{
            **{key: source[key] for key in ["audioId", "narratorId", "mediaPath", "mediaIdentity"]},
            "durationSeconds": duration, "legacyCuePath": None, "split": "uncued-demonstration"}]}
        path = self.root / "selections" / f"{digest_json(manifest)}.json"
        if not path.exists():
            write_json(path, manifest)
        result = prepare(SimpleNamespace(manifest=str(path), keep_current=True))
        bundle, directory = current_input(str(Path(result["directory"]) / "input.json"))
        if selection.get("uploadId"):
            upload = self.upload_record(selection["uploadId"], source["id"])
            bundle = deepcopy(bundle)
            recording = bundle["recordings"][0]
            recording.update(audioId=f"private-{source['audioId']}-{upload['mediaIdentity']['digest'][:12]}",
                             narratorId="private-import", title=selection["title"],
                             audioFormat=upload["format"], mediaPath=upload["mediaPath"],
                             mediaIdentity=upload["mediaIdentity"], durationSeconds=upload["durationSeconds"])
            bundle["provenanceSources"][str((self.root / "uploads" / f"{selection['uploadId']}.json").relative_to(REPO))] = file_hash(self.root / "uploads" / f"{selection['uploadId']}.json")
            verify_sources(bundle); probe(recording)
            directory = work_path(f"inputs/{digest_json(bundle)}")
            if not (directory / "input.json").exists():
                write_json(directory / "input.json", bundle)
        return bundle, directory


class BatchStore(BetaStore):
    def import_reviews(self, previous_root):
        marker = self.root / "imported-reviews.json"
        if marker.exists():
            return
        previous = BetaStore(previous_root)
        imported = {}
        for identifier, entry in previous.entries.items():
            saved = previous.saved(identifier)
            if not saved["revision"]:
                continue
            if identifier in self.entries and (self.directory(identifier) / "head.json").exists():
                continue
            if identifier not in self.entries:
                registration = load_json(previous.root / "generated" / f"{identifier}.json")
                write_json(self.root / "generated" / f"{identifier}.json", registration)
                self.entries[identifier] = entry
            for revision_path in (previous.directory(identifier) / "revisions").glob("*.json"):
                destination = self.directory(identifier) / "revisions" / revision_path.name
                if not destination.exists():
                    write_json(destination, load_json(revision_path))
            write_json(self.directory(identifier) / "head.json", {"revision": saved["revision"], "sha256": digest_json(saved)})
            imported[identifier] = saved["revision"]
        write_json(marker, {"source": str(previous.root), "at": now(), "revisions": imported})
