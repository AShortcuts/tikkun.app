# Native Development

Updated: 2026-09-10

## Current Target

iOS first, using Capacitor 8.5.1 and Swift Package Manager. The user-confirmed bundle
ID is `com.adamn.tikkunreader`; the owner confirmed team `5D862AQ8GV` on 2026-09-10.
Verify provisioning/signing before TestFlight. Native icon and launch
assets now use Tikkun's existing vector mark. The earlier `app.tikkun.reader` Simulator
installation and its data are separate and have not been removed or migrated.

Use the repository-pinned Node 22.23.2 and npm 11.19.0. Initial verification used
Xcode 26.6 and an iPhone 17 Pro simulator running iOS 26.5.

Current remaining work: [iOS release checklist](ios-release-checklist.md).
The dated checkpoints below preserve history, not the current task list.

## Consolidated Local Verification (2026-09-10)

- Completed web pending-batch capacity reservations using existing persistence
  and Web Locks. Tests cover concurrent admission, shared-asset deduplication,
  dead-owner reclamation, invalid persistence, cancellation, late acquisition,
  completion and destruction. Full missing/staging bytes stay reserved until a
  batch ends; this is conservative and does not guarantee physical disk space.
- Replaced Capacitor's template icon/splash with the existing Tikkun vector mark.
  Icon verified at 1024 x 1024 with no alpha. Added microphone usage text for the
  existing recording tools; permission flow remains a device acceptance item.
- Fixed a reproduced public-menu Escape race: native details state can change
  before Svelte's open binding. Both browser engines now pass that route check.
- Passed 202 focused Node tests, 144 Chromium/WebKit tests, 13 Swift playback tests
  and 14 Swift storage tests. One optional production-network Swift test was
  intentionally skipped. Final TypeScript/Svelte/ESLint and diff checks pass.
- Final web build passes unchanged budgets: 67 shell URLs / 1,556,858 raw bytes;
  worker 42,130 raw / 12,696 gzip bytes. Native sync: 441 files / 6,054,954 logical
  bytes, no bulk audio. Xcode Simulator build passed in 9.6 seconds, no diagnostics.
  Native web generation retains the known root/web TypeScript-config warning.
- Actual production-bundle Chromium and WebKit checks pass seven-aliyah download,
  cold offline playback/highlighting/seek, selected removal/re-download, paused
  cross-tab playback protection and tab-close release. No page runtime errors;
  intentional offline service-worker update probes still log network failures.
- No new Simulator takeover/install, physical-device acceptance, signed archive,
  website deployment, TestFlight upload or App Store submission in this pass.
  This is focused local verification, not a full release-suite or installed-PWA
  upgrade certification. Use the checklist for owner decisions and remaining gates.

Logs: `/tmp/tikkun-oneshot-{check,node,browser,build,native,playback,media,offline}.log`.
Xcode log: `build_sim_2026-09-11T00-12-30-987Z_pid19582_8b7daa6e.log` in the
XcodeBuildMCP workspace logs directory. These local logs are not shipped assets.

## Build Workflow

Clean-checkout repair (2026-09-10): a fresh temporary source copy reproduced a
Rolldown failure resolving missing `.svelte-kit/tsconfig.json`. Native packaging
now seeds web framework types only when absent, leaves existing web output alone,
derives ignored `tsconfig.native.json` from current compiler settings and checks
native-generated types after building. `npm run verify:native-clean` repeats this
test in a temporary source copy using installed dependencies and no bulk audio.
SvelteKit still emits its root-config extension suggestion; it is not suppressed.
The repaired clean fixture passed with 441 files / 6,054,939 bytes. The full Node
suite also passed 894 tests across 112 files; filesystem-watcher tests require
normal local permissions. Logs: `/tmp/tikkun-native-clean-check-final.log` and
`/tmp/tikkun-full-node-approved.log`. Neither result proves physical-device release.

Run from the repository root:

```sh
npm ci
npm run native:sync
npm run native:open
```

`native:sync` builds the native web assets, then runs Capacitor's iOS sync. In
Xcode, select the App scheme and an installed simulator, then Run. On a physical
iPhone, select the approved developer team and configure signing first.

For web-only native packaging verification:

```sh
npm run build:native
```

For a different media host:

```sh
TIKKUN_NATIVE_MEDIA_ORIGIN=https://example.org npm run native:sync
```

The default and confirmed production origin is `https://tikkunreader.com`.
Recordings stay under their catalog paths, such as
`/audio/yoni-davidov/beresheet/1.m4a`, with media digest query parameters intact.
Do not configure Capacitor `server.url` for production: the Reader must load its
bundled assets offline, not a hosted replacement.

## Generated Outputs

| Path | Purpose |
| --- | --- |
| `.native-site/` | Filtered static inputs, excluding bulk audio and host-only files |
| `.svelte-kit-native/` | Isolated native SvelteKit build output |
| `dist-native/` | Web assets packaged by Capacitor |
| `native-bundle-report.json` | Actual packaged file inventory and logical byte total |
| `ios/App/App/public/` | Capacitor's copied web assets |

These outputs are ignored by Git. Rebuild and sync after web changes before
running Xcode; rebuilding Swift alone does not refresh the packaged Reader.
Normal `npm run build` still produces `dist/` and the web service worker.

## Verification Checkpoint

- The initial native web bundle contained 428 files / 5,985,753 logical bytes;
  this is a dated measurement, not the installed app size or a budget. Recheck
  `native-bundle-report.json` after every build.
- Simulator compilation, installation, launch, clean Reader entry, styled text,
  and safe-area rendering passed. This is not physical-device evidence.
- A production request for bytes 0-31 of Bereshit aliyah 1 returned `206`, 32
  bytes, a matching `Content-Range`, and `Access-Control-Allow-Origin: *`.
- Focused tests cover HTTPS host validation, audio exclusion, URL versioning,
  native service-worker opt-out, native launch policy, and verified inventory.
- `npm run verify:quick` passed with 729 Node tests, 48 generated-data checks,
  clean TypeScript/Svelte diagnostics, and lint. The focused route and worker
  UI tests also passed. Full browser matrices and the web release build remain
  separate gates; this is not a complete release verification result.

### Native Playback Checkpoint

`ios/TikkunPlayback/` contains the AVPlayer engine and native tests. Run:

```sh
swift test --package-path ios/TikkunPlayback --scratch-path /tmp/TikkunPlaybackTests
```

The tests use tiny generated WAV fixtures and actual AVPlayer playback, not
mocked clocks. They cover trimmed segment progression, logical seeks, finite
duration discovery, invalid ranges, replacement, pause during loading, and late
callback rejection. These run on macOS; they do not prove iPhone audio routing.

`TikkunPlaybackPlugin` exposes session-scoped commands. On iOS 16 and later,
system controls use a player-bound `MPNowPlayingSession`; iOS 15 uses the shared
Now Playing interfaces. Notifications are reconciled on the main queue and
foreground snapshots use native audio position as their authority. Native state
revisions prevent delayed bridge replies from moving the Reader backward.

Observed on iPhone 17 Pro Simulator / iOS 26.5:

- Bereshit aliyah 1 loaded from the production host through the native bridge.
- Playback time advanced from 13 seconds before backgrounding to 107 seconds
  after background/lock/unlock; the Reader displayed the current highlighted word.
- The Reader's pause control stopped native playback. The simulator was left
  paused, not playing continuously after QA.
- Lock-screen controls did not appear. Their implementation is not acceptance
  evidence; verify on a physical iPhone and investigate before release.

Broader Chromium regression run: 580 passed, 3 failed. Failures are the existing
unlock-dialog copy assertion (`not a security control`), Two Sided Match width
(1364px against a 1281px maximum), and prototype-isolation timeout. Playback
integration tests passed. The unrelated rendering/copy work was not changed to
make this native checkpoint green.

## Shared Queue Checkpoint

The web Download Library now feeds existing Settings controls. It limits each
Reader owner to two transfers, retains verified audio across retries, supports
per-caller worker cancellation, persists unfinished intent, and defers removal
while any segment in the current playback plan references the file. Settings
closure does not cancel downloads. Hash-route changes retain this runtime owner;
navigation out of the Reader does not yet have application-wide ownership.

Verification on 2026-09-10:

- `npm run check`: TypeScript, Svelte (zero warnings), and ESLint passed.
- Focused offline/worker Node suites: 65 tests passed.
- Settings, Reader playback, native adapter, and app smoke Chromium suites:
  34 tests passed. Settings shared-queue cases run at 390px and 1280px.
- Real Chromium Web Locks persistence tests: 3 passed, including concurrent
  clients, corrupt data preservation, and explicit unavailable errors.
- Web compilation/static output succeeded, but release generation failed the
  unchanged service-worker precache budget: 72 URLs / 1,689,039 raw bytes against
  limits of 67 URLs / 1,610,000 bytes. This is not a release-ready web artifact.
  Build log: `/tmp/tikkun-web-build-queue.log`. No budget was raised.
- The native playback bridge registers lazily instead of registering as a web
  import side effect. Native adapter browser tests passed after that change;
  Xcode/Simulator were not rebuilt for this queue checkpoint.

At this queue checkpoint, stored meant verified audio only. Dependency readiness
and Media/Storage UI were implemented in later checkpoints. Batch quota preflight
was added later; global cross-tab transfer limits remain open.

## Native Storage Checkpoint

Native downloads and the first metrics bridge are now implemented. iOS uses
`ios/TikkunMedia/`, an actor-backed file store with URLSession download tasks.
The official File Transfer API was evaluated; its current API lacks cancellation,
so it could not satisfy the agreed per-transfer cancellation contract.

- Store: Application Support/TikkunMedia, excluded from backup. A verified media
  file and `asset.json` are committed together by moving their staging directory.
  Filenames are derived from asset identity; JS cannot select an arbitrary path.
  iOS recording files use protection until first user authentication so subsequent
  lock-screen segment loading is possible; this still needs physical-device QA.
- Integrity: SHA-256 and exact length, bounded 1 MiB reads, approved HTTPS audio
  origin, redirect checks, path/symlink confinement, and corrupt-copy reconciliation.
- Queue: the shared library selects native storage and atomic native intent files.
  No Web Locks or service worker is required in the native app. Progress is
  throttled and scoped to the current transfer generation.
- Playback: published segments resolve to verified local file URLs; absent files
  stream from the catalog URL. Corruption errors stay explicit. Catalog sources
  remain unchanged so cleanup protects every source in a playback plan.
- Metrics: logical app-bundle/audio/staging/metadata bytes and available capacity
  for important usage. A known low capacity rejects a new download with a visible
  message; unavailable capacity remains null and allows normal write/error handling.
  WebKit personal data and OS temporary overhead are not claimed as measured.
- Batch preflight: the shared queue passes unique missing audio plus existing
  queued/active audio to the native store before saving intent. The actor includes
  other active reservations once, subtracts reported written bytes, skips verified
  copies, and keeps a 32 MiB safety reserve. Commit moves staged media rather than
  copying it; old versions remain allocated until explicitly removed. Bundled
  text/cues need no extra download bytes. Each actual transfer rechecks capacity.
  This is advisory, not a permanent reservation for the whole batch: other apps
  can consume space afterward, and disk-write failures must still be handled.
- Privacy: the app manifest declares DiskSpace reasons E174.1 (download preflight)
  and 85F4.1 (user-facing storage reporting). No capacity data is uploaded.

Verification on 2026-09-10:

- Native media Swift tests: 11 passed, including an explicitly enabled production
  download of Beresheet aliyah 5 (501,397 bytes), checksum verification, reopened
  store inventory, and removal. The fixture came from the generated catalog and
  test files were cleaned afterward. Other tests cover active URLSession
  cancellation, HTTP failure, low/unknown capacity, corruption, and cleanup scope.
- Node offline suites: 47 passed, including the native bridge adapter.
- Settings/native-playback Chromium suites: 25 passed; the preceding focused run
  also passed the Reader playback suite. Native UI copy distinguishes device
  downloads from browser cache and omits the redundant core-Torah download button.
- TypeScript, Svelte (zero warnings), ESLint, and plist/project syntax checks passed.
- `npm run native:sync`: 428 files / 6,009,140 logical web-bundle bytes, no bulk audio.
- Xcode build/install/launch passed without compiler warnings. Latest build log:
  `~/Library/Developer/XcodeBuildMCP/workspaces/Tikkun-with-Highlighted-Audio-e334a9ef50c6/logs/build_run_sim_2026-09-10T14-26-14-018Z_pid19582_6ed6f942.log`.
- At this checkpoint, live Simulator interaction was blocked by the locked Mac.
  The later Media checkpoint verifies download/local-file playback through its UI.
  Runtime logs contain a generic `JS Eval error` before WebView-loaded; investigate
  this during unlocked UI verification rather than treating launch as proof.

Run deterministic storage tests with:

```sh
swift test --package-path ios/TikkunMedia --scratch-path /tmp/TikkunMediaTests
```

The production-network case skips by default. Enable it only by supplying
`TIKKUN_MEDIA_NETWORK_ASSET` as a JSON descriptor from the current generated audio
catalog (`audioId`, absolute HTTPS `url`, `digest`, `byteLength`). Keep network
fixtures small; this does not authorize downloading the full library.

## Bundled Dependency Checkpoint

On 2026-09-10, native downloads gained explicit dependency readiness. Published
cue modules must load, match the recording identity, and use the current text
tokenization. Absent or empty timings are audio-only; invalid or failed published
timings surface an error before audio transfer. Reconciliation keeps verified
audio bytes visible if supporting content fails, and retries reuse the audio.

Native packaging now checks every source JSON page/cue against the bundler's
module map and Vite dependency graph. A raw-text import can merge a page into a
shared chunk, so standalone manifest filenames alone are not sufficient evidence.
The bundle report records source SHA-256 digests and emitted dependency filenames.

Verification:

- `npm run build:native`: 430 files / 6,011,298 logical bytes, no bulk audio;
  262 text pages and 70 cue modules accounted for, including transitive assets.
- TypeScript, Svelte (zero errors/warnings), and ESLint passed.
- Focused Node suites: 62 passed, including native content coverage and dependency
  preparation/retry/cancellation. Settings/native-playback Chromium: 25 passed.
- Build log: `/tmp/tikkun-native-dependencies-build.log`.
- `cap copy ios` and Xcode build/install/launch passed without compiler warnings.
  Build log: `~/Library/Developer/XcodeBuildMCP/workspaces/Tikkun-with-Highlighted-Audio-e334a9ef50c6/logs/build_run_sim_2026-09-10T14-41-29-528Z_pid19582_16530220.log`.
- Live Simulator: Reader Settings and the native Offline section opened correctly;
  empty native inventory was returned; Beresheet aliyah 5 streamed with highlighting.
  Computer Use then repeatedly returned `noWindowsAvailable` on clicks despite
  screenshots and the accessibility window remaining available. Raising and
  reconnecting the window did not restore clicks. No native UI download was
  completed, so local-file playback through Settings is still unverified.
- The pre-WebView `JS Eval error` still appears in runtime startup logs.
  Web dependency caching and physical-device offline acceptance remain open.

## Remaining Gates

- Native SvelteKit output still suggests extending its generated configuration
  from the root config. Clean-checkout generation and separate native TypeScript
  checking now pass; the informational suggestion is retained without rewriting
  existing web output. See the clean-checkout repair above.
- Worker audio inventory is separate from the implemented text/cue dependency
  readiness protocol. Build-version matching, verified cache preparation, repair,
  and restart behavior have automated coverage; full browser offline/update
  acceptance remains unfinished. Media/Storage controls now have browser coverage.
- Native download persistence, local-media URL resolution, and metrics have
  automated coverage and the live Media checkpoint below. A simulator app
  replacement/relaunch preserved a download; physical-device kill/update and
  airplane-mode listening still require acceptance testing. User confirmed manual
  scrolling works; the complete native deletion UI flow still needs verification.
  Web and native data stores are separate; there is no automatic migration.
- Published recordings now use native AVPlayer segment progression. Background
  mode, audio-session activation/deactivation, system commands, and interruption
  handling are implemented. Lock-screen controls, physical-device interruptions,
  headphone removal, and media-services reset recovery still need verification
  or further implementation. Local microphone/blob playback remains web-based.
- Verify airplane-mode cold launch and never-opened text, local recording seek,
  settings persistence, and updates on a physical iPhone. Network success and
  simulator screenshots do not prove these cases.
- Finish branding, privacy declarations, deep links, sharing, signing, release
  checks, and TestFlight acceptance before App Store submission.

## Media UI Checkpoint (2026-09-10)

- `app/reader/MediaPanel.svelte` is a lazy Reader-owned destination with sibling
  Media/Storage tabs. Reader controls, navigation search, and Settings reach the
  same panel. Dialog focus and keyboard isolation preserve the underlying Reader.
- `app/offline/media-readings.ts` derives 54 canonical parshiot and actual aliyot
  from the calendar. `media-catalog.ts` joins narrator-specific logical readings
  to physical queue assets; complete counts require dependency readiness.
- `storage-metrics.ts` validates native metrics and measures only app-base-owned
  browser caches. It does not label an unchecked audio inventory as zero storage,
  mix device headroom into the ring, clear unrelated caches, or delete personal data.
- Verification: 44 focused Node tests, 35 Chromium regression tests followed by
  6 final Media tests (including axe and keyboard isolation), and 6 final WebKit
  Media tests passed. TypeScript, Svelte with zero warnings, and ESLint passed.
  Live browser checks at 390/1280 pixels exercised menu/Settings entry, tabs, 54
  rows, close, and unchanged reading hashes with no page runtime errors. The dev
  server has no production worker, so these are UI checks, not offline-web proof.
- Live Simulator: downloaded Beresheet aliyah 5 from the production origin
  (501,397 bytes), saw `1/7`, and measured 501,397 audio bytes plus 275 metadata
  bytes. Native resolution returned an Application Support `file:` URL; the
  62-second recording played with advancing highlights. Paused after verification.
  App replacement/relaunch preserved the verified recording and partial count.
- User confirmed manual scrolling works. CUA drag/scroll and native test
  swipes did not move either Media/Storage or the unchanged Reader. Instrumented
  Media measured a 661px viewport, 5,191px scroll content, and `overflow:auto`.
  This is an automation limitation; scrolling behavior was left unchanged.
  Native deletion UI was not reached; browser removal/confirmation
  and pending-playback tests pass. Temporary layout diagnostics were removed.
- Clean native web bundle: 433 files / 6,046,886 bytes, with no bundled audio.
  Copied into iOS, rebuilt, installed, and launched successfully after removing
  diagnostics. Build evidence:
  `build_run_sim_2026-09-10T15-50-23-648Z_pid19582_2f9a82e6.log`.
- Native startup still emits a generic `JS Eval error` before WebView-loaded.
  The duplicate Simulator accessibility-class warning also persists. Neither is
  treated as resolved by successful download or playback.
- Evidence: Simulator download/local-playback log ends
  `app.tikkun.reader_2026-09-10T15-30-50-986Z_helperpid62402_ownerpid19582_33b42b27.log`;
  preservation log ends
  `app.tikkun.reader_2026-09-10T15-35-10-692Z_helperpid72379_ownerpid19582_6c0e0757.log`.
  Both live in the XcodeBuildMCP workspace logs directory listed earlier.

## Native Batch Preflight Checkpoint (2026-09-10)

- Added `TikkunMedia.preflight` and a storage capability consumed by the shared
  queue, so Media and Settings use the same batch check. Low-space rejection
  neither persists the proposed intent nor starts a transfer. Smaller selections
  remain usable. Native dependency-only repair avoids an audio allocation check.
- Verification: 80 offline Node tests, 25 Chromium Media/Settings tests, and 7
  Media WebKit tests passed. Swift media tests: 14 passed, 1 opt-in production
  network test skipped. Cases cover duplicate assets, verified copies, replacement
  retention, active reservations/cancellation, unknown capacity, invalid identity,
  integer overflow, and destruction during preflight or intent persistence. TypeScript, Svelte (zero
  warnings), and ESLint passed.
- Native web packaging: 433 files / 6,047,227 bytes, no audio library. Xcode
  build/install/launch passed; saved Beresheet aliyah 5 remained visible as `1/7`
  and 501,397 audio bytes. Build log:
  `build_run_sim_2026-09-10T15-55-48-603Z_pid19582_1288a061.log`.
- Web quota checks also need versioned dependency accounting; see the subsequent
  web checkpoint. Real-device low-disk/write-failure acceptance remains open.

## Web Batch Preflight Checkpoint (2026-09-10)

- The dependency owner exposes combined audio/package preflight to the queue.
  `PREFLIGHT_RECORDING_DOWNLOADS` validates the client content version, recording
  identities and cue catalog, then measures missing audio, core text, timings,
  and the dependency manifest. Shared URLs are counted once. Already-active audio
  and dependency transfers from other clients of the worker are included.
- Temporary-write allowance uses the largest pending files, covering two
  concurrent writes or the currently observed active count when higher, plus a
  32 MiB reserve. Existing versions remain allocated; no cleanup is assumed.
  Cache reads can verify content, but preflight does not put/delete asset bodies.
  An absent manifest is fetched with bounded integrity verification, not cached.
  Aborting the queue owner cancels the preflight request before intent is saved.
- Browser quota uses `navigator.storage.estimate()` in the worker. Missing,
  malformed, or rejected estimates stay unknown (rejections are logged); actual
  storage errors still propagate. These are advisory checks, not a reservation
  against future writes by other tabs/apps. Other tabs' unstarted queues still
  require coordination. Native behavior continues through its separate backend.
- Verification: 134 focused Node tests and 25 Chromium Media/Settings tests passed.
  TypeScript, Svelte (zero warnings), and ESLint passed. Browser plugin unavailable;
  regular Playwright used for a temporary real-worker fixture at a dynamically
  assigned loopback port, separate from the existing development server.
  `/tmp/tikkun-web-preflight.mjs` exercised the real queue, web dependency/storage
  adapters, MessageChannel protocol, service worker, Web Locks intent, and caches
  in Chromium and WebKit. Both rejected an oversized request before persisting
  intent or fetching audio, then passed download/remove/re-download with an
  18-byte fixture. Final inventory was one file, intent empty, and no page errors.
  The temporary fixture server and browsers were closed after verification.
- At that checkpoint full web compilation/static output passed; worker finalization failed the
  unchanged shell budget: 76 URLs / 1,728,535 bytes versus 67 / 1,610,000. The
  resulting `dist` was not a release-ready PWA. No deployment or production audio
  download occurred. Full-app offline/update acceptance still needs verification.

Reference: [StorageManager estimates](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/estimate)
are available in workers and are approximate origin-level quota/usage, not exact
device free space.

### Web Release Budget Repair (2026-09-10)

- `npm run build` now passes all unchanged budgets: 67 shell URLs / 1,545,820
  raw bytes; largest JS 316,880 raw / 91,423 gzip; largest CSS 146,573 raw /
  22,708 gzip; worker 38,610 raw / 11,647 gzip. Largest static audio remains
  23,072,184 bytes. No numeric limit was raised.
- About, public Settings/diagnostics, Tidbits, their exclusive route bundles,
  and `home-ambient.jpg` are no longer installation requirements. Reading Index
  retains its shared layout; Reader Settings and Media remain precached. These
  exclusions affect the web startup cache, not native bundled text/cue policy.
- Picker CSS now belongs to its lazy feature entry, retaining the `feature`
  cascade layer and offline precache. esbuild 0.28.2 compiles/minifies the generated
  worker; it was already installed and is now an explicit dev dependency.
- 135 focused Node tests and 88 Chromium/WebKit picker/Media/Settings tests passed.
  TypeScript, Svelte (zero warnings), ESLint, and `git diff --check` passed.
  The minified worker also passed `/tmp/tikkun-web-preflight.mjs` in both engines:
  low-space rejection before intent/audio, then download/remove/re-download.
- Production-bundle Chromium passed cold Reader launch after explicit Torah
  download, first offline picker/Media/Storage/Reader Settings opening, Reading
  Index, and reconnected About at 390/1280 pixels with no page errors. Temporary
  Playwright screenshots under `/tmp/tikkun-offline-*` were visually inspected.
- WebKit's Playwright offline emulation failed cold navigation internally. With
  the task-owned origin server actually stopped instead, the same surfaces and
  reconnected About rendered, but the zero-page-errors assertion failed. Recorded
  failures reference optional passage-audio tools, undownloaded Beresheet cues and
  audio, Lora, the decorative background, plus `Context is stopped`. Do not suppress
  these blindly or count this as clean WebKit offline acceptance. Full downloaded
  recording packages, worker updates, and physical devices still require checks.
- Temporary test servers/browsers were closed. Existing development server was
  untouched. No production deployment, audio download from the live host, or new
  native build/install occurred during this repair checkpoint.

The editable scope and acceptance criteria remain in
[Capacitor, Media, and Storage Plan](capacitor-media-plan.md).

### Downloaded Package Acceptance (2026-09-10)

- Fixed a package dependency gap in `scripts/recording-dependency-manifest.mjs`:
  `app/reading/passage-audio-tools.ts` and its static dependency graph now join the
  verified core of explicit recording downloads. Its duration helper is required
  for multi-segment playback; its dialog/tooltip code stays lazy. This does not add
  startup precache URLs. Generator tests reject a missing emitted tools bundle and
  prove unrelated optional authoring tools are not included.
- `/tmp/tikkun-offline-package.mjs` exercises a production `dist`, not Vite source
  modules. A task-owned static server uses the existing verifier's byte-range
  parser and rejects network requests during the offline phase. Browser plugin
  unavailable; installed Playwright Chromium and WebKit were used at 390 x 844.
- Both engines passed real catalog/recording UI flows: from Noach, download all
  seven Beresheet aliyot; close that page; cold-open Beresheet with the origin
  unavailable; play aliyah 1; observe word highlighting; seek to 60% and observe a
  changed highlighted token; remove aliyah 5 in Storage; observe `6/7`; reconnect;
  re-download to disabled `Downloaded`. Inventory held seven verified audio files
  before the cold launch. The selected recording duration was about 641 seconds.
- Both runs had zero page runtime errors and no failed offline compiled-module
  requests. Expected diagnostics: the worker-script HEAD/update-availability probe
  cannot reach the offline origin; Chromium also reports media reads aborted by
  playback/seek changes. No console errors were silently filtered from the report.
  Results: `/tmp/tikkun-offline-package-result.log`; inspected removal screenshot:
  `/tmp/tikkun-package-webkit-removed.png`.
- A Vite-preview variant failed cold JavaScript loads despite intact cache bodies;
  this did not reproduce with the plain static server. Earlier WebKit shell-only
  runs also lacked deliberately undownloaded cues/audio. The full-package evidence
  above supersedes those as a claim about downloaded-package readiness, but does
  not erase the preview-tool limitations or prove deployment-specific headers.
- 138 focused Node tests and TypeScript/Svelte/ESLint passed. Full build passed:
  67 shell URLs / 1,545,820 raw bytes; largest JS 316,880 raw / 91,418 gzip;
  largest CSS 146,573 raw / 22,708 gzip; worker 38,610 raw / 11,642 gzip.
  No budget increase, live-host audio download, deployment, native rebuild, or
  existing development-server restart occurred.
- Still open: browser-process restart and installed-PWA upgrade acceptance,
  combined-recording playback, native removal/re-download UI, global queue/lifetime
  coordination, and physical-device/signing/release gates. The local test servers
  and browsers were closed after each completed run.

Implementation references: [Capacitor local plugins](https://capacitorjs.com/docs/ios/custom-code),
[AVPlayerItem boundaries](https://developer.apple.com/documentation/avfoundation/avplayeritem),
[Now Playing sessions](https://developer.apple.com/documentation/mediaplayer/mpnowplayingsession),
and [audio interruptions](https://developer.apple.com/documentation/avfaudio/handling-audio-interruptions).

### Shared Web Transfer Limit (2026-09-10)

- `scripts/offline-transfer-queue.mjs` supplies one local two-slot queue per worker
  and two stable, deployment-namespaced Web Locks shared across tabs/worker versions.
  Each task waits for either exclusive lock, cancels its losing lock request, and
  holds the selected lock until the full transfer/cache write settles. It never
  steals locks or treats acquisition failure as permission to transfer unlocked.
  Missing worker-side Web Locks falls back to a worker-local limit only.
- Wrapped recording downloads, verified dependency preparation, read-only manifest
  preflight fetches, and explicit Torah downloads. Ordinary streamed playback and
  runtime navigation/assets bypass this background-download queue. Audio/body
  readers are cancelled/released before freeing slots, including failed writes.
- 142 focused Node tests pass, including four scheduler tests. The repository's
  `scripts/offline-transfer-queue.vitest.ts` tests independent scheduler instances
  against actual browser Web Locks; Chromium and WebKit both pass. Its WebKit
  inclusion is explicit in `vitest.config.ts`.
- `/tmp/tikkun-transfer-coordination.mjs` additionally exercises two real compiled
  service workers with different build hashes and one deployment namespace. Both
  browsers measured peak two transfers across recordings, metadata, dependencies,
  and three Torah pages. Queued cancellation produced no fetch; active cancellation
  allowed the next task and later retry succeeded. Final held/pending locks: zero.
  Fixtures use tiny local bodies, not production network downloads.
- Production Media regression passed again in both engines at 390 x 844: seven
  saved aliyot, cold offline audio/highlighting, 60% seek, removal to `6/7`, and
  re-download to `Downloaded`, with zero page errors or failed compiled modules.
  Log: `/tmp/tikkun-transfer-package-result.log`.
- TypeScript/Svelte/ESLint and full static build pass. After final cleanup, worker
  regeneration and budget checks pass at 40,117 raw / 12,130 gzip bytes. Shell:
  67 URLs / 1,545,820 bytes. Limits unchanged; existing development server untouched.
  Temporary test servers/browsers closed. No native rebuild or deployment occurred.
- Remaining coordination: durable capacity reservations for unstarted work in
  other clients, cross-tab removal ownership, and moving queue lifetime beyond the
  Reader runtime. Native removal and physical-device/installed-PWA updates remain
  separate acceptance gates.

Lock semantics reference: [Web Locks request and lifetime](https://developer.mozilla.org/en-US/docs/Web/API/LockManager/request).

### Application-Lifetime Checkpoint (2026-09-10)

- Root-layout context owns a lazy DownloadOwner; Reader only borrows its library.
  Catalog/backend construction is isolated in `app/offline/recording-library.ts`.
  Focus, visibility and persisted-intent listeners survive public-route visits.
  Root teardown aborts active work without erasing retry intent. Full reloads,
  process termination and OS suspension are not background-transfer guarantees.
- Reader mounts release before SvelteKit replaces their DOM. This fixed a real
  blank About transition exposed by removing forced reloads. Public global styles
  are scoped away from Reader, preventing black paper/dark ink on return, while
  preserving public-page scrolling. Public Reader links now stay in the same app.
- Playback protection survives Reader teardown until native clear acknowledgment.
  The adapter's asynchronous-clear and failed-clear paths have browser tests;
  this is not a native bridge/device acceptance result.
- Passed: 50 focused Node tests; 23 Chromium and 23 WebKit tests, with the six
  public-route tests rerun in both engines after style isolation; TypeScript,
  Svelte (zero warnings), ESLint, and unchanged production budgets.
- `/tmp/tikkun-owner-navigation.mjs` tests actual production Media downloads.
  Two transfers remain deliberately unfinished during Reader -> About -> Reading
  Index -> Reader; all seven later finish exactly once, with no aborted transfers,
  document reloads or runtime errors. Both engines preserve Reader computed styles
  and public-page wheel scrolling. Final evidence: `/tmp/tikkun-owner-navigation.log`.
  Screenshots: `/tmp/tikkun-owner-{chromium,webkit}-{mobile,desktop}.png`, at
  390 x 844 and 1440 x 1000. Browser plugin unavailable; regular Playwright used.
- Final-artifact offline regression passed in Chromium and WebKit: seven saved
  aliyot, origin unavailable, cold Reader audio/highlighting, seek to 60%, remove
  aliyah 5 to `6/7`, reconnect and re-download to disabled `Downloaded`. Zero page
  runtime errors or missing compiled modules; expected offline service-worker
  availability/update probe warnings remain. Log: `/tmp/tikkun-owner-offline.log`.
- Build log: `/tmp/tikkun-owner-build.log`. Shell 65 URLs / 1,548,169 raw bytes;
  worker 40,032 raw / 12,092 gzip bytes. Three unused legacy SVGs stay shipped but
  no longer enter startup precache. No limits were raised. A simultaneous build/
  browser-test run corrupted generated dev route instrumentation; clean sequential
  reruns passed. Do not run those jobs against the same `.svelte-kit` concurrently.
- Existing development server was preserved. Native Simulator removal/redownload,
  physical-device tests, installed-PWA updates, durable quota reservations and
  cross-tab removal still need acceptance. No native rebuild, install or deployment
  was performed in this checkpoint.
  Final live check at `http://127.0.0.1:5176/reader/` rendered Reader with no runtime
  errors. All temporary verification servers and browsers were closed.

### Cross-Worker Mutation Checkpoint (2026-09-10)

- `scripts/recording-mutation-locks.mjs` adds shared library/exclusive URL ownership
  for explicit saves, nonwaiting targeted cleanup, and exclusive library ownership
  for clear-all/remove-others. Ownership spans cache commit or all deletion task
  settlement. Duplicate saves inspect verified cache after acquiring the URL lock.
  No byte body crosses the page/worker bridge.
- Cleanup conflicts return explicit errors without entering deletion. Missing
  worker Web Locks rejects explicit removal, preserving saved files; download's
  existing bounded fallback remains. This contract applies to participating worker
  builds, not older code that never acquires these locks. No released-worker
  compatibility layer has been added before first release.
- Passed 148 focused Node tests, including missing-lock/lock-error safeguards.
  Four mutation-lock browser tests plus the transfer-lock test passed in Chromium
  and WebKit. Older single-worker VM cache/protocol fixtures use an explicitly
  uncontended lock stub; those fixtures do not claim real contention coverage.
- `/tmp/tikkun-mutation-coordination.mjs` compiled two real workers sharing one
  cache. Both browsers passed: matching and bulk removal rejected during saving,
  unrelated removal allowed, duplicate save fetched once, subsequent removal,
  re-download and clear-all succeeded. Final held/pending locks and page errors
  were empty. Bodies were tiny local fixtures, not production-network downloads.
- Existing compiled-worker transfer regression also passed: peak two transfers,
  waiting cancellation never fetched, active cancellation/retry worked, dependency
  and Torah downloads finished, locks empty. Log: `/tmp/tikkun-mutation-transfer.log`.
- Final production offline Media flow passed both browsers at 390 x 844: seven
  saved aliyot, cold offline playback/highlighting, seek to 60%, selective removal
  to `6/7`, and reconnect/re-download to disabled `Downloaded`. Zero page runtime
  errors; expected unavailable service-worker probe warnings remain. Log:
  `/tmp/tikkun-mutation-offline.log`.
- TypeScript/Svelte/ESLint and full build pass. Logs:
  `/tmp/tikkun-mutation-check.log`, `/tmp/tikkun-mutation-build.log`.
  Shell: 65 URLs / 1,548,169 raw bytes. Worker: 41,002 raw / 12,390 gzip bytes.
  No budget increases, native build, installation, deployment or release action.
- Remaining: cross-tab playback leases, other tabs' queue intent not yet submitted
  to a worker, durable quota reservations, native removal UI, physical-device and
  installed-PWA updates. Mutation locking alone does not finish those contracts.

### Cross-Tab Playback Checkpoint (2026-09-10)

- `app/offline/playback-protection.ts` takes shared physical-URL Web Locks for all
  published session segments. `AudioController` installs the session only after
  acquisition; pause keeps the locks. Clearing audio and preloads releases them.
  Replacement/destroy abort pending acquisition; failure releases partial locks.
  Gesture-synchronous media authorization remains unchanged.
- Worker targeted and bulk removal require exclusive playback locks. Bulk worker
  endpoints check the entire deletion set first. Media selections use individual
  removals: a protected recording stays saved and unrelated selected files can be
  removed. Closing the other reading enables manual retry, not automatic deletion.
  Saving a playing recording remains allowed. This requires participating builds
  and Web Locks; it does not protect against old nonparticipating clients or turn
  corrupt-cache reconciliation into a playback-preservation guarantee.
- Passed 72 focused Node tests across AudioController, Download Library, generated
  worker, inventory and mutation locks. Chromium and WebKit each passed 27 tests
  across playback protection, Reader Playback, native controller and mutation
  locks. Tests cover later-segment protection, multiple readers, partial acquisition
  cancellation/failure and release timing. Chromium emitted a Vite SSR transport
  disconnect during test shutdown; no test failed.
- `/tmp/tikkun-playback-tabs.mjs` used the production `dist` build and local audio
  through a temporary static server. Browser plugin was unavailable; regular
  Playwright ran Chromium/WebKit at 390 x 844. Both passed: seven saved aliyot,
  cold offline playback/highlighting, seek to 60%, selective removal to `6/7`,
  re-download, then two-tab paused-playback protection. Selecting aliyot 1 and 5
  in the other tab retained the paused first recording, removed the unrelated
  fifth, and displayed the in-use error. Closing the reader released locks;
  retry removed the first; re-download restored seven verified files.
- Log: `/tmp/tikkun-playback-tabs.log`. Screenshots:
  `/tmp/tikkun-playback-chromium-protected.png` and
  `/tmp/tikkun-playback-webkit-protected.png`. No page runtime errors. Offline
  service-worker probes logged expected network errors; Chromium also cancelled
  superseded audio Range requests. No missing offline application chunks.
  The first attempt stopped on an ambiguous error-text selector; scoping it to
  the recording row allowed the complete run. Test browsers/servers were closed.
- TypeScript/Svelte/ESLint, diff whitespace check and production build pass.
  Logs: `/tmp/tikkun-playback-check.log`, `/tmp/tikkun-playback-node.log`,
  `/tmp/tikkun-playback-build.log`. Shell: 65 URLs / 1,549,643 raw bytes;
  worker: 41,477 raw / 12,497 gzip bytes. Budgets unchanged. No native build,
  install, production-network audio download, deployment or release this checkpoint.
- Remaining: other tabs' unsubmitted queue/removal intent, durable capacity
  reservations, native removal/re-download UI, combined-recording device playback,
  physical iPhone and installed-PWA update checks, branding/signing and release.
  This checkpoint proves web playback removal protection, not native readiness.

### Native Storage Removal Checkpoint (2026-09-10)

- Rebuilt current native web assets with `npm run native:sync`: 435 files,
  6,042,304 bytes, no bundled audio library. XcodeBuildMCP `build_run_sim` built,
  installed over the existing app and launched `app.tikkun.reader` on iPhone 17
  Pro simulator `5F758EB0-CF06-43AD-827C-DA1448F2C56C`. Existing Beresheet aliyah 5
  remained verified and Media showed `1/7` after replacement.
- Native semantic UI snapshots expose no tappable web controls. Instead of
  changing the UI or repeating unsuccessful gestures, a temporary script drove
  the existing DOM controls in the running WKWebView. LLDB scheduled
  `evaluateJavaScript` on the bridge controller's actual view, then detached.
  No production test hooks or application source changes were added.
- `/tmp/tikkun-native-storage-check.js` opened Media, filtered Beresheet, selected
  aliyah 5 in Storage, confirmed removal, checked the now-empty saved row and
  seven remaining aliyot, then expanded Media and re-downloaded only aliyah 5.
  Its disabled Downloaded control and `1/7` count returned. Native preflight,
  removal, transfer, inventory and metrics ran through the real Capacitor bridge.
  The recording body was 501,397 bytes from `https://tikkunreader.com`.
- Native metrics before/removal/restoration: audio 501,397 / 0 / 501,397 bytes;
  metadata 275 / 2 / 275 bytes; temporary files zero at every checkpoint. App/core
  bytes stayed 11,915,891. Device-available capacity was reported separately and
  is not expected to increase by exactly one logical recording size. The reading
  URL remained `capacitor://localhost/reader/#/torah/parsha/beresheet/1-1-1`.
- Runtime log ends `TIKKUN_NATIVE_STORAGE` stage `passed`. The initial test stopped
  before removal because it clicked refresh during initial measurement; waiting
  for the control to enable fixed the test. Native startup still logs the generic
  `JS Eval error`, null map-table warning and duplicate accessibility-class warning.
  They remain unresolved; the functional result does not dismiss them.
- Evidence under
  `~/Library/Developer/XcodeBuildMCP/workspaces/Tikkun-with-Highlighted-Audio-e334a9ef50c6/logs/`:
  `build_run_sim_2026-09-10T22-26-07-025Z_pid19582_8e2e84a3.log` and
  `app.tikkun.reader_2026-09-10T22-26-17-823Z_helperpid44871_ownerpid19582_25dc4227.log`.
  Native packaging log: `/tmp/tikkun-native-current.log`. Restored Storage screenshot:
  `/tmp/tikkun-native-storage-restored.jpg`. All debugger sessions detached; the
  app remains running with the restored recording. Diff whitespace check passes.
- This closes simulator native Storage handler/bridge removal and re-download
  verification. It does not prove touch accessibility, active-playback deferred
  removal, low-disk behavior on a physical device, airplane-mode relaunch or
  interruption/lock-screen controls. Those gates, branding/signing and release
  remain open. No App Store or deployment action was performed.

### Native Playback Retention Fix (2026-09-10)

- Reproduced a cleanup race in the installed pre-fix build: after Storage marked
  a playing recording for removal, pause retained it, but changing the reading
  attempted removal before asynchronous native clear completed. A temporary
  bridge guard delayed clear and rejected premature removal, preventing data
  loss while demonstrating the ordering bug. Prior teardown protection did not
  cover normal route reset or session replacement.
- Added `app/offline/playback-retention.ts` and wired it into Reader Runtime.
  Current and prior source URLs remain protected until the native release promise
  succeeds. Revision checks prevent an older acknowledgment from releasing a
  newer session; failed clear keeps protection. Teardown freezes this retained
  set and keeps its existing separate release acknowledgment.
- Four new deterministic tests cover delayed clear, failed clear, overlapping
  replacements and teardown during pending clear. The focused Node run passed
  30 tests with Download Library/Owner. Chromium and WebKit each passed 50 tests
  across native controller, Media panel and Reader routes. Route fixtures still
  emit the known SvelteKit history API warning; no tests failed.
- Rebuilt native assets: 435 files / 6,042,666 bytes, no audio library. Installed
  over the previous app and ran `/tmp/tikkun-native-retention-check.js` through
  the actual WKWebView DOM handlers. The exact previously failing guarded test
  now passes: native playback advances, Storage reports pending removal, pause
  retains the 501,397-byte file, and a one-second delayed native clear leaves it
  intact without any premature remove request. After releasing clear, native
  playback becomes idle, removal reduces audio bytes to zero, and re-download of
  that same recording restores 501,397 bytes and the `1/7` control. Temporary
  files stayed zero. The test restores the original bridge method in `finally`.
- Evidence directory:
  `~/Library/Developer/XcodeBuildMCP/workspaces/Tikkun-with-Highlighted-Audio-e334a9ef50c6/logs/`.
  Pre-fix reproduction is in
  `app.tikkun.reader_2026-09-10T22-26-17-823Z_helperpid44871_ownerpid19582_25dc4227.log`.
  Fixed runtime:
  `app.tikkun.reader_2026-09-10T22-38-17-582Z_helperpid76968_ownerpid19582_ad38680f.log`
  (native clear at line 93 precedes remove at line 96; final stage is `passed`).
  Build: `build_run_sim_2026-09-10T22-38-13-005Z_pid19582_c4eb27a5.log`.
  Screenshot: `/tmp/tikkun-native-retention-restored.jpg`.
- TypeScript/Svelte/ESLint and production build pass. Shell: 65 URLs / 1,550,012
  raw bytes; worker: 41,477 raw / 12,505 gzip bytes; budgets unchanged. Logs:
  `/tmp/tikkun-retention-{check,browser,webkit,native,build}.log`.
  Production Chromium/WebKit offline playback/highlight/seek, selective cleanup,
  paused cross-tab protection, tab-close release and re-download also pass:
  `/tmp/tikkun-retention-production.log`. No page runtime errors; expected offline
  service-worker probe errors and cancelled Range requests remain documented.
- All test browsers/servers closed and debugger sessions detached. Simulator
  remains on Media with the restored recording. No touch/physical-device,
  interruption/lock-screen, installed-PWA update or store-release claim is made.
  Native startup warnings remain unresolved. The full release plan remains open.

## Reading Sharing Checkpoint (2026-09-10)

- Added exact `@capacitor/share@8.0.1`, registered through Capacitor SwiftPM sync.
  `app/reader/share-reading.ts` validates reading hashes, strips unrelated query
  data and builds public HTTPS reading URLs. Reader Runtime shares its focal
  reading/verse; this does not promise an exact word position.
- Share Reading lives in the compact Reader menu and a desktop toolbar link icon.
  Both use the same handler, prevent duplicate sheets and restore focus after
  controls are re-enabled. Web Share preserves click activation; clipboard is
  used only when sharing is unavailable. Cancellation produces no false success
  or error notice; real failures remain visible.
- Sixteen Node sharing cases pass. Reader controls/routes pass 70 browser cases
  total across Chromium and WebKit. TypeScript, Svelte (zero errors/warnings),
  ESLint and `git diff --check` pass.
- Final production UI checks pass at 390px and 1280px in both engines: real
  reading content, one visible Share control, in-viewport controls, correct public
  URL, unchanged current reading, clipboard notice and restored focus; no page
  errors. Screenshots: `/tmp/tikkun-share-{chromium,webkit}-{390,1280}.png`.
  Log: `/tmp/tikkun-share-visual.log`. Used regular Playwright because the dedicated
  browser runtime was unavailable. The existing dev server had a stale generated
  SvelteKit module during testing; production validation used a temporary static
  server, without restarting the user's server.
- Simulator opened the actual UIActivityViewController through the Reader's live
  DOM click handler. The native payload was
  `https://tikkunreader.com/reader/#/torah/parsha/beresheet/1-1-4`; the screenshot
  shows the public site's preview. No item was sent to an external destination.
  Cancellation was exercised by invoking UIKit's completion callback through
  LLDB, not a manual gesture; the bridge returned `Share canceled` correctly.
  Native web accessibility automation still exposes no useful targets.
- Native sheet screenshot:
  `/var/folders/vl/qwh7jjjx6tv8wbcj2ffx404m0000gn/T/screenshot_optimized_549aca27-4cfb-462f-af3d-b3cad6ef0bb3.jpg`.
  Runtime evidence: XcodeBuildMCP log
  `app.tikkun.reader_2026-09-10T22-50-45-392Z_helperpid14754_ownerpid19582_83fc6316.log`.
  Final native sync packages 437 files / 6,045,556 logical bytes with no bulk
  audio, and the updated app builds/installs/launches on iPhone 17 Pro Simulator.
  Final build log: `build_run_sim_2026-09-10T22-56-16-204Z_pid19582_71e4eb65.log`.
- Final web build passes unchanged budgets: 65 shell URLs / 1,552,011 raw bytes;
  worker 41,477 raw / 12,508 gzip bytes. Logs:
  `/tmp/tikkun-share-{check-final,final-tests,web-build,native-final}.log`.
  Both production browsers also pass cold offline saved playback/highlighting/
  seeking, selective cleanup, paused cross-tab protection, tab-close release and
  re-download (`/tmp/tikkun-share-offline.log`). Expected offline service-worker
  probe errors and cancelled Range requests remain; page errors are empty.
- Temporary test servers/browsers close and LLDB sessions detach. Incoming native
  deep/universal links, the older aliyah permalink's native behavior, manual
  share-sheet cancellation/completion, real-device listening/offline acceptance,
  startup warnings, branding/signing and store release remain separate gates.

## Native Reading Links and Final Bundle ID (2026-09-10)

- User selected `com.adamn.tikkunreader`. Capacitor, both Xcode configurations
  and native logging now use it. The installed app's Info.plist confirms that
  identifier. The old preliminary Simulator installation and data remain intact;
  changing bundle IDs does not migrate its downloads or preferences.
- Added exact `@capacitor/app@8.1.1`. The existing SceneDelegate already forwards
  both URL and browsing-activity callbacks through Capacitor's scene proxy.
  `native-reading-links.ts` owns one root-lifetime listener, startup readiness,
  trusted reading URL validation, serialized navigation, latest pending intent,
  failure reporting and asynchronous listener cleanup. Reader waits for launch
  lookup only on hashless Reader startup. Explicit readings and public-page
  reloads do not replay the plugin's old launch URL.
- Real Simulator testing caught a hang from returning a bare Capacitor plugin
  proxy through an async loader: its synthesized `then` is treated as a promise.
  The loader now returns `{ app: App }`; the regression test rejects accidental
  promise assimilation. Rapid invalid-then-valid events also have coverage.
- Prepared `App/App.entitlements` with `applinks:tikkunreader.com`, connected to
  Debug/Release signing. The website association file allows only `/reader` and
  `/reader/` for `5D862AQ8GV.com.adamn.tikkunreader`, using the team's existing
  Xcode setting. `site/_headers` sets the association response to application/json.
  Final dist JSON identity/path scope and its header were inspected successfully.
- The live association URL returned HTTP 200 **text/html** on 2026-09-10, not
  valid association JSON. Nothing was deployed. Confirm the configured team/app
  identifier and App ID prefix, enable Associated Domains for that identifier,
  deploy the built site, verify the exact HTTPS endpoint has JSON without a
  redirect, then install a properly signed device build and test links from
  another app. Simulator ad-hoc signature inspection returned empty entitlements;
  it is not proof of signed Associated Domains. See the
  [Capacitor deep-link guide](https://capacitorjs.com/docs/guides/deep-links).
- Simulator evidence used actual SceneDelegate browsing activities dispatched
  through LLDB, not a mocked JS plugin: Noach opened in Reader; About navigation
  followed by a Beresheet link returned to a ready Reader; a fresh hashless
  webview used `App.getLaunchUrl()` to open Beresheet instead of recent Noach.
  This proves scene/plugin/JS routing and fresh-webview startup, not OS Universal
  Links handoff or a process-cold external-link launch. Runtime log:
  `com.adamn.tikkunreader_2026-09-10T23-09-49-593Z_helperpid69162_ownerpid19582_8894e061.log`.
- Final install/build log:
  `build_run_sim_2026-09-10T23-15-36-895Z_pid19582_eda9e2c1.log`.
  Final runtime log:
  `com.adamn.tikkunreader_2026-09-10T23-15-41-064Z_helperpid90683_ownerpid19582_9befb006.log`.
  The final app opened Beresheet ready, retained explicit Noach on reload without
  calling launch lookup again, and rejected an impersonating host without changing
  that URL. Another app then occupied the same Simulator; Tikkun's scene was
  confirmed backgrounded (activationState 2). The final reload had rendered 707
  line elements but still reported loading. Foreground completion of this last
  reload is unverified; no background-rendering bug is inferred from that sample.
- Verification: 48 Node cases (28 links, 16 sharing, 4 native build config), 80
  Chromium/WebKit Reader startup/route cases, TypeScript/Svelte/ESLint, plist/project
  syntax checks and diff whitespace checks passed. Production share smoke checks
  pass at 390px/1280px in both engines. Both production browsers pass offline
  playback/highlighting/seeking, selected removal/re-download, paused cross-tab
  protection and tab-close release. Page errors are empty; expected offline
  service-worker probes/cancelled Range requests remain documented.
- Final native package: 439 files / 6,048,522 logical bytes, no bulk audio.
  Web shell: 66 URLs / 1,552,324 raw bytes; worker: 41,519 raw / 12,534 gzip bytes.
  Budgets unchanged. Logs: `/tmp/tikkun-links-{node,browser,check,native,web-build,
  web-smoke,offline}.log`. Temporary browser/server processes finished; debuggers
  detached. Team ownership, deployment, signed-device links, physical listening/
  offline checks, startup warnings, old aliyah permalink handling and store release
  remain open. Prior dated checkpoints retain their historical bundle IDs.

## Native Aliyah Copy and Reload (2026-09-10)

- Added exact `@capacitor/clipboard@8.0.1`. Existing per-aliyah copy controls now
  write public HTTPS reading URLs on native, using the shared URL validator.
  Browser copies retain their deployment origin. The existing checkmark follows
  successful writes only; pending clicks are deduplicated, failed retries clear
  stale success, errors announce a retry notice, and detached controls receive no
  late success state. No clipboard contents are read.
- Twelve permalink cases run in both Chromium and WebKit. Together with Reader
  control coverage, 88 browser tests pass. TypeScript/Svelte/ESLint, native sync,
  Xcode build/install and the production web build pass. Logs:
  `/tmp/tikkun-permalink-{browser,check,native,web-build}.log`.
- Production Chromium/WebKit checks pass at 390px and 1280px: correct URL,
  successful copy, failure notice, cleared stale checkmark, retry and unchanged
  location. No page errors. The test selects a stable permalink across Reader
  virtualization rather than repeatedly selecting the first rendered element.
  Desktop uses actual Playwright clicks. Phone gutters are hidden by existing
  CSS, so phone checks invoke the DOM handler; Share Reading remains the visible
  phone action. This does not claim manual phone tapping of hidden controls.
  Script/log: `/tmp/tikkun-permalink-browser.mjs`,
  `/tmp/tikkun-permalink-visual.log`.
- With user approval, the installed `com.adamn.tikkunreader` was foregrounded in
  iPhone 17 Pro Simulator. Its real DOM handler called the real Clipboard plugin,
  writing `https://tikkunreader.com/reader/#/torah/parsha/beresheet/1-5-25`.
  The plugin resolved, the connected element entered copied state and revealed
  its check icon, and the current Noach URL stayed unchanged. This is LLDB-driven
  handler/bridge evidence, not a physical-device gesture or clipboard readback.
  Runtime log:
  `com.adamn.tikkunreader_2026-09-10T23-26-24-973Z_helperpid26263_ownerpid19582_69a60fd7.log`.
- Explicit Noach reload completed with `ready`, 84 rendered line elements and no
  new `App.getLaunchUrl` call. This supersedes the preceding checkpoint's pending
  reload completion. Another app reused the Simulator during later checks;
  screenshots showing that other app are excluded from Tikkun evidence. A final
  relaunch restored the original Reading layout through Settings and reloaded it.
- Final native package: 440 files / 6,050,675 logical bytes, no bulk audio.
  Web shell: 66 URLs / 1,552,604 raw bytes; worker: 41,519 raw / 12,531 gzip bytes.
  Budgets remain unchanged. Browser/server processes finish and debuggers detach.
  Universal Links deployment/signing, real-device listening/offline acceptance,
  manual share completion, branding and store release remain open.

## Audio Service Reset Recovery (2026-09-10)

- Added `AVAudioSession.mediaServicesWereResetNotification` handling. The plugin
  clears interruption-resume intent and stale audio-session activation state,
  removes old remote command targets, and rebuilds Now Playing against a new
  AVPlayer. It restores the playback/spoken-audio category without activating it.
  Reset failures use the existing native playback error path.
- The engine retains the session plan, logical position, rate and known duration,
  invalidates old item/seek callbacks, replaces the player and time observer, and
  remains paused. An active session reports a retryable error; explicit Play
  creates its new item. Empty sessions stay idle. Repeated resets do not erase
  position, and an ended session replays from its beginning only on Play.
- Also fixed failed-seek snapshots: error state now uses the captured logical
  position rather than a stale physical AVPlayer position. Retry therefore starts
  at the requested location, including a seek that failed before readiness.
- `swift test --package-path ios/TikkunPlayback --scratch-path
  /tmp/TikkunPlaybackTests --jobs 2` passes all 13 tests, including five new
  reset/error cases. These execute real AVPlayer behavior with tiny local WAV
  fixtures on macOS; they do not terminate the system audio service. Log:
  `/tmp/tikkun-audio-reset-tests.log`. Existing progression, gap skipping, seeking,
  bounds, pause-during-load and stale-callback coverage remains green.
- iOS Simulator compile-only build passes (4.2 seconds):
  `build_sim_2026-09-10T23-41-35-296Z_pid19582_e45846a8.log`.
  Only the existing no-AppIntents metadata warning appears. No app launch,
  installation, global service reset or shared-Simulator takeover was performed
  for this checkpoint. No web source or packaged web assets changed.
- Remaining device acceptance: install the updated signed build; play a saved
  recording, note its logical position, then trigger Settings > Developer > Reset
  Media Services. Verify that playback remains paused, position/downloads survive,
  and explicit Play resumes with correct highlighting. Repeat while paused,
  during a seek, and after the final segment. Verify that lock-screen controls
  work once each after recovery, without duplicate targets, and that a pending
  interruption-end event cannot start playback without user action. Also repeat
  the ordinary interruption/headphone tests; none are replaced by package tests.
  This recovery policy follows [Apple's media-service reset guidance](https://developer.apple.com/documentation/avfaudio/avaudiosession/mediaserviceswereresetnotification).

## Waiting Queue and Removal Coordination (2026-09-10)

- Web queue claims now cover items that have not reached the worker. Each queued
  recording holds shared registration-scope and physical-URL Web Locks before
  retry intent is persisted. Claims survive dependency preparation, transfer and
  commit; they release after settlement, cancellation or owner destruction.
  Partial acquisition and persistence failures release every acquired claim.
- Worker selected removal takes an exclusive URL claim; remove-all/remove-others
  take the exclusive scope claim. Another tab's queued work therefore refuses
  conflicting cleanup before deletion, with a message to cancel there and retry.
  Local removal first cancels its own selected queued/active work. Unrelated
  selected cleanup stays available. Cancellation still preserves manual retry
  intent; it does not erase another tab's request or automatically resume later.
- Lock acquisition/release mechanics are shared with playback protection, but
  queue and playback use distinct names and lifetimes. Immediate Retry waits for
  terminal-operation cleanup rather than silently skipping a still-releasing
  entry. Native storage has no web queue claims and retains its existing backend.
- Verification: 52 focused Node cases and 28 Chromium/WebKit cases pass, including
  actual browser locks for queued removal, bulk exclusion, scope isolation,
  cancellation, teardown, failed claims and existing playback protection. TypeScript,
  Svelte, ESLint and diff whitespace checks pass. Logs:
  `/tmp/tikkun-queue-claims-{node,browser,check}.log`.
- `/tmp/tikkun-queue-claims-real.mjs` runs two real same-origin tabs with the
  actual Download Library/storage adapter and compiled worker, using tiny local
  verified bodies. Both engines reject removing a waiting third recording while
  two transfers are active; cancelling it permits removal and never fetches it
  later. Explicit retry stores it, releases claims and permits removal. Page
  errors are empty. Log: `/tmp/tikkun-queue-claims-real.log`.
- Production Chromium/WebKit again pass seven-aliyah download, cold offline
  playback/highlighting/seeking, selective cleanup, paused cross-tab playback
  protection, tab-close release and re-download. Page errors are empty; expected
  offline worker probes and cancelled Range requests remain. Log:
  `/tmp/tikkun-queue-claims-offline.log`. Temporary servers and browsers close.
- Production build passes unchanged budgets: 66 shell URLs / 1,553,824 raw bytes;
  worker 41,941 raw / 12,636 gzip bytes. Native packaging/sync passes at 440 files /
  6,051,887 logical bytes with no bulk audio. Logs:
  `/tmp/tikkun-queue-claims-{build,native}.log`. This checkpoint does not install
  or launch the Simulator app, deploy a site or submit a release.
- Claims require participating page/worker builds. Installed-PWA update and
  mixed-version acceptance are not proved by this checkpoint. These are mutation
  protections, not durable pending-batch quota reservations; cross-tab space
  accounting, device/system-audio acceptance, signing/links and store release
  remain open.
