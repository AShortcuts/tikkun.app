# App Store listing

Editable listing source and delivery checkpoint, verified 2026-09-11.

## Identity

- App: Tikkun Reader (`6810923824`).
- Bundle: `com.adamn.tikkunreader`.
- Version: `1.0` (`cac2f8d9-a302-4b5a-9dc8-2ec9300647a6`).
- Uploaded and attached build: `1.0 (3)` (`cc9aa9c7-1d76-442c-87d6-71ca12fb59df`),
  processing `VALID`. English What to Test notes are attached; the existing
  `usesNonExemptEncryption: false` declaration is carried forward from build 2.
- Team: Adam Niyazov (`5D862AQ8GV`). Xcode GUI cloud signing succeeded despite
  CLI export reporting `No Accounts` and no distribution certificate. The account
  was present and valid; no account reset or source rebuild was needed.
- Development-signed direct install remains available through
  [Sqim](https://build.sqim.dev/sqim/install/bs7X-ngfodQq).
- Release mode: manual. No public review submission or release performed.

## Listing configuration

- Owner selected free pricing and worldwide availability. ASC reports USD 0.00,
  all 175 supported territories enabled, and future territories enabled.
  Availability is configured, not a claim that the unreleased app is on sale.
- Primary category Education; secondary Reference.
- `app-info/en-US.json`: name and subtitle.
- `version/1.0/en-US.json`: description, keywords, promotional text, marketing
  and support URLs. These fields were pushed successfully.
- Support uses the repository's existing public GitHub issue tracker.
- App icon is included in build 3; ASC reports a processed icon asset.
- App Store and TestFlight review instructions are populated. Existing private
  reviewer contacts were preserved; do not commit them here.
- Age-rating questionnaire populated conservatively for mild textual Biblical
  themes; owner should review the interpretation before public submission.
- ASC now reports `USES_THIRD_PARTY_CONTENT`; this declaration does not resolve
  the separate dependency-license question in the attribution audit.

## Screenshots

Unframed, unedited native Simulator captures of real Beresheet content:

- `screenshots/en-US/iphone`: 1320 x 2868, Reader, hidden-nekudot practice and
  actual audio playback, plus Media and Storage. Five uploaded assets verified `COMPLETE`.
- `screenshots/en-US/ipad`: 2064 x 2752, the same three workflows. Three uploaded
  assets verified `COMPLETE`.
- Medium widget rendered with the upcoming Shabbat and saved practice reading.
  Its Home Screen capture was excluded because unrelated test-app icons were visible.
- `04-media.png` and `05-storage.png` are captured from repaired build 3. Media
  shows a real 1/7 saved state (Beresheet Aliyah 5, 489.6 KB); Storage shows the
  actual measured categories. Existing Reader/practice/audio captures use build 2.

## Remaining gates

1. Publish an owner-approved privacy policy and verify its actual public content.
   `https://tikkunreader.com/privacy/` currently returns homepage HTML, not the
   prepared policy. Do not assign that URL until deployment is verified.
2. Review and publish App Privacy answers in ASC. Public API validation cannot
   verify that publication or replace a hosting/data-handling review.
3. Resolve calendar dependency distribution requirements with the owner; see
   `../docs/release-attribution-audit.md`.
4. Retest build 3 on the signed physical device, including downloads, background
   playback, widgets and Shortcuts. Build 2 does not contain the theme repair.
5. Tester/group access changes and public submission need separate authorization.

## Packaged-theme repair

Native automatic-light Media and Storage were visibly transparent. Production
CSS lowered `light-dark()` into helper-dependent values in the lazy panel chunk.
The source now uses explicit shared theme tokens in `css/reader-system-colors.css`,
including automatic, explicit and custom scheme handling. The same repair covers
the header audio color. A browser regression checks actual computed backgrounds.

Owner approved the additional build work. All 17 preference unit tests and 22
Chromium/WebKit Media/Storage tests passed. TypeScript, Svelte and ESLint passed.
Native sync produced 447 resources / 6,093,538 bytes with no audio library.
All resource hashes match the synced project, built Simulator app and signed
release archive. App and widget both report build 3. Simulator build/run succeeded
with no build diagnostics. Native Media is opaque; Storage was visually verified
in automatic light and dark appearances. A real small aliyah download completed.

Release archive: `.asc/artifacts/Tikkun-1.0-3.xcarchive`. Xcode Organizer exported
the existing archive with Cloud Managed Apple Distribution signing for Adam
Niyazov. The completed IPA was recovered from Xcode's distribution pipeline when
its save dialog did not respond reliably to automation, then copied to
`.asc/artifacts/Tikkun-1.0-3.ipa`. Deep/strict code-signature verification passed;
app and widget report build 3, and the distribution profile has
`get-task-allow: false`. ASC upload completed with processing `VALID`, and build 3
is attached to version 1.0. Sqim delivery also succeeded. Physical installation
remains unverified. Later working-tree changes are not included in this archive.

Logs: `/tmp/tikkun-theme3-browser.log`, `/tmp/tikkun-theme3-check.log`,
`/tmp/tikkun-theme3-sync.log`, `/tmp/tikkun-theme3-archive.log`,
`/tmp/tikkun-theme3-export.log`, `/tmp/tikkun-theme3-export-retry.log`,
`/tmp/tikkun-theme3-export-account-check.log`, `/tmp/tikkun-theme3-sqim.log`, and
`/tmp/tikkun-theme3-testflight.log`.

Successful upload and follow-up commands (completed; do not upload build 3 again):

```sh
asc publish testflight --app 6810923824 --ipa .asc/artifacts/Tikkun-1.0-3.ipa --upload-only --wait --timeout 15m --output json
asc builds test-notes create --build-id cc9aa9c7-1d76-442c-87d6-71ca12fb59df --locale en-US --whats-new "Fix Media and Storage backgrounds in automatic light/dark and custom themes. Verify saved audio and settings survive this update; test the widget and Get Upcoming Readings action."
asc builds update --build-id cc9aa9c7-1d76-442c-87d6-71ca12fb59df --uses-non-exempt-encryption=false
asc versions attach-build --version-id cac2f8d9-a302-4b5a-9dc8-2ec9300647a6 --build-id cc9aa9c7-1d76-442c-87d6-71ca12fb59df
```

Upload-only mode cannot be combined with test-note flags; notes are set separately.
No groups were created, testers added, or reviews submitted.

## Reconcile before publishing

Remote state can change while the owner edits ASC. Inspect before pushing; avoid
overwriting owner-entered fields or replacing existing screenshots unintentionally.

```sh
asc metadata validate --dir metadata
asc metadata push --app 6810923824 --version 1.0 --platform IOS --dir metadata --dry-run
asc screenshots list --version-localization 83719f5c-12f1-4990-98fc-091a8e433287 --output json
asc validate --app 6810923824 --version 1.0 --platform IOS --output json
asc validate testflight --app 6810923824 --build-id cc9aa9c7-1d76-442c-87d6-71ca12fb59df --output json
```

Latest API validation: store 0 errors, 1 privacy-URL warning; TestFlight 0 errors
and 0 warnings. This is not approval to publish and does not clear the gates above.
