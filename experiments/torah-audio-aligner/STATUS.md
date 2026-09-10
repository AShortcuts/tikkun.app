# Engine checkpoint: tested private research beta

The interactive private beta is ready for local testing at <http://127.0.0.1:8767>.
See [PRIVATE_BETA.md](PRIVATE_BETA.md) for the launch command and testing workflow.

Date: 2026-09-09. Generated from completed experiment artifacts.

- All 44 populated cue recordings processed: 8,646 display tokens, 3.45 hours.
- Separate uncued Behalotecha 1 run: 144 new word proposals, 15.07 seconds, no timing reference supplied.
- Frozen settings on 37 additional recordings: 80.86% cue agreement within 200 ms and 96.82% within 500 ms.
- Original acoustic head retained. The 80-step output-head fine-tune gives no material timing benefit.
- Reading graph, waveform quality flags, ambiguous-prefix detection, and possible cantillation-tail regions implemented and exercised.
- 57 deterministic/integration tests pass; 9/9 controlled real-audio behavior checks pass.
- 16.92 measured testing minutes used; 60 approved. Four CPU threads, about 3.08 GiB measured peak memory.
- Public integration remains unapplied and unapproved. This task changed only the isolated experiment during the approved testing phase.

These percentages compare approximate existing playback cues; they are not
independent acoustic accuracy. Reading-error and taamim correctness grading,
new-reader performance, and correction-time savings remain unmeasured.

[Full results](RESULTS.md) | [Commands](README.md) | [Playable review excerpts](</Users/adambh/Documents/HTML Projects/Tikkun with Highlighted Audio/experiments/torah-audio-aligner/work/review-packets/78b8ebe40e95/REVIEW.md>)

The approved testing, small-model adaptation, calibration, edge-case development,
and private evidence package are complete for this checkpoint. The private
correction workflow is now implemented; word-end accuracy still needs human
testing. Public integration needs its own exact diff, application/playback
verification, and explicit approval.
