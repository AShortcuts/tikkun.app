# Tikkun iOS Release Checklist

Updated: 2026-09-11. Current editable handoff; older development checkpoints are historical evidence.

## Store Preparation Checkpoint

Local follow-up: [content and controlled web updates](app-updates.md) are implemented
and separately verified. They are not in the uploaded build 3; feeds and a new
native release remain pending. Do not describe the existing TestFlight build as OTA-enabled.

See [editable App Store listing](../metadata/README.md) for current copy, screenshots,
remote IDs and remaining gates. Build 1.0 (3) is processed and attached. Pricing is
free in all 175 territories, including future territories. Description, subtitle,
keywords, promotional text, categories and review notes are populated; the build
contains the app icon. Eight native screenshots are accepted: five iPhone and three iPad.

Native screenshot capture exposed transparent Media/Storage backgrounds in the
packaged automatic-light theme. Build 3 repairs them with explicit shared tokens:
17 preference unit tests, 22 Chromium/WebKit Media/Storage tests, type/lint checks,
native sync, Simulator build/run and release archive pass. Native Media and Storage
were visually checked, including automatic dark Storage and a real 489.6 KB download.
All 447 bundled resource hashes match the synced project, Simulator app and archive.

Build 3's Sqim development-signed delivery and ASC upload both succeeded; see the
linked listing handoff. CLI export reported `No Accounts` and no distribution
certificate, but Xcode's GUI confirmed Adam Niyazov's account and successfully
cloud-signed the existing archive for team `5D862AQ8GV`. IPA signature verification
passed. ASC build `cc9aa9c7-1d76-442c-87d6-71ca12fb59df` is `VALID`, attached to
version 1.0, with English test notes and the existing encryption declaration.
No source rebuild, tester access change or review submission was performed during
this retry. Build 3 contains the theme repair, not later privacy/support page changes.

The public privacy URL currently serves homepage HTML. Policy deployment, App Privacy
publication, dependency licensing, final device acceptance and public submission
remain separate gates. ASC's current zero-error API validation does not clear them.

## Implemented Locally

- [x] Home Screen parsha/practice widget and 1-5 upcoming-readings Shortcuts action;
  architecture, build evidence and device checks: [iOS system integration](ios-system-integration.md).
- [x] Bundled offline Reader and Torah text; explicit audio downloads.
- [x] Media: all parshiot, per-aliyah downloads, partial counts, disabled Downloaded state.
- [x] Storage: measured categories, available capacity, selected removal and re-download.
- [x] Native persistent audio, integrity checks, two transfers, interruption retry.
- [x] Native playback, background progression, seeking, speed, interruptions and Now Playing commands.
- [x] Native sharing/copying, validated incoming links, last-reading startup.
- [x] Browser cross-tab transfer, queue/removal, playback and pending-capacity protection.
- [x] Bundle ID `com.adamn.tikkunreader`; native label `Tikkun`.
- [x] Icon and launch mark rendered from existing `site/favicon.svg`.
- [x] Disk-capacity privacy manifest and microphone permission text for existing recording tools.
- [x] iOS-style Media/Storage presentation: segmented navigation, system UI type,
  light/dark surfaces, 44px controls, fixed-size download states and confirmed removal.

### Latest UI Package Verification

2026-09-10: 20 focused Media/Storage tests passed in Chromium and WebKit across
320, 390, 768 and 1280px layouts, including dark-mode accessibility and keyboard
tab navigation. TypeScript, Svelte and ESLint passed. `npm run native:sync`
packaged 441 web resources / 6,060,431 bytes without the audio library; Xcode's
Simulator build succeeded with no diagnostics. SHA-256 comparison confirmed all
441 resources in the built App.app match `dist-native`.

This verifies the updated native package, not installation or native UI acceptance.
The shared Simulator was not relaunched or replaced during this UI packaging pass.
Physical-device and distribution gates below remain open.

### Nekud And Edge-to-Edge Reader

2026-09-10: verse numbers remain visible when vowels/cantillation are hidden.
Annotation changes now use the display's existing focal-token anchor, preserve
that word through repeated toggles, and refresh page/gutter measurements. Match
and Reading keep their separate layout contracts.

The native web view fills its host bounds, with `viewport-fit=cover` and CSS
safe-area padding for the header and Reader sides. The themed web surface now
extends under system chrome instead of exposing a separate native bezel.

- 236 Chromium/WebKit layout, display and responsive tests passed, including
  eight real-route toggle regressions at 390 and 1000px across both layouts.
- Six display-session Node tests, TypeScript, Svelte and ESLint passed.
- Native sync: 441 resources / 6,062,238 bytes, with no audio library.
- iPhone 17 Pro Simulator build/run passed with zero build diagnostics; dark
  inset continuity was visually checked. The Simulator retained an explicit
  dark app theme when system appearance changed, so this does not establish
  native light/custom-theme acceptance. System appearance was restored.
- Device archive, development export and Sqim upload succeeded; an updated
  install link was delivered. Physical-device installation remains unverified.

Logs: `/tmp/tikkun-reader-insets-browser.log`, `/tmp/tikkun-reader-insets-check.log`,
`/tmp/tikkun-reader-insets-node.log`, `/tmp/tikkun-reader-insets-native.log`, and
`/tmp/tikkun-reader-insets-sqim.log`.

Follow-up: compact One Side tap-to-toggle now covers the whole scrolling reading
body, including blank margins and gaps, rather than only `.reader-text-side`.
The existing drag, long-press, text-selection, interactive-control and audio-word
seeking guards remain in place. Eight focused Chromium/WebKit cases passed with
real blank-margin clicks plus drag/exclusion regressions; type/lint checks passed.
Native sync, device archive/export and Sqim upload succeeded. Logs:
`/tmp/tikkun-gap-tap-tests.log`, `/tmp/tikkun-gap-tap-check.log`, and
`/tmp/tikkun-gap-tap-sqim.log`. A new install link was delivered to the owner.

### Browser Repairs And Verification

2026-09-10: corrected the mobile title's RTL text measurement, empty Match aliyah
gutter overflow, and Safari verse-label overhang after shared-frame alignment.
Reading paired-word sizing now batches measurements before style writes; the
WebKit side-switch test improved from a 15-second timeout to about 2 seconds.
Development builds expose recording downloads as unsupported without a production
worker, and unsupported backends do not receive automatic refresh requests.

Browser harness fixes preserve coverage: tests await hydration and embedded Reader
readiness in a visible desktop viewport, match the promoted homepage and current
unlock copy, destroy ScrollDisplay fixtures, and avoid redundant history writes.
Chromium now uses sequential files like WebKit. The Match corpus reuses a Range
per page check and yields between pages instead of accumulating live ranges in one
long task. Neither corpus coverage nor geometry assertions were relaxed.

Verification was split to avoid repeating the expensive, unchanged Match sweep:

- 86 Match corpus cases passed across Chromium and WebKit in the complete run.
- The final rerun of every other configured browser file passed: **928 tests in
  114 project/file combinations**, 117.78 seconds, no failures or unhandled errors.
- Together these cover all **1,014 configured browser cases**. This is split-run
  evidence, not a claim that the earlier single complete invocation was green.
- Live 320px Reader inspection confirmed the full Hebrew title and no console errors.
- `npm run check` passed: TypeScript, Svelte (zero errors/warnings) and ESLint.
- All 38 focused download-owner, download-library and selected-download Node tests passed.
- Browser repairs are now included in the refreshed iOS package: `native:sync`
  produced 441 resources / 6,061,476 logical bytes, including 332 bundled content
  records and no audio library. Media origin remains `https://tikkunreader.com`.
- The compile-only iPhone 17 Pro Simulator build passed with zero diagnostics.
  SHA-256 comparisons matched all 441 resources against both the synced project
  and built App.app. The built bundle ID is `com.adamn.tikkunreader`.
- No Simulator installation or launch, signed-device verification, or deployment
  was performed during this browser-repair packaging pass.

Logs: `/tmp/tikkun-browser-final.log` (complete run, including the 86 corpus passes
and three subsequently repaired failures) and
`/tmp/tikkun-browser-final-regressions.log` (all 928 remaining cases passed).
Explicit positive file paths were used for the final rerun because this Vitest
project configuration did not apply the CLI exclusion to its browser projects.
Installed-PWA, production-build and physical-device gates below remain separate.

Native packaging log: `/tmp/tikkun-browser-fixes-native-sync.log`. Xcode build log:
`~/Library/Developer/XcodeBuildMCP/workspaces/Tikkun-with-Highlighted-Audio-e334a9ef50c6/logs/build_sim_2026-09-11T02-11-01-302Z_pid19582_558f2543.log`.
The build emitted SvelteKit's existing root-tsconfig extension advisory; the
isolated native TypeScript check passed. The earlier UI-package byte count above
is historical and is superseded by this refreshed package.

### Historical Failed Attempt

2026-09-10: owner approved the configured full Chromium/WebKit matrix. Ran
`npm exec vitest run -- --project=browser --project=webkit --maxWorkers=2`.
The run reported six failures before ceasing to report new progress, remained
live at very low CPU, and was explicitly interrupted after more than six minutes
(exit 130). It did not produce final totals; this is failed/incomplete verification,
not a release pass. The browser repairs and later verification above supersede it.

Originally observed failures:

- Chromium: `app/admin/cue-authoring-access-dialog.vitest.ts`, local gate/success clearing.
- Chromium: `src/routes/prototype-isolation.vitest.ts`, public/prototype isolation.
- Chromium and WebKit: `app/reader/reader-responsive-layout.vitest.ts`, responsive/theme/accessibility reachability.
- Chromium: `app/components/page-layout.vitest.ts`, identical Sea tracks at 1280px.
- WebKit: `src/routes/public-routes-real-url.vitest.ts`, Reader/About/Reading Index navigation; module-import rejections were also logged.

Local diagnostic log: `/tmp/tikkun-full-browser-approved.log`. These observations
did not distinguish product regressions from test isolation or runner failures.
All six originally observed cases now pass; the later full run also exposed the
corpus Range cost, Reading layout thrashing and redundant history writes repaired above.

## Owner Decisions

- [ ] Resolve bundled GPL calendar dependency distribution and notice requirements; see [attribution audit](release-attribution-audit.md). Root MIT licensing does not cover all dependencies.
- [x] Owner confirmed Apple team `5D862AQ8GV` on 2026-09-10; both Xcode configurations already use it.
- [ ] Verify the signed provisioning profile's App ID prefix matches the prepared Universal Links association; team confirmation alone does not inspect the profile.
- [ ] Approve final public store name. **Tikkun Reader** is available and was used
  for the owner-requested TestFlight app record (`6810923824`); public release
  copy remains a separate approval.
- [x] Owner confirmed Yoni Davidov's recordings are approved for app use on 2026-09-10; About retains his credit and states permission.
- [x] Owner confirmed text/fonts are free to use and requested no additional optional attribution work; existing notices remain intact.
- [x] Hebcal calendar credit added to About. This is attribution, not resolution of the separate GPL distribution gate.
- [ ] Supply approved public privacy policy and support URL/contact.
- [ ] Review App Privacy answers against final app, SDKs and hosting behavior. Do not infer no server logging from local storage; a privacy manifest is not a privacy policy.

## Physical Device

Use the final signed build. Simulator and browser results do not check these boxes.

- [ ] Download a never-opened reading, force-quit, enable airplane mode, relaunch; verify text, cues, playback and seeking.
- [ ] Verify lock-screen controls, background segment changes, speed, interruptions, headphones and foreground highlighting.
- [ ] Cancel a partial batch, force-quit and retry; partial files must not appear Downloaded.
- [ ] Remove one saved aliyah: Downloaded -> 6/7 -> Downloaded after re-download; verify storage decreases and personal data remains.
- [ ] Install an update without uninstalling; verify settings, bookmarks and downloads survive.
- [ ] Test low-space/write failures, microphone permission denial and user-triggered recording.
- [ ] Test iPad layouts if shipping the existing universal iOS target.

## Deployment And Distribution

### Private Install Link Preflight

The owner selected direct installation through the established `sqim` skill.
The earlier `asc-ad-hoc-distribution` preflight chose the wrong workflow: Sqim
uses local development signing and provides hosting. Missing ASC API credentials,
a distribution certificate, or a caller-owned S3 bucket are not prerequisites for
this Sqim route. Do not request them again unless switching distribution workflows.

- Sqim browser sign-in was renewed successfully after the stored session expired.
- Both target configurations use automatic signing, team `5D862AQ8GV`, and bundle
  ID `com.adamn.tikkunreader`.
- A connected iPhone 16 Pro was identified. Its private inventory remains ignored
  under `.asc/distribution`; preparing that file did not register a device with Apple.
- The initial device archive failed because the wildcard provisioning profile
  lacked Associated Domains. A retry with `--allow-provisioning-updates` cleared
  that signing error. Device archive, development-signed IPA export, and Sqim
  upload all succeeded (exit 0); the final HTTPS install link was delivered to
  the owner. Log: `/tmp/tikkun-sqim-device-upload-provisioning.log`.

Command: `sqim upload --device ios/App --build --allow-provisioning-updates`.
Use only the final HTTPS install URL from a successful command exit. Do not offer
a Simulator artifact as an iPhone install. Device installation, acceptance tests,
and public-release gates remain separate from successful build publication.

### Release Gates

- [ ] Deploy the prepared association file at `https://tikkunreader.com/.well-known/apple-app-site-association` after confirming team/prefix. It must return JSON, not the website HTML fallback.
- [ ] Open an HTTPS reading link from another app on the signed device, both cold and warm.
- [ ] Run the complete web release suite and installed-PWA update/process-restart checks; focused tests alone do not prove release readiness.
- [ ] Capture final store screenshots with real Reader, Media and Storage content.
- [ ] Archive/validate in Xcode, upload to App Store Connect, finish metadata and beta review details.
- [ ] Run a small TestFlight cohort through download/practice/remove/re-download.
- [ ] Obtain explicit authorization before App Store submission or publication.

## Commands

Use repository-pinned Node/npm. Existing resource-approval rules still apply.

```sh
npm run check
npm run verify:release
npm run native:sync
npm run verify:native-clean
swift test --package-path ios/TikkunMedia --jobs 2
swift test --package-path ios/TikkunPlayback --jobs 2
npm run native:open
```

In Xcode: choose App, confirm signing/team, select a physical device for acceptance,
then Any iOS Device for Product > Archive. Validate before uploading. The latest
widget checkpoint includes a signed archive and committed TestFlight upload;
see [iOS system integration](ios-system-integration.md) for current processing
and distribution status. Website deployment and public submission remain open.
`npm run native:branding` regenerates native assets from the existing vector mark
using installed Playwright/Chromium; no new dependency or asset service is needed.

## Deliberate Limits

Browser capacity reservations deduplicate physical URLs but conservatively retain
full missing-file and staging bytes until a batch ends. They coordinate participating
tabs, not old clients, other origins or the OS; quota remains advisory. Dead-owner
reservations are reclaimed through Web Lock liveness on the next batch.
Downloads do not promise continuation while suspended or force-quit; retry intent survives.
Native text/cues are bundled, not removable add-on products. Web dependency cleanup
and large-inventory optimization remain follow-ups; shared dependencies are not evicted.
Native builds seed root/web framework types only if missing, then use a separate
generated `tsconfig.native.json` for native type checking. SvelteKit's root-config
extension warning remains informational; clean-checkout native builds are verified.
Android remains milestone 7, after iOS acceptance; no Android binary is delivered here.

## Store Copy Draft

Name: Tikkun Reader

Subtitle: Torah reading practice

Description: Practice your Torah reading with a tikkun and recorded aliyot.
Follow available synchronized recordings, return to your reading, and download
audio for offline practice. Browse parshiot in Media and manage saved recordings
in Storage. Recording and synchronized-timing coverage varies by reading.

Review notes: No account is required for the Reader. Open Media from the Reader
menu, choose a parsha, and download an available aliyah. Storage removes saved
audio without removing Torah text. Background audio is used for listening.

Review and approve copy and all owner decisions before publishing.
