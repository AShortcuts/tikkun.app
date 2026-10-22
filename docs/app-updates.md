# Tikkun Update Delivery

Single update path: 2026-10-20. Each signed app update now carries the Reader's text, cues and recording catalog inside its web bundle, so there is one feed per native build at `/updates/web/<build>/`. The separate content feed, its compatibility contract and the native content store were removed. Builds 6 and 7 still read their published content feeds; those files stay in `site/updates/content/` and are retained and re-verified by every Pages build, but no new content feed is produced. Build 8 deletes the unused saved snapshot (`Application Support/TikkunContent`) on first launch. This change includes native code, so the next eligible OTA target is a new native archive (build 8) and its exported target record; neither the current source nor the last commit matches build 7's native contract.

Preparation checkpoint: 2026-10-07. Automatic Pages preparation and the local manual backup are implemented. Native archive `1.0 (7)` was built and its signature, native contract and 492 bundled files were verified; its signed public record is `config/native-update-target.json`. The real production preparation flow passed locally, producing a 1,873,823-byte web ZIP and a separate 3,950,716-byte content snapshot while retaining older downloads. Saved setup and activation records confirm that Cloudflare was configured at 2026-10-07T23:21Z to use `node scripts/build-pages.mjs`, production automatic mode, 100% rollout and a production-only encrypted signing secret. These records describe the verified configuration at that time, not a fresh live check. Git publication, native distribution and physical-device acceptance remain separate.

Historical implementation checkpoint: 2026-09-11. Native build `1.0 (6)` is archived and
uploaded through Sqim with manual update controls. Signed build-6 web and content
feeds are included in `site/updates/` for the existing GitHub-triggered deployment.
Keep publication on the Git-triggered Pages deployment. Do not upload directly with Wrangler.
The App Store Connect build remains separate from this development distribution;
the owner will publish a newer native app separately. Build 5 is not a web-feed
target for this release. No compatibility override is enabled.
The shared-prompt revision is prepared as a signed web update for that unchanged
build-6 native contract; the existing Sqim binary predates this UI revision.

## One Update Path

A signed app update replaces the Reader's HTML/CSS/JavaScript, which also contains
every text page, cue file and the recording catalog. Text corrections, new cues and
new recordings therefore ship exactly like code changes. Audio is not packaged;
recordings stream or download from the site as before.

The app checks after startup and when returning to the foreground or reconnecting,
at most once per 15 minutes after a successful check. It verifies a signed release
manifest, checks the exact native build and staged rollout, and uses
`@capawesome/capacitor-live-update` to verify and download the signed ZIP (about
1.9 MB). Automatic checks schedule that bundle for the next cold launch without
reloading. There is no paid cloud dependency or vendor update-service account.

Builds 6 and 7 also check `/updates/content/<compatibility>/`. Those published
files are kept unchanged so those builds keep working; they report "up to date"
for content because no newer content feed is published.

## Manual Checking

Native Reader Settings > More > App Updates includes **Check for Updates**.
It checks the app update feed immediately, bypassing the normal 15-minute interval while
sharing any check already in flight. Status distinguishes checking, downloading,
up to date, unpublished feeds, unsupported builds, and failed checks. Missing or
invalid feeds never report success.

Once an update is staged, the Reader displays the same centered **Update available**
pill as the PWA, with **Apply** and **Later**. Both delivery paths render
`src/lib/components/UpdatePrompt.svelte`; Settings does not add a second Apply
button. Manual checking reopens a dismissed prompt. **Apply** saves the current
reading and reloads through the native LiveUpdate plugin. Playback, recording, cue authoring, and
active download/removal work must finish first. The error remains visible and the
update stays pending. Apply becomes a neutral **Cancel** button, a thin line sweeps
along the bottom of the pill, and Later hides during a 1.2-second grace period.
The line has no fill level because applying reports no measurable progress; it is
hidden with reduced motion. Cancel or leaving Reader prevents the
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

- An RSA signature protects the release manifest; the native SDK also verifies
  the web ZIP signature. SHA-256 checks bind the manifest to the exact ZIP bytes.
- The public key is pinned in `config/update-public-key.pem` and the native
  plugin configuration. The private key is ignored under
  `.asc/update-signing/private.pem`, with owner-only permissions. Back it up
  securely outside the repository. Losing it requires a native key-rotation build.
- The web SDK has a 30-second readiness deadline, blocks failed bundles and
  falls back to the original bundled app (not a guaranteed previous OTA bundle).
- Native web bundle cleanup is SDK-managed. Audio, settings and bookmarks are
  not rewritten or removed by an update.
- Offline launch does not wait for the server. Network checks start after Reader
  readiness. No service worker is registered in the iOS app; web/PWA behavior is unchanged.

## Feed Hosting

Feeds need real JSON/ZIP responses, not the site's HTML fallback, and CORS for
`capacitor://localhost`. `site/_headers` contains the required update-path CORS/cache headers.
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
  --rollout 100 --approve-web-only
```

The generator checks the target archive's build number, installed public key,
and native compatibility fingerprint. Native code/config/dependency differences
stop the release. It rejects symlinks and signing-key/audio files; packages over
50 MiB unpacked produce a warning and continue. The app also warns for downloads
over 50 MiB. Signed byte counts and signatures remain mandatory. The archive must itself contain this update system; the old
TestFlight build 3 cannot be used as a target.

Output: `.asc/updates/web/BUILD_NUMBER/`, with a signed `latest.json` and signed,
hash-named ZIP. The low-level `updates:web` generator defaults to **0%** when
`--rollout` is omitted; the recommended `updates:release` workflow supplies
**100%** by default. Only publish after local verification
and explicit deployment approval. Host at `/updates/web/BUILD_NUMBER/`, ZIP first,
manifest last. A stable local random bucket selects the rollout; it is not sent
to a vendor service. Smaller rollouts remain available when explicitly requested.

Setting rollout to zero stops new staging but does not revoke already staged
bundles. To roll back a healthy but unwanted web revision, republish its known-good
predecessor with a newly signed manifest. A locally quarantined failing bundle
will not be retried; fix it and publish a new ZIP digest.

## Stage And Deploy

### Automatic Preparation On Push

Cloudflare Pages uses `node scripts/build-pages.mjs` with output directory `dist`. This dependency-free bootstrap enforces the pinned Node version, installs the pinned npm if needed, runs `npm ci` without the signing secret, and then invokes the same preparation used by `npm run build:pages`. On a production push to `develop`, the command restores previously published update files, runs `verify:quick`, builds native web assets, prepares and signs the app update for the target build, verifies it together with every retained feed, then builds and checks the website containing them. A failure exits nonzero and prevents the new deployment. The existing read-only GitHub verification workflow continues to run its full release/browser checks separately; Pages does not wait for that workflow. Review those checks when deciding what to merge/push. Local builds and preview branches run the ordinary website build without preparing updates or passing the signing key to build subprocesses.

One-time production configuration:

Order matters. Automatic mode fails the whole Pages deployment, website included,
when the current native source does not match `config/native-update-target.json`.
If waiting to push until a matching native archive and target record are ready,
leave the already configured `automatic` mode unchanged. Use
`TIKKUN_UPDATE_MODE=manual` only if the website must deploy before that archive
and record are ready, then switch back to `automatic` once they are committed.

- Build command: `node scripts/build-pages.mjs`; output: `dist`; production branch: `develop`. Set `SKIP_DEPENDENCY_INSTALL=1` and `NODE_VERSION=22.23.2` in production and preview so the bootstrap owns installation.
- Production-only encrypted secret `TIKKUN_UPDATE_PRIVATE_KEY`: the PEM contents of the existing `.asc/update-signing/private.pem`, matching `config/update-public-key.pem`. Never add this secret to Git, previews, logs, frontend variables or downloaded files.
- Production `TIKKUN_UPDATE_MODE=automatic`; optional `TIKKUN_UPDATE_ROLLOUT=100` (integer 0–100).
- Use the repository-pinned Node/npm for the build. Production has a required signing secret; missing keys or target records fail the build instead of silently publishing stale updates.

The bootstrap installs build/test tools explicitly with `npm ci --include=dev`, including when the hosting environment sets `NODE_ENV=production`.

The signing key is written to an owner-only temporary file only for the signing subprocess and deleted even on failure. Dependency installation, frontend builds, tests, and the staging verifier receive neither the PEM environment variable nor its file path. Pages also exposes production variables to production Functions; keep Functions trusted and never return their environment. Preview variables must not contain the key.

### Export The Native Compatibility Record

After creating the intended iOS device archive, export its signed public record:

```sh
npm run updates:target -- --native-build BUILD_NUMBER --target-archive .asc/artifacts/Tikkun-1.0-BUILD_NUMBER.xcarchive
```

This reads the archive's actual build number, device platform, embedded native contract and pinned verification key. It writes `config/native-update-target.json`, signed with the existing update key. The record contains only the build number and contract fingerprints; no account details, private key, archive path or signing certificates. Review and commit that file with the matching source. Export from the archive intended for distribution, never reconstruct the record from current source. Exporting does not upload or distribute the native app.

Every production preparation verifies the record's signature and compares its contract with the current native source both before and after `build:native`. Changed native code, Capacitor settings, plugins, generated native calendar resources or verification key require a new matching iOS archive and target record. The portable schema-2 contract excludes machine-local Xcode state and generated Capacitor JSON, while including the plugin package and resolved native dependencies. Old schema-1 archives can still be inspected; they cannot authorize schema-2 bundles. Initial automation therefore requires a fresh native build. Web changes can subsequently publish from pushes without another archive.

### Retaining Existing Downloads

The deployment includes a signed `/updates/index.json` describing exact public update paths, byte counts and SHA-256 digests. Before building the next deployment, preparation fetches that index from `https://tikkunreader.com` and restores its verified files into `site/updates/`. It retains older native-build feeds and immutable bundles, then replaces the current target's latest manifests. Download, signature, hash and output-parity failures stop publication. The first deployment permits a genuine index 404 and bootstraps from the verified public feeds already committed to Git. This initial rollout requires those existing feeds to remain in the checkout.

The index is served with `no-store`, like latest manifests. Hash-named bundles remain immutable; service-worker precaching and native packaging still exclude all update files. No new storage service, artifact download token or generated Git commit is involved. Accumulated files count against Pages limits and should be reviewed before a future retention policy is introduced. Rollback to a deployment predating this index also restores that deployment's older feed history; retain the newer deployment as a recovery artifact when rolling back.

### Manual Preparation As A Backup

The original local command remains available unchanged. To publish its prepared manifests through the configured Pages build, set the production variable `TIKKUN_UPDATE_MODE=manual`, then prepare, review, commit and push the public feed files yourself. In manual mode the build skips native generation and signing, restores remote downloads without overwriting local latest manifests, verifies the feeds, signs the retention index and builds the website. It still needs the production secret for that index. Return the variable to `automatic` to resume preparation from source on push.

### One Local Preparation Command

```sh
npm run updates:release -- --native-build 7
```

Despite its historical name, this command only prepares local artifacts. It runs
`verify:release`, builds native web assets, generates and signs the app update
under `.asc/updates/web/`, verifies and copies it into
`site/updates/`, then builds the website and verifies the prepared artifacts.
Reruns replace each `latest.json` with the newest signed manifest and retain older
hash-named downloads for clients already using them. It prints artifact paths for
review. It does not stage Git files, commit, push, publish, wait for deployment,
or contact GitHub. Those actions belong to the user.

Use the repository-pinned Node/npm, macOS, a clean `develop` checkout, and the
existing private update key. GitHub authentication and an interactive terminal
are not required. Use `--dry-run` for read-only preflight and a command preview.
The command requires clean source files and a clean Git index; unstaged changes
to generated public feed files are allowed so you can rerun before committing.
Review and commit source changes yourself before preparing a release. It never switches branches or
stashes/discards edits. It does not require the source to have been pushed.

Set `TIKKUN_UPDATE_PRIVATE_KEY_FILE` for an external signing key; the default is
`.asc/update-signing/private.pem`, with owner-only permissions. The default target
archive is `.asc/artifacts/Tikkun-1.0-BUILD_NUMBER.xcarchive`; override it with
`--target-archive PATH`. Archive compatibility remains mandatory. No Capacitor
sync or native compatibility override runs. Rollout defaults to 100%; use
`--rollout 10` for a limited rollout when the artifacts are eventually published.
Checks/builds may take 10-20 minutes and several GB of local output. Dependencies
and browsers are not installed automatically.

Preparation failures stop the command without publishing. Review any generated
local files before retrying. When ready, review, stage and commit the public
files yourself, then push to publish through the existing GitHub integration. After deployment, run `npm run updates:verify -- --native-build 7`
and compare the live digests and rollout with the prepared artifacts.

### Individual Steps

The existing Cloudflare Pages project is **tikkun**, serving `tikkun.pages.dev`
and `tikkunreader.com`. After creating the release, run:

```sh
npm run updates:stage -- --native-build 7
npm run build
```

Staging verifies the manifest signature, exact byte counts, hashes and ZIP
signature before copying public artifacts into
`site/updates/`. Only verified public artifacts enter the website; no private
signing material is copied. Browser precaching and native asset packaging exclude
this directory. Retain its prior immutable artifacts on subsequent deployments.

Review the public artifacts, commit the release files and routing code, and push
to **develop**. The existing Git integration builds and deploys the complete site,
including `site/updates/` and the repository's Pages Functions. With the automatic preparation configured, select manual mode for this backup path so the build keeps your locally prepared manifests. The production secret is still required to sign the retention index.
Never commit `.asc/`, signing keys, credentials, or phone installation links.

After the GitHub deployment succeeds, verify the actual public bytes:

```sh
npm run updates:verify -- --native-build 7
```

Verification checks manifest and ZIP signatures, exact byte counts and hashes,
JSON/ZIP responses, native CORS, caching, and an absent-feed
404. Build 6 is the first web-feed target; do not copy its manifest into build 5.
Future native builds use the same updater but require their own signed
`/updates/web/BUILD_NUMBER/` release. A newer build does not blindly install an
older build's package. With `build:pages` configured, production pushes generate compatible native update files automatically. The local backup command signs and copies an approved revision for your review and commit.

## Fresh Phone Builds

```sh
npm run native:share
```

This rebuilds and syncs web assets **before** asking Sqim to archive and upload.
Running Sqim alone does not refresh Capacitor's copied web files. The configured production Pages build prepares eligible signed updates automatically, but it does not build or distribute a new iOS binary. New native releases still need their own archive, distribution and exported compatibility record.

Releases change the version; Sqim builds only count up the build number. `native:share` archives each test build one above the highest of the project's build number, the published web update target in `config/native-update-target.json`, and the previous test build (kept in the ignored `.sqim/test-build` file). The bumped number exists only in that archive: `project.pbxproj` is restored afterwards, so the committed build number keeps matching the published target and the native contract stays unchanged. Because the app looks for updates at `/updates/web/<its build>/`, a test build above the published target finds none and never offers the released bundle as an update. A release that should itself receive web updates sets its own higher build number in the project before archiving and exports that archive's target record.

## Verification And Remaining Gates

- Automatic-preparation checkpoint (2026-10-07): the real production preparation flow passed locally, including `verify:quick` (1,151 Node tests), native packaging, separate signing, old-feed retention and exact deployment-output comparison. The clean native build and 30 Swift tests passed; one optional network test was skipped. Archive 7 passed signature, resource-parity and native-contract checks. Release validation also exposed outdated navigation/calendar/theme test fixtures and shared iframe import state; those fixtures were corrected, then all affected iframe tests passed in Chromium (77) and WebKit (66), and the media-theme checks passed. Full browser runs covered 788 Chromium and 523 WebKit assertions; their initial failures were resolved by those focused follow-ups. The first hosted automatic deployment and physical-device update acceptance still require the owner's publication steps.

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
