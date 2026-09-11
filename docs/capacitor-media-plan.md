# Capacitor, Media, and Storage Plan

Updated: 2026-09-10

Status: Local iOS implementation and release preparation are in place; device,
deployment and distribution acceptance remain open. Current remaining work is
consolidated in [iOS release checklist](ios-release-checklist.md).
Native distribution, offline practice, Media, and Storage remain the agreed scope.
Details below are implementation defaults and remain editable.

## Implementation Checkpoint

- Implemented: Capacitor 8.5.1 iOS/SwiftPM target, separate native static build,
  Reader entry, clean-route handling, safe-area host, and native service-worker
  opt-out. Audio resolves against the confirmed `https://tikkunreader.com` origin.
- Implemented: native hashless startup resumes an eligible recent reading or
  opens Reading Index. Explicit deep hashes and browser startup retain priority.
  Resume currently follows the existing 48-hour checkpoint policy.
- Implemented: worker `GET_RECORDING_LIBRARY` reports individual verified audio
  assets, removes corrupt entries, and exposes explicit inventory errors. This
  protocol now feeds the shared web queue, Settings controls, and Media/Storage tabs.
- Implemented: two active transfers per application owner, physical-asset deduplication,
  persisted manual retry offers, progress/verification states, per-request worker
  cancellation, and deferred deletion for every source in the current playback
  plan. Settings closure, Reader hash changes, and client-side navigation through
  public pages retain the queue owner in root-layout context.
  Cancelled work stays available for manual retry, without automatic resumption.
  Obsolete verified copies remain visible to cleanup. Cross-tab persistence uses
  Web Locks. Explicit web transfers now share two slots across tabs/worker versions
  through stable Web Locks; without worker Web Locks, the fallback is per worker.
  Cross-worker save/removal locks reject conflicting cleanup and deduplicate saves.
  Cross-tab playback Web Locks now retain every session segment through pauses
  and reject conflicting removal; retry is manual after the reading closes.
  Waiting web queue items now hold shared claims through cancellation/commit;
  conflicting selected/bulk removal refuses before deletion and asks the other
  tab to cancel first. Local removal cancels its own waiting items. Pending-batch
  quota reservations now coordinate participating tabs through persisted asset
  identities and Web Lock liveness. Full-page reloads
  still stop work and preserve retry intent.
- Implemented: native persistent media storage, bounded SHA-256 verification,
  atomic commits, cancellable URLSession transfers, local playback URL resolution,
  native queue intent, measured logical storage categories, and batch/per-file
  capacity preflight. Before persisting a new native batch, account for unique
  missing audio and existing queued/active work, retaining a 32 MiB reserve.
  Active native reservations include only their unwritten bytes; verified copies
  and bundled dependencies require no new allocation. Checks remain advisory,
  and unknown capacity does not block downloading. Settings identifies device
  storage and bundled core Torah correctly.
  iOS now contains required disk-space privacy declarations. These implementations
  have automated evidence, not yet complete native UI/physical-device acceptance.
- Implemented: separate package-readiness state and native bundled-cue checks,
  including tokenization compatibility, audio-only material, cancellation during
  preparation, and dependency-only retry while retaining verified audio. Native
  packaging verifies all 262 text-page and 70 cue source modules plus their emitted
  dependencies.
- Implemented: web text/cue dependency manifests matched to the exact client
  build, explicit preparation, size/SHA-256 verification, persistent cue caching,
  and subscriber-scoped cancellation. Shared core text is reused across recordings;
  no full-library cue download is implied. Settings can repair dependencies without
  removing or re-downloading saved audio. Browser cold-launch/update acceptance,
  dependency cleanup, and large-library scan performance remain open.
- Implemented: combined web audio/dependency batch preflight before queue intent
  is saved. The worker checks verified caches, deduplicates shared assets, includes
  already-active worker transfers, and reserves temporary-write overhead plus
  32 MiB. Unknown browser quota stays unknown; low-space rejection suggests cleanup
  or smaller selections. A missing dependency manifest is fetched and verified
  for estimation without committing it. Cross-tab reservations retain conservative
  full-batch staging capacity until completion/cancellation and reclaim dead owners.
- Implemented: native AVPlayer engine, session-scoped Capacitor commands, logical
  timeline mapping, Reader adapter, foreground highlight resynchronization,
  interruption/headphone handling, and Now Playing integration. Native segment
  progression no longer relies on WebView animation frames. Authoring's local
  microphone/blob playback retains its existing browser implementation.
- Verified: native web packaging excludes the bulk audio library; iOS Simulator
  builds and displays the styled Reader with safe areas. The production audio
  host returns byte ranges and permits cross-origin access for the sampled file.
- Verified: a production recording played in Simulator, advanced from 13 seconds
  to 107 seconds while backgrounded/locked, and restored the current highlighted
  word on foregrounding. Native engine tests exercise trimmed segment progression.
- Open milestone 1 gates: physical-iPhone offline launch/local recording,
  interruption/headphone verification, system controls, and full web release
  verification. Lock-screen controls did not appear in Simulator and remain an
  explicit acceptance gap. The full Chromium run also has three non-playback
  failures recorded in the native development guide.
- Implemented: lazy Media/Storage destination from Reader controls, navigation
  search, and Settings. All 54 canonical parshiot, book grouping, actual aliyot,
  search, narrator scope, downloaded filtering, individual downloads, cancellation,
  fixed-width partial/completed controls, and confirmed library batches are wired
  to the shared queue. Range-based catalog entries use Other Readings when present.
- Implemented: native/web measured storage ring, separate capacity, explicit
  unknown/error states, reading/narrator filters, size ordering, selection and
  confirmed removal. Playback-dependent removal remains pending until released.
  Shared required content and personal data are not removed by audio cleanup.
- Implemented: iOS-style Media/Storage controls and presentation, including
  segmented tabs, system UI typography, adaptive light/dark surfaces, native
  pickers and fixed-size download controls. Reader layout and queue behavior
  are unchanged. Current browser and native-package verification is recorded in
  [the release checklist](ios-release-checklist.md#latest-ui-package-verification);
  this presentation update has not yet been installed for native UI acceptance.
- Verified in Simulator: native Media entry, a 501,397-byte Beresheet aliyah 5
  download, `1/7` state, measured audio/metadata growth, local `file:` playback with
  highlighting, and download preservation after app replacement/relaunch.
  User confirmed manual scrolling works. Automated gestures did not move either
  the new panel or the existing Reader; this is an automation limitation, not
  evidence of a panel scrolling defect. The current native build now passes the
  Storage selection/confirmation/removal/re-download handlers when driven through
  its live WKWebView DOM: audio bytes 501,397 -> 0 -> 501,397, empty temporary
  storage throughout, and `1/7` restored without changing the reading. This is
  native bridge/UI-handler evidence, not physical-device touch acceptance.
- Verified and repaired: route reset previously allowed pending cleanup before
  native clear acknowledged release. Retention now spans normal route/session
  changes as well as teardown. The installed simulator build passes playback,
  pause, deliberately delayed clear, deferred removal and re-download. A guarded
  run on the pre-fix build reproduced premature removal without deleting the file.
- Implemented: Share Reading creates public reading links through the iOS share
  sheet, browser Web Share, or clipboard fallback. Mobile Reader menu and desktop
  toolbar use one sharing interface. Native sheet presentation and payload were
  verified in Simulator.
- Implemented: existing aliyah permalink copying uses the native Clipboard plugin
  and public HTTPS links. Browser URLs remain deployment-relative; duplicate,
  failure, retry and detached-control states are covered in Chromium and WebKit.
  Simulator bridge writes and explicit-reading reload pass. Phone gutter buttons
  remain hidden by existing layout rules; phone sharing uses Share Reading.
- Implemented: app-lifetime incoming reading links through the official Capacitor
  App plugin, startup ordering, origin/route validation and public-page navigation
  without recreating the download owner. Simulator scene delivery and launch-URL
  lookup passed; website association deployment and signed-device handoff remain.
  Bundle ID is now the user-confirmed `com.adamn.tikkunreader`.
- Implemented: native media-service reset recovery rebuilds audio and Now Playing
  objects, preserves the logical position and requires explicit Play before retry.
  Native engine tests cover active/paused/loading/ended/empty sessions; actual
  iOS service-reset and system-control acceptance remain physical-device gates.
- Implemented: Tikkun-branded native icon and launch mark from the existing favicon,
  plus microphone usage text for the existing user-triggered recording tools.
- Next dependent work: Universal Links deployment/device acceptance, physical-device cleanup/listening acceptance,
  and full web offline/update
  acceptance. Cache-budget repair passed
  the checkpoint below. TestFlight
  signing, store metadata, physical-device gates, and release remain open.

Build commands and current limitations: [Native development](native-development.md).

Foundation verification (2026-09-10, before Media UI): 104 focused Node tests and 27 Chromium tests
passed; TypeScript/Svelte/ESLint passed. Native web packaging passed at 431 files /
6,014,015 bytes with no bulk audio. At that checkpoint, the full web build compiled but failed the
unchanged shell budget: 74 URLs / 1,693,801 bytes versus 67 / 1,610,000. No production
worker was finalized and no deployment was performed at that checkpoint. The later
budget repair below supersedes that blocker without increasing limits. The worker-restart result is a protocol test,
not a complete PWA/physical-device acceptance result. That full web build predates
the Media UI; its release budgets must be remeasured before publishing.

Media verification (2026-09-10): 44 focused Node tests, 35 Chromium tests, and the
final 6 Media tests in both Chromium and WebKit passed (Chromium overlap with the
regression run). TypeScript/Svelte/ESLint passed. Live Reader
entry points were exercised at 390 and 1280 pixels: 54 parshiot, unchanged reading
hash, and no page runtime errors. Development has no installed production worker,
so it is a UI preview, not offline-download acceptance. Native web packaging and
Xcode installation/launch passed; see native-bundle-report.json for current bytes.
Additional final accessibility checks are recorded in the native development guide.

Native batch-preflight verification (2026-09-10): 80 offline Node tests,
25 Chromium Media/Settings tests, and 7 Media WebKit tests passed. Swift media
tests passed 14 deterministic cases; the production-network case was intentionally
skipped. TypeScript/Svelte/ESLint and Xcode build/install/launch passed. Native web
bundle: 433 files / 6,047,227 bytes, excluding bulk audio. This is not evidence of
real-device low-disk behavior or web batch quota acceptance.

Web batch-preflight verification (2026-09-10): 134 focused Node tests and 25
Chromium Media/Settings tests passed; TypeScript/Svelte/ESLint passed. A separate
real-worker fixture in Chromium and WebKit rejected an oversized batch with empty
intent/inventory and no audio request, then downloaded, removed, and re-downloaded
a tiny fixture through the actual shared queue, worker protocol, and CacheStorage.
No production audio was downloaded. This does not replace full-app PWA acceptance.
At that checkpoint the full web build compiled but failed the unchanged shell budget at 76 URLs /
1,728,535 raw bytes versus 67 / 1,610,000. No final production worker or deployment
was produced; the following repair supersedes that build blocker.

Web budget repair (2026-09-10): full `npm run build` now passes unchanged limits.
Shell: 67 URLs / 1,545,820 raw bytes. Largest Reader CSS: 146,573 bytes. Generated
worker: 38,610 raw / 11,647 gzip bytes. Informational routes and their decorative
background are deferred; core Reader, picker, Media, Settings, and Reading Index
remain offline-capable. Picker CSS loads in its original layer with its lazy entry;
the generated worker is minified without protocol property mangling.

Verification: 135 focused Node tests, 88 Chromium/WebKit picker/Media/Settings tests,
and TypeScript/Svelte/ESLint pass. The compiled worker passes real-browser batch
rejection/download/removal/re-download fixtures in both engines. Production-bundle
Chromium passes cold offline Reader (after explicit Torah download), picker, Media,
Storage, Reader Settings, and Reading Index at 390/1280 pixels with no page errors.
WebKit renders those surfaces with the origin server shut down, but its clean-error
check fails on unavailable optional audio/cue/tool/font/background resources and a
`Context is stopped` diagnostic. Playwright offline emulation also produces an
internal WebKit cold-navigation error. These remain acceptance investigations, not
a clean WebKit/PWA release claim. No deployment or new native installation occurred.

Downloaded-package verification (2026-09-10, supersedes the package-level WebKit
uncertainty above): explicit packages now include the lazy playback-tools module
and its static dependencies. Previously it was excluded even though combined
recordings require its duration/dialog helpers. It remains outside startup precache.
Missing emitted playback dependencies fail manifest generation instead of producing
a success-shaped incomplete package.

Using the actual production bundle and local recordings, Chromium and WebKit at
390 x 844 passed: open Media from a different reading, download all seven Beresheet
aliyot, close the page, make the origin unavailable, cold-open Beresheet, play with
word highlighting, seek to 60%, remove aliyah 5 through Storage, observe `6/7`, then
reconnect and re-download to disabled `Downloaded`. Both had zero page runtime
errors and no failed compiled-module requests. Only the expected offline worker
availability probe and interrupted media requests remained in diagnostics.
The Vite-preview startup failure did not reproduce with the plain static verifier
server; it is not evidence that downloaded packages lack the core shell.

138 focused Node tests, TypeScript/Svelte/ESLint, and full production build passed.
Shell size remains 67 URLs / 1,545,820 bytes; worker gzip is 11,642 bytes. No limits
were raised. This is browser cold-page acceptance, not installed-PWA worker-update,
browser-process restart, combined-recording playback, physical iPhone, or native
deletion acceptance. Those gates and global queue/lifetime coordination remain open.

Transfer coordination verification (2026-09-10): explicit web audio, dependency
manifest/modules, and Torah-page downloads share two transfer slots, retained until
cache commit/cleanup finishes. Real compiled workers registered separately as two
versions shared the same deployment locks in Chromium and WebKit: peak two server
transfers, cancelled waiting audio never fetched, active cancellation released a
slot, retry succeeded, and all locks were released afterward. Four Node regressions
and a real-browser lock regression are included in the repository; the focused run
passed 142 Node tests and the browser regression passed in both engines.

Production offline playback/highlighting/seek/removal/re-download still passes in
both browsers. TypeScript/Svelte/ESLint, static build and unchanged budgets pass;
final worker is 40,117 raw / 12,130 gzip bytes. The shell remains 67 URLs /
1,545,820 bytes. Application-wide lifetime, quota reservations, cross-tab removal,
native/device/update/release gates remain open. This is not a claim that all queue
coordination or the complete Capacitor milestone is finished.

Application-lifetime verification (2026-09-10): root-layout context now owns one
lazy library, its platform backend, dependencies, and refresh listeners. Reader
mounts attach playback protection and panel subscriptions, not queue ownership.
Native teardown retains protection until the clear request acknowledges success.
SSR/app roots are isolated; final teardown aborts transfers but retains retry intent.

Public links use client navigation. Reader's imperative component roots are
disposed before the route DOM swap, fixing a reproduced blank About page. Public
global CSS is scoped away from Reader; navigation restores its original paper,
font, overflow and color scheme. Public pages remain vertically scrollable.

50 focused Node tests and 23 browser tests per engine passed, including real-route
round trips and history back/forward. TypeScript/Svelte/ESLint pass. Actual built
Chromium/WebKit Media tests held two audio transfers open while navigating Reader
-> About -> Reading Index -> Reader: no document reload, no aborted transfers,
each of seven files fetched once, and the same control ended disabled `Downloaded`.
Screenshots checked at 390 x 844 and 1440 x 1000. The prior offline package flow
also passed after the lifetime change; final-artifact evidence is in the native
development guide.

Final build: 65 shell URLs / 1,548,169 raw bytes, worker 40,032 raw / 12,092 gzip.
Three unreferenced legacy SVGs no longer enter startup precache; files remain
available on demand. All build limits remain unchanged. No native build, device
install, deployment or App Store action occurred in this checkpoint. Cross-tab
removal ownership, durable pending-batch reservations, and native/device/update/
release acceptance remain open.

Cross-worker mutation verification (2026-09-10): explicit recording saves and
cleanup now use deployment-scoped library/physical-URL locks. Participating worker
versions cannot delete a file while another saves it; unrelated targeted removal
still works. Bulk removal excludes accepted worker saves until deletion tasks
settle. Conflicting cleanup returns a visible retry error rather than waiting and
unexpectedly deleting a newly saved file. Duplicate saves recheck verified cache
after acquiring ownership and fetch the physical body only once. Missing worker
Web Locks refuses explicit removal and keeps saved files; it does not silently
claim coordinated cleanup.

148 focused Node tests, five lock tests per browser engine, and TypeScript/Svelte/
ESLint pass. Two real compiled worker versions sharing a cache passed in Chromium
and WebKit: rejected matching/bulk cleanup during saving, successful unrelated
cleanup, one fetch for duplicate saves, removal/re-download/clear-all, and no
remaining held/pending locks. Existing transfer-cap/cancellation and production
offline Media/playback/highlighting/seek/removal/re-download checks still pass.
Build: 65 shell URLs / 1,548,169 raw bytes; worker 41,002 raw / 12,390 gzip bytes.
All limits unchanged. Cross-tab playback protection, coordination of unsubmitted
queue intent, durable quota reservations, and native/device/update/release gates
remain open. This is not complete cross-tab deletion acceptance.

Cross-tab playback verification (2026-09-10): shared URL locks now cover every
published segment before a web session is installed, survive pause, and release
after media/preloads are cleared or the tab closes. Explicit worker deletion
requires exclusive playback ownership. Conflicts keep the recording and show a
retryable error; unrelated selected recordings can still be removed. This is not
a durable deferred-removal request in another tab.

Passed 72 focused Node tests and 27 browser tests in each of Chromium and WebKit.
The real production app passed two-tab paused-playback protection, unrelated
selected removal, tab-close release, retry and re-download in both engines.
The same run passed cold offline playback/highlighting, 60% seek, and `6/7` back
to disabled `Downloaded`. No page runtime errors; unavailable service-worker
network probes still log errors during deliberate offline operation. Build:
65 shell URLs / 1,549,643 raw bytes; worker 41,477 raw / 12,497 gzip bytes;
unchanged budgets. TypeScript, Svelte and ESLint pass. Native removal/device,
installed-PWA update, unsubmitted queue intent, durable quota reservations and
release gates remain open. See the development checkpoint for evidence paths.

## Outcome

Ship a branded iOS app through TestFlight, then the App Store, followed by Android.
Keep one shared Reader and website/PWA. Native launch opens the last reading or
Reading Index. Core text works immediately offline; users explicitly download
audio. Media and Storage become shared product features with platform-specific
storage implementations.

## Media Panel

- Add a single Media destination accessible from Reader navigation and Settings.
  Use a full-height sheet on compact screens and a roomy panel on wide screens,
  preserving the reading position and playback. Media and Storage are sibling
  tabs within this destination, avoiding stacked panels.
- List every parsha in Torah order, grouped by book, using the canonical reading
  catalog. Include search and All / Downloaded filters. Show an honest unavailable
  state where no recording exists.
- Use the current narrator; show a narrator selector when multiple choices exist.
  Counts, sizes, and batch actions always belong to the selected narrator. Storage
  totals include every narrator and expose that distinction.
- Each parsha row has its name, size of missing downloads, a disclosure chevron,
  and ONE fixed-width download control. Expanding reveals individual aliyot with
  real titles, size, download state, and individual download controls.
- Keep download and expansion actions separate. Downloading never starts audio,
  changes the current reading, or collapses the row.

### The Same Download Control Changes State

| State | Visible control | Behavior |
| --- | --- | --- |
| Nothing saved | Download all | Queue missing available aliyot for this parsha |
| Partly saved | 1/7, 2/7, etc., with download icon | Queue only remaining available aliyot |
| Queued | Queued | No duplicate queue action |
| Transferring | Byte progress indicator with completed count | Batch cancel available alongside progress |
| Verifying | Verifying | Wait for integrity and required assets |
| Fully saved | Check icon + Downloaded | Muted and disabled; no hover or deletion action |
| Failed | Retry, with completed count retained | Retry failed or unfinished assets only |
| No recordings available | Unavailable | Disabled |

The partial count has an accessible action name such as "Download remaining 6
aliyot for Bereshit". The original button retains its shape and location as its
label changes. Downloaded rows remain expandable. Removal lives in Storage.

Seven is the normal parsha denominator, not a universal recording assumption.
If only three of seven aliyot are published, show coverage as "3 of 7 available".
After those three are saved, show muted "3/7 saved" with no further download
action; do not imply complete seven-aliyah coverage. Derive actual coverage and
counts from authoritative catalog entries and verified local inventory.
Shared recordings, including maftir reuse, consume bytes only once. Preserve
range-based readings in a separate Other Readings group when present.

Provide a secondary "Download library" menu action for all available recordings
of the selected narrator. Before a large batch, show missing bytes, scope, and a
confirmation; never interpret a parsha's "Download all" as the entire library.

## Storage Panel

Use a Telegram-like segmented ring with measured Tikkun storage in its center.
Every segment has a matching text label and byte count; color is supplementary.
Show device space available for downloads separately below the ring. It is not
part of the app-usage denominator.

| Category | Contents | Removal policy |
| --- | --- | --- |
| App and core text | Installed executable, bundled web code, fonts, required text | Read-only; cannot remove inside app |
| Optional reading bundles | Downloadable text/cue packages, if any exist | Removable only when not required by saved recordings |
| Audio | Verified downloaded recordings | Remove individually, by parsha, narrator, or selection |
| Temporary files | Interrupted transfers, obsolete unreferenced assets | Clear safely; never delete active writes |
| Personal data | Preferences, bookmarks, drafts, local recordings/issues | Account for when measurable; excluded from download cleanup |

- No invented bundle products: bundle core Torah text with the native app first.
  Show optional bundle rows only for actual downloadable content. Do not count
  embedded text twice as both app bytes and bundle bytes.
- List downloaded assets with size and selection controls, sortable by size or
  reading order. Show selected reclaimable bytes before removal.
- Use "Remove downloads" and "Remove all audio downloads" for cleanup actions.
  Confirm bulk removal with scope and bytes; retain preferences, bookmarks, drafts,
  and personal recordings. Removing a download does not remove catalog content.
- Defer removal of files currently used by playback until released; show the
  pending state. Cancel affected queued transfers before removal so they do not
  recreate deleted assets. Retain shared cue/text dependencies while referenced.
- Refresh inventory and chart after each completed write/removal and on app resume.
  Show actual partial success and retry when deletion fails.
- Empty, scanning, unavailable, low-space, and error states must be explicit.
  Muted completed controls remain readable; chart values also exist as text.

### Honest Measurement

Native: measure installed bundle and owned files using platform APIs, consistently
distinguishing logical bytes from allocated disk usage. Label estimates; do not
promise exact agreement with iOS Settings. Prefer a maintained compatible plugin
for capacity reporting; otherwise add a small native Storage Metrics bridge.
Capacitor Device no longer exposes disk-free/total fields. Include required Apple
privacy declarations for disk-space APIs.

Web/PWA: use known cache asset sizes for categories and browser storage estimates
for origin usage/quota. Label quota headroom "Browser storage available
(estimated)", never "Device free space". Unknown values stay unavailable rather
than zero. Report unexplained overhead separately instead of forcing totals to
match. Do not enumerate or clear unrelated origin caches.

## Shared Architecture

Follow the existing architecture's platform-capability boundary and scoped mounts.
Keep parsha rules and playback timing in their current domain modules.

- Add a focused Download Library owner with catalog, per-asset inventory, queue,
  progress, subscriptions, and cleanup actions. Svelte views consume snapshots
  and semantic actions. This is feature state, not a new application-wide store.
- Compose that owner at the application boundary so downloads survive Media or
  Settings closing and Reader route changes. Panel teardown only unsubscribes.
- Adapt the existing selected-recording controller to the same owner. Existing
  Settings download/remove actions and new Media controls cannot disagree.
- Keep separate Web and Native storage/transfer implementations. Web reuses the
  existing worker's streamed verification and Range playback. Native stores
  explicit downloads in persistent app files, excluded from backup as appropriate,
  rather than purgeable cache. iOS uses a focused URLSession/MediaStore bridge:
  the official File Transfer API was evaluated but lacks cancellation. Keep
  Android plugin selection open until its parity work; reuse maintained plugins
  where their behavior meets the same contract.
- Generate stable asset descriptors: recording/narrator identity, URL, SHA-256,
  byte length, cue version, tokenization version, and dependencies. Reuse existing
  media identities. Add explicit identities for downloadable cue dependencies.
- "Downloaded" requires verified audio plus all published compatible timing/text
  dependencies needed for offline practice. Missing published timings allow
  audio-only downloads with honest timing availability; a failed timing download
  must not masquerade as a fully ready package.
- Commit only after validation. Stage replacements without deleting the last valid
  copy; switch atomically where supported. Never hold a whole recording in JS as
  base64. Reconcile inventory with actual files after interruption or app update.
- Start with two active transfers, deduplicate by asset identity, calculate batch
  progress from bytes, and persist queue intent. Cancellation preserves completed
  files and cleans unused temporary data. Relaunch offers retry for unfinished
  work; byte-offset resume is used only when server and transfer backend support it.
- Space preflight accounts for missing bytes, staging/replacement overhead, and a
  safety reserve. Disk checks are advisory; handle out-of-space during writing.
  Offer smaller selections or Storage cleanup instead of silent eviction.
- First release does not promise transfers while suspended or force-quit. Prove
  interruption recovery. OS-managed background downloads can be added separately;
  background audio remains part of the first native milestone.
- Browser/PWA storage and native storage are separate. Do not promise automatic
  migration of existing browser downloads or personal data into the installed app.

## Implementation Sequence

Each milestone needs its acceptance evidence before the next dependent milestone.

1. **Prove the native boundary.** Inventory current assets, bundle size, clean
   routes, media URLs, cue delivery, and browser-only dependencies. Add Capacitor
   and an iOS build target that packages core reader/text assets, excludes the
   bulk audio library, and launches the Reader. Disable web service-worker/update
   behavior inside native builds. Resolve remote media URLs explicitly. Verify
   cold offline text launch, clean/hash routes, settings, safe areas, and one local
   recording on a real iPhone. Spike native background playback here, before UI
   work depends on the player implementation. Keep web builds unchanged.
2. **Build shared inventory and queue.** Extend worker inventory beyond aggregate
   counts and the active recording. Add the Download Library and dependency
   descriptors. Route existing Settings through it. Verify deduplication, partial
   batches, cue readiness, cancellation, multi-tab coordination, and reconciliation.
3. **Implement native downloads and metrics.** Add persistent file storage,
   streamed validation, staged commit, local playback URL resolution, storage
   measurements, and interruption cleanup. Verify airplane-mode relaunch, seeking,
   low disk space, failed verification, removal, and re-download. Audit existing
   persistence: replace unsupported browser facilities with narrow native adapters.
4. **Build Media and Storage.** Use shared Svelte components and project design
   conventions. Implement all row states, per-aliyah expansion, narrator/filter
   scope, library batches, ring chart, asset selection, and cleanup. Run browser
   accessibility and responsive checks plus native device checks. Verify all panels
   update from the same inventory without altering current reading or playback.
5. **Finish native listening and integration.** Ship background audio, lock-screen
   controls, interruption/headphone handling, speed and seek behavior, and exact
   highlight resynchronization on foregrounding. Add native sharing and deep links
   into readings. Keep audio position as the timing authority. Bundle updates follow
   store releases; define a versioned content-refresh contract if recordings/cues
   must update independently. Practice reminders remain a later optional feature.
6. **TestFlight and release.** Confirm store name, bundle ID, developer team, icon,
   and signing details before final packaging. Extend release evidence with native
   builds, privacy manifests, content attribution/rights, store screenshots,
   support/privacy URLs, update preservation, and real-device results. Run a small
   TestFlight cohort through download/practice/remove/re-download. Submit only
   after observed failures are resolved and release is authorized.
7. **Android parity.** Reuse shared Media/Storage and domain logic. Add Android
   storage metrics, back navigation, audio service/notification integration, links,
   and platform release configuration. Repeat equivalent device and interruption
   gates, then Play internal testing and store release.

## Acceptance Scenarios

- Saving one aliyah changes its parsha control to 1/7. Tapping that same control
  queues only the remaining six. After verification, it becomes disabled Downloaded.
- Expanding a fully saved parsha still works; removing one aliyah in Storage
  immediately restores a clickable 6/7 control and correct byte totals.
- Partial published coverage never claims all seven aliyot are available or saved.
  Shared/overlapping recordings never inflate storage totals.
- A never-before-opened downloaded reading plays and highlights after airplane-mode
  cold launch. Published audio-only material remains clearly audio-only.
- Leaving Media, changing readings, or reopening Settings preserves queue state.
  Killing and reopening the app never marks a partial file as downloaded.
- A content update retains a valid old copy until replacement succeeds and reports
  its version honestly; failed replacement cannot destroy offline practice.
- Selective and bulk cleanup release measured bytes without removing personal data,
  active playback files, core installed assets, or shared referenced dependencies.
- Native charts and web estimates retain distinct labels. Missing metric support
  does not produce fabricated space values or block otherwise usable downloads.
- Background/lock-screen playback survives normal interruptions and returns to the
  correct highlighted word. Native app updates preserve downloads and personal data.

## Scope and Follow-up

First release covers text, audio, compatible cue data, Media, Storage, and useful
native listening. Video downloads, cloud sync, accounts, widgets, and reminders are
not prerequisites. Their potential value can be assessed after TestFlight use.

Planning does not authorize a bulk library download or sustained rendering/build
job. Before agent-run work over 500 MB or sustained CPU/GPU work, provide the size,
runtime, and resource estimate and obtain the approval required by project rules.

## Documentation References

- [Current architecture](architecture.md) and [explicit offline media decision](adr/0004-explicit-offline-media.md).
- [Capacitor workflow](https://capacitorjs.com/docs/basics/workflow): native projects receive built web assets.
- [File Transfer](https://capacitorjs.com/docs/apis/file-transfer) and [Filesystem](https://capacitorjs.com/docs/apis/filesystem): native download progress and file storage.
- [Capacitor 7 migration](https://capacitorjs.com/docs/updating/7-0): Device disk-space fields were removed.
- [Apple available-capacity API](https://developer.apple.com/documentation/foundation/urlresourcekey/volumeavailablecapacityforimportantusagekey): capacity checks and required privacy declaration.
- [Browser storage estimates](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/estimate): approximate origin usage and quota.
