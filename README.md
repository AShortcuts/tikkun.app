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

1. Choose or create a local Koofr-synced folder.
2. Record validated MP4s into that folder:

```sh
TIKKUN_VIDEO_OUTPUT_ROOT="/Users/adambh/Koofr/Tikkun Videos" npm run video:record -- --ids=bereshit-1
```

The recorder starts Vite locally, launches Chromium through Chrome DevTools Protocol, renders at a fixed high-density viewport, captures 60fps frames, encodes with FFmpeg, validates the MP4, writes compact local metadata, and deletes temporary frames.

Useful commands:

```sh
npm run video:calibrate -- --ids=bereshit-1 --max-concurrency=3
npm run video:cleanup
npm run video:manifest
```

After Koofr syncs a validated MP4, create the Koofr share link manually and add it to `koofr-video-links.local.json` using `koofr-video-links.local.example.json` as the shape. Then run `npm run video:manifest`; only validated videos with registered Koofr links are exposed in the app.

### Checks

```sh
npm run typecheck
npm run lint
```

## License

[MIT](LICENSE)
