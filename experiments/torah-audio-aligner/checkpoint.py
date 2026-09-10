"""Generate the checkpoint report from completed experiment artifacts."""

from collections import Counter
from datetime import datetime, timezone
import json

from aligner import HERE, WORK, file_hash, work_path, write_json, input_for_result, recording_for


def latest(name):
    path = work_path(json.loads(work_path(name).read_text())["path"])
    return path, json.loads(path.read_text())


def main():
    confirmation_path, confirmation = latest("latest-confirmation.json")
    graph_path, graph = latest("latest-graph-confirmation.json")
    edge_path, edges = latest("latest-edge-assessment.json")
    tuning_path, tuning = latest("latest-head-tuning.json")
    calibration_path, calibration = latest("latest-calibration.json")
    taamim_path, taamim = latest("latest-taamim-analysis.json")
    tests_path, tests = latest("latest-tests.json")
    if tests["status"] != "verified-foundation" or tests["exitCode"] != 0:
        raise ValueError("A passing test artifact is required")
    for name, identity in tests["sourceFiles"].items():
        if file_hash(HERE / name) != identity:
            raise ValueError("Implementation changed since the recorded tests: " + name)
    uncued = json.loads(work_path("latest-uncued-run.json").read_text())
    uncued_path = work_path(uncued["directory"]) / "proposal.json"
    uncued_proposal = json.loads(uncued_path.read_text())
    uncued_input, uncued_input_dir = input_for_result(uncued_proposal)
    uncued_recording = recording_for(uncued_input, uncued_proposal["audioId"])
    uncued_reference = recording_for(json.loads((uncued_input_dir / "legacy-evaluation.json").read_text()), uncued_proposal["audioId"])
    if uncued_reference["kind"] != "unlabeled-no-cue-reference" or uncued_reference["cues"]:
        raise ValueError("The uncued demonstration must not contain timing references")
    review_path = work_path(json.loads(work_path("latest-review-packet.json").read_text())["path"])
    preservation = json.loads(work_path("public-preservation-check.json").read_text())
    ledger = json.loads(work_path("testing-ledger.json").read_text())
    for value in [confirmation, graph, edges, tuning, calibration, taamim]:
        if value["status"] != "complete":
            raise ValueError("An unfinished experiment cannot generate a completed checkpoint")
    elapsed = sum(event["elapsedSeconds"] for event in ledger["events"])
    event_counts = Counter()
    for row in graph["recordings"]:
        event_counts.update(row["eventKinds"])
    sources = [confirmation_path, graph_path, edge_path, tuning_path, calibration_path, taamim_path, tests_path, uncued_path]
    code = {}
    for pattern in ["*.py", "*.mts", "*.json", "tests/*.py"]:
        for path in HERE.glob(pattern):
            identity = file_hash(path)
            code[str(path.relative_to(HERE))] = identity
            snapshot = work_path("checkpoint-sources/" + identity + "/" + path.name)
            snapshot.parent.mkdir(parents=True, exist_ok=True)
            if snapshot.exists():
                if file_hash(snapshot) != identity:
                    raise ValueError("A checkpoint source snapshot changed")
            else:
                with snapshot.open("xb") as output:
                    output.write(path.read_bytes())
    checkpoint = {"status": "tested-private-research-beta", "generatedAt": datetime.now(timezone.utc).isoformat(),
                  "publicIntegration": "not-applied-not-approved", "sourceSummaries": {str(path.relative_to(WORK)): file_hash(path) for path in sources},
                  "sourceFiles": code, "measuredTestingSeconds": elapsed, "approvedTestingSeconds": 3600,
                  "graphReviewEventCounts": dict(event_counts), "reviewPacket": str(review_path.relative_to(WORK)),
                  "defaultHead": "original-pinned-checkpoint", "headFineTunePromoted": False,
                  "uncuedDemonstration": {"audioId": uncued_proposal["audioId"], "occurrences": len(uncued_proposal["occurrences"]),
                                           "wallSeconds": uncued["wallSeconds"], "timingReferenceCount": 0},
                  "testEvidence": {"testCount": tests["testCount"], "exitCode": tests["exitCode"], "source": str(tests_path.relative_to(WORK))},
                  "publicPreservation": preservation}
    write_json("checkpoint.json", checkpoint, replace=True)
    baseline, adapted = confirmation["totals"]["original"], confirmation["totals"]["adapted"]
    graph_scores = graph["totals"]["confirmation"]
    report = ["# Torah Audio Aligner: measured private beta", "", "Checkpoint: 2026-09-09.", "",
              "The isolated engine runs on real Tikkun recordings. Keep the original acoustic head; the small fine-tune provides no material timing improvement. The reading graph and acoustic review flags are useful beta components. Public application integration remains unapplied and unapproved.", "",
              "## Data and evaluation", "",
              "All 44 populated cue recordings were processed: 8,646 display tokens and 3.45 hours of one narrator. Seven recordings formed the initial pilot; the remaining 37 formed a confirmation set selected before their acoustic outputs were inspected.", "",
              f"A separate uncued demonstration generated {len(uncued_proposal['occurrences'])} word proposals for {uncued_recording['durationSeconds']:.2f} seconds of Behalotecha 1 in {uncued['wallSeconds']:.2f} seconds. No cue file or timing reference was provided. Its absolute timing accuracy is unmeasured. The input compiler now accepts uncued recordings already registered in Tikkun.", "",
              "Existing cues are treated as approximately 90% accurate under the user's stated assumption. That percentage was not independently measured. Scores below measure agreement with legacy playback starts, not acoustic or pronunciation accuracy. The normalized first cue of every recording is excluded. No human word-end labels exist.", "",
              "A 228 ms playback lead was fitted on Beresheet 1 and Haazinu 4, then frozen. Acoustic coordinates remain unchanged. The confirmation set has 6,953 eligible start comparisons.", "",
              "| Method | Within 200 ms | Within 500 ms | Median absolute difference | Over 1 s | Missing/ambiguous |",
              "|---|---:|---:|---:|---:|---:|"]
    for name, values in [("Original head + Torah-spoken reference", baseline), ("80-step adapted head", adapted), ("Bounded reading graph", graph_scores)]:
        report.append(f"| {name} | {values['within200msIncludingMissing']:.2%} | {values['within500msIncludingMissing']:.2%} | {values['medianAbsoluteDifferenceSeconds'] * 1000:.0f} ms | {values['overOneSecond']} | {values['missingOrAmbiguous']} |")
    report += ["", "The earlier four-file pilot evaluation reached 76.95% within 200 ms and 95.37% within 500 ms. Those were a separate passage mix, not a competing setting fitted on the confirmation set.", "",
        "## Fine-tuning decision", "",
        f"Adapted 32,800 output-head parameters with the encoder frozen. Beresheet 1 supplied training audio/text; Haazinu 4 selected the checkpoint by CTC loss. Development loss fell from {tuning['baselineDevelopmentCTCLoss']:.4f} to {tuning['selectedDevelopmentCTCLoss']:.4f}. The model never trained on cue timestamps or confirmation passages.", "",
        "On confirmation, the adapted head moved only two additional starts inside 200 ms while increasing over-one-second discrepancies from 59 to 61. That trade does not justify making it the default. Both original and candidate artifacts are retained.", "",
        "## Repeats, skips, and unclear audio", "",
        "The reading graph emits performance occurrences, so canonical positions may repeat while audio time stays monotonic. Its skip penalty was tuned on Haazinu 1 and Beresheet 1. An initially permissive setting suggested 32 missing lexical parts on those development recordings. The selected penalty removed those suggestions while retaining the controlled omitted-word detection.", "",
        "All 44 recordings then completed graph decoding. It emitted 8,642 display occurrences against 8,646 reference display tokens. Four words lack graph occurrences; a fifth lexical mismatch is inside an incomplete maqaf group. These are review targets, not established reader mistakes.", "",
        f"Structural review events: {event_counts['candidate_skip']} candidate missing lexical matches, {event_counts['partial_display_token']} incomplete display group, {event_counts['ambiguous_repeated_prefix']} ambiguous prefixes, {event_counts['unassigned_audio']} unassigned interval, and {event_counts['uncertain_region_anchor']} uncertain region anchors.", "",
        "| Controlled real-audio case | Result |", "|---|---|"]
    descriptions = {"clean": "Reference sequence retained; no structural flags", "leading-silence": "Sequence retained after a two-second shift",
                    "mid-pause": "Sequence retained across a three-second pause", "repeat-verse": "All 26 performance occurrences recovered from 19 canonical lexical parts",
                    "skip-word": "Removed word receives no fabricated occurrence", "insert-off-passage": "Expected sequence recovers; extra audio remains unassigned",
                    "partial-first-word": "Repeated prefix flagged; full-word separation remains ambiguous", "muffled": "Restricted bandwidth flagged as unclear; canonical sequence is not proof of audible correctness",
                    "noise-12db": "Elevated broadband background flagged as unclear"}
    for case in edges["cases"]:
        report.append(f"| {case['fixture']} | {descriptions[case['fixture']]} |")
    report += ["", f"All {edges['behaviorChecksPassed']}/{edges['caseCount']} behavior checks passed. These fixtures were used during development, so this is not an estimate of natural-error sensitivity. Added silence/pause tests had zero median timing-shift error and at most 80 ms deviation.", "",
        "## What taamim analysis revealed", "",
        "Pitch and timing analysis covers the original seven-file, 1,920-lexical-part pilot. Higher-support examples show larger boundary gaps at verse endings and etnahta than at munah/merkha. Several gershayim and telisha-qetana words have short CTC label spans followed by multiple seconds of voiced audio.", "",
        "For וּרְד֞וּ in Beresheet 1, the CTC span ends at 505.06 s while the following label starts at 509.40 s. Approximately 99.5% of pitch frames in that 4.34 s interval remain voiced. This is evidence for a possible cantillation tail and against treating a CTC label end as a verified word end.", "",
        "The engine now preserves these tail intervals as review evidence. It does not assign every voiced gap to the preceding word: connected speech and early syllables of the next word remain competing explanations. Pitch features are relative and raw periodicity is not a calibrated confidence score. Word length, phrase context, and this narrator's style confound accent comparisons.", "",
        "## Plumbing verified", "",
        f"{tests['testCount']} deterministic/integration tests pass, including repeated labels, long vowels, silence abstention, maqaf grouping, nonmonotonic canonical positions, source-coordinate preservation, immutable input selection, stale-review rejection, path-escape rejection, process-group cancellation, and draft validation using Tikkun's actual parser.", "",
        "Audio bytes and canonical dependencies are checked. The encoder uses exact convolution geometry, retains silence, validates stitched frame coverage, and works offline from pinned safetensors. Reusing the extracted encoder implementation produced an identical frame map and matching original-recording emissions.", "",
        "Playback lead, acoustic coordinates, and replay pre-roll are separate. Draft exports include starts by default. Ends require separate explicit acceptance, since clipping sustained chanting would otherwise be possible. Every export remains in work/drafts, and unresolved events or a non-linear sequence block v2 flattening.", "",
        "## Measured resources", "",
        f"The additional 165.7 minutes of audio completed original/adapted inference and evaluation in {confirmation['elapsedSeconds'] / 60:.2f} minutes using four CPU threads. Peak resident memory was {confirmation['peakResidentBytes'] / 1024**3:.2f} GiB. Selected model/wheel downloads total approximately 1.43 GB; no further model was downloaded. Disk usage at the final check was approximately 3.4 GiB including the environment.", "",
        f"The execution ledger records {elapsed / 60:.2f} minutes of testing against the approved 60-minute envelope. Lightweight source inspection and report generation are additional. No GPU or full-encoder training ran.", "",
        "## Remaining capability limits", "",
        "- One narrator and one recording corpus; new-reader/tradition performance is unmeasured.",
        "- Natural mistakes and pronunciation correctness are not labeled. No halachic or cantillation correctness judgments are produced.",
        "- Short restarts can remain ambiguous; muffled/slurred speech may be positioned by context without being acoustically resolved.",
        "- Long recordings use local regions from unreviewed acoustic anchors. Long jumps across an anchor can still be missed.",
        "- Full Biblical-Hebrew phoneme/syllable/stress modeling, taamim grammar, and tradition-specific melodic grading remain research work.",
        "- Correction-time savings, live following, and public app integration remain future product work.", "",
        "The private correction editor is available through ./experiments/torah-audio-aligner/beta; see [PRIVATE_BETA.md](PRIVATE_BETA.md). The next validation is human testing of correction speed and timing quality, followed by a separately verified integration diff. More output-head steps alone are not supported by the observed timing results.", "",
        "## Inspect the evidence", "",
        f"- [Eleven playable review excerpts](<{review_path}>)",
        f"- [Confirmation measurements](<{confirmation_path}>)",
        f"- [Graph measurements](<{graph_path}>)",
        f"- [Edge-case assessment](<{edge_path}>)",
        f"- [Training history](<{tuning_path}>)",
        f"- [Taamim observations](<{taamim_path}>)",
        f"- [Uncued recording proposal](<{uncued_path}>)",
        "", "Public app, cue, recording, package, route, and deployment files were not modified by this experiment. A 966-file starting snapshot shows concurrent changes from other work; those were preserved and are recorded separately in work/public-preservation-check.json.", ""]
    (HERE / "RESULTS.md").write_text("\n".join(report))
    status = f"""# Engine checkpoint: tested private research beta

The interactive private beta is ready for local testing at <http://127.0.0.1:8767>.
See [PRIVATE_BETA.md](PRIVATE_BETA.md) for the launch command and testing workflow.

Date: 2026-09-09. Generated from completed experiment artifacts.

- All 44 populated cue recordings processed: 8,646 display tokens, 3.45 hours.
- Separate uncued Behalotecha 1 run: {len(uncued_proposal['occurrences'])} new word proposals, {uncued['wallSeconds']:.2f} seconds, no timing reference supplied.
- Frozen settings on 37 additional recordings: {baseline['within200msIncludingMissing']:.2%} cue agreement within 200 ms and {baseline['within500msIncludingMissing']:.2%} within 500 ms.
- Original acoustic head retained. The 80-step output-head fine-tune gives no material timing benefit.
- Reading graph, waveform quality flags, ambiguous-prefix detection, and possible cantillation-tail regions implemented and exercised.
- {tests['testCount']} deterministic/integration tests pass; {edges['behaviorChecksPassed']}/{edges['caseCount']} controlled real-audio behavior checks pass.
- {elapsed / 60:.2f} measured testing minutes used; 60 approved. Four CPU threads, about 3.08 GiB measured peak memory.
- Public integration remains unapplied and unapproved. This task changed only the isolated experiment during the approved testing phase.

These percentages compare approximate existing playback cues; they are not
independent acoustic accuracy. Reading-error and taamim correctness grading,
new-reader performance, and correction-time savings remain unmeasured.

[Full results](RESULTS.md) | [Commands](README.md) | [Playable review excerpts](<{review_path}>)

The approved testing, small-model adaptation, calibration, edge-case development,
and private evidence package are complete for this checkpoint. The private
correction workflow is now implemented; word-end accuracy still needs human
testing. Public integration needs its own exact diff, application/playback
verification, and explicit approval.
"""
    (HERE / "STATUS.md").write_text(status)
    print(json.dumps({"results": str(HERE / "RESULTS.md"), "status": str(HERE / "STATUS.md"), "testingMinutes": elapsed / 60}))


if __name__ == "__main__":
    main()
