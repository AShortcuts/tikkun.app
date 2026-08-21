# Release Evidence: `<version or date>`

Copy this file for each release. Replace every placeholder; use `Not run` or
`Failed` explicitly instead of leaving a field blank.

## Identity

- Commit: `<full SHA>`
- Build/artifact identifier: `<identifier>`
- Built at: `<UTC timestamp>`
- Deployed URL: `<canonical URL>`
- Previous known-good artifact: `<artifact identifier or location>`
- Release owner: `<name>`

## Automated Evidence

- `npm ci`: `<pass/fail, environment>`
- `npm run generated:check`: `<pass/fail, test count>`
- `npm run verify`: `<pass/fail, test counts>`
- `npm run verify:release`: `<pass/fail, generated drift and whitespace result>`
- `npm audit --omit=dev`: `<result>`
- Build budgets: `<largest JS, CSS, service worker, and static file>`
- Generated-data second run: `<no diff/failure>`

## Deployed Evidence

- Security headers and CSP: `<pass/fail, routes checked>`
- Audio HEAD/range/suffix/416/If-Range: `<pass/fail, recording>`
- Beginning/middle/end seek: `<pass/fail, browser/device>`
- First install/offline relaunch: `<pass/fail>`
- Recording Offline Download: `<progress, offline relaunch, range seeks, removal>`
- Service-worker install/reload recovery: `<pass/fail>`

## Browser And Device Matrix

| Browser/device | Viewport/mode | Journeys completed | Result |
| --- | --- | --- | --- |
| Chromium desktop | `<size>` | `<journeys>` | `<pass/fail>` |
| Chromium touch | `390 CSS px` | `<journeys>` | `<pass/fail>` |
| Safari macOS | `<version>` | `<journeys>` | `<pass/fail>` |
| Safari physical iPhone | `<model/iOS>` | `<journeys>` | `<pass/fail>` |

## Accessibility And Usability

- Keyboard-only Reader journey: `<pass/fail>`
- Same-reading narrator switch: `<pass/fail/not applicable; recording pair>`
- VoiceOver Reader journey and Hebrew reading order: `<pass/fail>`
- 200% zoom, reduced motion, forced colors: `<pass/fail>`
- Five uncoached readers: `<count/result/notes>`
- Incumbent contrast waiver: `<accepted/rejected; owner; review trigger>`

## Decision

- Known limitations: `<list or None>`
- Waived gates: `<gate, impact, owner, follow-up date or None>`
- Rollback trigger: `<observable condition>`
- Decision: `<release/hold/rollback>`
- Decision timestamp: `<UTC timestamp>`
