---
name: Torah Audio Aligner - Private beta
description: Existing Tikkun typography and calm controls for private timing review.
colors:
  blue: "#245f96"
  blue-soft: "#dce9f3"
  blue-hover: "#174d7b"
  blue-active: "#103b63"
  paper: "#faf9f5"
  surface: "#f1f0eb"
  panel: "#fdfcf9"
  ink: "#252e32"
  muted: "#5b6468"
  line: "#d7d9d5"
  white: "white"
  green: "#317253"
  amber: "#825219"
  danger: "#9b3933"
  error-surface: "#fcebe8"
  error-ink: "#7c2722"
  disabled-surface: "#edeeea"
  disabled-ink: "#596366"
typography:
  display:
    fontFamily: "Lora, Georgia, serif"
    fontSize: "23px"
    fontWeight: 400
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Lora, Georgia, serif"
    fontSize: "22px"
    fontWeight: 400
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "14px"
    fontWeight: 400
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "12px"
    fontWeight: 600
  supporting:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.6
  compact-row:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "13px"
    fontWeight: 400
  compact-meta:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "11px"
    fontWeight: 400
  hebrew:
    fontFamily: "Stam, serif"
    fontSize: "29px"
    fontWeight: 400
    lineHeight: 1.75
rounded:
  control: "7px"
  word: "6px"
spacing:
  tight: "5px"
  small: "8px"
  compact: "10px"
  medium: "12px"
  section: "16px"
  panel: "20px"
components:
  button-primary:
    backgroundColor: "{colors.blue}"
    textColor: "{colors.white}"
    rounded: "{rounded.control}"
    padding: "7px 12px"
  button-primary-hover:
    backgroundColor: "{colors.blue-hover}"
  button-primary-active:
    backgroundColor: "{colors.blue-active}"
  button-secondary:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "7px 12px"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "7px 12px"
  button-text:
    backgroundColor: "transparent"
    textColor: "{colors.blue}"
    rounded: "{rounded.control}"
    padding: "5px 0"
  button-disabled:
    backgroundColor: "{colors.disabled-surface}"
    textColor: "{colors.disabled-ink}"
  input:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "8px 10px"
  word:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.hebrew}"
    rounded: "{rounded.word}"
    padding: "1px 7px 3px"
  word-selected:
    backgroundColor: "{colors.blue-soft}"
  word-playing:
    backgroundColor: "{colors.blue}"
    textColor: "{colors.white}"
---

# Design System: Torah Audio Aligner - Private beta

## Overview

**Creative North Star: "Listen, locate, correct."**

This private extension uses Tikkun's established visual world: warm paper, dark ink, restrained blue, local Lora headings, and local Stam Hebrew. The passage carries the visual emphasis; conventional authoring controls support listening and correction.

Operate mode favors compact tools, visible review state, and progressively disclosed details. This document records the built private surfaces only; the surface contracts remain in `private-ui.brief.md` and `batch-ui.brief.md`, and product constraints remain in `PRODUCT.md`.

**Key Characteristics:**

- Warm, flat reading surfaces with restrained tool contrast.
- Large RTL Hebrew paired with compact controls and tabular times.
- Blue selection and playback, green timing review, amber uncertainty.
- Persistent playback access and contextual error recovery.

Source: `private-ui/index.html`, `private-ui/style.css`, and `private-ui/app.js`. The supplied desktop and mobile finish screenshots corroborate these treatments. Independent finish review cleared the three identified mobile fixes; that disposition applies to those fixes. Sidecar tonal ramps are generated swatch previews, not additional implemented palette tokens.

The batch extension preserves this visual world. Its implementation sources are
`batch-ui/panel.html`, `batch-ui/batch.css`, and `batch-ui/batch.js`; its review
captures live in `.impeccable/review/batch/`.
Independent batch finish review cleared the three reviewed fixes and returned a
ship disposition limited to those fixes.

## Colors

Warm neutrals surround one blue action accent. Semantic colors communicate review and failure states.

### Primary

- **Restrained blue** supplies primary actions, selected-word borders, focus outlines, links, and selected onset markers. Soft blue fills selection and job status; darker blue states supply primary-button hover and press feedback.

### Neutral

- **Warm paper** is the reading background; **tool surface** distinguishes the inspector; **light panel** supports fields, review, and playback.
- **Dark ink** carries primary text. **Muted ink** carries times and supporting explanations. **Divider gray** separates regions and outlines controls.
- **White** appears on primary actions and the playing word. Explicit disabled neutrals preserve readable controls and unavailable-state feedback.

Green marks reviewed timing; amber marks model hypotheses and sustained-tail guidance. Danger text marks removal and queue failures, while paired error ink and pale error fill make contextual failures readable.

**The State Meaning Rule.** Blue denotes selection or playback; green denotes timing reviewed; amber denotes uncertainty requiring listening.

## Typography

**Display Font:** Lora, with Georgia and serif fallbacks. **Body Font:** the existing system sans-serif stack. **Hebrew Font:** Stam, with a serif fallback. Both custom faces load locally with font-display swap.

The frontmatter records the base type roles. Application and passage headings remain close in size; the selected Hebrew word is larger (43px desktop, 38px mobile). Passage words grow to 32px at the wide breakpoint. The application heading becomes 20px in the intermediate layout, returning to its base size on mobile.

Supporting copy uses comfortable line height; labels stay compact. Hebrew groups run RTL with generous line spacing, retaining niqqud and taamim. Times, numeric fields, and word positions use tabular numerals. The implementation adds no separate display family or decorative label treatment.

## Layout

The desktop shell fills the viewport with a compact header and recording row, a flexible passage beside a 290px inspector, and full-width playback below. Passage and inspector scroll independently. At 1500px and above, the inspector grows to 320px and reading gutters widen to 5vw.

At 980px and below, gutters tighten and recording metadata wraps. At 700px and below, normal document flow stacks the passage, inspector, and playback. The passage has its own bounded scroll area (37dvh, minimum 250px); inspector contents remain in document flow. Timing controls cap at 420px.

Mobile playback sticks to the bottom with safe-area padding. Its controls wrap and its waveform shortens from 112px to 82px. Review becomes a fixed, full-width dialog, with an internal sticky heading, playback, and error recovery. Background controls become inert while this mobile dialog is open.

**The Local Scroll Rule.** Advancing or following words scrolls the passage container, preserving the operator's document position.

Batch navigation sits between the recording row and the workspace. Its two
buttons expose the active view with pressed state and the same soft-blue
selection treatment. Opening Batch saves current edits, closes review, pauses
audio, and focuses the Batch switch. In Batch, the recording row, recording
save/undo/redo tools, passage workspace, and playback are hidden; record-specific
actions appear only with the recording they affect.

Desktop places the compact library beside the saved queue in an asymmetric grid
(36px gap, 1350px maximum width); at 900px and below they stack with a 28px gap.
At 700px and below, the batch panel uses normal document flow and the navigation
status occupies its own row. Library rows scroll within a bounded list (335px
maximum height). Opening a result returns to the reader, selects its first word,
and resets the inspector's internal scroll position.

## Elevation & Depth

Most surfaces are flat. Tonal contrast and thin borders separate reading, inspector, fields, and transport. The desktop review overlay uses a faint left-edge shadow; mobile sticky playback uses a faint upward shadow. Exact shadow values belong to the sidecar. Neither treatment is a general card-shadow style.

## Shapes

Conventional controls use gently rounded corners; Hebrew word targets use a slightly tighter radius. Major work regions stay rectangular, divided by thin rules. Tiny circular marks indicate timing review or an unresolved flag. The private-beta badge is a compact status marker, not a navigation chip system.

## Components

### Batch queue

Use flat divided rows for recording selection and queue history. Recording
titles use 13px text, with semibold titles in the queue; library metadata uses
11px text. Existing results, reviewed counts, unresolved flags, paused work,
and failures use explicit text. Parsha and text filters narrow the real library;
empty searches display a message. Unavailable recordings have disabled
checkboxes and an explicit identity warning. Only export-eligible results
receive ZIP selection checkboxes, and newly eligible results are selected
automatically. Failure messages use the existing danger color; long titles,
errors, and upload filenames wrap inside their regions.

Start, pause after current, cancel waiting, and retry retain distinct actions.
Run limits, fresh alignment, and uploads stay in disclosures. Upload mapping
pairs each filename with a labeled complete-aliyah selector. Queue rows retain
Review or Open actions for completed results and Retry for failed, interrupted,
or cancelled work. Review next prioritizes results with unresolved reading
flags. The ZIP action shows the selected file count and exposes a repeat
download link once the files are prepared.

### Quick review

Quick review is an initially open inspector disclosure with paired Replay pasuk
and Next unreviewed controls, then full-width Mark pasuk reviewed & next and
Next reading flag controls. Pasuk replay selects its first occurrence; pasuk
acceptance marks timing review and advances to the next pasuk when available.
Next unreviewed wraps to an earlier unreviewed word when needed and replays it.
Next reading flag opens the existing review panel, focuses the listening
decision field, positions the flag below the sticky heading, and replays the
word. Its label exposes the remaining count or the disabled No remaining
reading flags state. These controls reuse existing buttons, focus, disabled
states, and local passage scrolling.

### Buttons

Primary buttons use blue with white text; secondary buttons use light panels and borders. Quiet buttons remove the resting border and fill. Text actions remain blue and compact; occurrence removal uses danger text. Primary hover and press darken, while ordinary controls shift to neutral and soft-blue fills. Disabled buttons keep explicit text, fill, and a not-allowed cursor.

Buttons use short color transitions (150ms, ease). Focus-visible controls receive a blue outline (2px, offset 3px). Reduced-motion preference removes transitions and smooth scrolling.

### Inputs / Fields

Inputs, selects, and textareas share a thin border, light panel, and control radius. Onset editing pairs a centered numeric field with two nudge buttons. Labels remain explicit; secondary units and optional guidance use muted text. Native checkboxes, ranges, and selects retain conventional operation.

### Navigation

Previous and Next flank a tabular word position. Limits disable the corresponding direction. Recording selection and Review & export remain in the recording row; the review panel has a visible Close action. Escape closes review and returns focus to its trigger; mobile review contains keyboard focus.

Download Tikkun cues sits beside the recording selector, spanning its own row on mobile. Reviewed recordings download directly; incomplete recordings open the existing review panel at its download requirements. The panel puts the cue action first, followed by name, full-recording approval, timings, and reading flags. Optional end exports and review packages remain under Other export options.

### Hebrew Word

Each performed occurrence is a real button containing canonical annotated Hebrew. Selection uses a blue border and soft fill; playback uses solid blue and white text. A bottom dot means timing reviewed; a small upper dot means a remaining hypothesis. Selecting a word also replays it. Textual counts, the legend, and accessible word labels supplement the state colors.

### Review / Playback

Review displays flag notes and listening actions as divided rows. Native disclosure sections hold optional word details, sustained tails, preview settings, and history. The waveform uses a soft selected interval, onset lines, a dashed model-end estimate, and a darker playhead. Its window selector, seek range, replay, loop, speed, and playback controls support inspection.

**The Visible Recovery Rule.** Review keeps its own playback control and moves errors with Download edits and Dismiss into the visible panel.

## Do's and Don'ts

### Do:

- Do preserve local Lora and Stam roles and readable Hebrew diacritics.
- Do show uncertainty beside the word or review decision it affects.
- Do retain visible focus, explicit disabled states, and playback access.
- Do use disclosure sections for optional corrections and review settings.

### Don't:

- Don't turn timing-reviewed green into pronunciation or taamim certification.
- Don't move the whole document when advancing a word inside the passage.
- Don't obscure errors or playback behind the mobile review dialog.
- Don't promote this private extension's layout into a replacement public Tikkun identity.
