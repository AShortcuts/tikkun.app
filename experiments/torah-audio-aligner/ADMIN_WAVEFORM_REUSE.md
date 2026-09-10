# Reuse the beta waveform in admin

Implemented locally on 2026-09-09 after the user's approval. The existing admin
waveform lane now uses the beta's 10 ms minimum/maximum envelope and pixel-based
canvas drawing. Recording controls, cue and issue markers, playhead, seeking,
and scrolling/follow behavior remain in the existing panel. Nothing was published.

## Before the port

- `app/audio/waveform-summary.ts` averaged sample energy into 800 buckets for
  the entire recording. `app/admin/cue-waveform.ts` interpolated and smoothed
  those values into 160 visible bars. Zooming cannot recover discarded detail.
- `beta_store.py` retains minimum and maximum sample values in 10 ms bins.
  `private-ui/app.js` combines the bins intersecting each canvas column and
  draws their vertical extent, retaining brief transients when zooming out.
- The beta's peak generation is ordinary audio processing. It does not require
  the alignment model. Its current Python code reads completed analysis WAVs;
  the algorithm can run on the browser-decoded audio the admin loader already
  provides.

## Implementation

1. The admin summary retains min/max values plus sample
   rate, sample count, and bin size. Keep the original audio time origin and
   map seconds directly to samples; do not stretch peak positions to a separate
   declared duration. Decoded floating-point amplitudes are retained without
   normalization or rounding; clipping is limited to the canvas display.
2. Reuse `WaveformSummaryLoader` cancellation, retry, and existing media-identity
   cache keys. Generate the envelope once per audio identity. Keep decoding
   failures visible. Precomputed peak files can later reduce browser decoding
   cost for catalog recordings; they are not required for the initial port.
3. Replace the 160 decorative bar elements in the existing admin lane with a
   canvas that aggregates min/max values for each physical display pixel. Retain cue,
   issue, and playhead overlays and click-to-seek behavior. Use the panel's
   existing colors and dimensions. No panel redesign is needed.
4. Keep microphone behavior explicit. The current admin panel hides catalog
   waveforms while capturing or holding new microphone audio. Showing a live
   microphone waveform needs a streaming audio input; the beta's completed-file
   generator alone does not provide that feature.

Source scope: `app/audio/waveform-summary.ts`,
`app/audio/waveform-summary-loader.ts`, `app/admin/cue-waveform.ts`,
`css/cue-authoring.css`, and four focused test files. The controller owns its
canvas inside the existing Svelte target, so no panel markup change was needed.
There are no new dependencies or connections to the private aligner server.

The canvas redraws when media, visible time range, dimensions, pixel density,
or theme changes. Moving only the playhead does not redraw it. A cancellation
race was also corrected: an old aborted request cannot erase a pending retry.
Loads are matched by media identity even when playback returns fresh session
objects. The summary cache retains at most six recordings.

## Verification

- Preserve brief impulses, quiet passages, silence, channel peaks, and the final
  partial bin. Ensure every source sample contributes to the correct time bin.
- Check overview and zoomed views on the same real recording, comparing word
  boundaries and seeking against the original audio timeline.
- Verify cue/issue overlays, playback following, resizing, high-DPI rendering,
  interrupted decoding, source changes, retry, and the existing microphone state.
- Exercise desktop and mobile admin workflows using authorized admin access.

- Node: 8 tests passed across waveform time mapping and loader lifecycle tests.
- Chromium: 35 tests passed across waveform generation, real WAV decoding and
  canvas pixels, retry/replacement/microphone states, and existing authoring
  controller/panel behavior. Resize and 2x pixel-density checks passed.
- `npm run check`: TypeScript, Svelte diagnostics (0 errors, 0 warnings), and
  ESLint passed. `npm run build` passed, including static output and build budgets.
- Real app: used the normal local Cue Authoring unlock. Behalotecha Aliyah 1
  loaded from its original audio (232.129887 seconds). The previous summary
  averaged 290.16 ms per bucket; the new bins are 10 ms. This is a resolution
  comparison, not a measured speed claim.
- Desktop at 1440 x 1000: clicking the middle of the 0-24 second lane sought
  exactly to 12 seconds; playhead ratio was 0.5 with 16 visible cue markers.
  Playback automatically advanced the window to 22-46 seconds at 37.36 seconds.
- Mobile at 390 x 844 and normal 389 x 721: no horizontal overflow. A tap on
  the unobstructed waveform sought to 177.81307 seconds and recentered the
  window to 165-189 seconds. Playback was left paused. Restoring the normal
  browser viewport also verified the real 2x-density canvas (462 x 137 pixels).
- Captures and DOM measurements: `.impeccable/review/admin-waveform/desktop.png`,
  `mobile.png`, and `verification.json`, relative to this experiment directory.

Live microphone visualization remains outside this port. During capture and
while holding newly captured audio, the catalog waveform remains hidden with
the existing explicit status. The existing compact admin layout and separate
floating player were preserved; on mobile, that player can overlap the bottom
of the lane. The visible upper part supports seeking.
