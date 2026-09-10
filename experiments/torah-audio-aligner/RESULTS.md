# Torah Audio Aligner: measured private beta

Checkpoint: 2026-09-09.

The isolated engine runs on real Tikkun recordings. Keep the original acoustic head; the small fine-tune provides no material timing improvement. The reading graph and acoustic review flags are useful beta components. Public application integration remains unapplied and unapproved.

## Data and evaluation

All 44 populated cue recordings were processed: 8,646 display tokens and 3.45 hours of one narrator. Seven recordings formed the initial pilot; the remaining 37 formed a confirmation set selected before their acoustic outputs were inspected.

A separate uncued demonstration generated 144 word proposals for 232.13 seconds of Behalotecha 1 in 15.07 seconds. No cue file or timing reference was provided. Its absolute timing accuracy is unmeasured. The input compiler now accepts uncued recordings already registered in Tikkun.

Existing cues are treated as approximately 90% accurate under the user's stated assumption. That percentage was not independently measured. Scores below measure agreement with legacy playback starts, not acoustic or pronunciation accuracy. The normalized first cue of every recording is excluded. No human word-end labels exist.

A 228 ms playback lead was fitted on Beresheet 1 and Haazinu 4, then frozen. Acoustic coordinates remain unchanged. The confirmation set has 6,953 eligible start comparisons.

| Method | Within 200 ms | Within 500 ms | Median absolute difference | Over 1 s | Missing/ambiguous |
|---|---:|---:|---:|---:|---:|
| Original head + Torah-spoken reference | 80.86% | 96.82% | 93 ms | 59 | 0 |
| 80-step adapted head | 80.89% | 96.84% | 93 ms | 61 | 0 |
| Bounded reading graph | 80.81% | 96.76% | 93 ms | 61 | 4 |

The earlier four-file pilot evaluation reached 76.95% within 200 ms and 95.37% within 500 ms. Those were a separate passage mix, not a competing setting fitted on the confirmation set.

## Fine-tuning decision

Adapted 32,800 output-head parameters with the encoder frozen. Beresheet 1 supplied training audio/text; Haazinu 4 selected the checkpoint by CTC loss. Development loss fell from 1.5160 to 1.3326. The model never trained on cue timestamps or confirmation passages.

On confirmation, the adapted head moved only two additional starts inside 200 ms while increasing over-one-second discrepancies from 59 to 61. That trade does not justify making it the default. Both original and candidate artifacts are retained.

## Repeats, skips, and unclear audio

The reading graph emits performance occurrences, so canonical positions may repeat while audio time stays monotonic. Its skip penalty was tuned on Haazinu 1 and Beresheet 1. An initially permissive setting suggested 32 missing lexical parts on those development recordings. The selected penalty removed those suggestions while retaining the controlled omitted-word detection.

All 44 recordings then completed graph decoding. It emitted 8,642 display occurrences against 8,646 reference display tokens. Four words lack graph occurrences; a fifth lexical mismatch is inside an incomplete maqaf group. These are review targets, not established reader mistakes.

Structural review events: 5 candidate missing lexical matches, 1 incomplete display group, 15 ambiguous prefixes, 1 unassigned interval, and 20 uncertain region anchors.

| Controlled real-audio case | Result |
|---|---|
| clean | Reference sequence retained; no structural flags |
| leading-silence | Sequence retained after a two-second shift |
| mid-pause | Sequence retained across a three-second pause |
| repeat-verse | All 26 performance occurrences recovered from 19 canonical lexical parts |
| skip-word | Removed word receives no fabricated occurrence |
| insert-off-passage | Expected sequence recovers; extra audio remains unassigned |
| partial-first-word | Repeated prefix flagged; full-word separation remains ambiguous |
| muffled | Restricted bandwidth flagged as unclear; canonical sequence is not proof of audible correctness |
| noise-12db | Elevated broadband background flagged as unclear |

All 9/9 behavior checks passed. These fixtures were used during development, so this is not an estimate of natural-error sensitivity. Added silence/pause tests had zero median timing-shift error and at most 80 ms deviation.

## What taamim analysis revealed

Pitch and timing analysis covers the original seven-file, 1,920-lexical-part pilot. Higher-support examples show larger boundary gaps at verse endings and etnahta than at munah/merkha. Several gershayim and telisha-qetana words have short CTC label spans followed by multiple seconds of voiced audio.

For וּרְד֞וּ in Beresheet 1, the CTC span ends at 505.06 s while the following label starts at 509.40 s. Approximately 99.5% of pitch frames in that 4.34 s interval remain voiced. This is evidence for a possible cantillation tail and against treating a CTC label end as a verified word end.

The engine now preserves these tail intervals as review evidence. It does not assign every voiced gap to the preceding word: connected speech and early syllables of the next word remain competing explanations. Pitch features are relative and raw periodicity is not a calibrated confidence score. Word length, phrase context, and this narrator's style confound accent comparisons.

## Plumbing verified

57 deterministic/integration tests pass, including repeated labels, long vowels, silence abstention, maqaf grouping, nonmonotonic canonical positions, source-coordinate preservation, immutable input selection, stale-review rejection, path-escape rejection, process-group cancellation, and draft validation using Tikkun's actual parser.

Audio bytes and canonical dependencies are checked. The encoder uses exact convolution geometry, retains silence, validates stitched frame coverage, and works offline from pinned safetensors. Reusing the extracted encoder implementation produced an identical frame map and matching original-recording emissions.

Playback lead, acoustic coordinates, and replay pre-roll are separate. Draft exports include starts by default. Ends require separate explicit acceptance, since clipping sustained chanting would otherwise be possible. Every export remains in work/drafts, and unresolved events or a non-linear sequence block v2 flattening.

## Measured resources

The additional 165.7 minutes of audio completed original/adapted inference and evaluation in 7.05 minutes using four CPU threads. Peak resident memory was 3.08 GiB. Selected model/wheel downloads total approximately 1.43 GB; no further model was downloaded. Disk usage at the final check was approximately 3.4 GiB including the environment.

The execution ledger records 16.92 minutes of testing against the approved 60-minute envelope. Lightweight source inspection and report generation are additional. No GPU or full-encoder training ran.

## Remaining capability limits

- One narrator and one recording corpus; new-reader/tradition performance is unmeasured.
- Natural mistakes and pronunciation correctness are not labeled. No halachic or cantillation correctness judgments are produced.
- Short restarts can remain ambiguous; muffled/slurred speech may be positioned by context without being acoustically resolved.
- Long recordings use local regions from unreviewed acoustic anchors. Long jumps across an anchor can still be missed.
- Full Biblical-Hebrew phoneme/syllable/stress modeling, taamim grammar, and tradition-specific melodic grading remain research work.
- Correction-time savings, live following, and public app integration remain future product work.

The private correction editor is available through ./experiments/torah-audio-aligner/beta; see [PRIVATE_BETA.md](PRIVATE_BETA.md). The next validation is human testing of correction speed and timing quality, followed by a separately verified integration diff. More output-head steps alone are not supported by the observed timing results.

## Inspect the evidence

- [Eleven playable review excerpts](</Users/adambh/Documents/HTML Projects/Tikkun with Highlighted Audio/experiments/torah-audio-aligner/work/review-packets/78b8ebe40e95/REVIEW.md>)
- [Confirmation measurements](</Users/adambh/Documents/HTML Projects/Tikkun with Highlighted Audio/experiments/torah-audio-aligner/work/confirmation/6fba07e0f8d6/summary.json>)
- [Graph measurements](</Users/adambh/Documents/HTML Projects/Tikkun with Highlighted Audio/experiments/torah-audio-aligner/work/graph-confirmation/e68f8487af80/summary.json>)
- [Edge-case assessment](</Users/adambh/Documents/HTML Projects/Tikkun with Highlighted Audio/experiments/torah-audio-aligner/work/edge-assessments/5d6bd7b117a9/summary.json>)
- [Training history](</Users/adambh/Documents/HTML Projects/Tikkun with Highlighted Audio/experiments/torah-audio-aligner/work/head-tuning/77e62384d7ff/summary.json>)
- [Taamim observations](</Users/adambh/Documents/HTML Projects/Tikkun with Highlighted Audio/experiments/torah-audio-aligner/work/taamim-analysis/800fb28d6374/summary.json>)
- [Uncued recording proposal](</Users/adambh/Documents/HTML Projects/Tikkun with Highlighted Audio/experiments/torah-audio-aligner/work/runs/behalotecha-1-8802e7c257a0/proposal.json>)

Public app, cue, recording, package, route, and deployment files were not modified by this experiment. A 966-file starting snapshot shows concurrent changes from other work; those were preserved and are recorded separately in work/public-preservation-check.json.
