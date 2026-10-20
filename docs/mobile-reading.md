# Isolated mobile Reading

Indexed Torah readings show one complete aliyah in Reading mode when the shorter browser viewport dimension is at most 550 CSS pixels. Eligibility uses `window.innerWidth` and `window.innerHeight`, never physical screen dimensions or touch capability. Narrowing a desktop window or tablet split-screen enters the same isolated Reading view. Larger viewports, Match, physical pages, and unindexed readings retain continuous rendering. Crossing the breakpoint preserves the focal word, selected aliyah, playback, and saved side preference without adding history entries.

Resize updates share one ordered animation-frame transaction: viewport eligibility and side mode, toolbar/player/rail geometry, page layout, then markers and focal positioning. Repeated window and visual-viewport events coalesce, and passage text is rebuilt only when its isolation or side mode changes. Page measurements finish before progress and focal positioning are published.

Continuous desktop Reading retains its canonical side labels, Play buttons, and permalinks in both side modes. These reuse the same rendered badges, exact-start token resolver, word-form mapping, and playback actions as Match. Their positions participate in the shared layout transaction, including annotation changes and side swaps. Isolated Reading continues to use its rail and toolbar controls.

Reading centers its text column with balanced side margins and keeps the verse and aliyah controls outside the text. Hebrew stays right-aligned without justification, each pasuk starts a new line, and longer pesukim wrap naturally. Two Sided Reading has no vertical column divider; Match retains its existing layout and divider.

The rail includes every indexed division, including Maftir and special service
divisions. Beneath it, the left chevron advances and the right chevron goes back.
Their visible surfaces are 32 pixels, icons 16 pixels, and targets 44 pixels.
Endpoints are disabled. The rail can scroll horizontally. Landscape keeps the
rail, chevrons, player, and picker. A saved Two Sided preference falls back to
One Side in portrait and returns in landscape without rewriting preferences.

## Rendering and selection

`createIsolatedAliyahViewModel` resolves the complete final pasuk before the
display mounts. The optional passage projection filters emitted content while
retaining source page, line, column, fragment, and word coordinates. Boundary
context is loaded but not rendered. Missing data produces the reader's retry
state; retry reloads the document because failed module imports are cached.

One selected run and aliyah controls navigation, progress, and playback. A new
selection clears the previous passage immediately, pauses playback, and opens
the destination at its beginning. Superseded loads and restorations cannot
commit. Selecting the current rail item is a no-op.

The token identity index maps pointed and unpointed words through the existing
maqaf and ketiv/qere projection. Exact bookmark keys and labels retain the
existing storage schema. Old labels disambiguate coordinates shared by different
text forms; an ambiguous saved position reports an error rather than guessing.
No bookmark is rewritten on load. Explicit links precede normal resume, which
continues to save an aliyah-start checkpoint.

## Playback and native compatibility

Play authorizes media synchronously within its user gesture, then awaits
selection and complete mounting. The existing portion dialog, recording
segments, logical timeline, cross-file seeking, and cancellation remain in use.
Partial recordings do not reduce displayed text. Segment chaining may continue
within the selected playback passage; completion does not select another aliyah.

Web parsing and `TikkunSystem.PracticeStore` accept the same new aliyah suffixes
and canonical Torah references. The native contract fingerprint includes this
Swift validator. A native web update must target a newly built native app with
the matching contract; exporting a new target from an old binary is insufficient.
The existing update tooling rejects an incompatible native target. No update
bundle or release is prepared by this implementation.

## Verification

`npm run test:phone` runs the real Reader in Chromium and WebKit phone fixtures,
including rotation, saved side preferences, rail/picker navigation, rapid Play,
Back/Forward, overlapping and legacy bookmarks, special service divisions, and
missing-boundary recovery. These fixtures emulate touch and screen dimensions;
they are not physical-iPhone evidence. Focused Node and component tests cover
cross-page final verses, source identities, eligibility, projection, and guards.

Physical iPhone acceptance remains pending at the owner's request. Before
release, test Safari and native Tikkun rotation, actual playback and chaining,
Play-triggered selection, saved side preference, bookmarks, and cold/warm deep
links on an unlocked device. Existing idle-dimming protection and maqaf wrapping
remain part of the reader and should be included in that device pass.

### Local verification, 2026-10-15

- Done: 306 focused Node checks and 20 native-update/build contract checks.
- Done: 149 route, playback, and phone integration checks (including all 32
  Chromium/WebKit phone cases), plus 7 partial-passage/dialog/keyboard checks.
- Done: 48 focused renderer, maqaf, and arrival-cue checks across both engines;
  6 native Swift route/storage tests; type checking, Svelte checking, and lint.
- Done: production build and live portrait/landscape, light/dark/sepia,
  enlarged-text, desktop, narrowed-desktop, tablet split-screen, Match,
  loading/error/retry, and player captures. Chromium audio continued through
  rotation with the same selected aliyah.
- Pending: the physical iPhone acceptance described above and a matching native
  binary before publishing a native web update.

The broader suite is not entirely green. Unchanged HEAD `93301ba0e95c`
reproduces the early-theme CSP hash assertion, two search assertions, and the
date-sensitive responsive Reader title assertion. The build also retains its
existing shell-precache budget warning (1,801,486 bytes versus 1,610,000).
These unrelated failures and the budget limit were not changed in this work.

### Viewport and desktop-controls follow-up, 2026-10-15

- Done: 38 focused Node checks; 170 page-layout checks, 72 reader controls/admin audio checks, 24 arrival-cue checks, 38 focused display/initial-position checks, and 40 window/phone checks across Chromium and WebKit.
- Done: exact focal-token restoration at 550/551 pixels, rapid viewport reversals, scrolling away from a paused highlight, unchanged history and saved side preference, desktop side labels and Play/Pause in both side modes, shared starts, maqaf wrapping, annotation changes, and Match regression coverage.
- Done: live Chromium/WebKit Play/Pause with advancing audio time, portrait/landscape captures, no page errors, type checking, lint, and production build. The 28-step Chromium resize probe reduced layout recalculations from 537 to 89 for One Side and 1,081 to 168 for Two Sided; Two Sided word-style writes fell from 64,288 to 9,926. These are local counts, not physical-device performance claims.
- Done: the existing landscape player uses a horizontal control row in isolated Reading, keeping the edge navigation buttons reachable. Live Chromium and WebKit checks cover playback, speed changes, expansion, collapse, and navigation pausing audio.
- Existing limitations: the three ScrollDisplay centering/previous-page failures also reproduce in the unchanged HEAD copy. The successful build still reports the existing shell-precache budget warning, now 1,812,413 bytes versus 1,610,000. Physical iPhone acceptance remains pending.
