# Mobile Reader Design QA

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
