# tikkun.io

> A practical online tikkun for preparing Torah readings.

The goal is to help Torah readers prepare faster and more clearly. The site keeps the familiar tikkun format, then adds audio, reader settings, and synced word highlights.

The source text is pulled from the [Sefaria API](https://github.com/Sefaria/Sefaria-Project/wiki/API-Documentation), with some minor overrides as issues are found (such as פתוחה/סתומה discrepancies). Sefaria's default Tanakh text is based on MAM (Miqra According to the Masorah). MAM is licensed under CC-BY-SA and is attributed to [Hebrew Wikisource](https://en.wikisource.org/wiki/User:Dovi/Miqra_according_to_the_Masorah#beginning).

## Local workflow

This is a self-contained static site:

- application code lives in `src/`
- deployable static files and copied audio live in `static/`
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
npm run audio:sync
```

That command copies supported source audio files such as `.m4a` and `.mp3` into `static/audio/yoni-davidov/` and regenerates `src/data/audio-manifest.generated.ts`.

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
TIKKUN_VIDEO_OUTPUT_ROOT="/Users/adambh/Koofr/Tikkun Videos" npm run video:record -- --ids=bereshit-2 --concurrency=1
```

The recorder starts Vite locally, launches Chromium through Chrome DevTools Protocol, renders at a fixed high-density viewport, captures 30fps frames by default, encodes with FFmpeg, validates the MP4, writes compact local metadata, and deletes temporary frames.

Use a custom Chrome executable if the default Chrome path is not correct:

```sh
TIKKUN_CHROME="/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" TIKKUN_VIDEO_OUTPUT_ROOT="/Users/adambh/Koofr/Tikkun Videos" npm run video:record -- --ids=bereshit-2
```

Record multiple aliyot:

```sh
TIKKUN_VIDEO_OUTPUT_ROOT="/Users/adambh/Koofr/Tikkun Videos" npm run video:record -- --ids=bereshit-1,bereshit-2 --concurrency=1
```

Record every available aliyah with complete cues:

```sh
TIKKUN_VIDEO_OUTPUT_ROOT="/Users/adambh/Koofr/Tikkun Videos" npm run video:record -- --concurrency=1
```

Calibrate safe parallelization before increasing production concurrency:

```sh
npm run video:calibrate -- --ids=bereshit-1 --max-concurrency=3
```

Use the highest concurrency level that completes with zero validation failures:

```sh
TIKKUN_VIDEO_OUTPUT_ROOT="/Users/adambh/Koofr/Tikkun Videos" npm run video:record -- --ids=bereshit-1,bereshit-2 --concurrency=2
```

Use 60fps only when you want a smoother premium export and can tolerate longer render time and larger temporary frame storage:

```sh
TIKKUN_VIDEO_OUTPUT_ROOT="/Users/adambh/Koofr/Tikkun Videos" npm run video:record -- --ids=bereshit-2 --concurrency=1 --fps=60
```

If Vite is already running elsewhere, point the recorder at that server:

```sh
npm run dev -- --host 127.0.0.1 --port 5173
npm run video:record -- --external-server --base-url=http://127.0.0.1:5173 --ids=bereshit-2
```

After Koofr syncs a validated MP4, create the Koofr share link manually and add it to `koofr-video-links.local.json` using `koofr-video-links.local.example.json` as the shape:

```json
{
  "bereshit-1": {
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
