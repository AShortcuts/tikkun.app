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

Saving:
- To generate cues for new recordings, add the audio to the source recordings folder and run `npm run cues:generate`; it saves a ZIP to Downloads for Import cues
- In the admin panel on the Mac running `npm run dev`, Export saves the cue file straight to its path here after the same checks the build runs
- On any other computer, or the public site, Export offers Download Cues (and Download Audio after a microphone pass) to send to yourself
- To place downloaded cue files later, run `npm run cues:save -- <file.json> [...]`, or import them in the admin panel and Export
- Cues timed while recording new audio have no audio fingerprint: add the audio to the project first, then use Import cues on that aliyah and confirm it plays the new recording
- Saving never commits; review the git diff as usual
