# Tikkun Update Delivery

Implementation checkpoint: 2026-09-11. No update feed has been deployed and the
existing TestFlight build does not contain these additions. Ship a new native
build before expecting installed apps to receive updates.

## Two Separate Paths

**Content updates** change practice material, not application code. The native
Reader checks a signed manifest after startup and when returning to the foreground
or reconnecting, at most once per 15 minutes after a successful check. New content
is validated and saved as a pending snapshot. The open document continues using
one revision; a fresh launch activates pending content before loading the catalog.

The first snapshot is 3,889,665 bytes (about 3.9 MB), without audio. This initial
implementation downloads a complete snapshot when content changes, not individual
changed files. A 12 MiB limit bounds automatic content downloads. Unchanged
releases only fetch the small manifest. Large audio remains user-controlled.

**Controlled web updates** change compatible HTML/CSS/JavaScript. The app verifies
a signed release manifest, checks the exact native build and staged rollout, and
uses `@capawesome/capacitor-live-update` to verify and download the signed ZIP.
It schedules that bundle for the next cold launch; it never calls `reload()`.
There is no paid cloud dependency or vendor update-service account.

## Visible Prompt Preview

The native updater currently has no visible prompt: it stages verified updates
silently for the next cold launch. The web/PWA service worker has an
"Update available" prompt with Apply and Later actions.

On a local development server, open
`/reader/?preview-update=1#/torah/parsha/vezos-haberacha` to demonstrate that
existing web prompt. The browser tab and accessible label identify the demo;
the prompt restores the centered pill and filled action button introduced in
commit `242a99d8`, before the SvelteKit migration. The button now reads Apply in
medium weight with a lighter fill. Apply simulates the waiting state,
then confirms that nothing was updated; Show again repeats it and Later dismisses
it. While applying, Later is hidden and Apply becomes Cancel. Cancel stops the
demo timer or the real pending page reload; it cannot reverse service-worker
activation already requested. Applying again after activation reloads the page.
The demo performs no worker operations, downloads, or reloads and is disabled
in production builds. It is not a native OTA delivery test.

## Release Boundaries

App Store review rules still apply. Native code, plugins, widgets, Shortcuts,
permissions, and substantial functionality changes use normal native releases.
OTA must not hide functionality from App Review.

## Integrity And Recovery

- RSA signatures protect both release manifests; the native SDK also verifies
  the web ZIP signature. SHA-256 checks bind manifests to exact content bytes.
- The public key is pinned in `config/update-public-key.pem` and the native
  plugin configuration. The private key is ignored under
  `.asc/update-signing/private.pem`, with owner-only permissions. Back it up
  securely outside the repository. Losing it requires a native key-rotation build.
- Content is JSON only. The parser rejects markup in rendered text, arbitrary
  media URLs, malformed records, incompatible schemas and mismatched audio/cues.
- Content compatibility pins page/verse/token addresses and the supported
  reading/narrator set. Text corrections and recordings within those existing
  readings are supported. New scrolls, new narrators, range-recording schemas,
  or structural page changes require a new contract/native or eligible web build.
- Existing empty legacy timing files are normalized to the current schema only
  when they contain zero cues; no timing positions are invented.
- Complete content state is atomically written in Application Support, excluded
  from backup. Audio, settings and bookmarks are not rewritten or removed.
- A pending content revision is a startup trial. Reader readiness confirms it;
  an interrupted/failed trial falls back to the last confirmed content, or the
  bundled core, and quarantines that revision. Corrupt/incompatible snapshots
  are rejected. Failures are logged, not presented as successful updates.
- The web SDK has a 30-second readiness deadline, blocks failed bundles and
  falls back to the original bundled app (not a guaranteed previous OTA bundle).
- Storage includes saved content-update bytes. The content store holds at most
  the current and pending snapshot; native web bundle cleanup is SDK-managed.
- Offline launch does not wait for the server. Network checks start after Reader
  readiness. No service worker is registered in the iOS app; web/PWA behavior is unchanged.

## Publish Content

Use the repository-pinned Node/npm. Keep audio manifests and source cue data current.

```sh
npm run updates:content
```

This validates the real corpus and creates a signed `latest.json` plus an immutable
hash-named JSON snapshot in `.asc/updates/content/<compatibility>/`. It does not
upload anything. A mismatched private/public signing key stops publication.
`TIKKUN_UPDATE_PRIVATE_KEY_FILE` can point to an externally stored signing key.

After owner deployment approval, host that directory at:
`https://tikkunreader.com/updates/content/<compatibility>/`.
Upload the hash-named snapshot first and publish `latest.json` last. Retain
previous immutable files for in-flight clients. The feed needs real JSON responses,
not the site's HTML fallback, and CORS for `capacitor://localhost`.
`site/_headers` contains the required update-path CORS/cache headers.

## Publish A Web Fix

First inspect the patch for native compatibility and App Store eligibility, run
the tests, and build with the same pinned signing key as the distributed archive.

```sh
npm run native:sync
TIKKUN_UPDATE_PRIVATE_KEY_FILE=.asc/update-signing/private.pem npm run updates:web -- \
  --native-build BUILD_NUMBER \
  --target-archive /absolute/path/to/the/distributed.xcarchive \
  --rollout 10 --approve-web-only
```

The generator checks the target archive's build number, installed public key,
and native compatibility fingerprint. Native code/config/dependency differences
stop the release. It rejects symlinks, signing-key/audio files, and packages over
50 MiB unpacked. The archive must itself contain this update system; the old
TestFlight build 3 cannot be used as a target.

Output: `.asc/updates/web/BUILD_NUMBER/`, with a signed `latest.json` and signed,
hash-named ZIP. Default rollout is **0%**. Only publish after local verification
and explicit deployment approval. Host at `/updates/web/BUILD_NUMBER/`, ZIP first,
manifest last. A stable local random bucket selects the rollout; it is not sent
to a vendor service. Increase rollout after acceptance, not automatically.

Setting rollout to zero stops new staging but does not revoke already staged
bundles. To roll back a healthy but unwanted web revision, republish its known-good
predecessor with a newly signed manifest. A locally quarantined failing bundle
will not be retried; fix it and publish a new ZIP digest.

## Verification And Remaining Gates

- 20 unit/integration tests passed, covering real corpus/catalog/cue integration, signature tampering,
  native-build/rollout gates, failed downloads, disk-write failures, content
  activation and interrupted-trial recovery.
- 32 Chromium/WebKit tests passed, covering signed manifests, bounded downloads, the content
  lifecycle, Reader startup and unchanged PWA update behavior.
- TypeScript, Svelte (zero errors/warnings), ESLint, and the iOS Simulator build pass.
  Native sync packages 452 files / 6,111,212 bytes without the audio library.
  A dedicated Simulator cold-launch test seeded
  the real 3.9 MB pending snapshot and verified native read/validation/activation,
  Reader readiness, and the durable active-state write. This is not hosted-feed
  or physical-device OTA delivery proof.
- Undeployed feed URLs returned website content; bounded response checks rejected
  it while the native Reader remained usable. The temporary Simulator was removed.
- Before release: deploy and verify signed feeds/CORS, archive a new iOS build,
  test a real signed OTA download and rollback on a device, confirm settings/audio
  survive, review privacy/hosting behavior, and then expand beyond a test cohort.
- This work did not publish server files, upload a new TestFlight build, change
  tester access, or submit App Store review.

Logs: `/tmp/tikkun-updates-node.log`, `/tmp/tikkun-updates-browser.log`,
`/tmp/tikkun-updates-check.log`, `/tmp/tikkun-updates-native.log`, and
`/tmp/tikkun-updates-cap-sync.log`, and `/tmp/tikkun-updates-native-cold.json`.
