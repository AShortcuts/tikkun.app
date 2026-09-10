"""Explicit, resumable download of the approved checkpoint's allowlisted files."""

from pathlib import Path
import hashlib
import json
import os
import time
import urllib.request

HERE = Path(__file__).resolve().parent
CHECKPOINT = json.loads((HERE / "checkpoint.json").read_text())
DIRECTORY = HERE / "work/model"
DIRECTORY.mkdir(parents=True, exist_ok=True)
LEDGER = HERE / "work/model-download.json"
state = json.loads(LEDGER.read_text()) if LEDGER.exists() else {"downloadedBytes": 0, "files": {}}
# Leave the rest of the approved 2 GB allowance for the locked environment and metadata.
DOWNLOAD_CEILING = 1_700_000_000


def save_state():
    temporary = LEDGER.with_suffix(".tmp")
    temporary.write_text(json.dumps(state, indent=2) + "\n")
    os.replace(temporary, LEDGER)


for name in CHECKPOINT["requiredFiles"]:
    destination = DIRECTORY / name
    limit = CHECKPOINT["weights"]["byteLength"] if name == "model.safetensors" else 2_000_000
    partial = destination.with_suffix(destination.suffix + ".partial")
    if destination.exists():
        with destination.open("rb") as existing:
            digest = hashlib.file_digest(existing, "sha256").hexdigest()
        if name in state["files"] and state["files"][name]["sha256"] == digest:
            print(json.dumps({"file": name, "status": "already-verified"}), flush=True)
            continue
        raise RuntimeError(f"Existing file is not recorded as verified: {name}")
    offset = partial.stat().st_size if partial.exists() else 0
    url = f"https://huggingface.co/{CHECKPOINT['id']}/resolve/{CHECKPOINT['revision']}/{name}"
    request = urllib.request.Request(url, headers={"Range": f"bytes={offset}-"} if offset else {})
    print(json.dumps({"file": name, "status": "downloading", "resumeOffset": offset}), flush=True)
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            if offset and (response.status != 206 or not response.headers.get("Content-Range", "").startswith(f"bytes {offset}-")):
                raise RuntimeError("Server did not honor the requested resume range")
            announced = int(response.headers.get("Content-Length", "0"))
            if announced and (offset + announced > limit or state["downloadedBytes"] + announced > DOWNLOAD_CEILING):
                raise RuntimeError("Download exceeds the declared file or total budget")
            written, last_report = offset, time.monotonic()
            with partial.open("ab" if offset else "xb") as output:
                while block := response.read(1024 * 1024):
                    state["downloadedBytes"] += len(block)
                    written += len(block)
                    if state["downloadedBytes"] > DOWNLOAD_CEILING or written > limit:
                        raise RuntimeError("Download exceeded its byte budget")
                    output.write(block)
                    if time.monotonic() - last_report > 10:
                        output.flush()
                        save_state()
                        print(json.dumps({"file": name, "receivedBytes": written}), flush=True)
                        last_report = time.monotonic()
                output.flush()
                os.fsync(output.fileno())
    finally:
        save_state()
    with partial.open("rb") as downloaded:
        digest = hashlib.file_digest(downloaded, "sha256").hexdigest()
    if name == "model.safetensors" and (partial.stat().st_size != limit or digest != CHECKPOINT["weights"]["sha256"]):
        raise RuntimeError("Downloaded model failed its pinned identity check")
    state["files"][name] = {"sha256": digest, "bytes": partial.stat().st_size,
                            "revision": CHECKPOINT["revision"]}
    os.replace(partial, destination)
    save_state()
    print(json.dumps({"file": name, "status": "verified", "bytes": destination.stat().st_size}), flush=True)
state["status"] = "complete"
save_state()
print(json.dumps({"status": "complete", "networkBytes": state["downloadedBytes"]}), flush=True)
