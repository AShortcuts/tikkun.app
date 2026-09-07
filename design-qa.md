# Tikkun Design QA

## Homepage direction 1

- Source visual truth: `/Users/adambh/.codex/generated_images/019f6b21-9ff3-7960-918a-73a88354ef09/exec-6c02aa32-b857-4c36-be9a-ea52549febc6.png` (1487 x 1058 px).
- Implementation screenshot: `/private/tmp/tikkun-homepage-final.png` (1487 x 1005 capture from a 1487 x 1058 CSS viewport at 1x).
- Normalized source crop: `/private/tmp/tikkun-homepage-reference-final-crop.png`.
- Full combined comparison: `/private/tmp/tikkun-homepage-final-comparison.png`.
- Focused source and implementation comparison: `/private/tmp/tikkun-homepage-focused-comparison.png`.
- Responsive evidence: `/private/tmp/tikkun-homepage-mobile.png` at 390 x 896, with no horizontal overflow.
- State: `#/about`, initial scroll position, dark homepage, reader demonstration visible, and no modal or menu open.

The homepage follows the selected desktop-first direction: concise practical copy at left, an accurate reader demonstration at right, and a compact availability dock beneath it. The former technical About tables and Google Sheet link are replaced with product benefits, a three-step explanation, and a data-backed available-readings section.

### Fidelity surfaces

- Typography: the hero hierarchy, measure, and line wrapping match the source direction. The live product capture preserves the Torah type, spacing, line breaks, and alignment exactly.
- Spacing and layout: header placement, split hero composition, angled reader, availability dock, and section transition align with the reference. The responsive layout preserves the desktop reader demonstration instead of presenting the product as mobile-first.
- Colors: near-black surfaces, white type, restrained blue accents, muted supporting copy, and green availability states follow the selected visual direction.
- Images and icons: the atmosphere is a generated raster asset sized for the hero, the demonstration is a fresh capture of the actual reader, and the existing brand asset is used instead of an invented logo. There are no placeholders, fake interface drawings, or CSS gradients.
- Copy and content: every visible line explains practical value or a next action. Reading availability is generated from the recording manifest rather than hard-coded marketing claims.

### Findings and iteration history

- P0: none.
- P1: none.
- P2: none.
- P3: the real reader content and existing aleph brand mark intentionally replace the generated mock's invented UI and scroll icon; this improves product accuracy without changing the selected composition.
- First pass: the title focus ring was visible on load, the hero sat too low, the reader crop was oversized, the dock label clipped, and the following section did not enter the viewport.
- Final pass: focus styling, hero rhythm, title scale, reader capture/aspect, and dock geometry were corrected, then compared again against the normalized source in one combined image.

### Functional and regression checks

- `Available readings` scrolls to and focuses the readings section.
- `Start practicing`, available-reading cards, and all `Open reader` actions enter the existing reader routes.
- The readings grid reflects the live recording manifest and its existing availability states.
- The 390 px responsive pass has no horizontal overflow and retains the same product story.
- Browser console errors and warnings: none during the final interaction pass.
- `npm run check`, `npm run build`, and the full test suite pass: 109 files, 687 tests passed, and 1 skipped.

final result: passed

---

# Reader Settings Option 1 Design QA

Date: 2026-09-03

## Evidence

- Selected visual truth: `/Users/adambh/.codex/generated_images/01a06363-460b-7dd0-a3e0-0ee75cba3358/exec-a6c4ba33-2955-44b4-94b0-eba0bddb99a9.png` at 1000 x 1573 px.
- Implementation capture: `qa/reader-settings/implementation-option-1-desktop-full.png`, a 922 x 648 browser-harness capture of the live 1280 x 900 Reader frame.
- Focused source crop: `qa/reader-settings/reference-option-1-panel.png`.
- Focused implementation crop: `qa/reader-settings/implementation-option-1-panel.png`.
- Combined comparison: `qa/reader-settings/comparison-option-1.png`; selected mockup is left and implementation is right.
- Live route: `http://127.0.0.1:5176/reader/#/torah/parsha/beresheet`.
- Verified state: dark Beresheet Reader, Reading category, Match, One Side, Reader position, and the Shift preference off.

## Findings

- P0: none.
- P1: none.
- P2: none remaining.
- Follow-up: `LAYOUT` and `READER` now use the mockup's muted, compact, tracked uppercase treatment; the underlying heading text remains semantic title case.
- The implementation preserves the mockup's icon-only rail, two-column setting rows, grouped segmented controls, circular header actions, and bordered Shift switch.
- The pane is intentionally more concise than the source: it removes the mockup's unused lower space, reduces vertical padding, and keeps the full Reading category immediately scannable.
- The desktop Two Sided helper remains `Mirrored`, while compact portrait correctly shows `Landscape`; this preserves the real availability rule instead of copying static mockup text.
- Existing product typography, theme tokens, icons, and preference behavior remain implementation truth.

## Functional And Responsive Checks

- Live category navigation and the Shift switch were exercised in the in-app browser; the original Reading category and off state were restored.
- Live checks at 1280 x 900 and 390 x 844 showed no clipping or horizontal overflow. The responsive browser matrix also passed across 320-1280 px, all themes, reduced motion, forced colors, and 200% reflow.
- Focused Reader Settings and progress runtime tests passed: 11 tests across 2 files.
- Typecheck passed with 0 errors and 0 warnings; targeted ESLint and targeted `git diff --check` passed.
- `npx vite build` passed. The full wrapper `npm run build` stops before Vite on the unrelated existing Vayetzei manual-work manifest invariant.
- Browser console errors and warnings: none; only Vite connection and hot-update debug entries were present.

final result: passed

---

# Reader Settings Pane Design QA

Date: 2026-09-02

## Target And State

- Source visual truth: `/Users/adambh/.codex/generated_images/01a06363-460b-7dd0-a3e0-0ee75cba3358/exec-a3bbcada-9a38-47ff-96c2-b19bb4cbebe8.png` at 1682 x 976 px.
- Implementation captures: transient Codex in-app browser captures at 1682 x 976, 1440 x 900, 768 x 900, 390 x 844, and 320 x 700 CSS px at 1x density. The browser API did not expose a persistent screenshot path.
- Combined comparison: a temporary in-app browser canvas placed the 1682 x 976 source and a same-size live Reader iframe side by side, normalized together to a 1682 x 488 comparison capture. The temporary comparison files were removed after review.
- Focused comparison: no separate crop was needed because the Reader Settings pane is the only modified visual region and remained fully visible in the combined comparison.
- Verified state: dark Beresheet reader, Reading category active, Match and One Side selected, Yoni Davidov selected, and playback at 1x.
- Geometry: the pane is 500 px wide, with a 56 px icon rail on desktop and a 48 px rail on compact mobile.

## Fidelity And Iteration

- The implementation preserves the approved dark glass surface, restrained blue active state, thin rail indicator, Lucide icon family, one-line header, instant-apply check, and compact reset and close actions.
- Reading is the primary surface. Appearance, Playback, and More are real switchable groups instead of visually uniform stacked sections.
- Labels and controls use a denser inline layout than the source mockup, following the approved request to make option 3 more concise. Existing offline, support, theme, highlight, and playback controls remain available through progressive disclosure.
- P0: none. P1: none. P2: none.
- First responsive pass: `Reader Settings` wrapped at 320 px. The mobile header gaps were tightened and the title now remains on one line.
- Final responsive pass: no horizontal overflow at 768, 390, 320 px; the mobile pane measures 378.8125 px inside a 390 px viewport and 308.8125 px inside a 320 px viewport.

## Functional And Accessibility Checks

- All four icon-only categories expose accessible names, pressed state, controls relationships, visible focus, and keyboard activation.
- The advanced-reading row opens Playback; the playback stepper changed 1x to 1.05x and back; Reading/Match changed instantly and was restored to Match.
- Escape closes the dialog, returns focus to Reader settings, and reopening focuses Close reader settings.
- Compact mobile keeps Two Sided visible but disabled with its Landscape explanation. A cold mobile load hides the desktop settings trigger, then loads and styles the pane from Reader Controls without a flash of the desktop trigger.
- Reader Settings CSS is emitted as its own 18.48 kB lazy asset; the main CSS asset is 155.02 kB and remains below the 170 kB build budget.
- `npm run typecheck`, targeted ESLint, `npm run build`, and five affected browser suites pass: 5 files and 17 tests.
- Browser console: one existing special-Hebrew-letter alignment error from `app/special-letter-layout.ts` was observed; no Reader Settings error was produced.

final result: passed

## Reader Settings hierarchy follow-up

Date: 2026-09-02

### Target and evidence

- Source visual truth: `/Users/adambh/.codex/generated_images/01a06363-460b-7dd0-a3e0-0ee75cba3358/exec-a3bbcada-9a38-47ff-96c2-b19bb4cbebe8.png` at 1682 x 976 px, plus the user's requested hierarchy and checkmark refinements.
- Implementation: the live Reader at `http://127.0.0.1:5176/reader/#/torah/parsha/beresheet` in the Codex in-app browser.
- Full-view comparison: a temporary comparison canvas placed the 1682 x 976 source beside a live 1682 x 976 Reader iframe. Both were normalized to 628 x 364.39 px at 1x density inside a 1280 x 720 capture. The temporary files were removed after review.
- Focused comparison: a second temporary canvas placed the cropped source pane beside the current 389 x 697 mobile Reading capture. It was used to judge the requested header and section changes, not desktop proportions. The temporary files were removed after review.
- State: dark Beresheet reader; Reading and Playback categories checked separately; Match, One Side, Reader position, Yoni Davidov, and 1x playback selected.

### Fidelity surfaces

- Fonts and typography: existing Reader Settings typography, weights, line height, wrapping, and hierarchy remain intact. The moved labels stay readable at both desktop and compact widths.
- Spacing and layout rhythm: the 56 px desktop rail and 48 px compact rail remain unchanged. Reset and Close now measure 37.59375 x 37.59375 px with a computed `50%` radius. The 389 px viewport has zero horizontal overflow and a 377.8125 px pane.
- Colors and visual tokens: the decorative green instant-status check and blue selected-option check glyphs are gone. The restrained blue active surfaces remain as the selection affordance, while native checkbox marks remain only where they communicate an actual boolean control.
- Image and icon fidelity: no new image assets were needed. Existing Lucide rail, reset, and close icons remain sharp and use the established Reader token colors.
- Copy and content: Reading position appears first under Reading > Reader. The bordered Shift/Nekudot preference is the section's final control. Ba'al Koreh and Playback speed remain under Playback > Audio; Auto-scroll remains under Playback > Behavior.

### Findings and checks

- P0: none. P1: none. P2: none. The first post-change comparison passed without a visual-fix iteration.
- Reading, Playback, Shift preference, Reading position, playback stepper, and keyboard focus behavior all remained functional. The redundant Playback settings shortcut is absent. Changed preferences were restored after the interaction pass.
- The latest focused browser pass confirms a 1 px solid border, 14 px radius, the Shift preference after Reading position, no Playback shortcut, and zero horizontal overflow at 389 px.
- The five affected browser suites pass: 5 files and 17 tests. The latest targeted rerun passes 3 files and 12 tests. `npm run typecheck`, targeted ESLint, and `npm run build` pass.
- Browser-test diagnostics showed only the existing SvelteKit history API warnings; no Reader Settings error was produced.
- Production output keeps Reader Settings in a 17.77 kB lazy CSS asset. The main CSS asset is 155.16 kB and remains below budget.

final result: passed

## Mobile title depth follow-up

- Source visual truth: `/Users/adambh/Library/Caches/Clop/images/38626.png` (194 x 96 px, Display P3, 2x source density).
- Implementation screenshot: `/private/tmp/tikkun-title-depth-390.png` (390 x 844 px at a 390 x 844 CSS viewport and 1x capture density).
- Full-view regression comparison: `/private/tmp/tikkun-title-full-comparison.png`.
- Focused comparison: `/private/tmp/tikkun-title-depth-focused-comparison.png`.
- Density normalization: the source was reduced to 97 x 48 px and centered in a 100 x 64 px comparison cell beside 1x implementation crops.
- State: dark Yitro reader, compact mobile header, picker closed, and no player overlay.

The source is a component crop rather than a full reader mock. The focused comparison therefore owns border, radius, surface, and shadow fidelity. The full-view comparison uses the previous 390 x 844 implementation as regression evidence that the Torah surface and overall reader geometry did not change.

### Fidelity surfaces

- Fonts and typography: the existing app typeface and weight remain unchanged; the parsha title increases to 22.4 px on normal phones and 19.2 px at 320 px. The missing chevron is intentional and preserves the user's prior explicit direction.
- Spacing and layout rhythm: the title measures 80.38 x 48 px at 390 and 550 px, and 65.98 x 48 px at 320 px. Its center delta is -0.004 px, -0.004 px, and 0 px respectively. No horizontal overflow or control overlap was observed.
- Colors and visual tokens: both title and home use the same theme-aware neutral border and raised surface. Their shared shadow reproduces the reference's inner top highlight, subtle lower inset, close shadow, and soft falloff.
- Image and icon fidelity: no raster assets were needed. The supplied image is reference-only; the existing Lucide home icon remains sharp and unchanged.
- Copy and content: the parsha name and all Torah content remain unchanged.

### Findings and comparison history

- P0: none.
- P1: none.
- P2: none.
- Earlier state: the parsha title had a blue border and the home control had a comparatively flat surface.
- Fix: both controls now share the reference-derived neutral depth treatment, and the title was enlarged without changing the equal-side-column centering model.
- Post-fix evidence: the focused comparison shows the matching raised treatment; the full comparison shows unchanged Torah layout; browser measurements confirm exact viewport centering at every tested compact breakpoint.
- Interaction proof: opening the parsha picker focused its search field; pressing the title again returned to the Yitro reader. Browser console warnings and errors: none.

final result: passed

## Visual comparison

- Primary viewport: 390 x 844.
- Reader reference: `/tmp/brilliant-reader-playing-soft-v2.png`.
- Reader implementation: `/tmp/tikkun-mobile-reader-visual-final.png`.
- Combined reader comparison: `/tmp/tikkun-reader-comparison-final.png`.
- Picker reference: `/tmp/brilliant-aliyah-picker-soft-v2.png`.
- Picker implementation: `/tmp/tikkun-mobile-picker-visual-final.png`.
- Combined picker comparison: `/tmp/tikkun-picker-comparison-final.png`.

The implemented hierarchy, rounded floating surfaces, gold current-aliyah state, blue playing state, seven-position rail, per-aliyah controls, and persistent transport match the approved direction. The final comparison pass reduced the picker cards and transport height while preserving 44 px minimum touch targets.

## Functional checks

- The Library control opens the existing Torah library and returns to the selected parsha.
- Selecting an aliyah closes the picker, scrolls to its Torah position, and updates the capsule and rail.
- Aliyot 1-7 expose real play/pause controls connected to the existing shared audio session.
- Maftir reuses the seventh aliyah recording while retaining its own navigation and playback target.
- The bottom transport remains visible for the loaded session, seeks on the real timeline, and uses filled play/pause icons.
- Mobile overflow actions remain reachable.
- The layout has no horizontal overflow at 390 x 844 or 320 x 844.
- Desktop reader geometry remains unchanged; the audio player shares the new five-control transport order.

## Constraints and intentional differences

- The Torah font, text, line spacing, alignment, and rendering code were not changed.
- Recordings without cue-derived duration metadata show `Available` instead of invented times.
- Play and pause glyphs are filled, following the user's latest direction rather than the outlined glyphs in the reference.

## Severity audit

- P0: none.
- P1: none.
- P2: none remaining.

## Aliyah start overlay follow-up

- Viewport and route: 390 x 844 at `#/torah/parsha/beresheet/1-2-4`, navigated to Beresheet aliyah 6.
- Approved source: `/private/tmp/tikkun-aliyah-overlay-brilliant-refined.png`.
- Matched source crop: `/private/tmp/tikkun-aliyah-overlay-reference-390x844.png`.
- Approved implementation visual baseline: `/private/tmp/tikkun-aliyah-start-marker-portal-390x844.png` (the marker styling is unchanged by the anchoring refactor).
- Combined comparison: `/private/tmp/tikkun-aliyah-overlay-comparison-390x844.png`.
- The 38 x 14 visual capsule, short fading rules, and bold Lucide chevron match the approved compact direction while retaining a separate 44 x 44 tap target.
- Each marker is measured once when its page renders, then absolutely anchored inside the line content and carried by native scrolling. Scroll events perform no marker geometry reads or coordinate writes.
- In the steady-state scroll check, an 80 px reader scroll moved the aliyah 6 line exactly -80 px while its stored marker coordinates, marker count, and reader scroll height remained unchanged.
- The marker center matched the measured first grapheme center with a 0 px delta for Beresheet aliyah 6 (`וַיֹּ֨אמֶר`).
- The shared aliyah-rail state hid the overlay after four seconds. `Show Aliyah Starts` restored it without moving the reader or changing the active aliyah.
- Tap, keyboard button semantics, and pointer hover all opened the existing details dialog with parsha, aliyah, and verse range.
- Console errors: none observed during the final verification pass.

## Expanded mobile player follow-up

- Viewport and route: 393 x 852 at `#/torah/parsha/beresheet/1-2-4`.
- Brilliant source: `/private/tmp/tikkun-expanded-player-reference.png`.
- Implementation: `/private/tmp/tikkun-mobile-player-expanded.png`.
- Combined comparison: `/private/tmp/tikkun-expanded-player-comparison.png`.
- The compact transport now keeps Restart, Previous, Play/Pause, Next, and Speed in one symmetric row, with the primary control centered at 196.5 px.
- The expanded state reuses the live audio session and is a fixed overlay. The Torah surface measured 393 x 754.40625 px before and after expansion, with identical x/y coordinates and no layout shift.
- Compact touch targets measured 44, 44, 48, 44, and 44 px; expanded targets measured 44, 44, 56, 44, and 44 px. The primary control remains centered, uses the filled pause glyph, and has computed `box-shadow: none`.
- Word progress remains above the current timestamp. Expanded timestamps align to the progress track endpoints; compact timestamps share the track's vertical center.
- The backdrop and close control collapse the sheet, restore focus to the expansion control, and clear the expanded document state.
- Loop, Save, and Repeat Passage are intentionally absent, following the latest direction.
- Console errors and warnings: none observed during the final verification pass.

## Parsha trigger and touch-target follow-up

- Source of visual truth: `/Users/adambh/.codex/generated_images/019f6b21-9ff3-7960-918a-73a88354ef09/exec-af8828bd-e26c-4d9c-a900-60e0b45235a4.png`.
- Implementation screenshot: `/private/tmp/tikkun-parsha-trigger-final-390.png`.
- Full comparison: `/private/tmp/tikkun-design-qa-comparison.png`.
- Focused header comparison: `/private/tmp/tikkun-design-qa-header-comparison.png`.
- Viewport and density: 390 x 844 CSS px at 1x; the 852 x 1848 source was normalized to the same comparison dimensions.
- State: dark Yitro reader, compact header, no picker, dialog, or player overlay.
- Scope: app-owned header controls and touch geometry. The Torah font, line breaking, spacing, alignment, and text renderer remain implementation truth and were intentionally excluded from visual restyling.

At that checkpoint, the parsha name used a blue rounded pill with no chevron while the home icon used a rounded-square neutral gray border. The later Mobile title depth follow-up supersedes those border and elevation details; existing Lucide iconography and the independent aliyah capsule remain preserved.

The home, parsha, aliyah, and settings controls measured at least 44 px high. All seven aliyah rail buttons measured 44 x 44 px at the narrowest 320 px viewport without horizontal overflow. The seek input measured 44 px high; restart, previous, next, and speed measured 44 x 44 px; play measured 48 x 48 px; and the compact expand control measured 64 x 44 px. Visible rail lines and the seek track retained their prior artwork dimensions.

### Findings and iterations

- P0: none.
- P1: none.
- P2: none.
- Initial touch-target verification found a 5.68 px overlap between the enlarged seek and expand targets.
- The player reserved additional fixed-overlay padding, leaving a measured 2 px separation while preserving independent center hit testing and avoiding Torah layout changes.
- Parsha picker and About interactions were exercised after styling; both opened and returned to the reading surface correctly.
- Browser console warnings and errors: none.

final result: passed

## Scroll-story layered live reader follow-up

- Desktop source visual truth: `/Users/adambh/Downloads/Codex Image Aug 5, 2026, 03_40_11 PM.png` (1487 x 1058 px) for reader scale and angle, plus `/var/folders/vl/qwh7jjjx6tv8wbcj2ffx404m0000gn/T/codex-clipboard-056daec6-a993-433f-b4af-f8d6b9525a8e.png` (1487 x 1058 px) for the bright rim and layered-reader treatment.
- Desktop implementation: `prototypes/scroll-story/qa/implementation-desktop-post-fix-1487x1058.jpg` at a 1487 x 1058 CSS viewport and 1x capture density.
- Desktop full comparison: `prototypes/scroll-story/qa/comparison-desktop-post-fix.png`.
- Desktop focused reader comparison: `prototypes/scroll-story/qa/comparison-desktop-reader-post-fix.png`.
- Mobile source visual truth: `/Users/adambh/Downloads/Codex Image Aug 7, 2026, 01_34_47 PM.png` (853 x 1844 px).
- Mobile implementation: `prototypes/scroll-story/qa/implementation-mobile-light-post-fix-427x922.jpg` at a 427 x 922 CSS viewport and 1x capture density.
- Mobile density normalization: the 853 x 1844 source was downsampled to 427 x 922 before comparison in `prototypes/scroll-story/qa/reference-mobile-normalized-427x922.png`.
- Mobile full comparison: `prototypes/scroll-story/qa/comparison-mobile-post-fix.png`.
- Mobile focused reader comparison: `prototypes/scroll-story/qa/comparison-mobile-reader-post-fix.png`.
- State: desktop initial hero with an interactive Dark reader, noninteractive Light reader behind it, and no menu open; mobile initial hero with one interactive Light reader and the theme sheet visible at the viewport bottom. The Dark mobile state is recorded in `prototypes/scroll-story/qa/implementation-mobile-dark-post-fix-427x922.jpg`.

The desktop comparison owns the angle, scale, clipping, rear-reader reveal, cool rim, and floor shine. The mobile comparison owns the upright device frame, real Torah content, and paper theme sheet rising over the lower edge. Both implementations use the existing same-origin reader rather than a raster mock, so the Torah text remains sharp and interactive.

### Findings and iteration history

- P0: none.
- P1: none.
- P2: none remaining.
- First comparison: the Light reader was too concealed behind the front frame, the floor shine was too restrained, and the mobile paper sheet entered below the initial 427 x 922 viewport.
- Fix: the rear reader moved higher and farther right, the front frame gained a cooler rim and broader floor bloom, and the mobile sheet moved into the bottom of the first viewport.
- Runtime fix: hidden mobile desktop-only embeds were not mounted after breakpoint detection. Mobile now runs one real iframe, eliminating the zero-size reader progress errors without touching reader code.
- Post-fix comparison: the supplied references and final renders were joined into full-view and focused comparison inputs, then reviewed at matching viewport dimensions.
- P3 intentional differences: mobile remains Light by default per the approved prototype behavior, and the established Tikkun Reader branding, byline, live-reader toolbar, and existing reader controls remain product truth instead of copying invented reference details.

### Functional and regression checks

- Mobile Light and Dark theme buttons update the live hero iframe and their pressed state; the final handoff is restored to Light.
- `See how it works` moves to the real workflow section and aligns `#how-it-works` at the viewport top.
- The desktop hero loaded both the front and Light rear readers; mobile loaded only the visible front reader.
- No horizontal overflow was observed at 1487 x 1058, 427 x 922, 320 x 568, or 844 x 390.
- Browser console warnings and errors: none in the final desktop and mobile passes.
- `npm run check` passed with 0 errors and 0 warnings; `npm test -- src/routes/prototype-isolation.test.ts` passed 3 tests; `npm run build` and `git diff --check` passed.

final result: passed

---

# Mobile Player Design QA

Date: 2026-09-01

## Target

- Selected source: option 1, the centered compact glass transport.
- Original source dimensions: 853 x 1844.
- Normalized source: `qa/mobile-player/reference-option-1-390x844.png`.
- Implementation capture: `qa/mobile-player/implementation-mobile-390x844.png`.
- CSS viewport: 390 x 844 at 1x density.
- Verified state: Beresheet, First Aliyah, playing, compact after four seconds idle.

## Behavior

- The full mobile transport appears immediately when playback starts.
- Four seconds without player interaction settles it into one compact capsule.
- Playback progress updates do not restart the idle deadline.
- Tapping the title restores the full transport.
- The existing speed control remains available from the capsule and opens the full speed popover.
- The existing expanded mobile sheet still opens and closes.
- Keyboard-visible focus prevents an automatic collapse while a player control is focused.
- The desktop transport does not enter the mobile minimized state.

## Visual Comparison

- Pass 1 found the capsule wider and taller than the selected source. This was corrected by tightening the capsule grid, padding, control size, and bottom offset while retaining a 44 px play target.
- Pass 2 found no unresolved P0, P1, or P2 differences before the explicit control-order follow-up.
- Full comparison: `qa/mobile-player/comparison-full.png`.
- Focused player comparison: `qa/mobile-player/comparison-player.png`.

### Compact Control-Order Follow-up

- The user explicitly moved playback speed to the left and play/pause to the right, superseding those two positions in the selected source.
- The equal 44 px side tracks keep the capsule centered and unchanged in size at 320, 390, and 550 px.
- DOM order remains primary-first: play/pause, restore summary, then speed. The new visual traversal follows that order from right to left.
- Both swapped controls restored the full transport; speed opened its existing popover and play/pause changed the live playback state.

## Accessibility And Resilience

- The compact state reuses the real play and speed controls instead of adding duplicate playback entry points.
- The summary button exposes a descriptive restore label.
- Reduced-motion and reduced-transparency fallbacks are present.
- Browser console: zero errors. One pre-existing SvelteKit history API warning is unrelated to the player.

final result: passed
