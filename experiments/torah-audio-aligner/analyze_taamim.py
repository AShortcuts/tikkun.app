"""Describe measured pitch/duration patterns; never grade cantillation correctness."""

from collections import defaultdict
import json
from pathlib import Path
import time
import uuid
import wave
import numpy as np

from aligner import HERE, WORK, file_hash, write_json, work_path
from analysis_runs import baseline_records, require_budget, record_elapsed
from prosody import accent_names, interval_features, pitch_track


def summarize(rows):
    names = ["durationSeconds", "pitchRangeSemitones", "pitchChangeSemitones", "gapToNextLabelSeconds", "gapLowEnergySeconds"]
    groups = defaultdict(list)
    for row in rows:
        if row["accentGroup"]:
            groups[row["accentGroup"]].append(row)
    result = []
    for accent, group in sorted(groups.items()):
        entry = {"accent": accent, "words": len(group), "recordings": len({row["audioId"] for row in group}),
                 "measurablePitchWords": sum(row["pitchRangeSemitones"] is not None for row in group)}
        for name in names:
            values = [row[name] for row in group if row[name] is not None]
            entry[name + "Median"] = float(np.median(values)) if values else None
        result.append(entry)
    return result


def main():
    require_budget(120)
    started = time.monotonic()
    bundle, items = baseline_records()
    directory = work_path("taamim-analysis/" + uuid.uuid4().hex[:12])
    directory.mkdir(parents=True)
    calibration = json.loads(work_path(json.loads(work_path("latest-calibration.json").read_text())["path"]).read_text())
    lead = calibration["variants"]["orthographic"]["fittedPlaybackLeadSeconds"]
    rows, recording_features = [], []
    for item in items:
        recording = item["recording"]
        with wave.open(str(item["directory"] / "analysis.wav"), "rb") as waveform:
            samples = np.frombuffer(waveform.readframes(waveform.getnframes()), dtype="<i2").astype(np.float32) / 32768
        track = pitch_track(samples)
        np.savez(directory / (recording["audioId"] + "-pitch.npz"), **track)
        voiced = np.isfinite(track["f0Hz"])
        if not voiced.any():
            raise RuntimeError("No measurable periodic voice in a declared reading; inspect recording")
        reference = float(np.median(track["f0Hz"][voiced]))
        cutoff = max(.0001, float(np.quantile(track["rms"], .05)) * 2)
        recording_features.append({"audioId": recording["audioId"], "medianF0Hz": reference,
                                   "voicedFrameFraction": float(voiced.mean()), "lowEnergyCutoffRms": cutoff})
        display_cues = {row["tokenKey"]: row for row in item["legacy"]["cues"]}
        display_occurrences = {row["tokenKey"]: row for row in item["baseline"]["occurrences"]}
        tokens = {row["tokenKey"]: row for row in recording["tokens"]}
        units = item["baseline"]["lexicalUnits"]
        for index, unit in enumerate(units):
            names = accent_names(unit["annotatedText"])
            group = "verse-ending" if "\u05c3" in unit["annotatedText"] else names[0] if len(names) == 1 else "multiple-accents" if names else None
            features = interval_features(track, unit["sourceStartSample"], unit["sourceEndSample"], reference)
            next_start = units[index + 1]["sourceStartSample"] if index + 1 < len(units) else len(samples)
            gap_mask = (track["centerSamples"] >= unit["sourceEndSample"]) & (track["centerSamples"] < next_start)
            cue, occurrence = display_cues[unit["tokenKey"]], display_occurrences[unit["tokenKey"]]
            difference = None if cue["excludedFromTiming"] else occurrence["sourceStartSample"] / 16000 - cue["timeStart"] - lead
            rows.append({"audioId": recording["audioId"], "split": recording["split"], "lexicalKey": unit["lexicalKey"],
                         "annotatedText": unit["annotatedText"], "verse": tokens[unit["tokenKey"]]["verse"],
                         "accentGroup": group, "accents": names, **features,
                         "gapToNextLabelSeconds": max(0, next_start - unit["sourceEndSample"]) / 16000,
                         "gapLowEnergySeconds": float(np.sum(track["rms"][gap_mask] < cutoff) * track["hopSamples"] / 16000),
                         "rawAlignmentScore": unit["rawAcousticScore"], "cueDifferenceAfterLeadSeconds": difference,
                         "higherSupportSubset": difference is not None and abs(difference) <= .5 and unit["rawAcousticScore"] >= .15})
    summary = {"status": "complete", "source": "One narrator; seven recordings; model lexical spans and approximate cue references",
               "recordingCount": len(items), "lexicalUnitCount": len(rows), "recordingFeatures": recording_features,
               "allGroups": summarize(rows), "higherSupportGroups": summarize([row for row in rows if row["higherSupportSubset"]]),
               "bySplit": {split: summarize([row for row in rows if row["split"] == split]) for split in ["calibration", "evaluation"]},
               "limitations": ["Observational correlations, not melody correctness or causal claims",
                               "Unknown named cantillation tradition; results describe this narrator only",
                               "Pitch tracking can make octave errors and excludes weak/aperiodic frames",
                               "Word and gap boundaries are CTC estimates, not independent phonetic labels",
                               "Duration and contour depend on word length, vowel, context, and phrase position"],
               "pitchMethod": "YIN-style difference normalization; 64ms frames, 20ms hop, 70-550Hz, raw periodicity threshold",
               "implementation": {name: file_hash(HERE / name) for name in ["prosody.py", "analyze_taamim.py"]},
               "elapsedSeconds": time.monotonic() - started}
    write_json(directory / "words.json", rows)
    write_json(directory / "summary.json", summary)
    write_json("latest-taamim-analysis.json", {"path": str((directory / "summary.json").relative_to(WORK))}, replace=True)
    record_elapsed("pitch-and-taamim-analysis", summary["elapsedSeconds"], {"directory": str(directory)})
    print(json.dumps({"summary": str(directory / "summary.json"), "elapsedSeconds": summary["elapsedSeconds"],
                      "groups": summary["higherSupportGroups"]}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
