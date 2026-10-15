# Print dialog prototype QA

final result: passed

Scope: isolated interactive mockup, not production integration or printer certification.

## Printed signature follow-up

Added the existing logo, Tikkun Reader name, and website link beneath it to every prepared page, in faint gray. Page numbers move to the right of the same footer. [Signature capture](qa/signature.png).

Verified the logo loads and the anchor points to `https://tikkunreader.com`. Portrait retains a 5px gap between the content box and footer; both continued Landscape sheets have one signature with no overlap. The 0% preview remains blank. Project typecheck, scoped ESLint, and whitespace checks passed. Actual printer output and PDF link retention remain unverified.

## Visual evidence

- Source visual truth: `/Users/adambh/.codex/generated_images/01a0edcd-e0c3-79a2-ae6d-74665f8ff95e/exec-41cd716b-cf87-4532-ba36-9978e589da2e.png`.
- Implementation: [desktop capture](qa/desktop.png), `/prototypes/print/`.
- Source and implementation: 1484 x 1060 pixels, 1484 x 1060 CSS-pixel desktop comparison, normalized to 1 pixel per CSS pixel. Both opened together in one comparison input.
- State: custom Beresheet 1:6–1:13, Two Sided Match, surrounding text enabled, Portrait, 100%, Shrink to fit; Passage and Reading appearance expanded, Page setup collapsed.
- Responsive evidence: [390 x 844 mobile capture](qa/mobile.png).
- Special-layout evidence: [Shemot 15:1–19 capture](qa/shirah.png).
- Full-view comparison covered the entire dialog. No focused crop was needed: controls and text hierarchy were legible at full resolution; DOM measurements separately checked page dimensions, transforms, and clipping boundaries.

## Findings and comparison history

No actionable P0/P1/P2 visual differences remain in the selected mockup scope.

Implementation inspections found and fixed an empty justification line that made Match columns too small, missing icon strokes, a narrow settings panel, stale verse labels outside the Reader selection, a Reader page-break offset that clipped the next line, and Shirah positioning measured outside the viewport. Source text selection is also projected through the existing text filters when Torah form expands maqaf groups.

The final joint source/implementation comparison passed after these fixes. The desktop capture shows the 475px right inspector, shared header/footer and enclosing border, stroked project icons, readable controls, complete real Torah column, and correctly selected passage. The Shirah capture and DOM check show no faded words inside the selected song body. Mobile keeps the actions visible while the preview and settings scroll.

## Fidelity surfaces

- Typography: existing Noto Sans Hebrew UI for controls; ShlomosemiStam for Torah text. Control hierarchy and wrapping follow the concept. Real source columns contain more lines than the generated concept, so the printed text is intentionally denser. Hebrew page headings use the project's numeral helper.
- Layout: settings on the right, preview on the left, persistent full-width header and footer, rounded border. The preview uses actual Letter proportions instead of the concept image's unusually wide paper. Sections expand without displacing the footer.
- Color: light gray preview surface, white paper/settings, blue selected controls and primary action. Unselected Torah text is gray; selected text remains dark. System-native select arrows differ slightly from the concept.
- Assets: existing project SVG icons and fonts; no invented illustrations or replacement Torah imagery. Preview text is rendered from project data.
- Copy: agreed option names retained, including Show surrounding text. The sample reading is labelled honestly. Page counts and fitted scale come from the prepared document. Print actions occur only in the shared footer.

## Interaction and correctness verification

- Done: all four Reader/Match x One/Two Sided combinations; plain and annotated forms; context toggle and trimmed Match lines.
- Done: custom chapter/pasuk inputs, reversed-range error and recovery, ranges across physical columns and chapters, several-aliyah empty state, whole-parsha preview.
- Done: Portrait 816 x 1056 and Landscape 1056 x 816 prepared sheets; uniform Match scaling; Shrink to fit and continued pages; Reader breaks between complete visual lines.
- Done: mobile scrolling, section expansion, Cancel, and Cmd+P reopening the personal dialog.
- Done: five targeted tests covering exact boundaries, cross-column/chapter selection, noncontiguous/overlapping ranges, invalid inputs, and expanded unannotated words.
- Done: project typecheck (zero errors/warnings) and scoped ESLint.
- Console: MutationObserver errors were recorded during browser startup/hot reload; their source was not confirmed. A subsequent reload and mode-switch sequence monitored through Runtime.exceptionThrown produced no exceptions. No print-render error appeared in the UI.

## Limits and optional follow-up

- Production navigation and active-reader context are intentionally deferred. The prototype uses a labelled Beresheet sample for preset scopes.
- Physical printer output, native dialog settings, browser-menu Print, and full browser/device matrix are unverified. Letter is a temporary canvas assumption.
- No full production build, publication, or deployment was performed for this mockup.
- P3: revisit printed heading hierarchy and small copy spacing with user feedback; the dialog's chosen structure is ready to review.

## Native zoom follow-up

The preview now fits once on mount. Browser resizing during native zoom no longer recalculates a smaller paper scale; enlarged pages remain inside the scrollable preview. Window resizing also preserves the initial fit until reload.

Verified native visual viewport scaling at 200% using browser emulation, with the iframe's fitted scale unchanged. Restored viewport scale to 100% after the check. [Zoom capture](qa/native-zoom.png). Scoped ESLint passed. Physical trackpad input was not exercised.

## Shared one-sided presentation and chevrons

Both side choices now render and measure through the existing two-sided `Page` / `applyReaderPageLayout` path. One-sided output is a presentation of the selected surface, with no independent text-sizing or right-alignment implementation.

- Match keeps the measured column width and word positions, hides the opposite surface, and centers the selected column. Tikkun measured 272.6844px in both choices, with maximum sampled word-position drift below 0.00004px; Torah widths were exactly equal. [Match one-sided capture](qa/match-one.png).
- Reader uses the shared two-sided block flow and right alignment, with the selected side spanning the available width. Both Tikkun and Torah first words ended at the same 768px right edge as their container. [Reader one-sided capture](qa/reader-one.png).
- Every select now uses `PrintSelect`, which places the existing 16px chevron 12px inside the right edge and reserves text padding. All six glyph boxes stayed within their inputs at desktop and 390px mobile widths. [Mobile select capture](qa/mobile-selects.png).
- Project typecheck, scoped ESLint, and all five passage tests passed. Two-sided rendering/layout rules were retained.

## Printed Scaling follow-up

Renamed Text size to Scaling throughout the prototype. Range is 0–200%, default 100% at the midpoint, with visible endpoint and midpoint labels. User confirmed that this affects printed content, independently of native preview zoom.

- Match at 100% preserves the approved fitted layout. One-sided column width changed from 272.6844px at 100% to 545.3688px at 200%, with two printed pages and Print enabled.
- Reader at 200% used 50px text and six pages for the paired sample; 50% used 12.5px text and one page. Switching layouts retained the selected percentage.
- At 0%, page content is hidden and Print disabled. Enlarged Match content wider than the paper produces an explicit width warning and disables Print; it is not silently clipped in a print job.
- Project typecheck and scoped ESLint passed. [Neutral 100% control capture](qa/scaling.png).

## Production reader integration

The reader and prototype now share `app/printing/`. Entry points are Cmd/Ctrl+P, search (Print passage), and Settings > More > Print passage. Navigation redesign remains deferred.

Verified Noach aliyah 3 opens as Beresheet 7:17–8:14, with no sample fallback. Nine model/context tests pass. The real-route integration test checks keyboard opening, active range, watermark on every sheet, the prepared iframe print call, close/focus restoration, Settings entry, whole-parsha range, and Reader One Sided. The existing 20 settings tests also pass. Typecheck and scoped lint pass. Production build passes with a service-worker shell size warning (1,664,530 bytes against the 1,610,000-byte advisory budget).

Browser automation verifies the call into native printing without submitting a printer job. Physical printer output and native iOS printing are not verified. [Reader desktop capture](qa/reader-integration.png), [390px mobile capture](qa/reader-mobile.png).

## Upcoming reading selection

Print now offers ten calendar readings from today onward, including holidays and additional Torah scrolls. Dates and Hebrew chapter/pasuk ranges appear directly in the list. The existing mobile aliyah reference formatter is shared with print. Choosing a reading selects its whole passage, preserves appearance/page settings, and restores keyboard focus to the picker. Current reader passage restores the original aliyah.

Twelve model/calendar tests and the real-reader browser integration test pass. Coverage includes year rollover, Israel/diaspora differences, exact source ranges, ten visible choices, live preview updates, individual/custom selection, preserved layout, and return to the current passage. Typecheck reports no errors or warnings; scoped ESLint passes. Desktop and 390px mobile checked visually. [Upcoming picker](qa/upcoming-readings.png), [Mobile picker](qa/upcoming-readings-mobile.png).
