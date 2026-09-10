"""Bounded CTC head adaptation; evaluation passages never choose the checkpoint."""

import json
import argparse
from pathlib import Path
import time
import uuid
import numpy as np
import torch
from safetensors import safe_open
from safetensors.torch import save_file

from aligner import HERE, WORK, CHECKPOINT, file_hash, write_json, work_path, verify_model
from analysis_runs import baseline_records, comparison_stats, differences, require_budget, record_elapsed
from core import AlignmentError, lexical_units, propose

PROFILE = "torah-spoken-v1"


def load_sequence(item):
    with np.load(item["directory"] / "emissions.npz", allow_pickle=False) as cache:
        features = torch.from_numpy(cache["encoder_features"].astype(np.float32))
        starts = cache["frame_starts"].copy()
    text = "|".join(unit["alignmentText"] for unit in lexical_units(item["recording"]["tokens"], profile=PROFILE))
    labels = torch.tensor([CHECKPOINT["vocabulary"][char] for char in text], dtype=torch.long)
    return features, starts, labels


def sequence_loss(head, features, labels):
    log_probs = head(features).log_softmax(dim=-1).unsqueeze(1)
    loss = torch.nn.functional.ctc_loss(log_probs, labels,
                                       torch.tensor([len(features)]), torch.tensor([len(labels)]),
                                       blank=CHECKPOINT["blankId"], reduction="mean", zero_infinity=False)
    if not torch.isfinite(loss):
        raise AlignmentError("Non-finite CTC loss; alignment/training stopped")
    return loss


def train(args):
    require_budget(600)
    started = time.monotonic()
    torch.set_num_threads(4)
    torch.set_num_interop_threads(1)
    torch.manual_seed(20260909)
    bundle, items = baseline_records()
    verify_model()
    directory = work_path("head-tuning/" + uuid.uuid4().hex[:12])
    directory.mkdir(parents=True)
    by_id = {item["recording"]["audioId"]: item for item in items}
    training = by_id["beresheet-1"]
    development = by_id["haazinu-4"]
    train_features, _, train_labels = load_sequence(training)
    dev_features, _, dev_labels = load_sequence(development)
    head = torch.nn.Linear(1024, 32)
    with safe_open(str(work_path("model/model.safetensors")), framework="pt", device="cpu") as original:
        head.load_state_dict({"weight": original.get_tensor("lm_head.weight"), "bias": original.get_tensor("lm_head.bias")})
    initial = {name: value.detach().clone() for name, value in head.state_dict().items()}
    best = {name: value.clone() for name, value in initial.items()}
    with torch.inference_mode():
        baseline_dev = float(sequence_loss(head, dev_features, dev_labels))
    best_dev, best_step = baseline_dev, 0
    optimizer = torch.optim.AdamW(head.parameters(), lr=0.0002, weight_decay=0.01)
    history = []
    for step in range(1, args.steps + 1):
        if time.monotonic() - started > 420:
            raise AlignmentError("Head training reached its bounded runtime; no unverified checkpoint selected")
        head.train()
        optimizer.zero_grad(set_to_none=True)
        loss = sequence_loss(head, train_features, train_labels)
        anchor = sum(torch.mean((parameter - initial[name]) ** 2) for name, parameter in head.named_parameters())
        objective = loss + 10 * anchor
        objective.backward()
        torch.nn.utils.clip_grad_norm_(head.parameters(), 1, error_if_nonfinite=True)
        optimizer.step()
        head.eval()
        with torch.inference_mode():
            dev_loss = float(sequence_loss(head, dev_features, dev_labels))
        row = {"step": step, "trainingCTCLoss": float(loss.detach()), "developmentCTCLoss": dev_loss,
               "elapsedSeconds": time.monotonic() - started}
        history.append(row)
        if dev_loss < best_dev:
            best_dev, best_step = dev_loss, step
            best = {name: value.detach().clone() for name, value in head.state_dict().items()}
        write_json(directory / "training-progress.json", {"status": "training", "history": history}, replace=True)
        print(json.dumps(row), flush=True)
        if step - best_step >= args.patience:
            break
    head.load_state_dict(best)
    head.eval()
    save_file(best, str(directory / "tuned-head.safetensors"))
    predictions, split_deltas = [], {"development": [], "calibration": [], "evaluation": []}
    for item in items:
        features, starts, labels = load_sequence(item)
        with torch.inference_mode():
            probabilities = head(features).log_softmax(dim=-1).numpy()
        emissions_path = directory / f"{item['recording']['audioId']}-emissions.npz"
        np.savez(emissions_path, log_probs=probabilities, frame_starts=starts)
        metadata = {**item["metadata"], "encoderCacheSha256": item["metadata"]["emissionsSha256"],
                    "emissionsSha256": file_hash(emissions_path), "headAdaptation": {
            "checkpoint": str((directory / "tuned-head.safetensors").relative_to(WORK)),
            "sha256": file_hash(directory / "tuned-head.safetensors"), "selectedStep": best_step}}
        result = propose(bundle, item["recording"], probabilities, starts, metadata, CHECKPOINT, profile=PROFILE)
        result["decoder"] = "ctc-viterbi-with-adapted-head-v1"
        write_json(directory / f"{item['recording']['audioId']}.json", result)
        delta = differences(result, item["legacy"])
        split = item["recording"]["split"]
        split_deltas[split].append(delta)
        predictions.append((item["recording"]["audioId"], split, delta))
    lead = float(np.nanmedian(np.concatenate(split_deltas["calibration"])))
    summary = {"status": "complete", "encoderFrozen": True, "trainableParameters": sum(value.numel() for value in best.values()),
               "trainingRecordings": ["beresheet-1"], "developmentRecordings": ["haazinu-4"],
               "checkpointChosenBy": "Lowest development CTC loss, including the unmodified head as step zero",
               "maximumSteps": args.steps, "earlyStoppingPatience": args.patience,
               "selectedStep": best_step, "baselineDevelopmentCTCLoss": baseline_dev, "selectedDevelopmentCTCLoss": best_dev,
               "trainingHistory": history, "referenceProfile": PROFILE, "playbackLeadSeconds": lead,
               "splits": {split: comparison_stats(np.concatenate(values), lead) for split, values in split_deltas.items()},
               "recordings": [{"audioId": audio_id, "split": split, **comparison_stats(delta, lead)} for audio_id, split, delta in predictions],
               "elapsedSeconds": time.monotonic() - started,
               "implementation": {name: file_hash(HERE / name) for name in ["tune_head.py", "core.py"]},
               "limitations": ["One-narrator adaptation", "Agreement against approximate legacy timing labels", "No pronunciation-correctness assessment"]}
    write_json(directory / "summary.json", summary)
    write_json("latest-head-tuning.json", {"path": str((directory / "summary.json").relative_to(WORK))}, replace=True)
    print(json.dumps({"summary": str(directory / "summary.json"), "selectedStep": best_step,
                      "evaluation": summary["splits"]["evaluation"]}), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--steps", type=int, default=80)
    parser.add_argument("--patience", type=int, default=10)
    args = parser.parse_args()
    if not 1 <= args.steps <= 120 or not 1 <= args.patience <= 30:
        raise AlignmentError("Head adaptation limits: 1-120 steps and 1-30 patience")
    started = time.monotonic()
    try:
        train(args)
    finally:
        record_elapsed("ctc-head-adaptation-and-evaluation", time.monotonic() - started,
                       {"maximumSteps": args.steps})


if __name__ == "__main__":
    main()
