# iOS Widgets And Shortcuts

Updated: 2026-09-11. Editable implementation and acceptance reference.

Latest packaging checkpoint: app and widget are now **1.0 (3)**. The theme repair,
Simulator verification and Sqim delivery succeeded. Private installation links
belong in ignored local release records, not this public repository.
Build 3 is now uploaded to TestFlight, processed `VALID`, and attached to version
1.0 (`cc9aa9c7-1d76-442c-87d6-71ca12fb59df`). Xcode GUI cloud signing succeeded for
Adam Niyazov (`5D862AQ8GV`) despite the CLI account-lookup failure. English test
notes and export compliance are set; no tester access or review submission changed.
See [listing handoff](../metadata/README.md) for delivery evidence and remaining
gates. The initial feature-verification record below is historical.

## User Behavior

- Home Screen gallery: **Parsha & Practice**, small and medium sizes, iOS 17+.
- Small shows the next Shabbat reading. Medium adds a separate Continue link to
  the user's current practice reading; without a saved reading it offers the
  upcoming Shabbat reading. A festival on Shabbat shows that festival's reading.
- Shortcuts: **Get Upcoming Readings**, iOS 16+, configurable count 1 through 5.
  Returns names, dates, services and Torah verse references as text and a spoken
  dialog, without opening the app. Verse references are not full verse text.
- Both use the app's Israel/Diaspora setting and existing Ashkenazi calendar.
  Upcoming means today onward, including Shabbat and special days. Regular
  Monday/Thursday readings are not in the app's schedule and are not added here.
- Dates advance at local civil midnight, not sunset. Audio remains separately
  downloadable; neither system feature downloads recordings.

## Ownership

- `app/platform/system-calendar.ts` adapts the canonical LeiningGenerator.
  It preserves separate Torah runs and noncontiguous verse ranges.
- `scripts/build-system-calendar.mjs` bundles that adapter and its calendar
  dependencies into `ios/TikkunSystem/Sources/TikkunSystem/Resources/calendar.js`.
  `npm run native:sync` regenerates it through the native build script. Do not
  hand-edit the generated resource or maintain a second Swift calendar.
- `ios/TikkunSystem/` owns JavaScriptCore execution, schedule decoding and shared
  practice persistence. Its bundle works offline without the Capacitor WebView.
- App Group `group.com.adamn.tikkunreader` stores `calendar.israel` and
  `practice.reading`. The shared UserDefaults privacy manifest accompanies it.
- `app/platform/native-practice.ts` publishes native-only state updates through
  `TikkunPracticePlugin`. Existing last-reading checkpoints update practice as
  the user moves; initial Reader readiness publishes the explicit route before
  focal layout measurements settle. Recording-authoring mode does not publish.
- Native practice persistence does not expire after 48 hours. The browser's
  existing recent-reading expiry and startup rules remain unchanged.
- Widget reloads are deduplicated and debounced for two seconds, then flushed
  on backgrounding. Timeline entries cover the current time and seven local
  midnights; WidgetKit controls actual refresh timing, with no polling loop.
- `UpcomingReadingsIntent.swift` exposes the read-only action and app phrases.
- `native-reading-links.ts` validates `tikkunreader://reader/#/...` alongside
  existing HTTPS links. Invalid routes/hosts are rejected; custom links are
  local app entry points, not a replacement for HTTPS Universal Links.

## Initial Feature Build Identity (Historical)

- App: `com.adamn.tikkunreader`; extension: `com.adamn.tikkunreader.widgets`.
- Team: `5D862AQ8GV`; version/build: **1.0 (2)** for both targets.
- Widget extension minimum iOS 17; existing app minimum iOS 15 is retained.
- Release archive: `.asc/artifacts/Tikkun-1.0-2.xcarchive`.
- App Store Connect IPA: `.asc/artifacts/Tikkun-1.0-2.ipa`.
- App Store Connect record: **Tikkun Reader**, ID `6810923824`, SKU
  `com.adamn.tikkunreader`, primary locale `en-US`.
- TestFlight upload completed and Apple processing passed: **VALID**, build ID
  `45fe2a84-729f-4b61-b7d1-716a5c6dd291`. English What to Test notes are attached.
- Initial feature development-signed delivery succeeded through Sqim.

## Verification

- 39 focused Node tests and 42 Chromium/WebKit tests passed.
- Three Swift package tests passed using the actual bundled JavaScriptCore
  calendar: date rollover, Israel/Diaspora differences, count bounds, verse
  references, and shared-state persistence/validation.
- TypeScript, Svelte and ESLint passed. Native sync, signed Simulator build,
  Release archive and App Store Connect export succeeded.
- Actual medium widget rendered on iPhone 17 Pro Simulator: Rosh Hashana I on
  Shabbat for September 12, and Continue updated to Noach after opening Noach.
  This check caught and repaired an initial checkpoint timing error.
- Actual small widget rendered the same Shabbat reading; tapping it opened
  Tikkun's Rosh Hashana I Reader. Medium Continue touch acceptance remains open.
- App Intents metadata extraction and phrase compilation succeeded. Native
  custom-scheme Reader opening worked in Simulator.

Commands, using the repository-pinned Node/npm and approved resource budget:

```sh
npm run check
npm run native:sync
swift test --package-path ios/TikkunSystem --jobs 2
sqim upload --device ios/App --build --allow-provisioning-updates
```

## Remaining Acceptance

- Test both widget links by physical touch, small/medium sizes, tint modes,
  larger text, midnight rollover and Israel/Diaspora changes on iPhone/iPad.
- Run the actual Shortcuts action with 1 and 5 readings, including airplane
  mode and a cold app; verify Siri discovery and readable spoken output.
- Confirm existing downloads and settings survive installation of the update.
- App Store Connect API authentication and app-record creation succeeded.
  `asc publish testflight --app 6810923824 --ipa
  .asc/artifacts/Tikkun-1.0-2.ipa --upload-only --wait --timeout 15m` committed
  the upload and exited successfully with processing state VALID. Do not upload
  this version/build again. Log: `/tmp/tikkun-testflight-upload.log`.
- Creating a private internal group and assigning the owner requires separate
  access-change approval. No tester group, public link or review submission has
  been created at this checkpoint.
- Public App Store submission is not authorized. Licensing, privacy, metadata,
  Universal Links deployment and device-media gates remain in the
  [release checklist](ios-release-checklist.md); successful compilation and
  private build hosting do not clear them.
