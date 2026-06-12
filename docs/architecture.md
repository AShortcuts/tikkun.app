# Architecture Notes

This file is a living summary of the architectural choices in this app. Keep it practical and editable: update it when the codebase changes direction, when a pattern becomes intentional, or when a new subsystem needs a short orientation note.

## Product Shape

Tikkun is a browser-first, static web app for preparing Torah readings. The core experience is a scroll-like reader with selectable readings, reader preferences, audio playback, word-level cue highlighting, and optional publishing workflows for synced audio/video assets.

The app is intentionally not built around a large UI framework. It uses TypeScript modules, DOM APIs, generated data modules, and Vite as a thin dev/build layer.

## Runtime Architecture

- `index.html` owns the static shell, persistent DOM targets, app metadata, PWA manifest link, and a small early theme bootstrap.
- `src/index.ts` is the main browser orchestrator. It wires routing, rendering, controls, preferences, audio playback, highlighting, admin cue editing, recording mode, and service-worker registration behavior.
- UI rendering is mostly imperative DOM work through small component functions/classes in `src/components/`.
- State is kept close to the feature that owns it. There is no global store; shared behavior is exposed through narrow controllers and view models.
- Browser storage is used for user-facing local state such as reader preferences and admin cue drafts.

## Build and Delivery

- Vite compiles and bundles the static app.
- `static/` is the public directory copied by Vite.
- `dist/` is the deployable static output.
- `npm run build` runs `vite build` and then generates `dist/service-worker.js`.
- The project is suitable for static hosting; no app server is part of the production runtime.

## PWA Strategy

The app is treated as a PWA-capable static site rather than a native shell.

- `manifest.webmanifest` defines install metadata, display mode, colors, and icons.
- `index.html` includes Apple mobile web app metadata and icon links.
- `scripts/generate-service-worker.mjs` creates a versioned cache after each build.
- The generated service worker precaches non-media build output and uses cache-first behavior for same-origin assets.
- Navigation requests use network-first behavior with cached fallback to `/index.html`.
- Large media files are intentionally excluded from precache by path and extension to avoid oversized installs and unpredictable storage pressure.
- Recording media should become available offline only through explicit user-requested offline downloads, not silent playback caching.

If native app packaging is ever added, prefer treating Capacitor or another native wrapper as a packaging layer around the existing web build, not as a rewrite of the app architecture.

## Data Model

The app separates calendar/reading rules from rendering.

- `src/calendar-model/` defines the leining model and calendar-driven grouping.
- The main hierarchy is `LeiningDate` -> `LeiningInstance` -> `LeiningRun` -> `LeiningAliyah`.
- `LeiningGenerator` creates reading data using Hebcal libraries and app-specific rules.
- `src/view-model/` adapts model data into exactly what the UI should render.
- `src/view-model/scroll-view-model.ts` decides which pages, labels, aliyot, and messages appear in the scroll.
- `FullScrollViewModel` renders full scrolls for regular parsha and megillah views.
- `HolidayViewModel` renders selected pages plus skip messages for holiday/special readings.

## Routing

Routing is hash-based and browser-local.

- `src/view-model/navigation/url-parser.ts` parses hashes into app routes.
- Reader routes resolve to a `ScrollViewModel`.
- Supported route families include current/next reading, explicit run IDs, legacy references, parsha slugs, about pages, and cue analytics.
- Canonical parsha hashes are generated through the navigation view-model layer rather than directly in UI handlers.

## Rendering and Scrolling

Rendering is page-oriented and lazy.

- JSON page data under `src/data/pages/` is loaded dynamically by scroll and page number.
- `ScrollDisplay` renders `RenderedEntry` values into the reader root.
- `InfiniteScroller` loads previous or next content when the user nears either edge of the scroll container.
- Rendered pages dispatch a `page-rendered` event so other systems, especially highlighting, can index newly inserted token elements.
- Scroll position and top-bar state are derived from the rendered DOM and view models instead of duplicated in a central store.

## Audio and Highlighting

Audio support is data-driven and controller-based.

- `scripts/generate-audio-manifest.mjs` copies supported source audio into `static/audio/` and regenerates `src/data/audio-manifest.generated.ts`.
- `src/audio/library.ts` exposes narrators, recordings, cue lookup, cue progress, and recording matching.
- Cue payloads live in `src/data/audio-cues/` and are imported eagerly through `import.meta.glob`.
- `AudioController` wraps one `HTMLAudioElement`, tracks the active session, and emits typed playback/session events.
- `HighlightController` maps cue timing to token keys, indexes rendered token elements, activates the current word, and optionally scrolls it into view.
- Token keys are stable strings in the form `pageNumber:lineIndex:fragmentIndex:wordIndex`.

## Admin and Cue Editing

The admin flow lives inside the same browser app rather than a separate tool.

- Admin unlock state is session-based.
- Cue drafts are stored in local storage per recording.
- Exported cue JSON should match the payload shape expected under `src/data/audio-cues/`.
- Cue file naming and parsha-folder rules are documented in `src/data/audio-cues/README.md`.

## Video Publishing Workflow

Video generation is a local publishing workflow, not part of the production app runtime.

- `scripts/record-aliyah-videos.mjs` starts or reuses a local app server, drives Chromium, captures deterministic reader frames, muxes audio with FFmpeg, validates output, and records local metadata.
- Generated MP4 files stay outside the repo.
- `scripts/generate-video-manifest.mjs` exposes only validated videos that have manually registered share/download links.
- `src/video/` provides manifest and lookup helpers for app playback/download links.

## Preferences and Theming

Reader preferences are local, explicit, and CSS-variable driven.

- `src/reader-preferences.ts` defines the preference type, defaults, validation, persistence, and CSS application.
- The early inline script in `index.html` applies the saved theme before the bundle loads to reduce flash.
- Highlight styling is applied through root CSS variables so the rendering code does not need to know presentation details.

## Testing Strategy

The project uses two complementary test runners.

- Ava handles Node-oriented unit tests with TypeScript transform support.
- Vitest handles browser-oriented tests using `*.vitest.ts` and `vitest.workspace.ts`.
- Prefer focused tests around pure model/view-model logic, parsing, generated-data helpers, cue/highlight behavior, and DOM rendering boundaries.
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

- Do not introduce a framework, router, or state store unless it removes real complexity across multiple features.
- Do not make production depend on a server process.
- Do not precache the whole audio/video library by default.
- Do not duplicate leining/calendar rules in UI code.
- Do not edit generated manifests by hand; update source data and rerun the relevant script.

## Open Questions

- Whether a native wrapper such as Capacitor is worth adding later for app-store distribution or more reliable native media storage.
- Whether admin cue editing should eventually move into a separate route/tool or remain embedded behind the current unlock flow.
