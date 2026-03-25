Per-parsha cue files live here as JSON payloads.

Rules:
- One folder per parsha slug, for example `bereshit/`
- Seven cue files per supported parsha
- Filename format: `<parsha-slug>-<aliyah-letter>-<narrator-initials>.json`
- Example: `bereshit-א-yd.json`
- The JSON contents should match the admin export payload exactly

Aliyah letters:
- `א`, `ב`, `ג`, `ד`, `ה`, `ו`, `ז`

Maftir:
- There is no separate maftir cue file
- Maftir reuses the seventh aliyah recording and cue file
- Any lookup beyond aliyah 7 is normalized back to `ז`

Current narrator initials:
- `yoni-davidov` -> `yd`
