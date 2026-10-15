# Tikkun privacy-preserving analytics

The shared website and Capacitor reader send bounded, cookieless product events to the existing Melytics v0.5.4 installation. **The properties, dashboard reports, public collector, and production Pages settings are configured. Real user collection starts when the website changes and a new native app build are released.** No source changes have been committed, pushed, or published by this setup.

## Properties and transport

Two properties were created in the private Melytics dashboard under the existing account:

| Property | Dashboard site ID | Registered domain | Public key | Payload URL |
| --- | --- | --- | --- | --- |
| Tikkun Reader website | 2 | `tikkunreader.com` | `sIzf0AR7snr7` | `https://tikkunreader.com/reader` |
| Tikkun Reader app | 3 | `app.tikkunreader.com` | `iAu7GZxJiKU5` | `https://app.tikkunreader.com/app/reader` |

The app domain is an app-owned reporting namespace; it does not need to serve the reader. Do not reuse the portfolio key or use one Tikkun key for both properties. `config/analytics-public.json` supplies the public build defaults; exported `TIKKUN_ANALYTICS_*` variables override them. An explicitly blank key disables collection for its surface. These keys identify a property and grant no dashboard access. The native app sends actual pageviews as well as events, so Melytics's page, session, and funnel panels work for both properties.

Website requests go to same-origin `POST /api/echo`, implemented by `functions/api/echo.ts`. It accepts only the website key, approved page categories, and the event schema in `app/analytics/schema.ts`. It has a streaming 32 KiB body limit, rejects extra fields and persistent IDs, and forwards neither cookies nor authorization. Development, preview hosts, frames, browser automation, internal tools, print documents, and recording jobs do not collect.

The Pages Function sends requests to the dedicated `https://adamn.cc/api/tikkun-echo` relay. That route requires a server-only shared secret before trusting the forwarded visitor IP and country. This is necessary because [Cloudflare replaces the client IP on cross-zone Worker subrequests](https://developers.cloudflare.com/fundamentals/reference/http-headers/#cf-connecting-ip-in-worker-subrequests). Forwarding directly to the existing unmodified portfolio collector would merge distinct visitors. The integration does not expose the private dashboard or any admin API.

The app uses [CapacitorHttp](https://capacitorjs.com/docs/apis/http) directly, with a named Tikkun User-Agent plus the WebView's device information, a five-second timeout, and no global fetch patch. Its default public collector is the already configured `https://adamn.cc/api/echo`; `TIKKUN_ANALYTICS_APP_COLLECTOR` can name a dedicated HTTPS collector later. Native HTTP avoids browser CORS and preserves the device's public IP through the existing tunnel.

## What the reports mean

| Event | Useful question | Properties / counting rule |
| --- | --- | --- |
| Pageview (no event name) | Which public sections attract visits? | One initial view and one per changed page category; reader hash changes and scrolling do not inflate views |
| `reader_open` | Do visitors reach a usable reading? | Emitted after reader render; layout, sides, and broad route kind, never exact passages |
| `page_engagement` | How long does a page remain visible? | Incremental visible seconds; idle reading counts, hidden time does not |
| `playback_start` | How often is audio actually used? | First playing state per loaded session; `timed` distinguishes recordings with word cues |
| `playback_pause`, `playback_complete` | Where do listening sessions stop? | State transitions; completion means the recording reached its end, including after seeking |
| `playback_listened` | How much audio is practiced? | Incremental media seconds while advancing; obvious seek jumps excluded; not wall-clock time or proof every word was heard |
| `playback_error` | Is audio unavailable or failing? | `playback`, `offline`, or `prepare`; never error text or recording URLs |
| `search_results`, `search_select` | Does search find useful destinations? | Settled query result-count buckets, selected group and position, embedded/overlay surface; no query text or destination IDs |
| `download_start`, `download_complete`, `download_error`, `download_pause` | Do queued offline downloads finish? | Once per queued operation and terminal outcome; restored inventory and progress ticks do not count |
| `reader_setting` | Which presentation choices matter? | Layout, sides, theme, auto-scroll and speed bucket; no custom colors or full preferences |
| `bookmark_change` | Are saved places useful? | Add/remove action only; no location, labels, or stored bookmarks |
| `share_reading` | Are readings being shared? | Shared/copied/cancelled/failed; no shared content or destination |
| `print_open`, `print_requested`, `print_error` | Do people reach printing successfully? | Layout, sides, form, page count; requested means browser print was invoked, not confirmed paper/PDF output |
| `app_store_open` | Does the website send people to the app? | App Store link activation; not an install |
| `client_error` | Are navigation or runtime failures occurring? | Navigation/uncaught/unhandled category only; existing detailed support reports remain local |
| `__ping` | Is the live-visitor view current? | Every two minutes while visible and online |

Use Melytics's event-property explorer for distributions and numeric sums. Both properties have goals for `reader_open`, `playback_start`, `download_complete`, `share_reading`, and `print_requested`; the website also has `app_store_open`. The sharing goal is named **Share attempted**, because its event includes cancellation and failure; use the `outcome` property to distinguish success. Each property has an offline funnel (`download_start` -> `download_complete`). The website's listening funnel is page `/` -> `reader_open` -> `playback_start`; the app's is `reader_open` -> `playback_start`. Website visitors landing directly in the reader do not enter the homepage funnel. All 11 goals and four funnels were saved and verified.

Country/device/browser/referrer breakdowns come from Melytics's standard enrichment. Referrers include only their origin; query strings, UTM values, hashes, arbitrary outbound links, and full URLs are not sent. This implementation does not install `m.js`, avoiding its automatic full-URL/hash tracking and duplicate pageviews. Web Vitals, retention cohorts, cross-device identity, and confirmed installs are not collected by this integration. Cookieless visitor counts are daily estimates, not a count of identifiable people.

## Privacy and lifecycle

Collection is allowed by default once a property key is configured, with an immediate device-local opt-out labeled **Privacy-preserving analytics** in Reader Settings -> More -> Privacy and on `/privacy`. The saved local choice controls collection independently of Do Not Track and Global Privacy Control. Unreadable preference storage disables collection; if saving an opt-out fails, it still applies for the current session and the UI reports that it could not be saved.

There are no analytics cookies, persistent IDs, recorded search text, exact passages, saved reading data, recordings, or raw error messages in event payloads. Melytics uses a daily salted hash of IP and User-Agent for visitor estimates; its configured raw-hit retention is 90 days, with longer-lived daily rollups. The client caps bursts at 60 requests/minute and four in-flight requests. It never stores a delivery queue, retries failed events, or replays offline activity. On reconnect it can count the current page as a new online view. Delivery failure logs one generic warning per mount and never blocks reading.

The app manifest declares Product Interaction, Other Diagnostic Data, Coarse Location, and Device ID for analytics, unlinked and not used for tracking. Device ID conservatively covers the daily derived visitor hash; this does not enable a persistent client identifier. Before shipping an enabled app, review these declarations and the actual server behavior, generate Xcode's privacy report, and update App Store Connect's privacy answers to match. The widget extension does not send analytics. See [Apple's manifest categories](https://developer.apple.com/documentation/bundleresources/app-privacy-configuration/nsprivacycollecteddatatypes/nsprivacycollecteddatatype) and [privacy manifest guidance](https://developer.apple.com/documentation/bundleresources/describing-data-use-in-privacy-manifests).

## Configuration completed September 30, 2026

- Both sites have persistent identification disabled and 90-day raw-hit retention.
- Cloudflare Pages project `tikkun` has the website/app public keys and site origin in its production environment, plus an encrypted `MELYTICS_RELAY_TOKEN`. The existing `develop` branch, GitHub integration, preview settings, and deployment were preserved. Preview has no relay secret. Changes take effect on the next normal production deployment.
- The relay route is installed in work-server's `/etc/caddy/Caddyfile`, and the canonical `ghost/Caddyfile.work-server` source includes the same route. `/etc/caddy/tikkun-analytics.env` holds the secret with root-only permissions. `/etc/systemd/system/caddy.service.d/tikkun-analytics.conf` loads that file and replaces the package's `--environ` startup command, preventing the secret from being printed to the service log.
- The prior Caddy configuration is backed up in `/var/backups/caddy-tikkun/20260930T141615Z/Caddyfile`. Caddy validation and restart succeeded. The existing portfolio, tracker script, and blog passed health checks afterward.
- Live labeled `integration_check` events were accepted into the correct website and app properties, with `transport=web_relay` and `transport=native_http`. Two local executions of the actual Pages Function sent `__ping` through the public relay using distinct documentation-only IP addresses and the same User-Agent; database verification found two distinct visitor hashes and no persistent IDs. No synthetic pageviews or goal conversions were added. These are transport smoke checks, not evidence of a deployed website Function or a physical app session.
- The relay rejects a wrong token with 404. Public `/app/`, `/install`, and `/api/auth/user` paths remain unavailable. The private dashboard remains available only through its existing LAN/Tailscale route.

## Release and verification

1. Review the local source changes and use the normal GitHub-triggered production deployment. The public build configuration is already wired in; no key export is necessary. The Pages Function must ship alongside `dist`, as the existing audio delivery functions do. Its local Wrangler build includes `/api/echo` and excludes the colocated test files.
2. Run the existing native sync/release workflow to package the app configuration and updated privacy manifest. Update App Store Connect's privacy answers and verify a physical device before release. Do not deliver enabled analytics only as a web-content update to an older binary with an empty collection manifest; target a newly archived native build. The existing native update contract includes `.xcprivacy` files and rejects web updates whose native contract differs from the target archive.
3. After release, verify a real production browser and physical app independently. Check a pageview, search result/selection, playback start/end, a queued download outcome, and print/share outcomes in the correct dashboard property. A collector HTTP 204 alone is insufficient: unknown keys, bot agents, and mismatched domains also return 204. Confirm two different client networks remain distinct visitors, opt-out stops events, and offline activity is not replayed.
4. For later secret rotation, generate a fresh 64-character hexadecimal value and update both the encrypted Pages production binding and the root-only Caddy environment file. Back up configuration, validate with the service environment, and restart Caddy through the existing server procedure. Pages must then receive a normal production deployment to use the changed binding. Never put the secret in client variables, source files, logs, or Git. `docs/analytics-collector.caddy` is the deployed route template.

## Local verification

Run `npx vitest run --project=node app/analytics functions/api/echo.test.ts` for payload, transport, transition, and relay checks. Run `npx vitest run --project=browser app/analytics/client.vitest.ts` for real-browser navigation, visibility, opt-out, offline, and native-payload contract tests. These browser tests use an injected local collector and never send production analytics. Native HTTP is tested with a mocked Capacitor bridge; device delivery and dashboard acceptance remain release gates.

Verified September 30, 2026: 32 unit tests; 51 Chromium integration checks covering analytics, settings, search, printing, and public routes; then the expanded 11 analytics checks passed in both Chromium and WebKit. After configuring the real keys, the 32 unit tests, full typecheck/lint, website build, native web-bundle build, and local Pages Functions compilation passed again. Both web bundles contain the public configuration. App privacy-plist validation, Caddy validation, desktop/mobile UI inspection, and the live backend checks above passed. The latest website build reports a shell-precache size warning (1,686,725 bytes versus the 1,610,000-byte budget); the native web bundle is 6,264,089 bytes with no bundled audio library. No native binary was built or uploaded. Deployed browser traffic and physical-device delivery remain release checks.
