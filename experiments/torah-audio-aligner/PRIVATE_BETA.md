# Test the private Torah Audio Aligner

For the current **batch alignment, uploads, quick review, and ZIP downloads**,
use [the private batch beta guide](BATCH_BETA.md) and <http://127.0.0.1:8769>.
The original service below remains available; its saved reviews are copied
once into the batch workspace. Continue new review work in the batch version.

The remaining sections record the original single-recording beta and its
handoff verification. Current batch capabilities and verification are in the
new guide.

Open <http://127.0.0.1:8767> on this Mac.

Start or reopen the server from any terminal:

```sh
"/Users/adambh/Documents/HTML Projects/Tikkun with Highlighted Audio/experiments/torah-audio-aligner/beta"
```

The command reuses this workspace's existing beta. An occupied port belonging
to another service is not stopped. The public Tikkun app is a separate process.
This private editor binds to loopback intentionally and is not deployed.

## First test

1. Start with **Behalotecha Aliyah 1 - uncued**. Its 144 word timings were
   inferred without an existing cue file. **Haazinu Aliyah 1** is a shorter
   recording for a quick test.
2. Click a Hebrew word to replay it. The blue waveform region runs through the
   next onset. The dashed amber marker is the original model end estimate.
3. Listen, nudge the onset by 20 ms or enter seconds, then choose **Mark timing
   reviewed & next**. **Set onset at playhead** and Shift-click on the waveform
   also place the onset. Space plays/pauses outside text fields and buttons.
4. Try **Undo**, reload, and open **Saved revisions** under **Review & export**.
   Autosave retains immutable versions; restoring a revision creates another.
5. Use **Align again** to run the original local model on the selected recording.
   Progress appears above the passage. **Open new result** opens a separate
   unreviewed result while retaining earlier corrections.

## Correct the performance

Word details include notes and optional end boundaries. To add a missed or
repeated word, seek to its onset, choose the canonical word in **Add a performed
word**, and insert it. Source times must advance even when the text repeats.
Remove an incorrect occurrence with the corresponding control; Undo restores it.

Reading flags are hypotheses, not mistakes. Listen and write the reason for
your decision. A resolved flag retains its original evidence in the review
package and can be reopened. Possible sustained tails guide end review; they
do not require treating every voiced gap as a reading error.

## Download Tikkun cues

Click **Download Tikkun cues** beside the recording selector. A reviewed
recording downloads immediately as `RECORDING-tikkun-cues.json` to your
browser's download location. The button saves pending edits first and checks
the file with Tikkun's cue validator.

If review is incomplete, the same button opens the remaining requirements at
the top of **Review & export**. Add your name, confirm your full-recording
review, mark the timings reviewed, and record decisions for any reading flags.
The cue download is also available at the top of that panel.

## Export rules

**Other export options > Download review package** retains the original model proposal,
corrections, occurrence identities, notes, and remaining flags. It is the right
format for repeated or omitted words.

**Download Tikkun cues** requires your name, full-recording confirmation,
accepted timings, resolved reading flags, and exactly the canonical word order.
The real Tikkun cue parser validates the payload before download. It remains a
private draft; the editor contains no publish or public-file write endpoint.

Cue exports contain starts by default. Including ends under **Other export
options** requires reviewing every
end individually; overlapping ends and preview lead block export. The first
playback cue is normalized to zero for compatibility. Original onsets stay
unchanged in the review package.

Highlight lead defaults to 228 ms, learned from the approximate convention in
the existing cues. Word replay has a separate 250 ms pre-roll. Both can be
adjusted in Preview settings without rewriting acoustic coordinates.

## Where work is saved

- User revisions: `work/private-beta/edits/RECORDING/revisions/`.
- Private exported cue copies: `work/private-beta/exports/`.
- New model-result registrations: `work/private-beta/generated/`.
- Immutable audio/model evidence: the existing `work/runs/`, `work/diagnostics/`,
  and input directories.
- Automated browser edits: separate `work/private-beta-qa-*/` directories.
  Those explicitly synthetic review actions are not acoustic labels or user work.

Two tabs cannot silently overwrite each other's saved revisions. On a conflict,
download the unsaved recovery package, then reload. A server error leaves the
last saved revision intact; the UI reports unsaved changes instead of success.

## What remains unverified

This beta uses 45 prepared recordings from the existing narrator corpus. New
reader/tradition performance, arbitrary uploads, microphone capture, live
following, and pronunciation or taamim correctness grading are not implemented
or established by this milestone. The model can position unclear speech by
context; that does not prove what was pronounced.

Re-alignment is offline, one recording at a time, four CPU threads, with a
180-second acoustic limit followed by bounded diagnostics. It reuses the
installed model and downloads nothing. The shared approved testing budget is
checked and elapsed model work is recorded. Stopping the service during a job
lets its bounded worker finish rather than orphaning it.

Public integration remains a separate proposed diff, playback verification,
and explicit approval step after private testing.

## Verification at handoff

- 57 deterministic and integration tests pass against recorded source hashes.
- 49 browser checks pass: real playback, onset correction, undo, persistence,
  conflicting tabs, repeat insertion/removal, flag review, cue validation,
  private downloads, and the three reviewed mobile fixes.
- Chromium desktop (1280 x 900), Chromium mobile viewport (390 x 844), and
  Playwright WebKit mobile viewport (390 x 844) were exercised. These are browser
  tests, not a physical iPhone test. Automated accessibility checks are clear.
- A fresh Haazinu alignment plus diagnostics completed in 11.73 seconds and
  opened as a separate unreviewed result. Existing corrections survived.
- The actual handoff server opens 45 recordings, plays the uncued example,
  and contains zero automated user revisions. The launch command reuses it.
- Independent finish review scored the three reported mobile fixes resolved:
  stable inspector position, in-panel pause, and visible error recovery.

Evidence: [verification record](work/private-beta-verification.json) and
[browser check results](work/private-beta-verification/20260909/advanced-results.json).
The Browser plugin was unavailable; validation used the project's installed
Playwright browsers. This verification establishes the editing workflow,
not acoustic, pronunciation, or cantillation accuracy.
