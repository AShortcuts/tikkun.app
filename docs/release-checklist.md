# Release Checklist

Use this checklist for a public release. `npm run verify:release` is necessary,
but a local build cannot prove CDN, installed-PWA, or real-device behavior.

Support tiers, preview validation, rollback steps, dependency cadence, and
generated-file ownership live in `docs/release-operations.md`. Start each release
from `docs/release-evidence-template.md`; do not infer evidence from an earlier
build.

## Automated Gate

- Run `npm ci` with the repository's pinned npm version.
- Run `npm run verify:release`; do not publish with skipped or retried failures.
- The command runs deterministic `npm run verify`, rejects generator-owned
  outputs whose bytes changed during verification, checks
  whitespace with `git diff --check HEAD --`, and runs the live production audit
  through `npm audit --omit=dev`.
- Preexisting unrelated working-tree changes do not fail the generated-output
  check. Any generated diff created by verification must be reviewed and
  committed before rerunning the release gate.
- Confirm `dist/_headers` and `dist/service-worker.js` exist in the exact artifact being deployed.
- Confirm the Cloudflare deployment includes `functions/audio/`; a dist-only upload does not satisfy the media gate.
- Review the printed JavaScript, CSS, service-worker, and largest-static-asset sizes. Raise a budget only with contributing filenames and a documented product reason.

## Content Truth

- Confirm Readings & Coverage matches the generated public manifest and the actual published media.
- Treat browser-local Cue Drafts as authoring state only. They must never upgrade or downgrade public readiness.
- Open one available, one planned, and one needs-review reading. Verify the labels describe what a visitor can actually use.
- Regenerate twice when Cue Data changes and confirm the second run produces no diff.

## Deployed Media

- On the deployed origin, request an available recording with `HEAD`; verify a valid media type and length.
- Request `Range: bytes=0-1023`; verify `206`, `Accept-Ranges: bytes`, an exact `Content-Range`, and `Content-Length: 1024`.
- Request a suffix range and an unsatisfiable range; verify a correct suffix response and `416` with `Content-Range: bytes */<length>`.
- Test `If-Range` with both a current and stale validator. Confirm playback seeks from the beginning, middle, and near the end.
- Do not infer proportional origin bandwidth from app tests. Confirm the CDN or storage origin itself serves native range responses before claiming that benefit.

## Security Headers

- Inspect `/`, `/reader/`, and a media response on the deployed host. Confirm HSTS, `nosniff`, referrer policy, permissions policy, and the intended frame policy are present.
- Keep CSP in `Content-Security-Policy-Report-Only` while auditing Home, Reader, search, settings, Cue Authoring, audio, video links, and the live prototype iframe.
- Review browser CSP reports or console violations on a staging deployment. Enforce CSP only after every required source is explicit and the same build passes this checklist.
- Confirm every inline script hash from the deployed HTML appears in the deployed `_headers` policy and the CSP line remains within the host limit.
- Remember that a static host's `_headers` rules may not govern Function responses; inspect the deployed audio Function separately.

## Product And Accessibility

- Exercise desktop and touch layouts at 320, 390, 550, 551, 870, and 1280 CSS pixels without horizontal clipping or unreachable controls.
- Test light and dark themes, 200% zoom, reduced motion, and forced colors.
- Complete the Reader with keyboard only: choose a reading, search, change settings, select an aliyah, play/pause, seek, change speed, and dismiss every overlay.
- When the release catalog has two narrators for the same reading, switch between them and confirm playback, highlighting, and the active recording identity all change together. Record `Not applicable` when no real catalog pair exists; do not invent demo media.
- Verify visible focus, focus return, Escape behavior, progress announcements, loading, empty, offline, failure, and retry states.
- Confirm typing or selecting text never triggers presentation shortcuts.
- Record the incumbent contrast waiver from `docs/release-operations.md`; do not describe the exact automated exception inventory as full WCAG AA conformance.

## PWA And Devices

- Test first load, offline relaunch, and reconnect after the service worker has installed.
- Start one recording Offline Download from Reader Settings, observe progress, relaunch offline, and verify playback plus beginning/middle/end seeks. Remove it and confirm offline playback fails honestly while network playback still works after reconnecting.
- Deploy a second build over an installed copy. Confirm the update notice is understandable, reloads safely, and does not trap the user on a stale shell.
- Corrupt each persisted preference payload once and confirm the app recovers to explicit defaults without blocking startup.
- On a real iPhone, test portrait and landscape, the home indicator, notch or Dynamic Island safe areas, audio interruption, background/foreground return, and installed Home Screen mode.

## Release Decision

- Complete a copy of `docs/release-evidence-template.md` with the deployed URL, commit, build identifier, date, browser/device matrix, known limitations, and rollback artifact.
- Publish only when automated and deployed gates pass. If a gate is intentionally waived, record the owner, user impact, and follow-up date.
