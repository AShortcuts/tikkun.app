# Release Operations

This document defines the support promise and the operational work around
`docs/release-checklist.md`. A release is not complete until its evidence record
is saved alongside the release artifact.

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
