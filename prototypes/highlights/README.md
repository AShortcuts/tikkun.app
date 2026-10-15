# Destination highlight study

Open `/prototypes/highlights/` on the existing local dev server (port 5176).

This route is an isolated visual/interaction mockup for persistent highlights and sharing. It renders the real Beresheet text through the existing Page renderer and layout helper, and reuses the existing verse-to-token selection helper. The approved brief arrival cue has since been integrated into the reader as described below; persistent highlights and sharing remain prototype-only.

Compare Soft marker, Fine outline, and Tint + underline with Light, Sepia, Dark, or System. Reader/Match, one/two sides, a phrase, a pasuk, and pesukim 6-8 are selectable. Audio overlap is a static visual sample using the existing audio highlight style; it plays no sound. Theme choices are document-local and do not save reader preferences.

Replay ordinary-link arrival clears the persistent highlight, briefly marks the target's visual row with a theme-aware blue wash, then removes that cue after 1.6 seconds. The brief arrival and Soft marker direction are approved; this checkpoint evaluates their integration with selection actions. Remove highlight clears the explicit selection without moving the viewport and removes a prototype selection fragment from the URL. Restore highlight is a study-only control. The final product would reuse its existing navigation/scroll behavior; the mockup scrolls only its sample viewport.

Verified locally: all three treatments, default theme selectors, Reader and Match with one/two sides, phrase/verse/range selection, audio overlap, clear/restore, and arrival disappearance. Mobile overflow was corrected so lower controls remain reachable. Browser console had no errors. Typecheck and scoped ESLint passed. Screenshots are in `qa/`.

Selecting Torah text reveals Copy link to selection in a reserved action row below the text, leaving the native selection menu untouched. It uses the existing permalink clipboard handler. Copied URLs reopen this prototype with whole selected word tokens highlighted in both columns; `preview-words` is deliberately a local study format, not the production link contract. Production sharing and search matching remain unimplemented. Physical iOS selection-menu behavior still needs device validation.

Still undecided: final placement of the selection action, production link encoding, and whether full Torah wording search belongs in this scope.

2026-09-30 refinement: highlight fills, outlines, and underlines now span the inter-word gaps on each selected visual line, keeping the two columns separate. Decorative measured strips leave source text geometry and audio styling intact and are recalculated on layout/viewport changes. The arrival cue also uses continuous strips. Desktop Reader/Match and mobile reflow were visually checked; typecheck and scoped lint passed.

Three generated image studies are saved in `image-mockups/`: Translucent ribbon, Editorial margin, and Soft spotlight. Each compares Light, Sepia, and Dark. These are visual concepts, not accurate scripture reproductions; use the real prototype for exact text. Full prompts are retained alongside the images.

## Reader arrival cue

`app/reader/arrival-cue.ts` decorates the starting visual row after the existing route rendering and scroll completion. It mirrors into visible columns, leaves word/audio markup alone, and cleans up after 1.6 seconds, navigation, unmount, or a page resize. Normal scrolling and its URL checkpoint updates do not replay it. Page-number routes retain their existing page-number reveal instead. The light cue is neutral; dark and custom-dark use the approved faint blue; sepia retains its prototype blue tint. The cue fades in over 200 ms, holds for 600 ms, then fades out over 800 ms. Reduced motion holds a static cue for the same interval. Printing hides the cue.

Checks cover real Reader/Match rendering with one/two sides, mobile widths, text geometry, audio-class preservation, timer replacement, cleanup, theme colors, reduced motion, and route completion. Chromium and WebKit are exercised; physical iOS app validation and deployment are separate release steps. The new persistent highlight and Copy link to highlight workflow are not implemented in the reader yet.
