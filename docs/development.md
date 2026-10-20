# Development and publishing

[Back to the project overview](../README.md)

Run the commands in this guide from the repository root. For iOS builds, see [Native development](native-development.md).

## Local workflow

This is a browser-first static SvelteKit app with a shared TypeScript reader:

- public routes and the reader entry point live in `src/`
- reader, calendar, playback, and offline application code lives in `app/`
- protected page layouts and TOCs live in `text/`
- published Cue Data lives in `audio-cues/`
- generated audio and video catalogs live in `generated/`
- files copied directly into the built site, including recordings, live in `site/`
- `functions/audio/` adds verified byte-range delivery on Cloudflare Pages
- SvelteKit and Vite provide local development and static builds

### Install

Requires the release toolchain pinned in `.nvmrc`: Node.js 22.23.2 and npm 11.19.0.

```sh
npm ci
```

### Develop locally

```sh
npm run dev
```

Development and preview servers bind to `127.0.0.1` by default. Opt into LAN access explicitly with `npm run dev -- --host 0.0.0.0` on a trusted network.

For the private Torah Audio Aligner, run `npm run dev:aligner` in a second terminal. It imports new audio from the configured local source library, updates the local catalogs, then starts or refreshes the aligner using its existing Python environment and saved workspace. It does not start alignment jobs. See [the batch beta guide](../experiments/torah-audio-aligner/BATCH_BETA.md) for source configuration and review instructions.

### Build static output

```sh
npm run build
```

`dist/` is a portable static artifact. A generic static host can serve the full product, but media seeking follows that host's Range support. The Cloudflare release deploys the project with `functions/audio/` alongside the static output; uploading `dist/` alone does not satisfy the verified `206 Partial Content` release gate.

### Sync audio library

Normal development and builds do not require access to any external audio folders.

Only run this when you want to refresh the source recordings on the machine that has the source library:

```sh
npm run audio:sync -- --source "/path/to/source recordings"
```

The source directory must contain the narrator's complete recording library. Its folders use names such as `01 Beresheet`; supported `.m4a` and `.mp3` filenames identify aliyot 1 through 7.

The command replaces that narrator's generated media under `site/audio/`, normalizes each recording to `<narrator>/<reading>/<aliyah>.<format>`, and regenerates `generated/audio-manifest.ts`. You can set `TIKKUN_AUDIO_SOURCE_ROOT` instead of passing `--source`.

The generated manifest is deterministic and grouped by parsha so diffs stay reviewable in git.

The aligner's startup import is additive: it copies new recordings and restores missing copies of unchanged registered audio, preserves recordings absent from the source folder, and leaves cue files untouched. It refuses changed audio for an existing recording; review those replacements before using `audio:sync`. Startup source configuration lives in the ignored `experiments/torah-audio-aligner/work/audio-source.json` file (`{"sourceRoot":"/path/to/source recordings"}`), with `TIKKUN_AUDIO_SOURCE_ROOT` taking precedence. Without either setting, the aligner uses the already registered library and reports that import is not configured.

### Generate offline aliyah videos

Video generation is a local publishing workflow. It does not use Koofr API keys, and generated MP4 files should stay outside this repo.

Prerequisites:

- Install Chrome or Chromium.
- Install `ffmpeg` and `ffprobe`.
- Choose or create a local Koofr-synced folder for final MP4 output.
- Generate only aliyot that already have complete cue timing.

New videos are grouped under the output root using two-digit canonical audio-catalog numbers and names, for example `01 Beresheet` and `02 Noach`. Existing videos are not moved. The eight-character filename suffix fingerprints the audio, cues, and app build; an extra `-2`, `-3`, etc. prevents overwriting an existing filename. Temporary partial MP4s are created in the same parsha folder. Cleanup with `--include-output` also covers these subfolders.

`npm run video:record` records all remaining videos by default. It skips an export only when its saved validation passed, the MP4 still has the same SHA-256 digest, and the audio, cues, and render settings match. App-build changes alone do not invalidate completed videos; use `--force` to apply new app visuals or recording-code changes to existing exports. Skipped IDs and the remaining count are printed before launching the browser. Missing, changed, or stale outputs are rendered again. Older metadata without the output digest and settings requires one fresh render. Use `--force` to render all selected videos again; calibration always renders fresh videos.

Aliyot with missing or empty cue data are skipped with their IDs and reason printed and saved in the render report. They do not stop the batch or count as completed, and are checked again on the next run. This also applies with `--force`. Malformed cues, incomplete alignment, and rendering or validation errors still fail visibly.

Recommended first run:

```sh
TIKKUN_VIDEO_OUTPUT_ROOT="/path/to/Tikkun Videos" npm run video:record -- --ids=beresheet-2
```

The recorder starts Vite locally, launches Chromium through Chrome DevTools Protocol, renders at a fixed high-density viewport, waits for the first highlighted word to scroll into view, captures every frame at 60fps by default, encodes video with the recording's audio, validates the output, writes compact local metadata, and deletes temporary frames. Recording mode hides settings, about, admin controls, annotation toggles, floating UI, and scrollbars; the full 1300 x 600 viewport is recorded without cropping, keeping the entire header visible. At the default 3x capture scale, output is 3900 x 1800 (19.5:9), a close landscape fit for iPhone 12 Pro and iPhone 16 Pro. The shorter viewport shows fewer text rows rather than cutting the header off.

The recorder opens `/reader` and reuses a verified Vite process from this checkout on port 5176. If the port is free, it starts its own server and stops only that server afterward. An occupied port belonging to another app produces an error; `--base-url` selects a different server explicitly.

Both render modes use the same video clock. CSS highlight transitions are paused and sampled at their exact elapsed time, including outgoing fades and interrupted transitions. Smooth scrolling uses measured word positions and a distance-based Chromium-style curve. Recording pages and fonts are prepared before capture and remain mounted throughout the export. A slow computer takes longer to render; it never changes animation time, FPS, resolution, or quality to keep up. `cue-keyframes` is the default and reuses settled frames between animations. `deterministic-frames` captures every output frame.

Scroll interruptions follow native `Element.scrollTo`: an unchanged destination keeps the current animation, while a changed destination starts fresh easing from the current position. The clock does not carry velocity between different targets. Native-reference tests compare uninterrupted, repeated-target, interrupted, and reversing scrolls within two CSS pixels, and compare complete incoming/outgoing/reversing CSS fade curves at each property's own animation time. Browser paint-start delays are normalized to cue time. These checks supplement the two-mode frame-reuse tests; neither establishes pixel-for-pixel identity to live playback across every browser and recording.

Frames now stream directly from Chrome to FFmpeg by default (`--frame-transport=stream`). Each lossless PNG write completes before another write starts, so slow encoding applies backpressure instead of dropping frames or building an unbounded screenshot queue. Encoding overlaps capture and the normal workflow no longer writes or rereads temporary PNG files. Resolution, FPS, and encoding quality settings stay the same. The stream checks PNG dimensions and the exact number of frames sent; final MP4 validation still checks the decoded frame count and audio/video streams. Broken pipes, early exits, encoding errors, and stalled writes or finalization (120 seconds) fail the job and clean up its partial output.

Both render modes support streaming. In `cue-keyframes`, the recorder captures every frame while a fade or scroll is active. Once motion finishes, that image is sent for exactly the number of output frames before the next cue. It does not move cue times to force short words onto separate frames. The output contains every frame at the requested FPS. FFmpeg still decodes each repeated PNG, so fewer screenshots do not translate directly into the same percentage reduction in total render time.

Use `--keep-frames` to also save captured PNGs for diagnosis. Use `--frame-transport=files` to select the capture-then-encode workflow for comparison. Its cue concat manifest explicitly uses the requested FPS for each PNG's time base and trims the repeated end marker to the exact output frame count. Neither option is a silent fallback after a failed stream.

Concurrency defaults to `auto`, with a default maximum of five simultaneous recordings. Each aliyah is one job, so selecting only one aliyah cannot increase concurrency beyond one. It starts one recording, samples CPU usage, available RAM, and free space on both work/output disks every five seconds (also on job completion), and increases by one after 15 seconds of healthy readings. On macOS, RAM availability comes from the read-only `memory_pressure -Q` query, since raw free pages exclude reclaimable memory. Other platforms use the OS free-memory reading. Its CPU ceiling is one job per two logical CPUs; admission also reserves 15% of RAM (at least 1 GiB), plus an estimated memory budget for the new job based on capture resolution (at least 1.5 GiB). A numeric `--concurrency=N` is an upper bound, still subject to the maximum and these checks.

Above 90% CPU use or below the RAM reserve, the scheduler reduces its target and lets active jobs finish before admitting replacements. It starts new jobs only below 75% CPU use with enough memory headroom and at least 4 GiB free disk. Below 2 GiB free disk, or critically low free RAM (3% of total, at least 512 MiB), it stops owned render processes and reports failure. If no jobs are active and headroom stays unavailable for two minutes, it exits with an error. These are conservative sampled safeguards, not an OS resource reservation or a guarantee against sudden exhaustion. FFmpeg decoding and video encoding each use at most two threads per process.

Each job checks for cancellation between captures. Missing frame counts, even a single missing/extra output frame, invalid FPS/duration, dropped frames, and decode errors fail validation. Failed jobs stop the queue and are reported immediately; unstarted IDs are printed and saved. Completed results are saved individually. Outputs are encoded to hidden `.partial.mp4` files and receive their final names only after validation. Browser commands time out after 120 seconds instead of hanging indefinitely.

The terminal shows a live progress bar for each active aliyah, with its audio ID, completed-frame percentage, video time covered, elapsed time, estimated remaining capture time, and preparation/capture/encoding/validation stage. The batch header separates actual active jobs from the admission target and remaining-work ceiling, and counts validated, failed, and queued recordings. The target cannot grow without queued work, so a single selected aliyah stays at one throughout its run. A 100% frame bar means capture is complete; the video is marked validated only after encoding and validation succeed. ETA estimates cover capture only. Interactive terminals and redirected plain-text output both refresh every second. Both keep refreshing while waiting for frames, encoding, or validation, with immediate stage changes and results. Progress is enabled automatically in both render modes and both frame transports.

Explicitly capture every output frame:

```sh
TIKKUN_VIDEO_OUTPUT_ROOT="/path/to/Tikkun Videos" npm run video:record -- --ids=beresheet-2 --concurrency=1 --render-mode=deterministic-frames
```

The default `cue-keyframes` renderer reuses still images between animations:

```sh
TIKKUN_VIDEO_OUTPUT_ROOT="/path/to/Tikkun Videos" npm run video:record -- --ids=beresheet-2 --concurrency=1
```

The old cue-burst flags are accepted with a deprecation warning and ignored. Animation completion now determines when an image can be held; there is no burst cap that can cut off motion. Recording mode explicitly enables full highlight motion. Missing words, unsettled or changing layout, an uncontrolled animation, or an incorrect scroll position fail the job rather than accepting a suspect image. A fixed crop covers the prepared reading pages for the entire export. Browser preparation has a 30-second deadline.

Video generation flags:

| Flag | Default | Use |
| --- | --- | --- |
| `--ids=beresheet-1,beresheet-2` | all available recordings | Limits generation to specific `audioId` values. |
| `--force` | off | Re-renders selected videos even when completed files match. |
| `--concurrency=auto` | `auto` | Chooses concurrency from resource headroom. A positive integer sets a ceiling, not a forced worker count. |
| `--render-mode=cue-keyframes` | `cue-keyframes` | Reuses only settled frames. `deterministic-frames` shares the same motion clock and captures every frame. |
| `--frame-transport=stream` | `stream` | Sends PNGs directly to FFmpeg with bounded writes. `files` retains the capture-then-encode workflow. |
| `--fps=60` | `60` | Sets output FPS for the entire video, including scrolls and highlights. Use `30` for a faster render with fewer motion samples. |
| `--width=1300` | `1300` | Sets the logical browser viewport width. |
| `--height=600` | `600` | Sets the logical browser viewport height. |
| `--scale=3` | `3` | Sets browser `deviceScaleFactor` for sharper Hebrew text capture. |
| `--crop-margin=96` | `96` | Adds horizontal margin around the reading table before centered cropping. |
| `--crop` | off | Enables optional horizontal reading-surface cropping; this changes the output aspect ratio. |
| `--no-crop` | full viewport | Records the full viewport, including the header (default). |
| `--crf=18` | `18` | Controls H.264 compression quality; lower is larger/better, higher is smaller/lower quality. |
| `--preset=veryfast` | `veryfast` | Sets the FFmpeg x264 preset. Use slower presets for final batches if the time is acceptable. |
| `--output-root=/path` | `TIKKUN_VIDEO_OUTPUT_ROOT` or Koofr default | Sets the final MP4 output folder. |
| `--work-root=/path` | `/private/tmp/tikkun-video-render` | Sets the disposable temp frame/work folder. |
| `--external-server` | off | Reuses an already running app server instead of starting Vite. |
| `--base-url=http://127.0.0.1:5176` | `http://127.0.0.1:5176` | Points the recorder at a specific local app server and implies `--external-server`. |
| `--keep-frames` | off | Also saves captured PNGs when streaming, and keeps temporary frames for debugging. |
| `--max-concurrency=5` | `5` | Sets the concurrency ceiling, or the highest calibration level. Resource checks can keep actual concurrency lower. |
| `--include-output` | off | Used with `npm run video:cleanup` to delete local MP4 outputs as well as temp files. |

Use a custom Chrome executable if the default Chrome path is not correct:

```sh
TIKKUN_CHROME="/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" TIKKUN_VIDEO_OUTPUT_ROOT="/path/to/Tikkun Videos" npm run video:record -- --ids=beresheet-2
```

Record multiple aliyot:

```sh
TIKKUN_VIDEO_OUTPUT_ROOT="/path/to/Tikkun Videos" npm run video:record -- --ids=beresheet-1,beresheet-2
```

Record every available aliyah with complete cues:

```sh
TIKKUN_VIDEO_OUTPUT_ROOT="/path/to/Tikkun Videos" npm run video:record
```

Optional calibration renders real recordings, so it can take substantial time and disk space. Select at least as many distinct recordings as the maximum concurrency:

```sh
npm run video:calibrate -- --ids=beresheet-1,beresheet-2,beresheet-3 --max-concurrency=3
```

The calibration report records actual peak concurrency. A requested level is not established unless that many jobs actually overlapped and validated; automatic safeguards remain enabled. To limit normal recording to at most two jobs:

```sh
TIKKUN_VIDEO_OUTPUT_ROOT="/path/to/Tikkun Videos" npm run video:record -- --ids=beresheet-1,beresheet-2 --concurrency=2
```

60fps is the default for both render modes, preserving the animation timing while sampling motion twice as often as 30fps. In `cue-keyframes`, settled images are still reused between animations. To explicitly request the faster 30fps option:

```sh
TIKKUN_VIDEO_OUTPUT_ROOT="/path/to/Tikkun Videos" npm run video:record -- --ids=beresheet-2 --concurrency=1 --fps=30
```

To reproduce the earlier tall framing, explicitly use the previous viewport and horizontal crop:

```sh
TIKKUN_VIDEO_OUTPUT_ROOT="/path/to/Tikkun Videos" npm run video:record -- --ids=beresheet-2 --concurrency=1 --width=1920 --height=1080 --crop
```

If Vite is already running elsewhere, point the recorder at that server:

```sh
npm run dev -- --host 127.0.0.1 --port 5176
npm run video:record -- --external-server --base-url=http://127.0.0.1:5176 --ids=beresheet-2
```

After Koofr syncs a validated MP4, create the Koofr share link manually and add it to `koofr-video-links.local.json` using `koofr-video-links.local.example.json` as the shape:

```json
{
  "beresheet-1": {
    "videoSrc": "https://koofr.eu/links/example",
    "downloadSrc": "https://koofr.eu/links/example"
  }
}
```

Then regenerate the app video manifest:

```sh
npm run video:manifest
```

Only validated videos with registered Koofr links are exposed in the app.

Cleanup temporary render files:

```sh
npm run video:cleanup
```

Inspect an owned recording run without signaling or changing anything:

```sh
npm run video:status
npm run video:shut-down -- --dry-run
```

After reviewing the exact owner and child identities, force-cancel a stuck recording run and clean its owned temporary files:

```sh
npm run video:shut-down
```

Recorder ownership fails closed after a hard crash. If startup reports that the registry transition is already in progress, first verify that no `record-aliyah-videos.mjs` owner or registered FFmpeg, ffprobe, Vite, or browser child is still live. Only then remove the exact `<work-root>.processes.json.transition` marker and retry. Never delete a broad temp directory to recover ownership.

Cleanup temporary files and local MP4 output after Koofr sync/link registration:

```sh
TIKKUN_VIDEO_OUTPUT_ROOT="/path/to/Tikkun Videos" npm run video:cleanup -- --include-output
```

### Checks

```sh
npm run verify:quick
npm run test:browser
npm run test:browser:webkit
npm run build
npm run verify:release
```

`npm run verify` runs deterministic product checks. `npm run verify:release` adds byte-for-byte post-generation drift detection, tracked-diff whitespace validation, and the live production-dependency audit. Existing unrelated dirty files are allowed; generator-owned files changed by verification are not. The build regenerates authoritative data, authorizes every built inline script in the report-only CSP, and rejects code or static assets that exceed the checked-in size ceilings. See [the release checklist](release-checklist.md) for deployed media, security-header, offline, accessibility, and device checks.

## License

See the [project license and content credits](../README.md#credits-and-attribution).
