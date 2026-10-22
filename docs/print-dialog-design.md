# Print dialog design

Design decisions from the print-dialog discussion. This is a design brief, not a shipped feature.

## Agreed behavior

- A Print action in the future navigation interface and Cmd/Ctrl+P open the Tikkun Print Dialog. Navigation redesign is a separate, later mockup.
- The dialog prepares the pages; the system print dialog handles printer choice, copies, duplex printing, and the actual job.
- Default to the current aliyah. Support several aliyot, the whole parsha, and a custom start/end pasuk range.
- Show a live page preview that updates when the passage or presentation changes.
- Support One Sided Reader, Two Sided Reader, One Sided Match, and Two Sided Match. Reuse existing reader rendering and layout logic; do not create a second Torah renderer.
- One Sided offers Tikkun (nekudot and taamim) or Torah (without them), defaulting to Tikkun. Two Sided pairs both forms.
- Reader uses the existing natural reading flow. Match preserves the existing Torah line breaks and horizontal placement.
- Without surrounding text, Match trims unused lines above and below the passage while preserving the selected words' line breaks and horizontal placement.
- In Match, "Show surrounding text" displays complete Torah columns and fades text outside the selected passage. "Fade" is shorthand in discussion only. This option does not apply to Reader.
- Offer Portrait/Landscape. Defer paper-size controls.
- Offer Scaling from 0–200%, with 100% as the neutral midpoint and default. It changes printed content size: Reader reflows; Match scales the existing layout uniformly.
- In Match, offer "Shrink to fit" (default) and "Continue onto next page" when the chosen text size would make a column too tall. Paired forms remain aligned.

## Handoff constraints

CSS `@page` can specify document page size/orientation, but `window.print()` accepts no settings. The browser/system retains control over physical printing; matching native selections and output must be verified in target browsers before claiming preview fidelity.

- [MDN: page size and orientation](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@page/size)
- [MDN: window.print](https://developer.mozilla.org/en-US/docs/Web/API/Window/print)
- [W3C: pages that do not fit the paper](https://www.w3.org/TR/css-page-3/#renderingpages)

## Mockup scope

Explore the print dialog's hierarchy, custom range controls, and preview presentation within the existing Tikkun visual language. Keep mockups isolated from production UI. Visual concept images do not verify Hebrew text, pagination, or print behavior; an interactive prototype must use actual project text and the shared renderer.

The selected direction combines the second mockup's collapsible settings with the first mockup's full-width header, footer, and outer border. Place the settings on the right and the preview on the left. Keep Passage and Reading appearance expanded, with Page setup collapsed; place Cancel and Print only in the shared footer. Remove the inherited mobile-tap hint from the print controls.

Paper dimensions for the initial preview and browser-menu Print behavior remain implementation questions. Do not imply paper settings are synchronized with the system dialog or that every browser Print entry point can be intercepted.

## Interactive prototype

Open `/prototypes/print/` on the local development server. The approved right-side settings, shared header/footer, collapsible groups, and live preview are implemented in this isolated route. The production reader now uses this same dialog through Cmd/Ctrl+P, search (Print passage), and Reader settings > More > Print passage. The wider navigation redesign remains deferred.

- The initial visual state is the concept's custom Beresheet 1:6–1:13 selection. Current aliyah, several aliyot, and whole parsha use the explicitly labelled sample Beresheet reading; the production reader captures its active aliyah and related reading ranges when Print opens.
- Preview sheets use US Letter as a temporary fixed canvas, with Portrait/Landscape available. Paper-size selection remains deferred.
- `Page` and `applyReaderPageLayout` supply the existing text rendering and Torah geometry. Print-specific code selects passages, projects boundaries between annotated/unannotated token forms, scales, and paginates the rendered result.
- Both side choices use the shared two-sided rendering/layout path. One-sided Match centers one already-fitted column without widening it; one-sided Reader spans the available width using the same right-aligned flow as the paired view.
- Scaling runs from 0–200% for both layouts. Match uses the current fitted column as its 100% baseline, applies the chosen multiplier, and continues enlarged content onto additional sheets. Reader changes text size proportionally and reflows. Changing layout does not reset Scaling.
- At 0%, the preview is empty and Print is disabled. If enlarged Match columns exceed the physical paper width, show a visible warning and disable Print instead of silently cutting off text. One Sided can accommodate larger scaling than Two Sided.
- Page numbers remain optional and off each time Print opens. When enabled, they show the current page and total, such as `1/2` and `2/2`.
- Page setup offers "Include details page", off each time Print opens. It appends a separate page after the reading pages, leaving the reading layout unchanged. The selected compact outlined box sits at the upper right and lists the selected parsha names in Hebrew and English, plus the original Torah column numbers. Esther uses the Megillah name and column numbers. Disjoint selections retain distinct column ranges; multiple parshiot use the canonical reading names. This page shares the heading, invocation, credits preference, and sacred-literature notice, and counts toward page-number totals. At 0% scaling it is omitted with the rest of the printable content.
- Cmd/Ctrl+P opens the personal dialog from the production reader. Print invokes the prepared document's system print dialog. Native browser-menu interception and actual printer output are not verified.

Verification and captures: [prototype QA](../prototypes/print-dialog/design-qa.md).

Each prepared page includes a faint Tikkun Reader signature at the bottom left: the existing logo to the left of the stacked name and `tikkunreader.com` link. Page numbers are optional through Page setup, off by default each time the dialog opens, and sit at the center of the footer when enabled. The bottom-right notice is always included: "The text on this page contains sacred literature. Please do not deface or discard." Footer edges align with the prepared content, including the selected column in One Sided Match; narrow columns scale the footer proportionally to keep it inside the reserved bottom margin. This does not change text geometry or pagination. Remove Credits, inside the collapsed Advanced section, independently hides the logo, name, and link from preview and printed pages; it does not hide the sacred-literature notice. Credits are shown by default. Option groups use compact spacing and controls, with larger touch targets on mobile.

The page heading places the English passage reference to the left of the Hebrew reference, separated by `|`. Match fits its shared column layout at the same width in both orientations, then uniformly scales it to fit the paper; landscape does not alter the text-to-line spacing. Reader continues to flow into the available paper width.

Advanced contains "Use substitute spellings", enabled each time Print opens, with examples of the resulting ידוה and אלקים forms. The print-only transformation replaces the first hey in the four-letter Name with daled, keeping the final hey, and the root hey in Eloah/Elohim derivatives with kuf, retaining prefixes, suffixes, nekudot, cantillation, and token boundaries. This matches spellings, including occurrences referring to other gods or judges; it does not classify a word's religious status. It applies to both Torah and Tikkun forms, selected passages, and faded surrounding text. The existing renderer still supplies Match geometry and Reader flow. Turning it off restores the original spelling in the live preview and prepared output; the reading text and source corpus are unchanged.

The top-right mark reflects what is actually printed. It reads ב״ה when any printed word, including faded surrounding text, is still a name that cannot be erased; otherwise it reads בס״ד, on every page of the printout. Besides the four-letter Name and Eloah forms, the check finds Shaddai, Kel, Adonai, Yah, and Ehyeh from their pointing, using the pointed text kept on Torah-column words as well. Ambiguous spellings, such as הָאֵל meaning "these", count as names because an unneeded ב״ה is harmless.

## Reader integration

The optional details box also includes the selected verse range in Hebrew and English, using the same reference formatter as the page heading. Current/several aliyot use their selected canonical names, including Maftir and dated service honor roles. Custom ranges show an aliyah name when contained within one aliyah, preferring the current service context; otherwise canonical parsha divisions supply the match. Whole readings, ranges spanning aliyot, and Esther omit the aliyah label. Changing the passage updates these details live.

The shared implementation lives in `app/printing/`; `/prototypes/print/` is now a sample-context wrapper. `/print/document/` supplies the isolated printable document, reusing `Page` and `applyReaderPageLayout`.

The reader captures current context from the same active-aliyah resolver used by navigation. Several aliyot uses stable run/aliyah identities, including Maftir. Whole parsha merges adjacent and overlapping ranges; holiday readings retain gaps and use the label Whole reading. Esther defaults to Whole Megillah and offers Custom range across its ten chapters. Its unpointed form is labelled Megillah; both layouts and side choices reuse the existing renderer, including the sons of Haman column and small letters.

The dialog uses native modal focus containment, restores focus on close, and owns its scroll lock and listeners. Opening is lazy and duplicate requests share one dialog. Printing calls the prepared iframe's system print function. Full desktop-browser menu interception, native iOS printing, physical output, and printer-specific margins still require device verification.

The production Passage section includes an Upcoming readings picker with ten dated Torah readings from today onward, using the reader's calendar settings and existing calendar coverage. Each entry shows the complete chapter/pasuk ranges, including separate Torah scrolls, using the same Hebrew reference formatter as the mobile aliyah popup. Selecting an entry previews the whole reading and keeps appearance/page options; individual aliyot and custom ranges remain available. Current reader passage restores the original active aliyah without navigating the reader.

The print dialog inherits the reader's active theme, including System, Light, Dark, Sepia, and custom background/text colors. Surfaces, controls, dividers, secondary text, and selection states derive from the shared reader color tokens. Printable sheets retain their paper presentation. The print settings panel uses its own class to avoid inheriting the reader settings popover's positioning and grid layout.

Opening Print with a native text selection in the reader initializes Custom range to the first through last selected pesukim. Selecting even part of a word includes its entire pasuk. Selection is captured before opening the modal, then resolved against the original Torah text using the existing text filters and tokenizer, including unannotated maqaf expansion and paired Reader word grouping. Source page continuations preserve verse/chapter boundaries. Selections spanning sefarim show an Ending sefer field. Empty or non-reader selections retain the current-aliyah default; unresolved reader text reports an error instead of printing another passage.
