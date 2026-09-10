"""Frozen-setting confirmation on every cued recording outside the pilot."""

import argparse
import fcntl
import json
import resource
import subprocess
import sys
import time
import uuid
import numpy as np

from acoustics import encode_samples, load_encoder, read_wave
from aligner import (HERE, REPO, WORK, CHECKPOINT, current_input, recording_for, file_hash,
                     verify_sources, verify_model, probe, write_json, work_path, bounded_worker)
from analysis_runs import comparison_stats, differences, require_budget, record_elapsed
from core import AlignmentError, digest_json, propose
from prosody import pitch_track
from review_evidence import signal_quality, repeated_prefixes, sustained_tail_regions


def worker(args):
    import torch
    from safetensors.torch import load_file
    started = time.monotonic()
    directory = work_path(args.output)
    bundle, input_dir = current_input(args.input)
    verify_sources(bundle)
    legacy = json.loads((input_dir / "legacy-evaluation.json").read_text())
    head_summary = json.loads(work_path(args.head_summary).read_text())
    head_path = work_path(args.head_summary).parent / "tuned-head.safetensors"
    encoder = load_encoder(verify_model(), work_path("hf-cache"))
    head = torch.nn.Linear(1024, CHECKPOINT["vocabularySize"])
    head.load_state_dict(load_file(str(head_path)))
    head.eval()
    heads = {"original": "log_probs", "adapted": "adapted_log_probs"}
    combined = {name: [] for name in heads}
    rows = []
    for recording in bundle["recordings"]:
        if time.monotonic() - started > 1000:
            raise TimeoutError("Corpus confirmation reached its worker budget")
        run_started = time.monotonic()
        probe(recording)
        run_dir = directory / recording["audioId"]
        run_dir.mkdir()
        waveform = run_dir / "analysis.wav"
        subprocess.run(["ffmpeg", "-v", "error", "-nostdin", "-n", "-threads", "1", "-i",
                        str(REPO / recording["mediaPath"]), "-map", "0:a:0", "-vn", "-ac", "1",
                        "-ar", "16000", "-c:a", "pcm_s16le", str(waveform)], check=True, timeout=60)
        samples = read_wave(waveform)
        if abs(len(samples) / 16000 - recording["durationSeconds"]) > .1:
            raise AlignmentError("Confirmation audio duration drift")
        evidence, geometry = encode_samples(samples, encoder, CHECKPOINT, alternative_head=head)
        cache_path = run_dir / "emissions.npz"
        np.savez(cache_path, **evidence)
        metadata = {**geometry, "inputSha256": digest_json(bundle), "mediaIdentity": recording["mediaIdentity"],
                    "checkpointRevision": CHECKPOINT["revision"], "emissionsSha256": file_hash(cache_path),
                    "analysisWaveSha256": file_hash(waveform)}
        quality = signal_quality(samples)
        track = pitch_track(samples)
        measurements = {}
        for name, key in heads.items():
            acoustic = {**metadata, "emissionArray": key}
            if name == "adapted":
                acoustic["headAdaptation"] = {"sha256": file_hash(head_path), "selectedStep": head_summary["selectedStep"]}
            result = propose(bundle, recording, evidence[key], evidence["frame_starts"], acoustic,
                             CHECKPOINT, profile="torah-spoken-v1")
            result["reviewDiagnostics"] = {"signalQuality": quality,
                "prefixAmbiguities": repeated_prefixes(evidence[key], result["lexicalUnits"],
                                                       CHECKPOINT["vocabulary"], CHECKPOINT["blankId"]),
                "possibleTails": sustained_tail_regions(result["lexicalUnits"], track)}
            write_json(run_dir / (name + "-proposal.json"), result)
            delta = differences(result, recording_for(legacy, recording["audioId"]))
            combined[name].append(delta)
            measurements[name] = comparison_stats(delta, .228)
            measurements[name]["prefixAmbiguities"] = len(result["reviewDiagnostics"]["prefixAmbiguities"])
            measurements[name]["possibleTails"] = len(result["reviewDiagnostics"]["possibleTails"])
        row = {"audioId": recording["audioId"], "measurements": measurements, "signalQuality": quality,
               "wallSeconds": time.monotonic() - run_started}
        rows.append(row)
        write_json(directory / "progress.json", {"status": "running", "recordings": rows}, replace=True)
        print(json.dumps({"audioId": recording["audioId"], "completed": len(rows), "of": len(bundle["recordings"]),
                          "original200ms": measurements["original"]["within200msIncludingMissing"],
                          "adapted200ms": measurements["adapted"]["within200msIncludingMissing"],
                          "wallSeconds": row["wallSeconds"]}), flush=True)
    peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    summary = {"status": "complete", "inputSha256": digest_json(bundle), "inputPath": str((input_dir / "input.json").relative_to(WORK)),
               "frozenPlaybackLeadSeconds": .228, "adaptedHeadSha256": file_hash(head_path),
               "recordings": rows, "totals": {name: comparison_stats(np.concatenate(values), .228) for name, values in combined.items()},
               "peakResidentBytes": peak if sys.platform == "darwin" else peak * 1024,
               "elapsedSeconds": time.monotonic() - started,
               "implementation": {name: file_hash(HERE / name) for name in ["confirm_corpus.py", "acoustics.py", "core.py", "review_evidence.py"]},
               "limitations": ["One narrator", "Approximate cue agreement, not independent acoustic accuracy",
                               "Settings frozen before these recordings; no fitting against confirmation results",
                               "Natural reading mistakes are not independently labeled", "No pronunciation or cantillation correctness grades"]}
    write_json(directory / "summary.json", summary)
    write_json("latest-confirmation.json", {"path": str((directory / "summary.json").relative_to(WORK))}, replace=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True)
    parser.add_argument("--head-summary", required=True)
    parser.add_argument("--output")
    parser.add_argument("--worker", action="store_true")
    args = parser.parse_args()
    if args.worker:
        if not args.output:
            raise AlignmentError("Worker needs an isolated output directory")
        worker(args)
        return
    remaining = require_budget(1200)
    lock = work_path("analysis-job.lock").open("w")
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    directory = work_path("confirmation/" + uuid.uuid4().hex[:12])
    directory.mkdir(parents=True)
    write_json(directory / "job.json", {"status": "started", "input": args.input, "headSummary": args.head_summary,
                                       "timeoutSeconds": min(1200, remaining)})
    started = time.monotonic()
    try:
        result = bounded_worker([sys.executable, "-B", str(HERE / "confirm_corpus.py"), "--worker",
                                 "--input", args.input, "--head-summary", args.head_summary,
                                 "--output", str(directory)], min(1200, remaining))
        (directory / "worker.stdout").write_text(result.stdout)
        (directory / "worker.stderr").write_text(result.stderr)
        if result.returncode:
            write_json(directory / "failure.json", {"status": "failed", "exitCode": result.returncode})
            raise AlignmentError(f"Confirmation failed; inspect {directory}")
        print(json.dumps({"status": "complete", "directory": str(directory)}), flush=True)
    except (subprocess.TimeoutExpired, KeyboardInterrupt):
        write_json(directory / "failure.json", {"status": "cancelled-or-timed-out"})
        raise
    finally:
        record_elapsed("frozen-corpus-confirmation", time.monotonic() - started, {"directory": str(directory)})


if __name__ == "__main__":
    main()
