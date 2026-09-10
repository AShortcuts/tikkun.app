"""Measure existing real-audio fixtures without another encoder pass."""

import json
import time
import uuid
import numpy as np

from acoustics import read_wave
from aligner import HERE, WORK, CHECKPOINT, file_hash, work_path, write_json
from analysis_runs import record_elapsed
from core import AlignmentError
from reading_graph import reading_graph, GraphConfig
from dataclasses import asdict
from review_evidence import signal_quality, repeated_prefixes, uncertain_word_events


def main():
    started = time.monotonic()
    source = work_path(json.loads(work_path("latest-edge-tests.json").read_text())["path"])
    summary = json.loads(source.read_text())
    output = work_path("edge-assessments/" + uuid.uuid4().hex[:12])
    rows = []
    clean = json.loads((source.parent / "clean.json").read_text())
    with np.load(source.parent / "clean-emissions.npz", allow_pickle=False) as cache:
        clean_graph = reading_graph(cache["log_probs"], summary["tokens"], CHECKPOINT["vocabulary"], CHECKPOINT["blankId"])
    clean_starts = {item["lexicalKey"]: item["sourceStartSample"] for item in clean_graph["lexicalOccurrences"]}
    for item in summary["results"]:
        name = item["fixture"]
        detail = json.loads((source.parent / (name + ".json")).read_text())
        wave_path, cache_path = source.parent / (name + ".wav"), source.parent / (name + "-emissions.npz")
        if file_hash(wave_path) != detail["derivativeSha256"] or file_hash(cache_path) != detail["acoustics"]["emissionsSha256"]:
            raise AlignmentError("A fixture's audio or acoustic cache changed")
        quality = signal_quality(read_wave(wave_path))
        with np.load(cache_path, allow_pickle=False) as cache:
            detail["graph"] = reading_graph(cache["log_probs"], summary["tokens"], CHECKPOINT["vocabulary"], CHECKPOINT["blankId"])
            prefix = repeated_prefixes(cache["log_probs"], detail["graph"]["lexicalOccurrences"],
                                       CHECKPOINT["vocabulary"], CHECKPOINT["blankId"])
        detail["exactOccurrenceSequence"] = [item["lexicalKey"] for item in detail["graph"]["lexicalOccurrences"]] == detail["expectedLexicalKeysFromCutStructure"]
        events = uncertain_word_events(detail["graph"], quality) + prefix
        row = {"fixture": name, "quality": quality, "events": events,
               "exactOccurrenceSequence": detail["exactOccurrenceSequence"]}
        if name in {"leading-silence", "mid-pause"}:
            errors = []
            for occurrence in detail["graph"]["lexicalOccurrences"]:
                original = clean_starts[occurrence["lexicalKey"]]
                shift = 32000 if name == "leading-silence" else (48000 if original >= 9.5 * 16000 else 0)
                errors.append(abs(occurrence["sourceStartSample"] - original - shift) / 16000)
            row["metamorphicTiming"] = {"medianAbsoluteShiftErrorSeconds": float(np.median(errors)),
                                       "p95AbsoluteShiftErrorSeconds": float(np.quantile(errors, .95)),
                                       "maximumAbsoluteShiftErrorSeconds": max(errors)}
        if name in {"muffled", "noise-12db"}:
            row["expectedBehaviorPassed"] = bool(quality["flags"]) and any(event["kind"] == "unclear_audio" for event in events)
        elif name == "partial-first-word":
            row["expectedBehaviorPassed"] = any(event["kind"] == "ambiguous_repeated_prefix" for event in events)
        elif name in {"clean", "leading-silence", "mid-pause"}:
            row["expectedBehaviorPassed"] = detail["exactOccurrenceSequence"] and not events and not quality["flags"]
        else:
            row["expectedBehaviorPassed"] = detail["exactOccurrenceSequence"] and bool(events)
        rows.append(row)
    result = {"status": "complete", "sourceSummarySha256": file_hash(source), "sourceSummaryPath": str(source.relative_to(WORK)),
              "cases": rows, "behaviorChecksPassed": sum(row["expectedBehaviorPassed"] for row in rows),
              "caseCount": len(rows), "elapsedSeconds": time.monotonic() - started,
              "graphConfig": asdict(GraphConfig()),
              "implementation": {name: file_hash(HERE / name) for name in ["assess_edges.py", "review_evidence.py", "reading_graph.py"]},
              "isGeneralErrorDetectionAccuracy": False,
              "limitations": ["Diagnostics developed against these same fixtures", "Unknown natural-error sensitivity and false-positive rate",
                              "Unclear audio is flagged rather than fully recovered", "Short restart remains ambiguous"]}
    write_json(output / "summary.json", result)
    write_json("latest-edge-assessment.json", {"path": str((output / "summary.json").relative_to(WORK))}, replace=True)
    record_elapsed("edge-uncertainty-assessment", result["elapsedSeconds"])
    print(json.dumps({"summary": str(output / "summary.json"), "passed": result["behaviorChecksPassed"], "cases": len(rows)}))


if __name__ == "__main__":
    main()
