# Release Operations

This reference contains support, verification and recovery procedures for the [canonical release checklist](release-checklist.md). Save each release's [evidence record](release-evidence-template.md) alongside its artifact.

## Support Tiers

### Tier 1: Release blocking

- Public Home, Readings, About, Tidbits, and Reader routes.
- Current stable Chromium on desktop and a 390 CSS-pixel touch viewport.
- Current stable Safari on macOS and Safari on one physical, supported iPhone.
- Reader startup, navigation, search, settings, bookmarks/resume, audio
  play/pause/seek, word highlighting, offline relaunch, and PWA update recovery.
- Deployed Cloudflare Pages artifact plus `functions/audio/`, including exact
  byte-range behavior.

Automated Chromium and WebKit checks are necessary evidence. They do not replace
the physical-iPhone, deployed-media, VoiceOver, or installed-PWA checks.

### Tier 2: Operator supported

- Cue Authoring, Cue Analytics, Recording Issues, and Recording Harness.
- Current stable desktop Chromium with keyboard and pointer input.
- Local browser storage enabled and enough free space to preserve/export drafts.

These tools must not weaken the Tier 1 Reader when their optional code is never
opened. Operator workflows require focused browser tests, but they do not block
mobile layout unless a release explicitly advertises mobile authoring.

### Tier 3: Best effort

- Firefox, embedded webviews, older browser releases, tablets not represented by
  the release matrix, and static hosts without the audio Function.

Do not claim these surfaces as supported without adding them to the release
matrix and recording evidence. A static-only deployment may play audio, but it
does not satisfy the seek/range contract.

## Incumbent Contrast Waiver

Product-owner direction on 2026-08-19 preserves the incumbent muted Reader
palette. The exact state-and-selector inventory in
`app/app-accessibility.vitest.ts` therefore remains a known WCAG AA color
contrast exception for secondary text, verse numbers, aliyah labels, progress
copy, and related helper copy. The impact is reduced legibility for some low-
vision readers; this is not a claim of full WCAG AA conformance.

The automated gate must continue to fail for every new contrast target, missing
inventory target, or non-color violation. Do not broaden the exception by class
name or silently adjust the palette. Re-review this waiver before any palette
change and record it in each release evidence file until explicit design
approval replaces the affected colors.

## Build Budgets

`npm run build` enforces simple per-file ceilings: 460,000 raw / 145,000 gzip
bytes for JavaScript, 170,000 / 30,000 for CSS, 72,000 / 14,000 for the service
worker, and 24 MiB for any static asset. The build prints the largest file in
each class so a raised ceiling must name the contributor and product reason.

`npm run preview:verify` separately loads the built Home, Readings, Reader, and
About routes, rejects missing or escaped assets, and exercises current-build
Offline Download, offline relaunch, cached Range requests, removal, and online
recovery. Cue Authoring, Cue Analytics, and Recording Harness remain lazy and
are excluded from the service-worker shell by the service-worker generator.

## Preview Procedure

1. Build the pull-request artifact with the same pinned Node and npm versions as
   CI and a non-root `TIKKUN_BASE_PATH`.
   Run `npm run preview:verify` before upload; it serves that exact artifact on
   an owned ephemeral loopback port and closes the browser and server afterward.
2. Confirm every application URL, media URL, service-worker scope, and cache
   namespace stays inside that base path.
3. Host the artifact on an isolated preview origin. If `functions/audio/` is not
   deployed there, label media seeking as unverified instead of treating the
   preview as release evidence.
4. Exercise Home, Readings, Reader startup, one recording, About, and an offline
   relaunch.
5. Inspect console errors, CSP reports, headers, missing assets, and service-worker
   install state. Save failures in the pull request; do not rely on screenshots
   alone.
6. Delete or expire the preview after review. Preview caches and service workers
   must not share the production namespace.

Add a targeted previous-build upgrade fixture after the first production
release creates a real compatibility boundary. Until then, current-build
install, reload, offline, and recovery behavior are the relevant contracts.

## Rollback Procedure

Before deployment, retain the previous known-good commit, exact static artifact,
Functions source, and release evidence.

1. Stop promotion when a Tier 1 gate fails. Do not repair production in place.
2. Redeploy the previous static artifact and its matching `functions/audio/`
   implementation as one version.
3. Verify Home and Reader startup, service-worker update/reload, security headers,
   and one beginning/middle/end audio seek on the deployed origin.
4. Record the failed release, rollback artifact, timestamps, user impact, and
   follow-up owner in the new release evidence record.
5. Preserve the failed artifact long enough to reproduce the issue. Remove it
   only after the corrective release is verified.

A rollback is complete only after the deployed checks pass; a provider dashboard
status alone is not evidence.

## Build Identity and Support Diagnostics

Every browser artifact embeds one build identifier. Build resolution prefers
`TIKKUN_BUILD_ID`, then `CF_PAGES_COMMIT_SHA`, then `GITHUB_SHA`, then the local
Git revision. Local Git builds add `.dirty` when tracked or untracked source is
not committed. `unknown-source` is honest local output, but it is not a valid
release identifier; provide `TIKKUN_BUILD_ID` when building outside Git or a
supported CI provider.

Confirm the identifier shown under About > Support and Reader Settings > Support
matches the release evidence record before promotion.

Support Diagnostics keeps at most 20 recent error categories in browser memory.
Its report includes the build identifier, generation time, coarse browser and
platform families, compact/wide viewport class, browser/standalone mode, online
state, current surface class, and bounded error categories. It deliberately
omits error messages, stack traces, full URLs and hashes, Torah text, recording
identifiers, search queries, Cue Drafts, and authoring payloads.

The Module does not use storage, analytics, network requests, or automatic crash
uploads. A report exists outside the app only after the user chooses Copy
diagnostic report or Download diagnostic report. Ask the user to inspect and
share that file through their chosen support channel; never claim the app sent
it automatically.

## Dependency Cadence

- Review production and development dependency updates once per month.
- Review GitHub Actions pins and the pinned Node/npm/Playwright toolchain in the
  same change.
- Triage critical or high production advisories immediately; either patch within
  seven days or document the exposure, mitigation, owner, and deadline.
- Upgrade one toolchain family at a time, run deterministic `npm run verify`,
  then run `npm run verify:release` before promotion. Preserve the previous
  lockfile in version control for rollback.
- Never download browser engines or large toolchains during routine review without
  first stating the expected size and obtaining approval when it exceeds 500 MB.

## Generated Ownership

| Source of truth | Command | Generated output | Review owner |
| --- | --- | --- | --- |
| `text/torah-toc.json` | `npm run torah:index` | `generated/torah-index.json` | Reader data maintainer |
| Curated narrator audio source | `npm run audio:sync -- <narrator> <source>` | `site/audio/**`, `generated/audio-manifest.ts` | Media maintainer |
| `audio-cues/**`, audio manifest, canonical reading tokens | `npm run reading:manifest` | `generated/public-reading-manifest.ts` | Cue/public-truth maintainer |
| Validated local video outputs and registered links | `npm run video:manifest` | `generated/video-manifest.ts` | Media maintainer |
| Application source and generated manifests | `npm run build` | `dist/**`, including `_headers` and `service-worker.js` | Release owner |

Generated files are reviewed diffs, never hand-edited sources. The relevant
generator test must compare checked-in output with authoritative input. Run the
generator twice after a source change; the second run must be a no-op.
When adding or replacing `audio-cues/**` while the development server is running,
Vite automatically validates and refreshes homepage and coverage-page aliyah bubbles.
Rapid edits are batched; unchanged coverage does not rewrite the catalog. Invalid
cue files show a development error and leave the last valid catalog intact until
corrected. Startup and builds also generate coverage; `npm run reading:manifest`
remains available for a manual refresh without a running development server.
Files in Downloads and local admin drafts do not change published cue coverage.
`npm run verify:release` snapshots all four tracked generated manifests before
verification and rejects any byte change afterward. It compares against the
starting bytes, not global worktree cleanliness, so unrelated work in progress
does not become a false generated-drift failure.

## Web Release Procedures

Use these procedures for the web gates in the canonical checklist. Run deployed checks against the exact authorized deployment; earlier evidence does not transfer to a new artifact.

### Automated Gate

- Run `npm ci` with the repository's pinned npm version.
- Run `npm run verify:release`; do not publish with skipped or retried failures.
- The command runs deterministic `npm run verify`, rejects generator-owned outputs whose bytes changed during verification, checks whitespace with `git diff --check HEAD --`, and runs the live production audit through `npm audit --omit=dev`.
- Preexisting unrelated working-tree changes do not fail the generated-output check. Any generated diff created by verification must be reviewed and committed before rerunning the release gate.
- Confirm `dist/_headers` and `dist/service-worker.js` exist in the exact artifact being deployed.
- Confirm the Cloudflare deployment includes `functions/audio/`; a dist-only upload does not satisfy the media gate.
- Review the printed JavaScript, CSS, service-worker, and largest-static-asset sizes. Raise a budget only with contributing filenames and a documented product reason.

### Content Truth

- Confirm Readings & Coverage matches the generated public manifest and the actual published media.
- Treat browser-local Cue Drafts as authoring state only. They must never upgrade or downgrade public readiness.
- Open one available, one planned, and one needs-review reading. Verify the labels describe what a visitor can actually use.
- Regenerate twice when Cue Data changes and confirm the second run produces no diff.

### Deployed Media

- Run `npm run audio:verify-delivery -- https://tikkunreader.com` after the GitHub-triggered Pages deployment succeeds. This checks every published recording's beginning, middle, suffix, and invalid ranges against the local audio bytes. An optional recording path limits diagnosis to one file.
- On the deployed origin, request an available recording with `HEAD`; verify a valid media type and length.
- Request `Range: bytes=0-1023`; verify `206`, an exact `Content-Range`, and `Content-Length: 1024`. The Function advertises `Accept-Ranges: bytes`; cached responses can omit this advisory header, so the live verifier reports its absence without accepting incorrect status, length, or bytes.
- Request a suffix range and an unsatisfiable range; verify a correct suffix response and `416` with `Content-Range: bytes */<length>`.
- Test `If-Range` with both a current and stale validator. Confirm playback seeks from the beginning, middle, and near the end.
- Do not infer proportional origin bandwidth from app tests. Confirm the CDN or storage origin itself serves native range responses before claiming that benefit.
- Pages currently ignores Range and can omit Content-Length inside its asset binding. The audio Function uses the existing generated recording sizes when needed, requests the cacheable full asset, and streams only the requested portion with bounded memory and cancellation. FixedLengthStream preserves the response length on the wire. A late seek still reads the preceding bytes internally; no separate media service or cache is involved.
- Range reads use Cloudflare's native `readAtLeast` with a maximum 1 MiB buffer. This avoids exhausting the Function CPU allowance on tiny upstream chunks. Check deployment logs for `exceededCpu` when diagnosing aborted audio transfers.

### Security Headers

- Inspect `/`, `/reader/`, and a media response on the deployed host. Confirm HSTS, `nosniff`, referrer policy, permissions policy, and the intended frame policy are present.
- Keep CSP in `Content-Security-Policy-Report-Only` while auditing Home, Reader, search, settings, Cue Authoring, audio, video links, and the live prototype iframe.
- Review browser CSP reports or console violations on a staging deployment. Enforce CSP only after every required source is explicit and the same build passes this checklist.
- Confirm every inline script hash from the deployed HTML appears in the deployed `_headers` policy and the CSP line remains within the host limit.
- Remember that a static host's `_headers` rules may not govern Function responses; inspect the deployed audio Function separately.

### Product And Accessibility

- Exercise desktop and touch layouts at 320, 390, 550, 551, 870, and 1280 CSS pixels without horizontal clipping or unreachable controls.
- Test light and dark themes, 200% zoom, reduced motion, and forced colors.
- Complete the Reader with keyboard only: choose a reading, search, change settings, select an aliyah, play/pause, seek, change speed, and dismiss every overlay.
- When the release catalog has two narrators for the same reading, switch between them and confirm playback, highlighting, and the active recording identity all change together. Record `Not applicable` when no real catalog pair exists; do not invent demo media.
- Verify visible focus, focus return, Escape behavior, progress announcements, loading, empty, offline, failure, and retry states.
- Confirm typing or selecting text never triggers presentation shortcuts.
- Record the incumbent contrast waiver from [Incumbent Contrast Waiver](#incumbent-contrast-waiver); do not describe the exact automated exception inventory as full WCAG AA conformance.

### PWA And Devices

- Test first load, offline relaunch, and reconnect after the service worker has installed.
- Start one recording Offline Download from Reader Settings, observe progress, relaunch offline, and verify playback plus beginning/middle/end seeks. Remove it and confirm offline playback fails honestly while network playback still works after reconnecting.
- Deploy a second build over an installed copy. Confirm the update notice is understandable, reloads safely, and does not trap the user on a stale shell.
- Corrupt each persisted preference payload once and confirm the app recovers to explicit defaults without blocking startup.
- On a real iPhone, test portrait and landscape, the home indicator, notch or Dynamic Island safe areas, audio interruption, background/foreground return, and installed Home Screen mode.
