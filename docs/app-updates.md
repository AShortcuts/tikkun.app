# Tikkun Update Delivery

Implementation checkpoint: 2026-09-11. Native build `1.0 (6)` is archived and
uploaded through Sqim with manual update controls. Signed build-6 web and content
feeds are included in `site/updates/` for the existing GitHub-triggered deployment.
Do not deploy directly with Wrangler or change Cloudflare configuration.
The App Store Connect build remains separate from this development distribution;
the owner will publish a newer native app separately. Build 5 is not a web-feed
target for this release. No compatibility override is enabled.
The shared-prompt revision is prepared as a signed web update for that unchanged
build-6 native contract; the existing Sqim binary predates this UI revision.

## Two Separate Paths

**Content updates** change practice material, not application code. The native
Reader checks a signed manifest after startup and when returning to the foreground
or reconnecting, at most once per 15 minutes after a successful check. New content
is validated and saved as a pending snapshot. The open document continues using
one revision; a fresh launch activates pending content before loading the catalog.

The first snapshot is 3,889,665 bytes (about 3.9 MB), without audio. This initial
implementation downloads a complete snapshot when content changes, not individual
changed files. Downloads over 12 MiB produce a warning and continue. Unchanged
releases only fetch the small manifest. Large audio remains user-controlled.
Native content-state storage above 32 MiB also warns and continues; UTF-8, JSON,
signed byte-count, digest, and compatibility validation remain enforced.

**Controlled web updates** change compatible HTML/CSS/JavaScript. The app verifies
a signed release manifest, checks the exact native build and staged rollout, and
uses `@capawesome/capacitor-live-update` to verify and download the signed ZIP.
Automatic checks schedule that bundle for the next cold launch without reloading.
There is no paid cloud dependency or vendor update-service account.

## Manual Checking

Native Reader Settings > More > App Updates includes **Check for Updates**.
It checks both feeds immediately, bypassing the normal 15-minute interval while
sharing any check already in flight. Status distinguishes checking, downloading,
up to date, unpublished feeds, unsupported builds, and failed checks. Missing or
invalid feeds never report success.

Once an update is staged, the Reader displays the same centered **Update available**
pill as the PWA, with **Apply** and **Later**. Both delivery paths render
`src/lib/components/UpdatePrompt.svelte`; Settings does not add a second Apply
button. Manual checking reopens a dismissed prompt. **Apply** saves the current
reading and reloads through the native LiveUpdate plugin. Playback, recording, cue authoring, and
active download/removal work must finish first. The error remains visible and the
update stays pending. Apply becomes the wine-colored **Cancel** button and hides
Later during a 1.2-second grace period. Cancel or leaving Reader prevents the
pending reload without removing the staged bundle. Cancel disables once native
reload begins, which cannot be undone. Reload failure permits retry. Ignoring Apply preserves the
automatic next-cold-launch behavior. Audio, preferences and bookmarks stay intact.

The website service worker manages network-served browser assets. Capacitor loads
bundled files under `capacitor://localhost`, so iOS uses the native signed-bundle
installer instead. The PWA prompt cannot update those native files.

## Visible Prompt Preview

Native checks/downloads remain automatic without interrupting practice. Once
ready, the shared nonmodal prompt offers Apply and Later. The web/PWA service
worker uses the same prompt, with its own activation and cancellation logic.

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

The GitHub deployment serves the staged public files at:
`https://tikkunreader.com/updates/content/<compatibility>/`.
Commit the snapshot and its signed `latest.json` together. Retain
previous immutable files for in-flight clients. The feed needs real JSON responses,
not the site's HTML fallback, and CORS for `capacitor://localhost`.
`site/_headers` contains the required update-path CORS/cache headers.
`functions/updates/[[path]].ts` also prevents Cloudflare Pages from returning its
HTML fallback for absent feeds, returns a real 404, and sets native CORS plus
no-store caching for manifests. Hash-named artifacts are immutable.

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
stop the release. It rejects symlinks and signing-key/audio files; packages over
50 MiB unpacked produce a warning and continue. The app also warns for downloads
over 50 MiB. Signed byte counts and signatures remain mandatory. The archive must itself contain this update system; the old
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

## Stage And Deploy

The existing Cloudflare Pages project is **tikkun**, serving `tikkun.pages.dev`
and `tikkunreader.com`. After creating both releases, run:

```sh
npm run updates:stage -- --native-build 6
npm run build
```

Staging verifies both manifest signatures, exact byte counts, hashes, ZIP
signature, and the content contract before copying public artifacts into
`site/updates/`. Only verified public artifacts enter the website; no private
signing material is copied. Browser precaching and native asset packaging exclude
this directory. Retain its prior immutable artifacts on subsequent deployments.

Review the public artifacts, commit the release files and routing code, and push
to **develop**. The existing Git integration builds and deploys the complete site,
including `site/updates/` and the repository's Pages Functions. No Cloudflare login,
new deployment configuration, direct upload, or private CI signing key is needed.
Never commit `.asc/`, signing keys, credentials, or phone installation links.

After the GitHub deployment succeeds, verify the actual public bytes:

```sh
npm run updates:verify -- --native-build 6
```

Verification checks manifest and ZIP signatures, exact byte counts and hashes,
content compatibility, JSON/ZIP responses, native CORS, caching, and an absent-feed
404. Build 6 is the first web-feed target; do not copy its manifest into build 5.
Future native builds use the same updater but require their own signed
`/updates/web/BUILD_NUMBER/` release. A newer build does not blindly install an
older build's package. A GitHub push alone does not generate native update files;
sign and stage approved web/content revisions locally before committing them.

## Fresh Phone Builds

```sh
npm run native:share
```

This rebuilds and syncs web assets **before** asking Sqim to archive and upload.
Running Sqim alone does not refresh Capacitor's copied web files. A web deployment
also does not automatically create a signed native update: eligible fixes still
need the signing, staging and publishing steps above.

## Verification And Remaining Gates

- Shared prompt follow-up: 21 Node tests and 48 Chromium/WebKit tests pass,
  including Cancel/retry, Reader teardown, Settings, and unchanged PWA behavior.
  TypeScript, Svelte, ESLint and the native web bundle build pass. The signed
  build-6 release has been regenerated and verified locally. Hosted delivery is
  checked separately with `npm run updates:verify -- --native-build 6`.

- Current manual-update work: type checks, Svelte and ESLint pass; 50 focused
  Node tests and 62 unique Chromium/WebKit tests pass, including the existing
  Settings suite. Build 6 archives successfully. A full web build and the Pages
  Functions compilation pass. Local Pages HTTP checks verify both signatures,
  exact bytes, CORS, cache policy, absent-feed 404, and a working Reader route.
  The production feed and physical-device Apply/cold-launch acceptance remain
  separate acceptance checks. The owner deferred phone acceptance until the
  newer native app is published; no build-5 phone update is promised.

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
- Native release and tester access are separate from the GitHub feed deployment.
  Build `1.0 (5)` was uploaded and attached for TestFlight/App Store preparation;
  build 6 has not been uploaded to App Store Connect by this feed-publishing work.

Logs: `/tmp/tikkun-updates-node.log`, `/tmp/tikkun-updates-browser.log`,
`/tmp/tikkun-updates-check.log`, `/tmp/tikkun-updates-native.log`, and
`/tmp/tikkun-updates-cap-sync.log`, and `/tmp/tikkun-updates-native-cold.json`.
