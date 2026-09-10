# Torah Audio Aligner: private beta

A local, offline Torah alignment engine built around Tikkun's actual canonical
tokens and recordings. Generated inputs, models, audio derivatives, timing
proposals, diagnostics, and draft exports stay in this directory's ignored
`work/` folder. No command publishes cues or changes the public application.

Read [STATUS.md](STATUS.md) for the checkpoint and [RESULTS.md](RESULTS.md) for
measurements and limitations.

## Open the private editor

```sh
./experiments/torah-audio-aligner/beta
```

Open <http://127.0.0.1:8767>. The command reuses a matching running beta.
This beta deliberately accepts connections only from this Mac. It does not
start or modify the public Tikkun development server.

Choose a real recording, click a Hebrew word to replay it, correct its onset,
and mark its timing reviewed. Changes save as private revisions. The editor
supports undo, revision restore, repeated/missing-word corrections, listening
notes, review-package downloads, and reviewed Tikkun cue drafts. `Align again`
runs the cached model and opens a separate result; it does not overwrite edits.

See [PRIVATE_BETA.md](PRIVATE_BETA.md) for the testing flow, export rules,
restart command, and remaining limits.

## What works

- Canonical passage compilation through Tikkun's qere, tokenization, reading
  range, media identity, and cue-validation helpers. Maqaf keeps its display
  identity and separate lexical parts. Annotated Hebrew and taamim stay intact.
- Offline Hebrew acoustic inference, exact source-sample coordinates, reusable
  caches, fixed model/dependency versions, and bounded subprocess cancellation.
- Torah-spoken reference alternatives for divine names, separate from canonical
  display text and explicitly recorded as pronunciation hypotheses.
- A linear CTC timing baseline plus an experimental reading graph for repeated
  words/phrases, partial attempts, skipped reference text, and unassigned speech.
  Performance occurrences can revisit a canonical word while audio time advances.
- Waveform quality checks, relative pitch features, taamim-associated duration
  analysis, ambiguous repeated-prefix flags, and possible sustained-word tails.
- Review-gated, isolated v2 cue export through the real application validator.

## Run

From the repository root:

```sh
./experiments/torah-audio-aligner/run verify
./experiments/torah-audio-aligner/run preflight
./experiments/torah-audio-aligner/run align --audio-id haazinu-1 --timeout 600
```

`align` prints a new run directory. Its `proposal.json` is an unreviewed linear
baseline. Supply that path, relative to `work/`, for deeper analysis:

```sh
./experiments/torah-audio-aligner/run diagnose runs/RUN_ID/proposal.json
./experiments/torah-audio-aligner/run evaluate runs/RUN_ID/proposal.json
```

The default evaluation reports raw acoustic-start differences. Add
`--playback-lead-samples 3648` for a separate comparison using the frozen
228 ms playback lead; acoustic scoring remains unshifted.

`diagnose` reuses verified acoustic evidence. It emits a separate reading-graph
proposal, uncertainty events, lexical occurrences, possible voiced tails, and
review template. Long recordings use bounded regions whose initial anchors come
from the linear acoustic seed. These anchors remain unreviewed; a long jump
crossing a region boundary can still be missed. Legacy cues never enter this
decoder. These are candidate readings, not correctness judgments.

For a longer prepared recording:

```sh
./experiments/torah-audio-aligner/run align --audio-id beresheet-1 --max-audio-seconds 900 --timeout 600
```

The wrapper uses the isolated `.venv` through `uv` in offline mode. Its 34
packages are pinned with hashes in `requirements.lock`; the environment and
model are installed here. Missing model files cause an explicit failure;
inference never silently downloads a replacement.

## Reproduce the experiments

Each command creates immutable results under `work/` and updates its own
latest-result pointer. The testing ledger records combined elapsed execution.

```sh
./experiments/torah-audio-aligner/.venv/bin/python -B experiments/torah-audio-aligner/pilot.py
./experiments/torah-audio-aligner/.venv/bin/python -B experiments/torah-audio-aligner/calibrate.py
./experiments/torah-audio-aligner/.venv/bin/python -B experiments/torah-audio-aligner/tune_head.py --steps 80 --patience 10
./experiments/torah-audio-aligner/.venv/bin/python -B experiments/torah-audio-aligner/analyze_taamim.py
./experiments/torah-audio-aligner/.venv/bin/python -B experiments/torah-audio-aligner/test_edges.py
./experiments/torah-audio-aligner/.venv/bin/python -B experiments/torah-audio-aligner/assess_edges.py
```

`pilot.py` reuses completed, identity-verified baseline caches. Other analysis
commands are explicit new experiments. Avoid concurrent sustained analysis jobs.
The authorized envelope is 2 GB of downloads, four CPU threads, and 60 minutes
of combined testing. Inspect `work/testing-ledger.json` before further work.

Prepare an additional manifest without changing the original pilot pointer:

```sh
./experiments/torah-audio-aligner/run prepare --manifest confirmation-manifest.json --keep-current
```

Preparation verifies recording hashes, canonical sequence, cue identity, text
version, and presentation origin. Immutable bundles live in `work/inputs/HASH/`.
`align --input inputs/HASH/input.json` pins the worker to that bundle even if
another preparation later changes the latest pointer. Live canonical helpers
remain checked against current project files. Historical compiler and selection
sources retain their own hashed snapshots.

Set `legacyCuePath` to `null` in an additional manifest to align an uncued
recording already registered in Tikkun. Canonical tokens and media identity stay
required; evaluation correctly reports no reference score. Behalotecha 1 was
tested through this complete path with 144 proposed words and no supplied cues.

## Evidence and interpretation

- `work/baseline-pilot.json`: seven-file pilot and original acoustic run paths.
- `work/latest-calibration.json`: learned playback lead and fixed-split comparison.
- `work/latest-head-tuning.json`: small output-head adaptation experiment.
- `work/latest-taamim-analysis.json`: pitch, duration, gap, and accent observations.
- `work/latest-edge-tests.json`: real-audio cut/corruption fixtures and raw results.
- `work/latest-edge-assessment.json`: explicit uncertainty behavior on those cases.
- `work/latest-confirmation.json`: frozen-setting comparison on additional files.
- `work/diagnostics/`: reading hypotheses and review queues.

The user estimates existing cues are approximately 90% accurate. Their starts
are useful proxy references, not independently verified acoustic labels. Every
first cue was normalized to zero and is excluded from start-error scoring.
There are no human word-end labels. Missing and ambiguous predictions stay in
metric denominators.

The 228 ms lead is a learned playback convention. Acoustic samples stay unchanged;
replay pre-roll remains separate. Confidence and pronunciation/cantillation
correctness fields stay null. Raw CTC scores and pitch periodicity are features,
not calibrated probabilities of correct reading.

Fine-tuning uses Beresheet 1, with Haazinu 4 choosing the checkpoint by CTC loss.
The four pilot evaluation files and separate confirmation set never enter gradient
updates. All recordings use one narrator. This does not establish performance on
new readers, traditions, children, live microphones, or room noise.

## Review and draft export

For a fully reviewed linear performance, complete a new review JSON identifying
the exact proposal hash, reviewer, accepted occurrences, and confirmation that
the complete audio follows the canonical sequence. Then:

```sh
./experiments/torah-audio-aligner/run export-draft runs/RUN_ID/proposal.json --review runs/RUN_ID/review.completed.json
```

The draft stays in `work/drafts/`. Repeated, missing, or unassigned words and
unresolved events block v2 flattening. The compatibility copy alone normalizes
the first playback start to zero. Reviewing an event does not automatically
resolve it: a corrected, separately versioned proposal must represent the
resolved performance first.

Drafts export starts only by default. `playbackLeadSamples` in the review applies
a consistent lead to that copy. `includeAcousticEnds: true` additionally requires
`acceptedEndOccurrenceIds` for every occurrence; this prevents unreviewed CTC ends
from truncating sustained chanting.

Public integration requires an isolated proposed diff, application/playback
checks, and explicit user approval. No publish or deploy command exists here.

## Model and sources

The checkpoint is `imvladikon/wav2vec2-xls-r-300m-lm-hebrew`, revision
`a532e94f9747ade06ec9b3a45aee3d7965dd8f84`. Its 1,261,938,632-byte safetensors file
is SHA-256 verified. The encoder uses 20-second cores with two seconds of context,
a 320-sample step, and a 400-sample receptive field at 16 kHz. Silence is retained.
Refactored encoder outputs were compared with the original run on identical audio.

- [Feasibility assessment](../../docs/research/torah-audio-aligner/feasibility.md)
- [Pinned model and declared license](https://huggingface.co/imvladikon/wav2vec2-xls-r-300m-lm-hebrew/tree/a532e94f9747ade06ec9b3a45aee3d7965dd8f84)
- [Wav2Vec2 documentation](https://huggingface.co/docs/transformers/model_doc/wav2vec2)
- [YIN pitch-estimation paper](https://pubmed.ncbi.nlm.nih.gov/12002874/)

Torah-aware describes the reference/compiler and experimental decoding/prosody
layers. It does not imply that the pretrained encoder understands Torah
pronunciation or can judge the correctness of taamim.
