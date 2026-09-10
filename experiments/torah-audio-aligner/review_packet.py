"""Small playable review packet generated from completed, identified experiments."""

import json
from pathlib import Path
import uuid

from acoustics import read_wave
from aligner import HERE, REPO, WORK, file_hash, work_path, write_json, current_input, recording_for
from analysis_runs import baseline_records
from test_edges import write_wave


def latest(name):
    path = work_path(json.loads(work_path(name).read_text())["path"])
    return path, json.loads(path.read_text())


def main():
    directory = work_path("review-packets/" + uuid.uuid4().hex[:12])
    directory.mkdir(parents=True)
    confirmation_path, confirmation = latest("latest-confirmation.json")
    graph_path, graph = latest("latest-graph-confirmation.json")
    edge_path, edges = latest("latest-edge-assessment.json")
    fixture_summary = work_path(edges["sourceSummaryPath"])
    bundle, pilot = baseline_records()
    sources = {item["recording"]["audioId"]: item for item in pilot}
    extra, input_dir = current_input(confirmation["inputPath"])
    for recording in extra["recordings"]:
        sources[recording["audioId"]] = {"recording": recording, "directory": confirmation_path.parent / recording["audioId"],
            "baseline": json.loads((confirmation_path.parent / recording["audioId"] / "original-proposal.json").read_text())}
    clips = []
    sections = ["# Torah aligner: audio for private review", "",
        "Generated from completed local experiments. Every excerpt is an identified derivative; original recordings remain intact.", "",
        "These are model observations and deliberately edited test cases. No clip has been signed off as a human pronunciation or cantillation judgment.", ""]

    def excerpt(identifier, source_path, start, end, title, explanation, identity):
        samples = read_wave(source_path)
        start, end = max(0, int(start)), min(len(samples), int(end))
        destination = directory / (identifier + ".wav")
        write_wave(destination, samples[start:end])
        clips.append({"id": identifier, "sourcePath": str(source_path.relative_to(WORK)), "sourceSha256": file_hash(source_path),
                      "sourceStartSample": start, "sourceEndSample": end, "sampleRate": 16000,
                      "derivativeSha256": file_hash(destination), "recordingIdentity": identity})
        sections.extend(["## " + title, "", explanation, "", f"![{title}](<{destination}>)", ""])

    for name, title in [("repeat-verse", "Controlled repeated verse"), ("skip-word", "Controlled missing word"),
                        ("partial-first-word", "Short restart: correctly left ambiguous"), ("muffled", "Muffled audio: unclear, not a correctness grade")]:
        detail = json.loads((fixture_summary.parent / (name + ".json")).read_text())
        source_path = fixture_summary.parent / (name + ".wav")
        end = 3.0 if name == "partial-first-word" else (13 if name == "muffled" else detail["audioSeconds"])
        explanation = {"repeat-verse": "The first verse was copied before the two-verse passage. The graph recovers 26 lexical occurrences against 19 canonical lexical parts.",
                       "skip-word": "A cut removed the interval around וְתִשְׁמַע. The graph preserves the gap in the reference without assigning that word an invented audio interval.",
                       "partial-first-word": "Two supported initial acoustic labels are separated in time. The complete-word graph merges them, so a separate ambiguity flag preserves both locations for review.",
                       "muffled": "A documented 1 kHz low-pass transform removes much consonant evidence. The quality gate flags uncertainty; it does not certify the reading or accuse the reader of omissions."}[name]
        excerpt(name, source_path, 0, end * 16000, title, explanation, detail["sourceMediaIdentity"])

    beresheet = sources["beresheet-1"]
    item = next(row for row in graph["recordings"] if row["audioId"] == "beresheet-1")
    proposal = json.loads((work_path(item["directory"]) / "proposal.json").read_text())
    word = next(unit for unit in proposal["lexicalUnits"] if unit["annotatedText"] == "וּרְד֞וּ")
    tail = next(region for region in proposal["reviewDiagnostics"]["possibleTails"] if region["lexicalKey"] == word["lexicalKey"])
    explanation = (f"CTC label span ends at {word['sourceEndSample'] / 16000:.2f}s. The next lexical label starts at "
                   f"{tail['sourceEndSample'] / 16000:.2f}s; {tail['voicedFrameFraction']:.1%} of intervening pitch frames remain voiced. "
                   "This supports a sustained-tail hypothesis. The raw word end is retained, and that interval remains unresolved.")
    excerpt("sustained-tail", beresheet["directory"] / "analysis.wav", word["sourceStartSample"] - 5000,
            tail["sourceEndSample"] + 16000, "Beresheet: possible cantillation tail on וּרְד֞וּ", explanation,
            beresheet["recording"]["mediaIdentity"])

    for row in graph["recordings"]:
        if not row["eventKinds"].get("candidate_skip") and not row["eventKinds"].get("unassigned_audio"):
            continue
        source = sources[row["audioId"]]
        proposal = json.loads((work_path(row["directory"]) / "proposal.json").read_text())
        event = next(event for event in proposal["events"] if event["kind"] in {"candidate_skip", "unassigned_audio"})
        if event["kind"] == "candidate_skip":
            token = next(token for token in source["recording"]["tokens"] if token["tokenKey"] == event["tokenKey"])
            timing = next(word for word in source["baseline"]["occurrences"] if word["tokenKey"] == event["tokenKey"])
            start, end = timing["sourceStartSample"] - 16000, timing["sourceEndSample"] + 24000
            title = row["audioId"] + ": unresolved " + token["annotatedText"]
            explanation = "The linear and graph hypotheses disagree here. A missing graph match can reflect an omission, unclear speech, or model error. This is a review target, not a confirmed reading mistake."
        else:
            start, end = event["sourceStartSample"] - 16000, event["sourceEndSample"] + 16000
            title = row["audioId"] + ": unassigned audio"
            explanation = "The graph keeps this interval outside its expected words. Review can distinguish extra speech, a reading variation, or model confusion."
        excerpt(row["audioId"] + "-review", source["directory"] / "analysis.wav", start, end, title, explanation,
                source["recording"]["mediaIdentity"])
    manifest = {"status": "ready-for-review", "clips": clips,
                "sourceSummaries": {str(path.relative_to(WORK)): file_hash(path) for path in [confirmation_path, graph_path, edge_path]},
                "implementationSha256": file_hash(HERE / "review_packet.py")}
    write_json(directory / "manifest.json", manifest)
    (directory / "REVIEW.md").write_text("\n".join(sections))
    write_json("latest-review-packet.json", {"path": str((directory / "REVIEW.md").relative_to(WORK))}, replace=True)
    print(json.dumps({"path": str(directory / "REVIEW.md"), "clips": len(clips)}))


if __name__ == "__main__":
    main()
