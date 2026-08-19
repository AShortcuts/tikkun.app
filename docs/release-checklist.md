# Release Checklist

Use this checklist for a public release. `npm run verify` is necessary, but a
local build cannot prove CDN, installed-PWA, or real-device behavior.

## Automated Gate

- Run `npm ci` with the repository's pinned npm version.
- Run `npm run verify`; do not publish with skipped or retried failures.
- Run `npm audit --omit=dev`; production dependencies must have no unaccepted vulnerability.
- Run `git diff --check` and review generated-data diffs as source changes, not hand edits.
- Confirm `dist/_headers` and `dist/service-worker.js` exist in the exact artifact being deployed.
- Confirm the Cloudflare deployment includes `functions/audio/`; a dist-only upload does not satisfy the media gate.
- Review the printed JavaScript, CSS, service-worker, and largest-static-asset sizes. Raise a budget only with a documented product reason.

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
- Verify visible focus, focus return, Escape behavior, progress announcements, loading, empty, offline, failure, and retry states.
- Confirm typing or selecting text never triggers presentation shortcuts.

## PWA And Devices

- Test first load, offline relaunch, and reconnect after the service worker has installed.
- Deploy a second build over an installed copy. Confirm the update notice is understandable, reloads safely, and does not trap the user on a stale shell.
- Corrupt each persisted preference payload once and confirm the app recovers to explicit defaults without blocking startup.
- On a real iPhone, test portrait and landscape, the home indicator, notch or Dynamic Island safe areas, audio interruption, background/foreground return, and installed Home Screen mode.

## Release Decision

- Record the deployed URL, commit, date, browser/device matrix, known limitations, and rollback artifact.
- Publish only when automated and deployed gates pass. If a gate is intentionally waived, record the owner, user impact, and follow-up date.
