# tikkun.io

> A practical online tikkun for preparing Torah readings.

The goal is to help Torah readers prepare faster and more clearly. The site keeps the familiar tikkun format, then adds audio, reader settings, and synced word highlights.

The source text is pulled from the [Sefaria API](https://github.com/Sefaria/Sefaria-Project/wiki/API-Documentation), with some minor overrides as issues are found (such as פתוחה/סתומה discrepancies). Sefaria's default Tanakh text is based on MAM (Miqra According to the Masorah). MAM is licensed under CC-BY-SA and is attributed to [Hebrew Wikisource](https://en.wikisource.org/wiki/User:Dovi/Miqra_according_to_the_Masorah#beginning).

## Local workflow

This is a self-contained static site:

- application code lives in `app/`
- protected page layouts and TOCs live in `text/`
- published Cue Data lives in `audio-cues/`
- generated audio and video catalogs live in `generated/`
- files copied directly into the built site, including recordings, live in `site/`
- Vite is only used as a thin local dev/build step for TypeScript and static bundling

### Install

```sh
npm install
```

### Develop locally

```sh
npm run dev
```

### Build static output

```sh
npm run build
```

The build output in `dist/` is ready for static hosting.

### Sync audio library

Normal development and builds do not require access to any external audio folders.

Only run this when you want to refresh the source recordings on the machine that has the source library:

```sh
npm run audio:sync -- --source "/path/to/source recordings"
```

The source directory must contain the narrator's complete recording library. Its folders use names such as `01 Beresheet`; supported `.m4a` and `.mp3` filenames identify aliyot 1 through 7.

The command replaces that narrator's generated media under `site/audio/`, normalizes each recording to `<narrator>/<reading>/<aliyah>.<format>`, and regenerates `generated/audio-manifest.ts`. You can set `TIKKUN_AUDIO_SOURCE_ROOT` instead of passing `--source`.

The generated manifest is deterministic and grouped by parsha so diffs stay reviewable in git.

### Generate offline aliyah videos

Video generation is a local publishing workflow. It does not use Koofr API keys, and generated MP4 files should stay outside this repo.

Prerequisites:

- Install Chrome or Chromium.
- Install `ffmpeg` and `ffprobe`.
- Choose or create a local Koofr-synced folder for final MP4 output.
- Generate only aliyot that already have complete cue timing.

Recommended first run:

```sh
TIKKUN_VIDEO_OUTPUT_ROOT="/Users/adambh/Koofr/Tikkun Videos" npm run video:record -- --ids=beresheet-2 --concurrency=1
```

The recorder starts Vite locally, launches Chromium through Chrome DevTools Protocol, renders at a fixed high-density viewport, waits for the first highlighted word to scroll into view, captures cue-keyed frame windows at 30fps by default, holds stable sections with an FFmpeg concat file, muxes the original audio, validates the output, writes compact local metadata, and deletes temporary frames. Recording mode hides settings, about, admin controls, annotation toggles, floating UI, and scrollbars; the video is cropped around the reading table with balanced side cropping so unused side whitespace is reduced without crowding the text.

The default renderer is `cue-keyframes`. It captures a short cue-start burst for the highlight animation, holds a settled cue frame through the stable part of the cue, and captures a short 30fps burst beginning just before the cue ends so highlight and scroll transitions are preserved without full every-frame capture. If that ever needs diagnosis, force the slower every-frame renderer:

```sh
TIKKUN_VIDEO_OUTPUT_ROOT="/Users/adambh/Koofr/Tikkun Videos" npm run video:record -- --ids=beresheet-2 --concurrency=1 --render-mode=deterministic-frames
```

Tune transition bursts only if the highlight or scroll transition needs more or less coverage. `--cue-burst-pre-end-ms` controls how soon before `cue.timeEnd` the burst starts; `--cue-burst-max-ms` caps how long the burst can run before falling back to a held frame:

```sh
TIKKUN_VIDEO_OUTPUT_ROOT="/Users/adambh/Koofr/Tikkun Videos" npm run video:record -- --ids=beresheet-2 --concurrency=1 --cue-burst-pre-end-ms=120 --cue-burst-max-ms=500
```

Video generation flags:

| Flag | Default | Use |
| --- | --- | --- |
| `--ids=beresheet-1,beresheet-2` | all available recordings | Limits generation to specific `audioId` values. |
| `--concurrency=1` | `1` | Runs multiple recordings in parallel after calibration proves it is safe. |
| `--render-mode=cue-keyframes` | `cue-keyframes` | Uses the fast cue-keyframe/FFmpeg concat renderer. Use `deterministic-frames` for slower every-frame capture. |
| `--fps=30` | `30` | Sets output FPS. Use `60` only for smoother premium exports. |
| `--width=1920` | `1920` | Sets the logical browser viewport width. |
| `--height=1080` | `1080` | Sets the logical browser viewport height. |
| `--scale=4` | `4` | Sets browser `deviceScaleFactor` for sharper Hebrew text capture. |
| `--cue-burst-pre-end-ms=120` | `120` | Starts the transition burst this many milliseconds before `cue.timeEnd`. |
| `--cue-burst-max-ms=500` | `500` | Caps each transition burst before the renderer returns to holding frames. |
| `--crop-margin=96` | `96` | Adds horizontal margin around the reading table before centered cropping. |
| `--no-crop` | cropping on | Disables reading-surface cropping and records the full viewport. |
| `--crf=18` | `18` | Controls H.264 compression quality; lower is larger/better, higher is smaller/lower quality. |
| `--preset=veryfast` | `veryfast` | Sets the FFmpeg x264 preset. Use slower presets for final batches if the time is acceptable. |
| `--output-root=/path` | `TIKKUN_VIDEO_OUTPUT_ROOT` or Koofr default | Sets the final MP4 output folder. |
| `--work-root=/path` | `/private/tmp/tikkun-video-render` | Sets the disposable temp frame/work folder. |
| `--external-server` | off | Reuses an already running app server instead of starting Vite. |
| `--base-url=http://127.0.0.1:5173` | `http://127.0.0.1:4177` | Points the recorder at a specific local app server and implies `--external-server`. |
| `--keep-frames` | off | Keeps temporary PNG frames for debugging. |
| `--max-concurrency=3` | `3` | Sets the highest concurrency level tested by `npm run video:calibrate`. |
| `--include-output` | off | Used with `npm run video:cleanup` to delete local MP4 outputs as well as temp files. |

Use a custom Chrome executable if the default Chrome path is not correct:

```sh
TIKKUN_CHROME="/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" TIKKUN_VIDEO_OUTPUT_ROOT="/Users/adambh/Koofr/Tikkun Videos" npm run video:record -- --ids=beresheet-2
```

Record multiple aliyot:

```sh
TIKKUN_VIDEO_OUTPUT_ROOT="/Users/adambh/Koofr/Tikkun Videos" npm run video:record -- --ids=beresheet-1,beresheet-2 --concurrency=1
```

Record every available aliyah with complete cues:

```sh
TIKKUN_VIDEO_OUTPUT_ROOT="/Users/adambh/Koofr/Tikkun Videos" npm run video:record -- --concurrency=1
```

Calibrate safe parallelization before increasing production concurrency:

```sh
npm run video:calibrate -- --ids=beresheet-1 --max-concurrency=3
```

Use the highest concurrency level that completes with zero validation failures:

```sh
TIKKUN_VIDEO_OUTPUT_ROOT="/Users/adambh/Koofr/Tikkun Videos" npm run video:record -- --ids=beresheet-1,beresheet-2 --concurrency=2
```

Use 60fps only when you want a smoother premium export and can tolerate longer render time and larger temporary frame storage:

```sh
TIKKUN_VIDEO_OUTPUT_ROOT="/Users/adambh/Koofr/Tikkun Videos" npm run video:record -- --ids=beresheet-2 --concurrency=1 --fps=60
```

Disable reading-surface cropping if you need to inspect the full fixed viewport:

```sh
TIKKUN_VIDEO_OUTPUT_ROOT="/Users/adambh/Koofr/Tikkun Videos" npm run video:record -- --ids=beresheet-2 --concurrency=1 --no-crop
```

If Vite is already running elsewhere, point the recorder at that server:

```sh
npm run dev -- --host 127.0.0.1 --port 5173
npm run video:record -- --external-server --base-url=http://127.0.0.1:5173 --ids=beresheet-2
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

Force-cancel a stuck recording run, then clean temp files:

```sh
npm run video:shut-down
```

Cleanup temporary files and local MP4 output after Koofr sync/link registration:

```sh
TIKKUN_VIDEO_OUTPUT_ROOT="/Users/adambh/Koofr/Tikkun Videos" npm run video:cleanup -- --include-output
```

### Checks

```sh
npm run typecheck
npm run lint
```

## License

[MIT](LICENSE)
