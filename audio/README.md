Narrator recordings live here as the audio files the Reader plays.

Rules:
- One folder per narrator, for example `yoni-davidov/`
- One folder per reading inside the narrator folder, named with the two-digit parsha number and the parsha slug, for example `01 beresheet/` or `38 korach/`, matching `audio-cues/`
- Non-parsha readings keep their plain reading id as the folder name
- One file per aliyah: `1.m4a` through `7.m4a` (or `.mp3`)
- Example: `yoni-davidov/03 lech-lecha/1.m4a`

Publishing:
- The URL mirrors the file path. The example above is served at `/audio/yoni-davidov/03%20lech-lecha/1.m4a`, which is the `playSrc` recorded in `generated/audio-manifest.ts`.
- `npm run dev` serves this directory through `scripts/audio-assets-plugin.ts`; `npm run build` copies it into `dist/audio/`.
- Populate it with `npm run audio:sync -- <narrator> <source>`; do not rename files by hand, because cues are bound to the exact audio bytes and URL.
