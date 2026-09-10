#!/usr/bin/env python3
"""Isolated local runner. Network downloads and publication are deliberately absent."""

from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import importlib.util
import json
import os
from pathlib import Path
import resource
import re
import signal
import subprocess
import sys
import tempfile
import time
import uuid

from core import (AlignmentError, digest_json, lexical_units,
                  propose, reviewed_draft, timing_metrics, validate_result)

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
WORK = HERE / "work"
CHECKPOINT = json.loads((HERE / "checkpoint.json").read_text())


def load_json(path):
    return json.loads(Path(path).read_text())


def file_hash(path):
    with Path(path).open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


def work_path(relative):
    target = (WORK / relative).resolve()
    if not target.is_relative_to(WORK.resolve()):
        raise AlignmentError("Outputs must remain inside the experiment's work directory")
    return target


def write_json(path, value, *, replace=False):
    path = work_path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix=".writing-", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w") as output:
            json.dump(value, output, ensure_ascii=False, indent=2, allow_nan=False)
            output.write("\n")
            output.flush()
            os.fsync(output.fileno())
        if replace:
            os.replace(temporary, path)
        else:
            os.link(temporary, path)
    finally:
        Path(temporary).unlink(missing_ok=True)
    return path


def current_input(path=None):
    if path is None:
        pointer = work_path("latest-input.json")
        if not pointer.is_file():
            raise AlignmentError("Run prepare before this command")
        path = load_json(pointer)["path"]
    location = work_path(path)
    bundle = load_json(location)
    if digest_json(bundle) != location.parent.name:
        raise AlignmentError("Prepared input was modified; prepare a new version")
    return bundle, location.parent


def recording_for(bundle, audio_id):
    matches = [item for item in bundle["recordings"] if item["audioId"] == audio_id]
    if len(matches) != 1:
        raise AlignmentError(f"Unknown or ambiguous recording: {audio_id}")
    return matches[0]


def input_for_result(result):
    identity = result.get("inputSha256")
    if not isinstance(identity, str) or len(identity) != 64 or any(char not in "0123456789abcdef" for char in identity):
        raise AlignmentError("Proposal needs a valid immutable input digest")
    return current_input(f"inputs/{identity}/input.json")


def assert_no_cue_labels(value):
    if isinstance(value, dict):
        for key, child in value.items():
            if key in {"timeStart", "timeEnd", "cues", "sourceStartSample", "sourceEndSample"}:
                raise AlignmentError(f"Legacy timing leaked into model input: {key}")
            assert_no_cue_labels(child)
    elif isinstance(value, list):
        for child in value:
            assert_no_cue_labels(child)


def verify_sources(bundle, recording=None):
    for relative, expected in bundle["compilerSources"].items():
        source = REPO / relative
        if not source.is_file() or file_hash(source) != expected:
            source = work_path(Path("compiler-history") / expected / Path(relative).name)
        if not source.is_file() or file_hash(source) != expected:
            raise AlignmentError(f"Source changed since prepare: {relative}")
    for relative, expected in bundle.get("provenanceSources", {}).items():
        source = REPO / relative
        if not source.is_file() or file_hash(source) != expected:
            source = work_path(Path("compiler-history") / expected / Path(relative).name)
        if file_hash(source) != expected:
            raise AlignmentError(f"Historical compiler provenance is unavailable: {relative}")
    text_hash = hashlib.sha256()
    for path in sorted((REPO / "text/pages/torah").glob("[0-9]*.json"), key=lambda p: int(p.stem)):
        text_hash.update(path.name.encode() + b"\0" + path.read_bytes() + b"\0")
    if text_hash.hexdigest() != bundle["textPagesSha256"]:
        raise AlignmentError("Canonical text changed since prepare")
    for item in [recording] if recording else bundle["recordings"]:
        source = (REPO / item["mediaPath"]).resolve()
        imported = WORK / "imported-audio"
        if not source.is_relative_to(REPO / "site/audio") and not (
            source.parent == imported.resolve() and source.stem == item["mediaIdentity"]["digest"]
        ):
            raise AlignmentError("Source recording is outside the declared audio tree")
        if source.stat().st_size != item["mediaIdentity"]["byteLength"] or file_hash(source) != item["mediaIdentity"]["digest"]:
            raise AlignmentError(f"Recording bytes changed: {item['audioId']}")
    assert_no_cue_labels(bundle)


def probe(recording):
    command = ["ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries",
               "format=duration,start_time:stream=sample_rate,channels,start_time", "-of", "json",
               str(REPO / recording["mediaPath"])]
    info = json.loads(subprocess.check_output(command, timeout=15))
    if len(info.get("streams", [])) != 1:
        raise AlignmentError("Expected one selected audio stream")
    for source in [info["format"], info["streams"][0]]:
        if abs(float(source.get("start_time", 0))) > 0.000001:
            raise AlignmentError("Nonzero presentation origin needs an explicit source mapping")
    duration = float(info["format"]["duration"])
    if abs(duration - recording["durationSeconds"]) > 0.002:
        raise AlignmentError("Media duration differs from the prepared pilot")
    return info


def annotation_template(bundle):
    recordings = []
    for recording in bundle["recordings"]:
        tokens = recording["tokens"]
        target = len(tokens) if recording["split"] == "development" else min(60, len(tokens))
        selected = {token["tokenKey"] for token in tokens[:10]}
        maqaf = [token for token in tokens if "\u05be" in token["annotatedText"] and token["tokenKey"] not in selected]
        rank = lambda token: hashlib.sha256((recording["audioId"] + token["tokenKey"]).encode()).hexdigest()
        selected.update(token["tokenKey"] for token in sorted(maqaf, key=rank)[:min(20, target - len(selected))])
        others = [token for token in tokens if token["tokenKey"] not in selected]
        selected.update(token["tokenKey"] for token in sorted(others, key=rank)[:target - len(selected)])
        recordings.append({
            "audioId": recording["audioId"], "mediaIdentity": recording["mediaIdentity"],
            "split": recording["split"], "kind": "human-acoustic-boundaries",
            "cues": [{"tokenKey": token["tokenKey"], "annotatedText": token["annotatedText"],
                      "verse": token["verse"], "timeStart": None, "timeEnd": None,
                      "reviewState": "unreviewed", "reviewer": None,
                      "firstPlaybackCueWasNormalized": index == 0,
                      "maqafInteriorLabelsNeeded": "\u05be" in token["annotatedText"]}
                     for index, token in enumerate(tokens) if token["tokenKey"] in selected],
        })
    return {"schemaVersion": "torah-aligner-annotations-v1", "inputSha256": digest_json(bundle),
            "textPagesSha256": bundle["textPagesSha256"], "recordings": recordings}


def prepare(args):
    command = ["node", "--import", "tsx", str(HERE / "compile-input.mts")]
    if args.manifest:
        command += ["--manifest", str(work_path(args.manifest))]
    completed = subprocess.run(command,
                               cwd=REPO, capture_output=True, text=True, timeout=90, check=True)
    compilation = json.loads(completed.stdout)
    bundle = compilation["input"]
    verify_sources(bundle)
    for relative, expected in {**bundle["compilerSources"], **bundle.get("provenanceSources", {})}.items():
        history = work_path(Path("compiler-history") / expected / Path(relative).name)
        history.parent.mkdir(parents=True, exist_ok=True)
        if history.exists():
            if file_hash(history) != expected:
                raise AlignmentError("Historical compiler snapshot changed")
        else:
            with history.open("xb") as snapshot:
                snapshot.write((REPO / relative).read_bytes())
    probes = {item["audioId"]: probe(item) for item in bundle["recordings"]}
    input_hash = digest_json(bundle)
    directory = work_path(Path("inputs") / input_hash)
    files = {"input.json": bundle, "legacy-evaluation.json": compilation["evaluation"],
             "annotations.template.json": annotation_template(bundle), "media-probes.json": probes}
    for name, value in files.items():
        target = directory / name
        if target.exists():
            if load_json(target) != value:
                raise AlignmentError(f"Prepared artifact changed: {name}; preserve edits separately")
        else:
            write_json(target, value)
    if not args.keep_current:
        write_json("latest-input.json", {"path": str((directory / "input.json").relative_to(WORK))}, replace=True)
    summary = {
        "status": "prepared-no-inference", "inputSha256": input_hash,
        "recordings": len(bundle["recordings"]),
        "displayTokens": sum(len(item["tokens"]) for item in bundle["recordings"]),
        "lexicalUnits": sum(len(lexical_units(item["tokens"])) for item in bundle["recordings"]),
        "humanBoundaryTargets": sum(len(item["cues"]) for item in files["annotations.template.json"]["recordings"] if item["split"] != "development"),
        "legacyTimingsAbsentFromModelInput": True, "directory": str(directory),
    }
    return summary


def preflight(_args):
    bundle, _ = current_input()
    verify_sources(bundle)
    packages = {}
    for name in ["numpy", "torch", "transformers", "safetensors"]:
        packages[name] = importlib.metadata.version(name) if importlib.util.find_spec(name) else None
    model_dir = work_path("model")
    missing = [name for name in CHECKPOINT["requiredFiles"] if not (model_dir / name).is_file()]
    download_plan = load_json(HERE / "resource-plan.json")
    report = {
        "status": "blocked-on-model-setup" if missing else "local-files-present-unverified",
        "checkpoint": CHECKPOINT, "packages": packages, "missingModelFiles": missing,
        "automaticDownloads": False, "sourceIdentityChecks": "passed",
        "executionPlan": {
            "firstRecording": "haazinu-1", "audioSeconds": 76.184671,
            "selectedWheelAndWeightBytes": download_plan["estimatedSelectedDownloadsBytes"],
            "proposedDownloadCeilingBytes": 2_000_000_000, "estimatedWorkingMemoryGiB": [4, 8],
            "cpuThreads": 4, "smokeWallTimeLimitSeconds": 600,
            "pilotRuntime": "Estimate from the measured smoke run before authorizing a larger run",
        },
    }
    write_json("preflight.json", report, replace=True)
    return report


def verify_model():
    directory = work_path("model")
    for name in CHECKPOINT["requiredFiles"]:
        if not (directory / name).is_file():
            raise AlignmentError(f"Model setup required: missing {name}; downloads are never automatic")
    weights = directory / CHECKPOINT["weights"]["filename"]
    if weights.stat().st_size != CHECKPOINT["weights"]["byteLength"] or file_hash(weights) != CHECKPOINT["weights"]["sha256"]:
        raise AlignmentError("Model weights do not match the pinned checkpoint")
    config = load_json(directory / "config.json")
    vocabulary = load_json(directory / "vocab.json")
    feature = load_json(directory / "preprocessor_config.json")
    if config["conv_kernel"] != CHECKPOINT["convKernel"] or config["conv_stride"] != CHECKPOINT["convStride"] or config["add_adapter"]:
        raise AlignmentError("Unexpected model time geometry")
    if config["pad_token_id"] != CHECKPOINT["blankId"] or config["vocab_size"] != CHECKPOINT["vocabularySize"]:
        raise AlignmentError("Unexpected acoustic vocabulary or CTC blank")
    if vocabulary != CHECKPOINT["vocabulary"] or feature["sampling_rate"] != CHECKPOINT["sampleRate"]:
        raise AlignmentError("Tokenizer/feature extractor mismatch")
    return directory


def bounded_worker(command, timeout):
    """Own the worker's process group so cancellation also stops its decoder child."""
    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                               text=True, start_new_session=True)
    try:
        stdout, stderr = process.communicate(timeout=timeout)
    except (subprocess.TimeoutExpired, KeyboardInterrupt):
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass  # The process group already exited between timeout and cancellation.
        process.communicate()
        raise
    return subprocess.CompletedProcess(command, process.returncode, stdout, stderr)


def infer_worker(args):
    # Executed only in a bounded child process. Missing dependencies fail before audio work.
    import numpy as np
    from acoustics import encode_samples, load_encoder, read_wave
    directory = work_path(args.run_dir)
    bundle, _ = current_input(args.input)
    recording = recording_for(bundle, args.audio_id)
    verify_sources(bundle, recording)
    model_dir = verify_model()
    probe(recording)
    waveform = directory / "analysis.wav"
    subprocess.run(["ffmpeg", "-v", "error", "-nostdin", "-n", "-threads", "1", "-i",
                    str(REPO / recording["mediaPath"]), "-map", "0:a:0", "-vn", "-ac", "1",
                    "-ar", "16000", "-c:a", "pcm_s16le", str(waveform)], check=True, timeout=60)
    samples = read_wave(waveform)
    if abs(len(samples) / 16000 - recording["durationSeconds"]) > 0.1:
        raise AlignmentError("Decoded duration needs a more explicit presentation-time mapping")
    evidence, geometry = encode_samples(samples, load_encoder(model_dir, work_path("hf-cache")),
                                        CHECKPOINT, capture_features=True)
    metadata = {
        **geometry,
        "analysisWaveSha256": file_hash(waveform),
        "packages": {name: importlib.metadata.version(name) for name in ["numpy", "torch", "transformers", "safetensors"]},
        "inputSha256": digest_json(bundle), "mediaIdentity": recording["mediaIdentity"],
        "checkpointRevision": CHECKPOINT["revision"],
        "implementation": {name: file_hash(HERE / name) for name in ["aligner.py", "acoustics.py", "core.py", "checkpoint.json"]},
    }
    np.savez(directory / "emissions.npz", **evidence)
    metadata["emissionsSha256"] = file_hash(directory / "emissions.npz")
    result = propose(bundle, recording, evidence["log_probs"], evidence["frame_starts"], metadata, CHECKPOINT)
    peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    metadata["peakResidentBytes"] = peak if sys.platform == "darwin" else peak * 1024
    write_json(directory / "emissions.json", metadata)
    write_json(directory / "proposal.json", result)
    write_json(directory / "review.template.json", {
        "resultSha256": digest_json(result), "reviewer": None,
        "performanceReviewedLinear": False, "acceptedOccurrenceIds": [],
        "playbackLeadSamples": 0, "includeAcousticEnds": False, "acceptedEndOccurrenceIds": [],
    })
    return {"status": "proposal-ready-for-review", "directory": str(directory), "occurrences": len(result["occurrences"])}


def align(args):
    bundle, input_dir = current_input(args.input)
    recording = recording_for(bundle, args.audio_id)
    verify_sources(bundle, recording)
    if recording["durationSeconds"] > args.max_audio_seconds:
        raise AlignmentError("Recording exceeds this run's audio-duration limit; measure the smoke test first")
    if not 1 <= args.timeout <= 3600 or not 1 <= args.max_audio_seconds <= 900:
        raise AlignmentError("Run limits must be 1-3600 wall seconds and 1-900 audio seconds")
    verify_model()
    for package in ["torch", "transformers", "safetensors"]:
        if importlib.util.find_spec(package) is None:
            raise AlignmentError(f"Missing optional acoustic dependency: {package}")
    directory = work_path(Path("runs") / f"{recording['audioId']}-{uuid.uuid4().hex[:12]}")
    directory.mkdir(parents=True)
    write_json(directory / "run.json", {"status": "started", "inputSha256": digest_json(bundle),
                                      "audioId": recording["audioId"], "timeoutSeconds": args.timeout})
    started = time.monotonic()
    try:
        process = bounded_worker([sys.executable, "-B", str(HERE / "aligner.py"), "_infer",
                                  "--audio-id", args.audio_id, "--run-dir", str(directory),
                                  "--input", str(input_dir / "input.json")], args.timeout)
        if process.returncode:
            write_json(directory / "failure.json", {"status": "failed", "stderr": process.stderr[-8000:]})
            raise AlignmentError(f"Acoustic worker failed; details in {directory / 'failure.json'}")
    except subprocess.TimeoutExpired:
        write_json(directory / "failure.json", {"status": "timed-out", "timeoutSeconds": args.timeout})
        raise AlignmentError(f"Worker stopped at the wall-time limit; incomplete run retained at {directory}") from None
    except KeyboardInterrupt:
        write_json(directory / "failure.json", {"status": "cancelled"})
        raise AlignmentError(f"Worker cancelled; incomplete run retained at {directory}") from None
    elapsed = time.monotonic() - started
    status = {"status": "proposal-ready-for-review", "audioId": args.audio_id,
              "wallSeconds": elapsed, "realTimeFactor": elapsed / recording["durationSeconds"],
              "directory": str(directory)}
    write_json(directory / "completion.json", status)
    return status


def evaluate(args):
    result = load_json(work_path(args.proposal))
    bundle, input_dir = input_for_result(result)
    recording = recording_for(bundle, result["audioId"])
    verify_sources(bundle, recording)
    validate_result(bundle, recording, result)
    reference = load_json(work_path(args.reference) if args.reference else input_dir / "legacy-evaluation.json")
    if reference["textPagesSha256"] != bundle["textPagesSha256"]:
        raise AlignmentError("Evaluation text version mismatch")
    selected = recording_for(reference, result["audioId"])
    metrics = timing_metrics(recording, result, selected)
    output = {"audioId": result["audioId"], "proposalSha256": digest_json(result),
              "referenceSha256": digest_json(reference), "metrics": metrics}
    if not 0 <= args.playback_lead_samples <= result["sampleRate"]:
        raise AlignmentError("Playback comparison lead must be zero to one second")
    if args.playback_lead_samples:
        if selected["kind"] == "human-acoustic-boundaries":
            raise AlignmentError("Playback lead cannot be applied to acoustic ground-truth scoring")
        from analysis_runs import comparison_stats, differences
        output["playbackCueComparison"] = comparison_stats(differences(result, selected), args.playback_lead_samples / result["sampleRate"])
    location = write_json(Path("evaluations") / f"{uuid.uuid4().hex}.json", output)
    return {**output, "path": str(location)}


def export_draft(args):
    result = load_json(work_path(args.proposal))
    bundle, _ = input_for_result(result)
    recording = recording_for(bundle, result["audioId"])
    verify_sources(bundle, recording)
    payload = reviewed_draft(bundle, recording, result, load_json(work_path(args.review)))
    destination = work_path(Path("drafts") / f"{recording['audioId']}-{uuid.uuid4().hex[:12]}.json")
    # Reuse the real application validator before writing even an isolated draft.
    subprocess.run(["node", "--import", "tsx", str(HERE / "check-draft.mts")], input=json.dumps(payload),
                   text=True, capture_output=True, cwd=REPO, check=True, timeout=30)
    write_json(destination, payload)
    return {"status": "isolated-reviewed-draft", "path": str(destination), "published": False,
            "firstCueCompatibilityNormalization": "First playback start is zero; original acoustic onset remains in proposal"}


def verify(_args):
    process = subprocess.run([sys.executable, "-B", "-m", "unittest", "discover", "-s", str(HERE / "tests"), "-v"],
                             cwd=HERE, text=True, capture_output=True, timeout=60)
    sys.stderr.write(process.stderr)
    if process.returncode:
        raise AlignmentError("Experiment tests failed")
    bundle, _ = current_input()
    verify_sources(bundle)
    count = re.search(r"Ran (\d+) tests?", process.stderr)
    if count is None:
        raise AlignmentError("Test runner did not report a test count")
    files = [HERE / name for name in ["aligner.py", "core.py", "acoustics.py", "reading_graph.py", "review_evidence.py", "diagnostics.py",
                                    "beta_store.py", "beta_server.py", "batch_import.py", "batch_queue.py",
                                    "batch_server.py", "batch-library.mts"]]
    files += sorted((HERE / "private-ui").glob("*"))
    files += sorted((HERE / "batch-ui").glob("*"))
    files += sorted((HERE / "tests").glob("test_*.py"))
    report = {"status": "verified-foundation", "scope": "Deterministic tests and prepared source identities",
              "testCount": int(count[1]), "exitCode": process.returncode,
              "sourceFiles": {str(path.relative_to(HERE)): file_hash(path) for path in files},
              "acousticAccuracyMeasured": False, "recordings": len(bundle["recordings"])}
    location = write_json(Path("test-runs") / uuid.uuid4().hex[:12] / "result.json", report)
    (location.parent / "test-output.txt").write_text(process.stderr)
    write_json("latest-tests.json", {"path": str(location.relative_to(WORK))}, replace=True)
    return {"status": report["status"], "testCount": report["testCount"], "testEvidence": str(location),
            "scope": report["scope"], "acousticAccuracyMeasured": False, "recordings": len(bundle["recordings"])}


def diagnose_cli(args):
    from analysis_runs import require_budget, record_elapsed
    require_budget(180)
    proposal = work_path(args.proposal)
    started = time.monotonic()
    try:
        process = bounded_worker([sys.executable, "-B", str(HERE / "aligner.py"), "_diagnose", str(proposal)], 180)
    except (subprocess.TimeoutExpired, KeyboardInterrupt):
        record_elapsed("cancelled-cached-reading-diagnostics", time.monotonic() - started)
        raise AlignmentError("Diagnostic process group stopped; no completed proposal is claimed") from None
    if process.returncode:
        raise AlignmentError("Diagnostic worker failed: " + process.stderr[-4000:])
    return json.loads(process.stdout)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    preparation = commands.add_parser("prepare")
    preparation.add_argument("--manifest", help="Additional recording manifest inside work/")
    preparation.add_argument("--keep-current", action="store_true", help="Keep the original pilot pointer unchanged")
    for name in ["preflight", "verify"]:
        commands.add_parser(name)
    run_parser = commands.add_parser("align")
    run_parser.add_argument("--audio-id", default="haazinu-1")
    run_parser.add_argument("--input", help="Immutable input path inside work/; defaults to latest preparation")
    run_parser.add_argument("--timeout", type=int, default=600)
    run_parser.add_argument("--max-audio-seconds", type=int, default=90)
    worker = commands.add_parser("_infer", help=argparse.SUPPRESS)
    worker.add_argument("--audio-id", required=True)
    worker.add_argument("--run-dir", required=True)
    worker.add_argument("--input", required=True)
    for name in ["diagnose", "_diagnose"]:
        diagnostic = commands.add_parser(name, help=argparse.SUPPRESS if name.startswith("_") else "Inspect cached reading evidence")
        diagnostic.add_argument("proposal", help="Original linear proposal path inside work/")
    for name in ["evaluate", "export-draft"]:
        command = commands.add_parser(name)
        command.add_argument("proposal", help="Proposal path inside work/")
        if name == "evaluate":
            command.add_argument("--reference", help="Fresh reviewed reference inside work/; otherwise compare legacy starts")
            command.add_argument("--playback-lead-samples", type=int, default=0, help="Also compare playback cues with an explicit lead")
        else:
            command.add_argument("--review", required=True)
    args = parser.parse_args()
    handlers = {"prepare": prepare, "preflight": preflight, "verify": verify, "align": align,
                "_infer": infer_worker, "evaluate": evaluate, "export-draft": export_draft, "diagnose": diagnose_cli}
    if args.command == "_diagnose":
        from diagnostics import diagnose
        handlers["_diagnose"] = diagnose
    try:
        output = handlers[args.command](args)
    except (AlignmentError, OSError, subprocess.SubprocessError, json.JSONDecodeError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        if isinstance(error, subprocess.CalledProcessError) and error.stderr:
            print(error.stderr, file=sys.stderr)
        return 1
    print(json.dumps(output, ensure_ascii=False, indent=2, allow_nan=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
