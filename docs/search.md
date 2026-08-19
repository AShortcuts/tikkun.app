# Search architecture

## Product contract

The Reader has one search control with two placements:

- Embedded at the top of Reading Index.
- Hosted in the existing overlay when `Cmd/Ctrl-K` is used outside Reading Index.

Both placements mount `app/search/ReaderSearchBar.svelte` and construct `app/search/reader-search.ts`. They do not maintain separate queries, renderers, rankers, result limits, or keyboard rules.

`Cmd/Ctrl-K` focuses and selects embedded search when Reading Index is active. Otherwise it opens or refocuses the overlay. Opening Reading Index closes the overlay, so only one instance is active. The toolbar button and overflow-menu entry are removed; the `⌘K` hint lives inside the control and is hidden on compact/coarse-pointer layouts.

The existing Reading Index remains below embedded search: Israel calendar mode, direct Torah reference form, Coming Up, weekly readings, holidays, megillot, and aliyah flyouts are unchanged.

## Engine

The typed local pipeline under `app/search/` is:

1. `normalize.ts` removes Hebrew nikkud, folds punctuation/separators, and maps normalized match ranges to original labels.
2. `query-parser.ts` recognizes aliyot, Maftir, Torah/Esther pages, and book/chapter/verse references before fuzzy retrieval.
3. `search-index.ts` uses Fuse.js for candidate retrieval and deterministic rank bands: parsed intent, exact primary, exact alias, all-token prefix, all-token fuzzy, and partial fallback.
4. `reading-search.ts` adapts generated leinings; `action-search.ts` adapts pages, recordings, tools, bookmarks, resume points, and available admin actions without placing callbacks in indexed documents.
5. `reader-search.ts` merges both providers under the same rank bands, prefers the bilingual reading result when providers reach the same destination, deduplicates before the 12-result limit, and emits one display model. Granular aliyah actions are intent-gated so a plain parsha query does not flood the list; explicit aliyah, recording, or audio queries still expose them.

Invalid structured destinations return no nearby fuzzy destination. Short tokens do not use fuzzy matching. Context can reorder results only inside the same relevance band.

## Interaction

- Arrow keys and `Ctrl-N/P` wrap through results; Home/End keep their native text-caret behavior; Enter activates the current result.
- Escape clears a non-empty query first and dismisses the host only when the query is already empty.
- Empty query shows the same explicitly prioritized Quick Access actions in both placements.
- Reading and route results remain links, including modified-click behavior. Commands remain buttons.
- Matching characters stay bold in Hebrew/English reading labels and now also appear bold in command labels and off-label alias context.
- The input uses combobox/listbox relationships, active-descendant state, a polite result count, and an overlay focus boundary.

## Lifecycle and boundaries

| Surface | Catalog | Index lifecycle |
| --- | --- | --- |
| Unified Reader search | Generated readings, references, pages, aliyot, recordings, tools, bookmarks, resume points, and available admin actions | Built once when a host opens; reused per keystroke; rebuilt by refresh or calendar-setting reconstruction |
| Public Readings coverage | Public reading names, Hebrew names, canonical aliases, and coverage state | Built once when the route component initializes |

Reading Index and the overlay retain their lazy import boundaries. The homepage does not import Fuse.js. The service worker precaches the shared search chunks and both Reader hosts, while audio, cue payloads, and Torah page payloads keep their existing deferred policy.

Full-text Torah, commentary, semantic, and audio-content search remain intentionally out of scope. This engine navigates the real catalog and executes existing Reader actions; it does not invent or index content the app does not expose as navigation data.

## Relevance and verification

`app/search/golden-queries.ts` locks stable result identifiers and Top-1/Top-3 placement, never library scores. Coverage includes English/Hebrew, nikkud, punctuation variants, transliteration aliases, typos, aliyot, Maftir, pages, references, empty input, duplicates, filters, and hostile punctuation.

Unit and browser tests cover mixed-provider ranking, cross-provider deduplication, both placements, bold ranges, keyboard selection, query-first Escape, repeated Cmd-K focus, one-active-instance routing, dynamic refresh, lazy retry/cancellation, cleanup, and the real Reader bootstrap.

The release gate is `npm run verify`, which includes typecheck, lint, Node,
Chromium, the WebKit critical path, deterministic generation, build, and budgets.
Run `npm run search:measure` when search data, normalization, ranking, or its
dependencies change.

## Historical search baseline

Captured on 2026-08-15 before the current toolchain and service-worker changes.
Use it for trend context, not as the current release artifact. Vite hashes vary
between builds.

| Artifact | Production size |
| --- | --- |
| Deterministic search index and Fuse.js | 34.54 kB / 12.60 kB gzip |
| Unified Reader result adapter | 15.93 kB / 6.21 kB gzip |
| Reading Index dynamic entry | 18.79 kB / 7.12 kB gzip |
| Overlay mount dynamic entry | 2.34 kB / 1.15 kB gzip |
| Reader main dynamic entry | 417.73 kB / 130.42 kB gzip |

That build's generated service worker contained 95 shell URLs and 245 opt-in
Torah pages.

`npm run search:measure` measured a 1,000-document catalog over 20 samples and 250 searches per sample: 6.124 ms median index build and 4.309 ms median query. Real Reader catalogs are smaller, and indexes are not rebuilt per keystroke.
