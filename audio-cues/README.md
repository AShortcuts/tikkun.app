Published Cue Data lives here as JSON payloads.

Rules:
- One folder per narrator, for example `yoni-davidov/`
- One folder per reading inside the narrator folder, named with the two-digit parsha number and the parsha slug, for example `01 beresheet/` or `38 korach/`
- Non-parsha readings keep their plain reading id as the folder name
- Seven numbered files per fully cued parsha: `1.json` through `7.json`
- Example: `yoni-davidov/01 beresheet/1.json`
- The JSON contents should match the admin export payload exactly

Maftir:
- There is no separate maftir cue file
- Maftir reuses the seventh aliyah recording and resolves to `7.json`
