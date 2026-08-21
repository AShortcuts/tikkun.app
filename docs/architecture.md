# Architecture Notes

This file is a living summary of the architectural choices in this app. Keep it practical and editable: update it when the codebase changes direction, when a pattern becomes intentional, or when a new subsystem needs a short orientation note.

## Product Shape

Tikkun is a browser-first, static web app for preparing Torah readings. The core experience is a page-based reader with selectable readings, reader preferences, audio playback, word-level cue highlighting, and optional publishing workflows for synced audio/video assets.

SvelteKit owns the static public shell and clean pathname routes. The Reader keeps its mature TypeScript modules, Svelte feature mounts, and browser-local hash router behind the `/reader/` boundary. No server or global store is required.

Durable trade-offs live in [`docs/adr/`](adr/): static delivery, Reader hash routing, incremental Svelte adoption, explicit offline media, and Cue Authoring trust semantics.

## Runtime Architecture

- `src/app.html` owns shared metadata, the PWA manifest link, and the early Reader theme bootstrap.
- `src/routes/(site)/` owns the prerendered Home, Readings & Coverage, Tidbits, and About pages. `src/lib/readings.ts` derives public coverage from the real recording catalog and maintained tracker.
- `src/routes/reader/+page.svelte` renders `src/lib/components/ReaderApp.svelte`. Reader App owns the stable mount targets and loads `app/index.ts` only in `onMount`, so public pages never execute the Reader Runtime.
- `app/index.ts` is the small Reader bootstrap. It resolves browser storage, recording mode, and the public About URL, then exposes explicit start and stop functions to the SvelteKit route.
- `app/reader/reader-runtime.ts` is the composition root and the real Reader Runtime Module. Its lexical lifetime owns reader state and wires preference policy, feature Interfaces, Reader Playback, Reader Display Session, and the Reader Route host without exposing mutable globals.
- `app/reader/reader-display-session.ts` is the Reader Display Session Module. It owns the active `ScrollDisplay` lifetime and generation, DOM target indexes, progress-anchor cache, `ViewportTracker`, presentation scheduler, Page Window, audio preload, and background resource prewarming behind one narrow Interface. Reader Runtime supplies domain effects; stale async work validates the captured display lease before applying.
- `app/reader/reader-route.ts` is the Reader Route Module. Its small Interface hides hash listening, same-hash navigation, canonical reader hashes, Cue Analytics/not-found switching, visible title state, Optional Feature cancellation, first-use Parsha Picker loading and lifetime, and route-safe post-render work. Public About navigation crosses the host seam into the SvelteKit page.
- `app/reader/reader-shell.ts` mounts `app/reader/ReaderShell.svelte` before the rest of Reader Runtime. Reader Shell owns the stable reader frame and presents title, progress, route and Parsha Picker visibility, annotations, static chrome icons, and the empty targets used by nested reader features.
- `app/reading/aliyah-navigation/aliyah-navigation.ts` is the public Interface for the Aliyah Navigation Module. Its two Svelte views own the toolbar capsule, compact segments and sheet, wide rail, local focus and reveal state, async presentation data, and cleanup. Reader Runtime supplies typed snapshots and actions while keeping routing, page scrolling, playback, recording lookup, and Cue Data policy outside Svelte.
- `app/reading/reader-playback.ts` is the Reader Playback Module. It owns construction, cross-wiring, route reset, and teardown for the Audio Controller, Highlight Controller, Recording Session, and Playback Timeline while accepting page, network, preference, Cue Authoring, and presentation Adapters from Reader Runtime.
- `app/reader/reader-presentation-scheduler.ts` is the Reader Presentation Module. Its small invalidation Interface coalesces scroll, Reader Viewport, resize, and playback presentation work into at most one presentation callback per animation frame.
- `app/reader/reader-page-window.ts` owns the optional virtualization session: active display generation, retain policy, nested eviction holds, and coalesced near-placeholder remount and trim work. Reader Display Session supplies direct playback-protection, viewport, and presentation callbacks; `ScrollDisplay` retains rendering and mount mechanics.
- `app/reading/recording-session.ts` owns the Recording Session: narrator-aware recording lookup, page-token caching, Cue Data loading, playback-plan installation, cancellation, and transitions into and out of authoring.
- `app/reading/playback-timeline.ts` owns Playback Timeline behavior: playback commands, seeking policy, speed policy, cue progress, highlight synchronization, responsive policy, and cleanup. `app/reading/floating-player.ts` mounts `app/reading/FloatingPlayer.svelte`, whose connected Interface owns player markup, visual state, focusable controls, pointer mechanics, and icon presentation without selector-driven updates from Playback Timeline.
- `app/reader/lazy-reader-settings.ts` keeps the settings launcher ready immediately and imports `app/reader/reader-settings.ts` only on first use. The mount bridge and `app/reader/ReaderSettings.svelte` then own presentation, dialog state, focus return, theme-transition timing, preference events, and playback-rate handoff.
- `app/reader/reader-controls.ts` is the narrow mount bridge for `app/reader/ReaderControls.svelte`, which owns the wide bookmark and command buttons plus the compact Reader Controls menu. Both presentations use the same state and action callbacks while CSS decides which controls are visible.
- `app/navigation/lazy-command-palette.ts` preserves the first-use overlay boundary while importing `app/navigation/command-palette.ts` only when needed. `app/navigation/CommandPalette.svelte` is now only an overlay and focus host for shared Reader search.
- `app/components/parsha-picker-model.ts` prepares calendar, route, reading-catalog, and aliyah-choice data without rendering. `app/components/ParshaPicker.svelte` owns Reading Index and hosts the same shared search control behind `app/components/ParshaPicker.ts`.
- `app/reader/last-reading-prompt.ts` and `app/reader/offline-recording-prompt.ts` own their focused reader tools and browser effects.
- `app/support/support-diagnostics.ts` is the Support Diagnostics Module. Its small Interface hides bounded error capture, coarse environment classification, privacy filtering, and JSON export. `src/hooks.client.ts` starts its in-memory browser lifetime and records unexpected SvelteKit errors; About and Reader Settings expose explicit copy/download actions. No report is persisted, uploaded, or created before a user asks for it.
- `app/admin/cue-authoring-loader.ts` and `app/components/cue-analytics-route.ts` keep Optional Features outside the core reader bundle until they are requested.
- `app/admin/cue-authoring.ts` owns the Cue Authoring lifetime: access state, Cue Drafts, timing rules, microphone capture, issue rules, and export. `app/admin/cue-waveform.ts` owns Cue Waveform loading, caching, windows, markers, seeking, retry, and scheduling. The Svelte Panel, Cue List, Recording Issue dialog, and Cue Export Sheet own their focused presentation behind narrow TypeScript Interfaces.
- Remaining imperative UI uses focused components and controllers. Svelte is introduced feature by feature where it gives one clear owner to markup, local interaction state, or browser lifetime.
- `app/components/icons.ts` is the canonical icon implementation. `app/components/UiIcon.svelte` is only the typed Svelte adapter and must not duplicate SVG paths.
- State is kept close to the feature that owns it. There is no global store; shared behavior is exposed through narrow controllers and view models.
- Browser storage is used for user-facing local state such as reader preferences and admin cue drafts.

### Lifetime Ownership

- `app/lifecycle/mount.ts` is the shared seam for browser effect ownership. A mount receives an `AbortSignal`, owns explicit teardown functions, and returns an idempotent destroy function.
- Reader Runtime is one replaceable lexical mount created inside `app/reader/reader-runtime.ts`. It owns Reader Playback, nested feature mounts, public feature Interfaces, DOM and media listeners, timers, frames, and cancellation for pending route work. The bootstrap retains only the returned destroy Interface.
- Reader Display Session is nested inside Reader Runtime. A route replacement destroys the old display first, invalidates every display-bound cache, aborts its generation, and rejects stale render, prewarm, and remount completion before they can affect the new display. Its teardown releases the display, ViewportTracker, Page Window, presentation frames, preload media, and background work together.
- Reader Shell is mounted first and released last within Reader Runtime. Its reader root, optional-page outlet, toolbar, Aliyah Navigation mount targets, and other nested feature targets retain their identity for the lifetime of the mount.
- Reader Route owns the hash listener, Optional Feature abort controller, Parsha Picker import and instance, pending-intent cancellation, and stale-render checks. It keeps the current view visible until the picker is ready, and its cleanup runs before Reader Shell releases the roots it uses.
- Aliyah Navigation mounts into those empty Reader Shell targets before Reader Controls. Its timers, resize listeners, focus work, async status requests, and framework instances are released before Reader Shell.
- Reader Playback is mounted through the lifetime Seam. It creates the four playback Implementations once, owns their cross-wiring, and resets or releases them together.
- Reader Presentation is mounted through the same lifetime Seam. It cancels its pending frame and layout-deferred invalidations on teardown, and reentrant invalidation moves to the next frame instead of being lost.
- Cue Authoring is mounted through this Seam. The Svelte Cue Authoring Panel is mounted first and released last so its stable Cue List and Cue Waveform targets outlive their nested Implementations. Cue Waveform owns its lane listeners, retry handlers, resize listeners, animation frame, summary loaders, and caches; the parent lifetime releases it with object URLs, microphone capture, the Cue List, Recording Issue dialog, and Cue Export Sheet.
- Playback Timeline is nested inside Reader Playback. Its media subscriptions, responsive expansion policy, drag position policy, and scheduled focus are released as one lifetime.
- Floating Player is mounted and unmounted inside the Playback Timeline lifetime. Its Svelte Implementation owns control, pointer, focus, resize, and outside-dismiss mechanics, so a replacement runtime cannot retain old player markup or listeners.
- Lazy Reader Settings owns the always-ready launcher, pending open intent, retryable import, and mount lifetime. Its form and document listeners, delayed focus, theme-transition timer, dialog state, and focus target are released together.
- Reader Controls is mounted through the same seam. Its menu state, outside-dismiss listener, keyboard handling, and framework instance are released together.
- The lazy search overlay owns pending open intent, retryable import, and mount lifetime. Reader Route owns the active Reading Index. Runtime coordination guarantees one active search placement: Cmd-K focuses embedded search when present, while opening Reading Index closes the overlay.
- Mounting a replacement destroys the previous implementation first. Destroy functions are tied to their specific mount, so stale framework cleanup cannot tear down a newer remount.
- DOM listeners should use the mount signal. Typed event subscriptions, timers, animation frames, controllers, and nested feature mounts should transfer their teardown to `scope.own(...)`.
- Feature setup is synchronous. Async work may start inside a mount, but it must observe the signal before applying a result.
- Lifetime infrastructure owns cancellation and cleanup only. Domain state and platform capabilities do not belong in the mount module.
- Add future reader browser effects to the Reader Runtime or a nested mount so a replacement cannot leave listeners, timers, or stale async results behind.

### Adaptive UI Structure

- Share domain models, actions, semantic markup, and visual tokens across viewport sizes.
- Use CSS media or container queries for presentation changes where the interaction and DOM structure remain the same.
- Keep meaningfully different compact and wide interaction structures, such as a sheet and persistent rail, as separate presentation branches inside one owning Module. Both consume the same typed state and actions.
- Do not spread `isMobile` branches through domain logic. Viewport shape chooses a UI implementation; Capacitor capability adapters choose Web versus native behavior.
- Treat Capacitor as a packaging and device-capability layer. It should not become the definition of the mobile layout.
- `app/adaptive/reader-viewport.ts` owns the Reader Viewport query and exposes compact versus wide capacity to JavaScript. It is created inside a mount so importing app modules does not execute a viewport query.
- `app/reading/aliyah-navigation/model.ts` owns the pure snapshot model. `aliyah-navigation.ts` exposes the Module Interface, while `AliyahToolbar.svelte` and `AliyahNavigationLayer.svelte` hide the compact and wide Implementations behind that Seam.
- Reader Controls shares one typed state and action interface across its wide buttons and compact menu. CSS handles visibility; JavaScript checks Reader Viewport only when opening Aliyah Navigation requires a rail or picker.
- The compact Reader Viewport contract is `550px`. CSS still owns visual layout through media queries; JavaScript uses `COMPACT_READER_QUERY` only when behavior or DOM interaction genuinely differs.

### Framework and Native Migration Boundary

- Svelte is the incremental presentation layer for Reader Shell, Aliyah Navigation, Reader Settings, Reader Controls, shared Reader Search, Parsha Picker, Floating Player, the Cue Authoring Panel, Cue List, Recording Issue dialog, and Cue Export Sheet. Domain rules, preference persistence, playback, Reader Route coordination, Cue Authoring timing, export transactions and persistence, page rendering, waveform rendering, and browser capabilities remain in TypeScript Modules behind narrow Interfaces.
- A Svelte Module owns only the descendants or anchored siblings created by its explicit mount. Its TypeScript bridge mounts and unmounts it through the existing lifetime scope so Svelte and imperative controllers never compete for the same DOM.
- Reader Shell renders stable empty targets for nested Svelte and imperative features but never manages their contents. It updates classes, text, progress styles, and annotation state without conditionally replacing the `tikkun-book` reader root or optional-page outlet.
- Add Svelte feature by feature. Prefer a pure model plus a small mount adapter when the feature has meaningful domain preparation, as Parsha Picker does. Do not introduce a global store simply to connect old and new UI.
- SvelteKit is the delivery and public-routing layer. Reader components keep browser APIs inside their mounted lifetime, and Reader domain models remain safe to import during prerendering.
- A future Capacitor entry should compose Platform Capability adapters at the application boundary. Use native-platform or plugin-availability checks only to choose implementations such as native filesystem versus web download.
- Reader Viewport remains responsible for compact versus wide layout in browsers, PWAs, and Capacitor WebViews. Platform Capability must never become a responsive breakpoint.

## Build and Delivery

- SvelteKit and `adapter-static` prerender the public pages and fixed Reader entry; Vite compiles the client bundles.
- `site/` contains files copied unchanged by SvelteKit, including audio and install assets.
- `dist/` is the portable static output. The Cloudflare release also deploys `functions/audio/`; a dist-only host remains functional but cannot claim verified byte-range media unless that host independently serves `206` responses.
- `scripts/generate-torah-index.mjs` validates canonical `text/torah-toc.json` and writes the smaller `generated/torah-index.json` used at runtime. `predev` and the production build keep it current.
- `npm run dev` renders routes on demand with hot reload. `npm run build` generates authoritative reading data, prerenders the routes, derives CSP hashes from every built inline script, generates `dist/service-worker.js`, and enforces code plus host-asset size ceilings.
- `site/_headers` supplies the static host's baseline browser headers. Postbuild replaces its source-script hash with the deterministic union from the actual HTML artifact. CSP remains report-only until the deployed release checklist confirms that every required route and asset works without a violation.
- The product needs no application server. Cloudflare's narrow audio Function is a delivery adapter for reliable Range semantics, not an app backend.

## PWA Strategy

The app is treated as a PWA-capable static site rather than a native shell.

- `site/manifest.webmanifest` defines install metadata, display mode, colors, and relative install URLs.
- `src/app.html` includes Apple mobile web app metadata and icon links.
- `scripts/generate-service-worker.mjs` creates a versioned cache after each build.
- The generated service worker precaches the app shell, page chunks, and first-use core reader chunks, then uses cache-first behavior for requested same-origin assets.
- Navigation requests use network-first behavior with an exact cached clean-route match, then the cached Home page as a final fallback.
- Cue Data, prototype routes/assets, Optional Feature bundles, the recording-only harness, and large media files are intentionally excluded from the initial precache so installation does not download content the reader has not requested.
- Reader Settings offers an explicit per-recording Offline Download. The recording cache incrementally verifies the published SHA-256 digest and size before commit, reports progress, exposes the selected copy and other saved recordings for explicit cleanup, and serves cached `Range`/`If-Range` playback without opportunistically storing ordinary media requests.
- Before the first production release, the generated worker and cache protocol support only the current build contract; there is no previous-worker compatibility layer.
- Reader Settings, the search overlay, and Reading Index are deferred from initial JavaScript execution but remain precached because they are core reader controls that must work offline.
- Unified Reader search can read saved Cue Authoring access without importing Cue Authoring. The authoring implementation loads only when an unlocked user runs that action or invokes its dedicated shortcut.
- Recording media should become available offline only through explicit user-requested offline downloads, not silent playback caching.

If native app packaging is ever added, prefer treating Capacitor or another native wrapper as a packaging layer around the existing web build, not as a rewrite of the app architecture.

## Data Model

The app separates calendar/reading rules from rendering.

- `app/calendar-model/` defines the leining model and calendar-driven grouping.
- `text/torah-toc.json` remains the readable canonical Torah page map. `app/data/torah-index.ts` exposes the compact generated runtime representation without changing its reference behavior.
- The main hierarchy is `LeiningDate` -> `LeiningInstance` -> `LeiningRun` -> `LeiningAliyah`.
- `LeiningGenerator` creates reading data using Hebcal libraries and app-specific rules.
- `app/view-model/` adapts model data into exactly what the UI should render.
- `app/view-model/scroll-view-model.ts` decides which pages, labels, aliyot, and messages appear in the scroll.
- `FullScrollViewModel` renders full scrolls for regular parsha and megillah views.
- `HolidayViewModel` renders selected pages plus skip messages for holiday/special readings.

## Routing

Public routing uses clean SvelteKit pathnames. Reader routing remains hash-based and browser-local.

- `/`, `/readings/`, `/tidbits/`, and `/about/` are prerendered public pages.
- `/tidbits/[slug]/` is generated only for entries in `src/lib/tidbits.ts`; with no published Tidbits, no detail pages are emitted.
- `/reader/` is a prerendered entry document. Everything after `/reader/#/` belongs to the Reader Route Module.
- `app/view-model/navigation/url-parser.ts` parses hashes into app routes.
- `app/reader/reader-route.ts` owns the browser route transaction and uses Reader Shell as its presentation Adapter.
- Reader routes resolve to a `ScrollViewModel`.
- Supported Reader route families include the current reading, explicit run IDs, Torah references, parsha slugs, physical pages, and cue analytics.
- Canonical parsha hashes are generated through the navigation view-model layer and applied once by Reader Route rather than directly in UI handlers.

## Search

Search is local, typed, and shared at the retrieval layer while remaining scoped by feature.

- `app/search/normalize.ts`, `query-parser.ts`, and `search-index.ts` own Unicode-safe normalization, structured query parsing, Fuse.js candidate retrieval, deterministic rank bands, range mapping, deduplication, and stable limits.
- `app/search/reading-search.ts` adapts generated leinings; `app/search/action-search.ts` adapts runnable Reader actions through an external ID map; and `app/search/reader-search.ts` merges both under one ranking and deduplication contract. `app/search/ReaderSearchBar.svelte` renders that contract identically in Reading Index and the overlay. `src/routes/(site)/readings/reading-coverage-search.ts` separately adapts public coverage data and coverage filters.
- `app/view-model/navigation/parsha-route-catalog.ts` is the lightweight canonical alias source. Calendar-backed route resolution imports that catalog, while public search can reuse it without importing Hebcal generation.
- Each active Reader host builds one combined index on open and rebuilds only on refresh or calendar-setting reconstruction; the public coverage page builds one index at component initialization. Keystrokes only query an existing index.
- The homepage does not import the search engine. Reading Index and the overlay remain lazy; their shared search chunks are available offline through the app-shell cache.
- Relevance behavior is locked by `app/search/golden-queries.ts` and adapter/browser tests. See `docs/search.md` for ranking, lifecycle, bundle, timing, and cache details.

## Rendering and Scrolling

Rendering is page-oriented and lazy.

- JSON page data under `text/pages/` is loaded dynamically by text name and page number.
- `ScrollDisplay` renders `RenderedEntry` values into the reader root.
- `InfiniteScroller` loads previous or next content when the user nears either edge of the scroll container.
- Rendered pages dispatch a `page-rendered` event so other systems, especially highlighting, can index newly inserted token elements.
- Reader Display Session is the single vertical owner for display replacement and page lifecycle orchestration. It preserves the established event order while keeping display generation, DOM indexes, progress-anchor invalidation, presentation scheduling, ViewportTracker, Page Window, audio preload, and prewarm cancellation consistent.
- Reader Page Window waits for the active display's initial centered scroll before allowing eviction, preserves nested navigation and token-collection holds across display replacement, and rejects stale async remount completions by display generation. A near-placeholder remount schedules one generation-bound policy trim after scroll quiescence so reverse traversal stays bounded. Ordinary pause release deliberately does not trigger a policy pass; navigation-hold release does.
- Reader Progress Anchor Index rebuilds measured aliyah geometry only after explicit layout invalidation; routine scroll frames use its immutable cached snapshot without rescanning the DOM.
- `/reader/?debugPerformance=1#/...` enables local native User Timing
  entries for presentation work, progress-anchor rebuilds, and page
  render/eviction churn. Inspect them with
  `performance.getEntries().filter(({ name }) => name.startsWith('tikkun:reader:'))`;
  reset with the corresponding `performance.clearMarks(name)` and
  `performance.clearMeasures(name)` calls. Nothing is persisted, uploaded, or
  reported.
- Scroll position and top-bar state are derived from the measured anchor index and view models instead of duplicated in a central store.

## Audio and Highlighting

Audio support is data-driven and controller-based.

- `scripts/generate-audio-manifest.mjs` copies supported source audio into `site/audio/` and regenerates `generated/audio-manifest.ts`.
- `app/audio/library.ts` exposes narrators, recordings, cue lookup, cue progress, and recording matching.
- Cue payloads live in `audio-cues/` and are loaded lazily through the glob in `app/audio/cue-data.ts`.
- `AudioController` wraps one `HTMLAudioElement`, tracks the active session, and emits typed playback/session events.
- `HighlightController` maps cue timing to token keys, indexes rendered token elements, activates the current word, and optionally scrolls it into view.
- Reader Playback constructs these Implementations once and owns their cross-wiring, route reset, and teardown behind one Interface.
- Recording Session chooses recordings, loads Cue Data and page tokens, builds playback plans, and installs active sessions. Reader Playback supplies its page-display and presentation Adapters.
- Reader Playback passes only reader-level policies and callbacks into the mounted Playback Timeline.
- Playback Timeline translates controller events and user commands into player updates and highlighting. Its public interface is limited to commands, refresh, highlight synchronization, display time, and overlay closing.
- Token keys are stable strings in the form `pageNumber:lineIndex:fragmentIndex:wordIndex`.

## Admin and Cue Editing

The admin flow lives inside the same browser app rather than a separate tool.

- Admin unlock state is session-based.
- Cue drafts are stored in local storage per recording.
- Exported cue JSON should match the payload shape expected under `audio-cues/`.
- Cue file naming and narrator/reading folder rules are documented in `audio-cues/README.md`.
- `app/admin/cue-draft-editor.ts` is the Cue Draft Editor Module. Its semantic
  Interface owns canonical token-prefix validation, selection, timing-recording
  state, record, undo, trim, nudge, published-source comparison, dirty/export
  readiness, and save-conflict state behind a cached immutable snapshot.
- `app/admin/cue-authoring.ts` owns the surrounding interactive lifetime and
  coordinates Cue Draft Editor with playback, Web-Locked draft persistence,
  microphone capture, object URLs, downloads, dialogs, waveform, and panel
  Adapters. It does not keep a second mutable copy of Cue Draft state.
- `app/admin/cue-authoring-loader.ts` reads saved access without importing Cue Authoring, then imports and mounts the Optional Feature only when it must restore an open panel, open an unlocked panel, or handle the dedicated shortcut.
- `app/admin/CueAuthoringPanel.svelte` owns the Cue Authoring Panel markup, labels, icons, visible and disabled presentation, microphone state presentation, draft and progress presentation, and stable targets for nested Cue List and Cue Waveform Implementations. Cue Authoring sends one typed snapshot and receives semantic actions through `app/admin/cue-authoring-panel.ts`.
- `app/admin/CueAuthoringExportSheet.svelte` owns Cue Export Sheet markup, visibility, native download anchors, copy-status presentation, serialized Cue Data presentation, and delayed textarea selection. Cue Authoring retains payload generation, microphone finalization, Blob and object URL ownership, clipboard success and failure rules, and download invalidation through `app/admin/cue-authoring-export-sheet.ts`.
- `app/admin/CueAuthoringIssueDialog.svelte` owns Recording Issue dialog markup, form state, focus, and dismissal. The TypeScript Module still owns token selection, validation, deduplication, persistence, error reporting, and reader refresh.
- `app/admin/CueAuthoringCueList.svelte` owns saved-timing controls, disabled presentation, row markup, empty states, selected/current presentation, focus, five-row sizing, and follow-scrolling. It emits typed semantic actions through the Cue List Interface; Cue Authoring retains action validation, selection rules, seeking, highlighting, timing edits, and persistence.
- `app/admin/cue-waveform.ts` owns summary loading and caching, visible time windows, bars, cue and issue markers, the playhead, lane seeking, retry presentation, resize scheduling, and teardown behind the Cue Waveform Interface. Cue Authoring supplies a read-only workflow snapshot and invalidates content when cues or issues change.
- Per-frame playback work crosses the Panel's focused progress Interface without rebuilding its full snapshot, and crosses the Cue List Interface only when the current cue changes. Stable controls, stable nested targets, and keyed rows preserve DOM and focus identity while presentation updates.
- `app/reader/reader-runtime.ts` provides only the reader-facing Adapters Cue Authoring needs: entering or restoring a playback session, refreshing playback chrome, updating reader issue markers, and invalidating Aliyah cue status.
- Playback-plan construction and reader-visible issue presentation remain reader responsibilities, so Cue Authoring does not duplicate reader rules.

## Video Publishing Workflow

Video generation is a local publishing workflow, not part of the production app runtime.

- `scripts/record-aliyah-videos.mjs` starts or reuses a local app server, drives Chromium, captures deterministic reader frames, muxes audio with FFmpeg, validates output, and records local metadata.
- `app/video/recording-harness.ts` is dynamically imported only when recording mode is enabled. Its optional bundle is excluded from normal startup and service-worker precache.
- Generated MP4 files stay outside the repo.
- `scripts/generate-video-manifest.mjs` exposes only validated videos that have manually registered share/download links.
- `app/video/` provides manifest and lookup helpers for app playback/download links.

## Persisted State

`app/persistence/persisted-state.ts` is the shared Persisted State Module. Its
small Interface owns direct JSON reads, exact-value revisions, writes, removals,
and explicit storage/conflict failures. Domain Modules own validation, defaults,
merge policy, and user-facing errors.

All browser state uses unversioned keys and one current JSON shape. There are no
envelopes, migration chains, repair records, or compatibility parsers.

- Reader Preferences, Calendar Settings, Bookmarks, Last Reading, and local
  Recording Issues retain the revision returned by `read()` and supply it to
  every write or removal. A stale client must reload, rebase, or ask
  the user to retry instead of silently replacing another tab's change.
- Invalid current-schema data uses the domain's explicit default or unavailable
  state and remains untouched until the user performs a valid save.
- `localStorage` has no synchronous compare-and-swap. Exact-value revisions are
  a best-effort stale-write guard, not a transactional claim.
- Cue Drafts are the higher-value exception: their store uses Web Locks and an
  exact raw revision so concurrent authoring cannot silently overwrite a valid
  current draft.
- The early theme bootstrap reads the same direct current preference object as
  the runtime and otherwise applies the default theme.

## Preferences and Theming

Reader preferences are local, explicit, and CSS-variable driven.

- `app/reader-preferences.ts` defines the preference type, defaults, validation, persistence, and CSS application.
- Reader Runtime owns the canonical preference value and supplies narrow adapters for persistence, focal recentering, playback, and reader refresh.
- Reader Settings owns preference presentation and synchronization; external playback-rate changes call its `sync()` interface instead of reaching into its DOM.
- The early inline script in `src/app.html` applies the saved theme before the bundle loads to reduce flash.
- Highlight styling is applied through root CSS variables so the rendering code does not need to know presentation details.

## Testing Strategy

The project uses three Vitest 4 projects across Node and two browser engines.

- `*.test.ts` files run as Node-oriented unit tests.
- `*.vitest.ts` files run as the full headless Chromium project through `vitest.config.ts`; the WebKit critical matrix repeats Reader startup, accessibility, search, navigation, settings, bookmarks/resume, scrolling, playback, and service-worker update behavior.
- Prefer focused tests around pure model/view-model logic, parsing, generated-data helpers, cue/highlight behavior, and DOM rendering boundaries.
- Floating Player and Playback Timeline browser tests cover their connected Interface, replacement mounts, timed and untimed controls, compact expansion, speed synchronization, pointer mechanics, and teardown ownership.
- Reader Playback browser tests cover Implementation ownership, event translation, route reset, and teardown.
- Reader Presentation unit tests cover deterministic invalidation ordering, same-frame coalescing, reentrant work, layout deferral, immutable frames, and teardown.
- Reader Display Session unit tests cover display replacement order, stale-generation settlement, page indexing and eviction cleanup, prewarm and audio lifetime, deactivation, and teardown. Its focused runtime test rapidly replaces real Reader routes and verifies that only the latest generation becomes visible and ready.
- Reader Page Window unit tests cover ready-display identity, initial no-apply behavior, retain policy inputs, nested navigation and ordinary pause release semantics, coalesced near-placeholder remounts and post-remount trims, bounded reverse traversal, stale display generations, and teardown. Existing policy and Reader runtime browser tests remain the integration gates.
- Parsha Picker unit and browser tests cover model rules, canonical search, Torah references, calendar settings, nested aliyah choices, compact subviews, cleanup, pending-load cancellation, failure restoration, and retry.
- Shared Reader search browser tests cover mixed reading/action results, bold label and alias ranges, both hosts, keyboard selection, query-first Escape, repeated Cmd-K focus, action refresh, dismissal, replacement mounts, first-use loading, pending cancellation, retry, and cleanup.
- Reader Settings browser tests cover replacement mounts, first-click loading, pending cancellation, retry, focus return, outside dismissal, form synchronization, playback-rate handoff, and scheduled-effect cleanup.
- Offline Download tests cover worker request cancellation, active-recording rebinding, explicit progress/removal states, media-identity URL versioning, streamed cache writes, and exact cached prefix/suffix/unsatisfiable ranges.
- Reader Controls browser tests cover shared wide and compact actions, synchronized labels, disabled states, dismissal, focus return, replacement mounts, and teardown ownership.
- Reader Shell browser tests cover synchronous presentation updates, stable reader and feature-target identity, externally mounted reader content, action ownership, replacement mounts, and teardown ordering.
- Reader Route browser tests cover hashless startup, canonical aliases, About return, not-found Parsha Picker entry, same-hash rerendering, post-render Last Reading saves, and direct-page number reveal.
- Aliyah Navigation browser tests cover its shared compact and wide Interface, rail timing, pause-on-open, close-before-play, focus return, stale async data, replacement mounts, and cleanup.
- Recording Session browser tests cover loading, cancellation boundaries, initial highlight ordering, overlap lookup, token caching, and route-safe authoring restoration.
- Cue Authoring browser tests cover deferred loading, locked access, Panel snapshots and semantic actions, stable nested targets and progress updates, Cue List control actions and disabled states, row semantics and keyed updates, selection, focus, timing edits, list following, Recording Issue dialog form ownership, Cue Export Sheet downloads and text selection, payload and clipboard outcomes, object URL replacement and revocation, persistence failure, retry, and cleanup. Cue Waveform tests separately cover visible windows, sampled bars, loading and retry, seeking, resizing, and teardown.
- Recording Harness browser tests cover its external Interface, deterministic render delegation, duplicate-mount protection, and teardown.
- Optional Feature tests cover deferred mounting, aborted routes, keyboard loading, saved-open restoration, and retry after a failed import.
- The full-app browser smoke test loads the real `/reader/` entry and bootstrap in an isolated same-origin frame, verifies Cmd-K focuses embedded search without opening the overlay, verifies Cmd-K opens the overlay when Reading Index is closed, confirms the toolbar entry is absent, then exercises first-use Reader Settings and Cue Authoring.
- `npm run verify` is the deterministic product gate: typecheck, lint, Node tests, the full Chromium suite, the WebKit critical path, deterministic generation, static build, and bundle budgets. `npm run verify:release` wraps it with byte-for-byte post-generation drift detection, `git diff --check HEAD --`, and the live production-dependency audit. Deployed behavior still follows `docs/release-checklist.md` because local checks cannot prove CDN range responses, CSP delivery, an installed production PWA upgrade, or real-device safe areas.
- `docs/release-operations.md` owns support tiers, preview and rollback procedure, dependency cadence, and the source-to-generated-output ownership table. Each release records concrete evidence from `docs/release-evidence-template.md`.

## Architectural Preferences

Prefer these patterns:

- Keep the production app static-hostable.
- Keep domain rules in `calendar-model/`, display decisions in `view-model/`, and DOM rendering in `components/` or focused controllers.
- Add generated files only when they make reviewable runtime data cheaper or safer.
- Keep media out of aggressive precache unless the user explicitly chooses an offline download flow.
- Make URL parsing and canonical URL generation live in navigation/view-model code.
- Expose cross-feature behavior through small typed interfaces or controllers instead of adding broad global state.

Avoid these patterns:

- Do not move Reader domain logic into SvelteKit or introduce a global store simply to connect public pages and Reader features.
- Do not make production depend on a server process.
- Do not precache the whole audio/video library by default.
- Do not duplicate leining/calendar rules in UI code.
- Do not edit generated manifests by hand; update source data and rerun the relevant script.

## Open Questions

- Whether a native wrapper such as Capacitor is worth adding later for app-store distribution or more reliable native media storage.
- Whether admin cue editing should eventually move into a separate route/tool or remain embedded behind the current unlock flow.
