# Architecture Notes

This file is a living summary of the architectural choices in this app. Keep it practical and editable: update it when the codebase changes direction, when a pattern becomes intentional, or when a new subsystem needs a short orientation note.

## Product Shape

Tikkun is a browser-first, static web app for preparing Torah readings. The core experience is a page-based reader with selectable readings, reader preferences, audio playback, word-level cue highlighting, and optional publishing workflows for synced audio/video assets.

The app uses TypeScript modules and DOM APIs for its domain and browser logic, with Svelte added incrementally for stateful UI features. It does not use SvelteKit, a framework router, or a global store.

## Runtime Architecture

- `index.html` owns the static shell, persistent DOM targets, app metadata, PWA manifest link, and a small early theme bootstrap.
- `app/index.ts` is the composition root. It wires routing, page rendering, preference policy, recording mode, feature adapters, and service-worker registration without owning each feature's internal transaction.
- `app/reading/recording-session.ts` owns the Recording Session: narrator-aware recording lookup, page-token caching, Cue Data loading, playback-plan installation, cancellation, and transitions into and out of authoring.
- `app/reading/playback-timeline.ts` owns the mounted Playback Timeline: floating-player DOM state, playback controls, seeking, speed, cue progress, highlight synchronization, responsive player interactions, and their cleanup.
- `app/reader/reader-settings.ts` is the narrow mount bridge for `app/reader/ReaderSettings.svelte`, which owns the Reader Settings presentation, dialog state, focus return, theme-transition timing, preference events, and playback-rate handoff.
- `app/reader/reader-controls.ts` is the narrow mount bridge for `app/reader/ReaderControls.svelte`, which owns the wide bookmark and command buttons plus the compact Reader Controls menu. Both presentations use the same state and action callbacks while CSS decides which controls are visible.
- `app/navigation/command-palette.ts`, `app/reader/last-reading-prompt.ts`, and `app/reader/offline-recording-prompt.ts` own their focused reader tools and browser effects.
- `app/admin/cue-authoring-loader.ts` and `app/components/cue-analytics-route.ts` keep Optional Features outside the core reader bundle until they are requested.
- `app/admin/cue-authoring.ts` owns the Cue Authoring lifetime: access state, Cue Drafts, timing controls, microphone capture, issue editing, waveform review, and export.
- Existing UI rendering remains mostly imperative DOM work through small component functions/classes in `app/components/`. Svelte is used only where a component removes real state-and-lifecycle complexity.
- `app/components/icons.ts` is the canonical icon implementation. `app/components/UiIcon.svelte` is only the typed Svelte adapter and must not duplicate SVG paths.
- State is kept close to the feature that owns it. There is no global store; shared behavior is exposed through narrow controllers and view models.
- Browser storage is used for user-facing local state such as reader preferences and admin cue drafts.

### Lifetime Ownership

- `app/lifecycle/mount.ts` is the shared seam for browser effect ownership. A mount receives an `AbortSignal`, owns explicit teardown functions, and returns an idempotent destroy function.
- Reader Runtime is one replaceable mount created by the composition root. It owns the reader controllers, Recording Session, nested feature mounts, global adapters, DOM and media listeners, timers, frames, and cancellation for pending route work.
- Cue Authoring is mounted through this seam. Its DOM listeners, audio-controller subscriptions, resize listeners, animation frame, waveform loads, object URLs, and microphone capture are released together.
- Playback Timeline is mounted through the same seam. Its media subscriptions, pointer and keyboard interactions, responsive expansion state, drag state, observers, and scheduled focus are released as one lifetime.
- Reader Settings is mounted through the same seam. Its form and document listeners, delayed focus, theme-transition timer, dialog state, and focus target are released together.
- Reader Controls is mounted through the same seam. Its menu state, outside-dismiss listener, keyboard handling, and framework instance are released together.
- Mounting a replacement destroys the previous implementation first. Destroy functions are tied to their specific mount, so stale framework cleanup cannot tear down a newer remount.
- DOM listeners should use the mount signal. Typed event subscriptions, timers, animation frames, controllers, and nested feature mounts should transfer their teardown to `scope.own(...)`.
- Feature setup is synchronous. Async work may start inside a mount, but it must observe the signal before applying a result.
- Lifetime infrastructure owns cancellation and cleanup only. Domain state and platform capabilities do not belong in the mount module.
- Add future reader browser effects to the Reader Runtime or a nested mount so a replacement cannot leave listeners, timers, or stale async results behind.

### Adaptive UI Structure

- Share domain models, actions, semantic markup, and visual tokens across viewport sizes.
- Use CSS media or container queries for presentation changes where the interaction and DOM structure remain the same.
- Use separate feature implementations when mobile and desktop have meaningfully different interaction structures, such as a compact sheet versus a persistent rail. Both implementations should consume the same feature-specific inputs and actions.
- Do not spread `isMobile` branches through domain logic. Viewport shape chooses a UI implementation; Capacitor capability adapters choose Web versus native behavior.
- Treat Capacitor as a packaging and device-capability layer. It should not become the definition of the mobile layout.
- `app/adaptive/reader-viewport.ts` owns the Reader Viewport query and exposes compact versus wide capacity to JavaScript. It is created inside a mount so importing app modules does not execute a viewport query.
- `app/reading/aliyah-navigation/model.ts` owns shared Aliyah Navigation state. `desktop-rail.ts` and `mobile-picker.ts` are the two real adapters at that seam; each owns its DOM, interaction state, asynchronous presentation loading, and cleanup.
- Reader Controls shares one typed state and action interface across its wide buttons and compact menu. CSS handles visibility; JavaScript checks Reader Viewport only when opening Aliyah Navigation requires a rail or picker.
- The compact Reader Viewport contract is `550px`. CSS still owns visual layout through media queries; JavaScript uses `COMPACT_READER_QUERY` only when behavior or DOM interaction genuinely differs.

### Framework and Native Migration Boundary

- Svelte is a presentation layer, currently used by Reader Settings and Reader Controls. Domain rules, preference persistence, playback, routing, and browser capabilities remain in TypeScript modules behind narrow interfaces.
- A Svelte component owns only the descendants of its explicit mount target. Its TypeScript bridge mounts and unmounts it through the existing lifetime scope so Svelte and imperative controllers never compete for the same DOM.
- Add Svelte feature by feature rather than rewriting the shell. Pass focused state and actions into a component; do not introduce a global store simply to connect old and new UI.
- SvelteKit is not currently part of the app. If it later solves a concrete routing or delivery need, components should keep browser APIs inside their mounted lifetime and keep domain models safe to import outside the browser.
- A future Capacitor entry should compose Platform Capability adapters at the application boundary. Use native-platform or plugin-availability checks only to choose implementations such as native filesystem versus web download.
- Reader Viewport remains responsible for compact versus wide layout in browsers, PWAs, and Capacitor WebViews. Platform Capability must never become a responsive breakpoint.

## Build and Delivery

- Vite compiles and bundles the static app.
- `site/` contains files copied unchanged by Vite.
- `dist/` is the deployable static output.
- `npm run build` runs `vite build` and then generates `dist/service-worker.js`.
- The project is suitable for static hosting; no app server is part of the production runtime.

## PWA Strategy

The app is treated as a PWA-capable static site rather than a native shell.

- `manifest.webmanifest` defines install metadata, display mode, colors, and icons.
- `index.html` includes Apple mobile web app metadata and icon links.
- `scripts/generate-service-worker.mjs` creates a versioned cache after each build.
- The generated service worker precaches the app shell and page chunks, then uses cache-first behavior for requested same-origin assets.
- Navigation requests use network-first behavior with cached fallback to `/index.html`.
- Cue Data, Optional Feature bundles, and large media files are intentionally excluded from the initial precache so installation does not download content the reader has not requested.
- Recording media should become available offline only through explicit user-requested offline downloads, not silent playback caching.

If native app packaging is ever added, prefer treating Capacitor or another native wrapper as a packaging layer around the existing web build, not as a rewrite of the app architecture.

## Data Model

The app separates calendar/reading rules from rendering.

- `app/calendar-model/` defines the leining model and calendar-driven grouping.
- The main hierarchy is `LeiningDate` -> `LeiningInstance` -> `LeiningRun` -> `LeiningAliyah`.
- `LeiningGenerator` creates reading data using Hebcal libraries and app-specific rules.
- `app/view-model/` adapts model data into exactly what the UI should render.
- `app/view-model/scroll-view-model.ts` decides which pages, labels, aliyot, and messages appear in the scroll.
- `FullScrollViewModel` renders full scrolls for regular parsha and megillah views.
- `HolidayViewModel` renders selected pages plus skip messages for holiday/special readings.

## Routing

Routing is hash-based and browser-local.

- `app/view-model/navigation/url-parser.ts` parses hashes into app routes.
- Reader routes resolve to a `ScrollViewModel`.
- Supported route families include current/next reading, explicit run IDs, legacy references, parsha slugs, about pages, and cue analytics.
- Canonical parsha hashes are generated through the navigation view-model layer rather than directly in UI handlers.

## Rendering and Scrolling

Rendering is page-oriented and lazy.

- JSON page data under `text/pages/` is loaded dynamically by text name and page number.
- `ScrollDisplay` renders `RenderedEntry` values into the reader root.
- `InfiniteScroller` loads previous or next content when the user nears either edge of the scroll container.
- Rendered pages dispatch a `page-rendered` event so other systems, especially highlighting, can index newly inserted token elements.
- Scroll position and top-bar state are derived from the rendered DOM and view models instead of duplicated in a central store.

## Audio and Highlighting

Audio support is data-driven and controller-based.

- `scripts/generate-audio-manifest.mjs` copies supported source audio into `site/audio/` and regenerates `generated/audio-manifest.ts`.
- `app/audio/library.ts` exposes narrators, recordings, cue lookup, cue progress, and recording matching.
- Cue payloads live in `audio-cues/` and are loaded lazily through the glob in `app/audio/cue-data.ts`.
- `AudioController` wraps one `HTMLAudioElement`, tracks the active session, and emits typed playback/session events.
- `HighlightController` maps cue timing to token keys, indexes rendered token elements, activates the current word, and optionally scrolls it into view.
- Recording Session chooses recordings, loads Cue Data and page tokens, builds playback plans, and installs active sessions. Reader Runtime supplies its page-display and presentation adapters.
- Reader Runtime passes only reader-level policies and callbacks into the mounted Playback Timeline.
- Playback Timeline translates controller events and user commands into player updates and highlighting. Its public interface is limited to commands, refresh, highlight synchronization, display time, and overlay closing.
- Token keys are stable strings in the form `pageNumber:lineIndex:fragmentIndex:wordIndex`.

## Admin and Cue Editing

The admin flow lives inside the same browser app rather than a separate tool.

- Admin unlock state is session-based.
- Cue drafts are stored in local storage per recording.
- Exported cue JSON should match the payload shape expected under `audio-cues/`.
- Cue file naming and narrator/reading folder rules are documented in `audio-cues/README.md`.
- `app/admin/cue-authoring.ts` is the single owner of the interactive workflow and its mutable state.
- `app/admin/cue-authoring-loader.ts` imports and mounts Cue Authoring on first use while preserving the synchronous keyboard shortcut and saved unlock behavior.
- `app/index.ts` provides only the reader-facing adapters Cue Authoring needs: entering or restoring a playback session, refreshing playback chrome, updating reader issue markers, and invalidating Aliyah cue status.
- Playback-plan construction and reader-visible issue presentation remain reader responsibilities, so Cue Authoring does not duplicate reader rules.

## Video Publishing Workflow

Video generation is a local publishing workflow, not part of the production app runtime.

- `scripts/record-aliyah-videos.mjs` starts or reuses a local app server, drives Chromium, captures deterministic reader frames, muxes audio with FFmpeg, validates output, and records local metadata.
- Generated MP4 files stay outside the repo.
- `scripts/generate-video-manifest.mjs` exposes only validated videos that have manually registered share/download links.
- `app/video/` provides manifest and lookup helpers for app playback/download links.

## Preferences and Theming

Reader preferences are local, explicit, and CSS-variable driven.

- `app/reader-preferences.ts` defines the preference type, defaults, validation, persistence, and CSS application.
- Reader Runtime owns the canonical preference value and supplies narrow adapters for persistence, focal recentering, playback, and reader refresh.
- Reader Settings owns preference presentation and synchronization; external playback-rate changes call its `sync()` interface instead of reaching into its DOM.
- The early inline script in `index.html` applies the saved theme before the bundle loads to reduce flash.
- Highlight styling is applied through root CSS variables so the rendering code does not need to know presentation details.

## Testing Strategy

The project uses Vitest in two complementary workspaces.

- `*.test.ts` files run as Node-oriented unit tests.
- `*.vitest.ts` files run in a headless Chromium browser through `vitest.workspace.ts`.
- Prefer focused tests around pure model/view-model logic, parsing, generated-data helpers, cue/highlight behavior, and DOM rendering boundaries.
- Playback Timeline browser tests cover replacement mounts, timed and untimed controls, compact expansion, speed synchronization, and teardown ownership.
- Reader Settings browser tests cover replacement mounts, focus return, outside dismissal, form synchronization, playback-rate handoff, and scheduled-effect cleanup.
- Reader Controls browser tests cover shared wide and compact actions, synchronized labels, disabled states, dismissal, focus return, replacement mounts, and teardown ownership.
- Recording Session browser tests cover loading, cancellation boundaries, initial highlight ordering, overlap lookup, token caching, and route-safe authoring restoration.
- Optional Feature tests cover deferred mounting, aborted routes, keyboard loading, saved-open restoration, and retry after a failed import.
- `npm run check` runs typecheck and lint.

## Architectural Preferences

Prefer these patterns:

- Keep the production app static-hostable.
- Keep domain rules in `calendar-model/`, display decisions in `view-model/`, and DOM rendering in `components/` or focused controllers.
- Add generated files only when they make reviewable runtime data cheaper or safer.
- Keep media out of aggressive precache unless the user explicitly chooses an offline download flow.
- Make URL parsing and canonical URL generation live in navigation/view-model code.
- Expose cross-feature behavior through small typed interfaces or controllers instead of adding broad global state.

Avoid these patterns:

- Do not move domain logic into Svelte or introduce SvelteKit, a framework router, or a global store unless it removes concrete complexity across multiple features.
- Do not make production depend on a server process.
- Do not precache the whole audio/video library by default.
- Do not duplicate leining/calendar rules in UI code.
- Do not edit generated manifests by hand; update source data and rerun the relevant script.

## Open Questions

- Whether a native wrapper such as Capacitor is worth adding later for app-store distribution or more reliable native media storage.
- Whether admin cue editing should eventually move into a separate route/tool or remain embedded behind the current unlock flow.
