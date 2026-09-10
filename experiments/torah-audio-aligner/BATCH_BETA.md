# Private batch beta

The cue-flag preview is at <http://127.0.0.1:8768> on this Mac. It contains a
preserved copy of the existing queue, generated results, and review history.
The earlier service on 8769 keeps its original storage. Continue new work in
the cue-flag preview; edits in the two copies are independent. To start it again:

```sh
"/Users/adambh/Documents/HTML Projects/Tikkun with Highlighted Audio/experiments/torah-audio-aligner/batch"
```

With the preserved cue-flag snapshot present, the launcher defaults to port
8768 and reuses its running server. Explicit command-line options still take
precedence. The original services on 8767 and 8769 remain separate; use the
cue-flag preview for ongoing work.

## Align several recordings

1. Choose **Batch & review**, then a parsha. Select individual aliyot, **Select
   visible**, or **Select unaligned**. Each submission can contain up to 25.
2. Choose **Add to queue**. Existing results are reused by default, including
   their saved reviews. **Run fresh alignments** creates separate results.
3. Choose **Start queue**. One recording runs at a time with four CPU threads.
   The default run window starts new recordings for ten minutes. **Run limits**
   can change that window within the remaining approved testing allowance.
4. **Pause after current** finishes the active recording and retains waiting
   items. **Cancel waiting** retains cancelled history. **Retry** adds a new
   attempt for a failed, interrupted, or cancelled item, preserving the old one.
5. After a server restart, the queue waits for an explicit start. An interrupted
   active item needs **Retry**; completed results and review revisions survive.

The initial library contains 70 locally available recordings, including all
seven Behalotecha aliyot. No model download is needed. The shared testing
allowance is checked before each recording, and elapsed model work is recorded.
An active recording finishes before the run window or pause takes effect.

## Use your own audio

Expand **Use your own audio**, choose one or several MP3/M4A files, and map each
file to the complete aliyah it contains. Choose **Upload & add to queue**, then
start the queue. Each file must be at most 100 MB and 15 minutes. Passages are
currently limited to the aliyot available in the picker.

Uploads stay on this Mac. Original bytes are hashed and retained privately;
uploads get distinct recording identities so they cannot masquerade as the
existing Tikkun audio. Cue JSON files are bound to that exact audio identity.
No public media catalog or cue file is modified.

## Review quickly

**Review next** opens an incomplete result, prioritizing remaining reading
flags. In the word inspector, **Quick review** offers:

- **Replay pasuk**: play the selected pasuk once, with replay pre-roll.
- **Next unreviewed**: move to the next unchecked timing and replay it.
- **Mark pasuk reviewed & next**: accept that pasuk's timings and advance.
- **Next reading flag**: open the next unresolved flag at its decision field.

Readings still require listening. Marking a pasuk accepts only its timing
boundaries; it does not certify pronunciation, taamim, or the whole performance.
Reading flags remain model hypotheses. Save a listening decision for each one.

## Download together

Every completed result has a ZIP checkbox, including unreviewed results.
Choose **Select completed** or select individual results, then **Download cues
(.zip)**. The ZIP has
one validated cue JSON per recording and a manifest with recording identities,
revision IDs, cue counts, pending flags, and unreviewed cue counts.
**Download ZIP again** links to the same immutable
prepared archive. Individual cue export remains available in the reader.

Use **Back to batch** from a recording to return with library filters and
checkbox selections intact. Saving conflicts block navigation until resolved.

Unzip the download. In Tikkun, load the matching complete aliyah, unlock the
admin record panel, and choose **Import cues**. It verifies the recording hash,
text identity, cue ordering, and review metadata before changing the local
draft. Replacing existing timings needs confirmation. Orange rows show pending
flags; **Next flagged** wraps through them. Timing edits keep flags pending.
**Mark reviewed** clears their orange state while retaining their reasons and
review history. Autosave, reload, and Export keep that metadata.

No review approval is created by downloading. Cue files contain optional
`cues[].review` metadata with source, status, and flags (id, kind, message,
status, optional sourceTime and review note). Missing matches use saved initial
timings, or explicitly flagged estimates between neighboring words when needed.
Repeated occurrences remain flagged with their source times. Stale revisions,
damaged source identities, and unusable timing order still stop export.
Optional ends are included only after separate acceptance. The original strict
reviewed-export API remains available for workflows that require full review.

## Private storage

- Queue: `work/private-batch-cue-flags/queue.json`.
- Saved review revisions: `work/private-batch-cue-flags/edits/`.
- Uploaded-file metadata: `work/private-batch-cue-flags/uploads/`.
- Immutable uploaded bytes: `work/imported-audio/`.
- Generated-result registrations: `work/private-batch-cue-flags/generated/`.
- Cue copies and prepared ZIPs: `work/private-batch-cue-flags/exports/`.
- Historical compiler files: `work/compiler-history/`, checked against their
  original hashes; audio and canonical text continue to be verified live.

Keep the experiment's `work/` directory when backing up this beta; results refer
to their immutable inputs and model evidence there. QA reviews under
`work/private-batch-qa-*` are synthetic workflow tests, not user approvals or
audio-quality labels.

This remains a private timing-alignment beta. Accuracy on new readers and
traditions, pronunciation and taamim grading, and public integration have not
been established by these workflow tests.

## Cue-flag verification

- 74 Python tests, 57 Node tests, and 27 browser tests pass. Type checking,
  lint, and production build pass.
- All 68 saved alignments pass source verification and generated export.
  Historical compiler files match their recorded hashes; live audio and text
  identity checks still reject changed inputs.
- The browser prepared a ZIP of all 23 completed queue results: 3,508 cues
  and 30 pending flags. Archive integrity, cue counts, and flag counts match
  its manifest. The two failed attempts remain in the queue history.
- All 84 original saved metadata files retain their pre-change hashes. No
  alignment was rerun, and no generated result or review was discarded.
- A real Behalotecha Aliyah 3 export imports into admin with 183 cues and
  three flags on two words. Next flagged selects and seeks to a flagged word.
  Automated browser checks cover editing, export, autosave, reload, explicit
  review resolution, import cancellation, and invalid input rejection.
- Back to batch preserves the library search and both kinds of checkbox
  selections. These checks establish workflow behavior, not audio accuracy.
- Final desktop 1280 x 720 and mobile 390 x 844 checks confirm that flag
  navigation and reasons stay visible after jumping, with no horizontal
  document overflow. The live admin console has no errors.

## Earlier batch verification

- 67 deterministic tests pass, including queue idempotency, duplicate work,
  pause/resume, interrupted runs, retry, input limits, preserved reviews, and
  stale export refusal. Both browser modules pass syntax checks.
- Real Behalotecha Aliyah 2 alignment completed in 21.10 seconds (166 words).
  A separately uploaded Aliyah 3 completed in 19.09 seconds (183 words).
  Pausing held the second recording until explicit resume.
- A real QA-server restart preserved all three queue entries and the synthetic
  test review. The queue restarted paused.
- Quick pasuk replay stopped at the next pasuk; accepting the first pasuk
  reviewed exactly 12 timings and advanced. Word/flag navigation and mobile
  in-panel pause worked in the browser.
- The in-app browser saved a native ZIP. Archive integrity and 166 cue entries
  passed validation; the two unreviewed results were excluded. The synthetic
  test download was moved out of Downloads and is not a user-approved result.
- Desktop 1280 x 900, mobile 390 x 844, and actual user viewport 389 x 721 were
  checked through CUA. Console checks were clear and no horizontal document
  overflow was found. These are browser viewport tests, not physical-device QA.
- The user's Aliyah 1 review revision and all 144 accepted timings copied
  exactly. The user batch queue starts empty and paused, with no QA revisions.
- All 940 tracked project files retain their pre-task hashes.
- Independent finish review scored all three reported fixes resolved: hidden
  recording edit controls in Batch, accurate About copy, and current design
  documentation. The ship verdict is scoped to those fixes.

Evidence: [batch verification](work/private-batch-verification.json) and
[deterministic test record](work/test-runs/9c21441017ca/result.json).
