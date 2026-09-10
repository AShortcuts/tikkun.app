"""Fit playback lead on calibration passages and evaluate untouched passage splits."""

import json
import time
import uuid
import numpy as np

from aligner import WORK, HERE, CHECKPOINT, file_hash, write_json, work_path
from analysis_runs import baseline_records, comparison_stats, differences, record_elapsed, require_budget
from core import propose


def main():
    require_budget(180)
    started = time.monotonic()
    bundle, records = baseline_records()
    directory = work_path("calibration/" + uuid.uuid4().hex[:12])
    directory.mkdir(parents=True)
    variants = {}
    for profile in ["orthographic", "torah-spoken-v1"]:
        rows, by_split = [], {"development": [], "calibration": [], "evaluation": []}
        proposals = []
        for item in records:
            if profile == "orthographic":
                result = item["baseline"]
            else:
                with np.load(item["directory"] / "emissions.npz", allow_pickle=False) as cache:
                    result = propose(bundle, item["recording"], cache["log_probs"], cache["frame_starts"],
                                     item["metadata"], CHECKPOINT, profile=profile)
                write_json(directory / f"{item['recording']['audioId']}-{profile}.json", result)
            deltas = differences(result, item["legacy"])
            split = item["recording"]["split"]
            by_split[split].append(deltas)
            proposals.append((item["recording"]["audioId"], split, deltas))
        calibration = np.concatenate(by_split["calibration"])
        # The cue lead is a playback convention estimate, kept out of acoustic boundaries.
        lead = float(np.median(calibration[np.isfinite(calibration)]))
        for audio_id, split, deltas in proposals:
            rows.append({"audioId": audio_id, "split": split, "raw": comparison_stats(deltas),
                         "withCalibrationLead": comparison_stats(deltas, lead)})
        variants[profile] = {"fittedPlaybackLeadSeconds": lead, "leadFittedOn": ["beresheet-1", "haazinu-4"],
                             "recordings": rows,
                             "splits": {split: comparison_stats(np.concatenate(values), lead) for split, values in by_split.items()}}
        print(json.dumps({"profile": profile, "leadSeconds": lead, "heldOut": variants[profile]["splits"]["evaluation"]}), flush=True)
    summary = {"status": "complete", "referenceAssumption": "User's approximately 90%-accurate legacy cues",
               "acousticBoundariesWereShifted": False, "variants": variants,
               "implementation": {name: file_hash(HERE / name) for name in ["calibrate.py", "core.py"]},
               "elapsedSeconds": time.monotonic() - started}
    write_json(directory / "summary.json", summary)
    write_json("latest-calibration.json", {"path": str((directory / "summary.json").relative_to(WORK))}, replace=True)
    record_elapsed("decoder-calibration", summary["elapsedSeconds"], {"directory": str(directory)})
    print(json.dumps({"summary": str(directory / "summary.json")}), flush=True)


if __name__ == "__main__":
    main()
