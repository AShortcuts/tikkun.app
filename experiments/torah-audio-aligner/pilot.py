"""Resume the approved baseline pilot using verified, completed local runs."""

import fcntl
import json
from pathlib import Path
import subprocess
import sys
import time

from aligner import (WORK, HERE, CHECKPOINT, current_input, file_hash, recording_for,
                     verify_sources, work_path, write_json)
from core import digest_json, timing_metrics, validate_result


def cached_run(bundle, recording):
    for candidate in sorted(work_path("runs").glob(recording["audioId"] + "-*"), reverse=True):
        if not (candidate / "completion.json").exists() or (candidate / "failure.json").exists():
            continue
        proposal = json.loads((candidate / "proposal.json").read_text())
        if (proposal["inputSha256"] != digest_json(bundle) or proposal["checkpoint"]["revision"] != CHECKPOINT["revision"] or
                proposal["decoder"] != "numpy-ctc-viterbi-v1" or not proposal["acoustics"].get("encoderFeatures")):
            continue
        validate_result(bundle, recording, proposal)
        if file_hash(candidate / "emissions.npz") != proposal["acoustics"]["emissionsSha256"]:
            raise RuntimeError("Cached emissions were modified")
        return candidate
    return None


def main():
    bundle, input_dir = current_input()
    verify_sources(bundle)
    ledger_path = work_path("testing-ledger.json")
    ledger = json.loads(ledger_path.read_text()) if ledger_path.exists() else {"events": []}
    legacy = json.loads((input_dir / "legacy-evaluation.json").read_text())
    output = {"status": "running", "inputSha256": digest_json(bundle),
              "referenceAssumption": "User estimates existing cues are 90% accurate; agreement is a proxy metric",
              "isAcousticAccuracy": False, "recordings": []}
    lock = work_path("pilot.lock").open("w")
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    for recording in bundle["recordings"]:
        directory = cached_run(bundle, recording)
        if directory is None:
            consumed = sum(event["elapsedSeconds"] for event in ledger["events"])
            # Smoke measured 20.3 s / 76.2 s; allow twice that rate plus startup margin.
            estimate = recording["durationSeconds"] * 0.54 + 30
            if consumed + estimate > 3600:
                raise RuntimeError("Remaining approved testing budget cannot cover this estimated run")
            started = time.monotonic()
            process = subprocess.run([str(HERE / "run"), "align", "--audio-id", recording["audioId"],
                                      "--max-audio-seconds", "900", "--timeout", "600"],
                                     capture_output=True, text=True)
            elapsed = time.monotonic() - started
            ledger["events"].append({"kind": "baseline-inference", "audioId": recording["audioId"],
                                     "elapsedSeconds": elapsed, "exitCode": process.returncode})
            write_json(ledger_path, ledger, replace=True)
            if process.returncode:
                raise RuntimeError(process.stderr)
            directory = Path(json.loads(process.stdout)["directory"])
        proposal = json.loads((directory / "proposal.json").read_text())
        completion = json.loads((directory / "completion.json").read_text())
        metrics = timing_metrics(recording, proposal, recording_for(legacy, recording["audioId"]))
        item = {"audioId": recording["audioId"], "split": recording["split"],
                "runDirectory": str(directory.relative_to(WORK)), "metrics": metrics,
                "wallSeconds": completion["wallSeconds"], "peakResidentBytes": proposal["acoustics"]["peakResidentBytes"]}
        output["recordings"].append(item)
        write_json("baseline-pilot.json", output, replace=True)
        print(json.dumps(item), flush=True)
    output["status"] = "complete"
    write_json("baseline-pilot.json", output, replace=True)
    print(json.dumps({"status": "complete", "recordings": len(output["recordings"])}), flush=True)


if __name__ == "__main__":
    main()
