---
name: Tikkun Reader Scroll Story
description: A near-black Torah-practice story anchored by a live reader and one white paper chapter.
colors:
  reading-space: "#06080b"
  reader-surface: "#0b0e13"
  toolbar-surface: "#11161d"
  reading-text: "#f6f7f9"
  reading-muted: "rgba(236, 240, 246, 0.68)"
  hairline: "rgba(255, 255, 255, 0.12)"
  hairline-strong: "rgba(255, 255, 255, 0.22)"
  illuminated-frame: "rgba(221, 232, 249, 0.74)"
  action-blue: "#3984ff"
  action-blue-hover: "#4b90ff"
  action-blue-soft: "#79aaff"
  focus-blue: "rgba(95, 157, 255, 0.95)"
  synced-green: "#68c47b"
  draft-blue: "#5b9cff"
  needs-timing-yellow: "#e0b84f"
  paper: "#f6f5f1"
  paper-ink: "#111210"
  paper-muted: "#5a5b56"
  hebrew-highlight: "rgba(255, 215, 0, 0.15)"
  hebrew-highlight-text: "#fff7c1"
  white: "#ffffff"
typography:
  display:
    fontFamily: "Lora, Georgia, serif"
    fontSize: "clamp(3.65rem, 16vw, 5.8rem)"
    fontWeight: 400
    lineHeight: 0.9
    letterSpacing: "-0.04em"
  headline:
    fontFamily: "Lora, Georgia, serif"
    fontSize: "clamp(2.8rem, 12vw, 5.75rem)"
    fontWeight: 400
    lineHeight: 0.98
    letterSpacing: "-0.04em"
  title:
    fontFamily: "Lora, Georgia, serif"
    fontSize: "clamp(2.1rem, 8vw, 3.9rem)"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "-0.035em"
  body:
    fontFamily: "Lora, Georgia, serif"
    fontSize: "clamp(1rem, 3vw, 1.18rem)"
    fontWeight: 400
    lineHeight: 1.62
  action:
    fontFamily: "Noto Sans Hebrew, sans-serif"
    fontSize: "0.98rem"
    fontWeight: 720
  label:
    fontFamily: "Noto Sans Hebrew, sans-serif"
    fontSize: "0.82rem"
    fontWeight: 680
    lineHeight: 1.45
  hebrew:
    fontFamily: "ShlomosemiStam, serif"
    fontSize: "clamp(1.45rem, 6vw, 2.35rem)"
    fontWeight: 400
    lineHeight: 1.8
rounded:
  highlight: "0.35rem"
  brand-mark: "0.8rem"
  compact-action: "0.85rem"
  selector: "0.95rem"
  action: "1rem"
  reader: "1.1rem"
  paper-chapter: "clamp(2rem, 7vw, 4.5rem)"
  status: "50%"
spacing:
  content-edge: "1rem"
  content-edge-wide: "2rem"
  action-gap: "1.25rem"
  reading-row: "1.6rem"
  chapter-block: "clamp(6rem, 16vw, 10rem)"
components:
  primary-action:
    backgroundColor: "{colors.action-blue}"
    textColor: "{colors.white}"
    typography: "{typography.action}"
    rounded: "{rounded.action}"
    padding: "0.82rem 1.35rem"
    height: "3.45rem"
  primary-action-hover:
    backgroundColor: "{colors.action-blue-hover}"
    textColor: "{colors.white}"
    typography: "{typography.action}"
    rounded: "{rounded.action}"
  text-action:
    backgroundColor: "transparent"
    textColor: "rgba(235, 240, 247, 0.82)"
    height: "2.75rem"
  header-navigation:
    backgroundColor: "rgba(6, 8, 11, 0.82)"
    textColor: "{colors.reading-muted}"
    typography: "{typography.label}"
    rounded: "1.15rem"
    height: "5rem"
  live-reader-frame:
    backgroundColor: "{colors.reader-surface}"
    textColor: "{colors.reading-text}"
    rounded: "{rounded.reader}"
    width: "min(68vw, 60.5rem)"
  theme-selector:
    backgroundColor: "transparent"
    textColor: "{colors.paper-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.selector}"
    padding: "0.75rem 0.85rem"
    height: "4.8rem"
  theme-selector-selected:
    backgroundColor: "#10110f"
    textColor: "{colors.white}"
    typography: "{typography.label}"
  reading-row:
    backgroundColor: "transparent"
    textColor: "{colors.reading-text}"
    padding: "1.6rem 0"
  aliyah-status-bubble:
    backgroundColor: "rgba(255, 255, 255, 0.045)"
    textColor: "rgba(255, 255, 255, 0.4)"
    typography: "{typography.label}"
    rounded: "{rounded.status}"
    size: "2.54rem"
  torah-highlight-row:
    backgroundColor: "{colors.reading-space}"
    textColor: "{colors.hebrew-highlight-text}"
    typography: "{typography.hebrew}"
    padding: "clamp(1.35rem, 4vw, 2rem) 0"
---

# Design System: Tikkun Reader Scroll Story

## Overview

**Creative North Star: "The Connected Torah Page"**

The scroll story is a near-black reading space in which practice never separates from the Torah page. Editorial Lora copy explains the workflow while one functional, steeply angled Beresheet reader supplies the proof. On desktop, one local scroll film carries that same reader through the opening, the white paper chapter, and all three practice beats before releasing it into the readings index. Mobile keeps the upright reader and attached theme sheet unchanged. Blue actions lead into practice, and fine hairlines organize the story without turning it into a collection of feature cards.

The world stays restrained until the live reader carries the story into one rounded white paper chapter for theme selection. The journey then returns to the dark practice sequence and readings index with its status-coded aliyah links. This record is scoped to the shipped isolated prototype: a user-pinned, preserve-led scroll story with seed key `PINNED-SCROLL-STORY-2026-08-09`, not a replacement for the public product design.

**Key Characteristics:**

- A near-black reading space structured by fine light hairlines.
- Lora editorial display type paired with Noto Sans Hebrew for controls.
- Blue actions reserved for paths into practice and the live reader.
- A clipped, angled Beresheet reader that remains functional, outlined by a cool-white illuminated frame on desktop.
- An upright mobile reader with a Light-by-default paper theme sheet attached to its lower edge.
- One rounded white paper chapter where the same live reader settles into a large, centered reading surface on desktop.
- One spring-smoothed desktop stage that docks the reader beside the practice story instead of replacing it with another frame.
- Status-coded circular aliyah deep links.
- Three product-real scroll scenes: contents, playback, and Continue.

## Colors

The palette pairs a cool near-black reading world with a single paper interruption, using blue for practice paths and established green, blue, and yellow states for aliyah readiness.

### Primary

- **Practice Blue** (`#3984ff`): Primary buttons, playback progress, and the clearest path into the reader.
- **Practice Blue Hover** (`#4b90ff`): Hover feedback for filled reader actions.
- **Soft Reader Blue** (`#79aaff`): The hero byline and restrained supporting emphasis.
- **Focus Blue** (`rgba(95, 157, 255, 0.95)`): Three-pixel keyboard focus outlines against dark surfaces.

### Secondary

- **Synced Green** (`#68c47b`): Semantic reference for word timing that is ready.
- **Draft Blue** (`#5b9cff`): Semantic reference for timing still in draft.
- **Needs Timing Yellow** (`#e0b84f`): Semantic reference for audio that still needs timing.

### Tertiary

- **Torah Highlight Wash** (`rgba(255, 215, 0, 0.15)`): A quiet active-word field over the Torah line.
- **Torah Highlight Ink** (`#fff7c1`): Legible text within the active-word field.

### Neutral

- **Reading Space** (`#06080b`): The page background and dominant visual field.
- **Reader Surface** (`#0b0e13`): The outer live-reader frame.
- **Reader Toolbar** (`#11161d`): The compact control strip above the live embed.
- **Reading Text** (`#f6f7f9`): Primary copy on the dark story.
- **Reading Muted** (`rgba(236, 240, 246, 0.68)`): Explanations, metadata, and secondary navigation.
- **Hairline** (`rgba(255, 255, 255, 0.12)`): Section and reading-row dividers.
- **Strong Hairline** (`rgba(255, 255, 255, 0.22)`): Framing that needs slightly more definition.
- **Illuminated Frame** (`rgba(221, 232, 249, 0.74)`): Shared cool-white outline for the navigation shell and live hero reader.
- **Paper** (`#f6f5f1`): The sole light chapter behind the theme preview.
- **Paper Ink** (`#111210`): Primary type and selected-state contrast on paper.
- **Paper Muted** (`#5a5b56`): Supporting copy on paper.
- **White** (`#ffffff`): Filled-action labels and selected controls.

### Named Rules

**The Blue Path Rule.** Use Practice Blue for actions that open or advance practice; keep informational structure neutral.

**The Paper Interruption Rule.** Reserve Paper for theme selection: a single desktop chapter or the attached mobile bottom sheet. The surrounding scroll story remains Reading Space.

## Typography

**Display Font:** Lora (with Georgia and serif fallbacks)  
**Body Font:** Lora (with Georgia and serif fallbacks)  
**UI Font:** Noto Sans Hebrew (with sans-serif fallback)  
**Torah Font:** ShlomosemiStam (with serif fallback)

**Character:** Lora gives the product a calm editorial voice without becoming ornamental. Noto Sans Hebrew makes navigation, actions, theme controls, status, and metadata compact and operational; ShlomosemiStam is reserved for the Torah line itself.

### Hierarchy

- **Display** (400, `clamp(3.65rem, 16vw, 5.8rem)`, 0.9): The short first-viewport promise, tightly tracked and limited to roughly nine characters per line.
- **Headline** (400, `clamp(2.8rem, 12vw, 5.75rem)`, 0.98): Major story and chapter headings.
- **Title** (400, `clamp(2.1rem, 8vw, 3.9rem)`, 1): Individual practice beats.
- **Body** (400, `clamp(1rem, 3vw, 1.18rem)`, 1.62): Explanations held between roughly 28 and 40rem for readable measures.
- **Action** (720, `0.98rem`): The primary practice call to action.
- **Label** (680, `0.82rem`, 1.45): Reader links, reading actions, compact status, and interface metadata.
- **Torah** (400, `clamp(1.45rem, 6vw, 2.35rem)`, 1.8): The centered Hebrew demonstration line.

### Named Rules

**The Two-Voice Rule.** Lora carries narrative explanation, while Noto Sans Hebrew carries controls, navigation, status, and metadata.

**The Text Is the Artifact Rule.** Use ShlomosemiStam only where the Torah text itself is being demonstrated.

## Layout

Mobile uses one-rem content edges and retains its existing stacked sequence. The attached theme sheet rises from the live reader, then the three practice demonstrations continue in normal document flow. At 48rem, the desktop story becomes one continuous reader film: opening first, theme chapter second, practice third. The film owns one sticky `100svh` stage while chapter markers remain ordinary document content. Content edges widen to two rem, navigation links appear, the theme selector becomes four columns, and each reading row expands into title, aliyah, and action tracks. Header and hero cap at 92rem; practice content caps at 82rem; readings and footer cap at 86rem.

At 64rem, the first viewport remains an asymmetric composition with copy in the left third and the live reader oversized, angled, and clipped past the right edge. Local film progress progressively levels and centers that same frame as the reading-space atmosphere crossfades into Paper. The theme title stays fully clipped until the frame begins that inward leg, then rises from behind it and holds at the top of the paper chapter. The reader settles large in the lower half before scaling in place to make room for the appearance controls. The controls arrive as the reader clears their space, then the title and controls share one upward fade before the reader docks on the left while Choose, Follow, and Return pass on the right. The paper layer fades back to Reading Space, and the stage releases only after the final beat.

Film progress is measured from real chapter positions, updated once per animation frame, and softened with Svelte's numeric `Spring`. Scroll input itself stays native: there is no smooth-scroll controller and no intercepted page wheel. Fresh loads and reloads reset to the opening before the page restores its normal scroll behavior. The same progress source drives reader geometry, paper crossfade, title reveal, practice scene changes, the fine progress rail, and the final release. Reduced-motion mode removes the spring lag and applies the current state immediately.

At 34rem the brand descriptor appears; below 22rem the aliyah bubbles contract. The implementation is mobile-first and maintains all links, the live reader, and theme controls at every width.

**The Reader Leads Rule.** On wide screens, preserve the live reader's oversized right-edge crop instead of containing it beneath centered copy.

## Elevation & Depth

Most surfaces remain flat and are separated by one-pixel hairlines. Depth is concentrated where it proves something tangible: filled blue actions carry a soft blue glow (`0 1.25rem 3rem -1.8rem rgba(57, 132, 255, 0.88)`), the angled live reader uses a two-layer black-and-blue shadow, and the paper preview uses a broad dark ambient shadow. The hero image and gradient add atmosphere behind the reader without becoming a separate card surface.

### Shadow Vocabulary

- **Action Glow** (`0 1.25rem 3rem -1.8rem rgba(57, 132, 255, 0.88)`): Filled actions that enter the reader.
- **Reader Weight** (`0 3.2rem 7rem -3rem rgba(0, 0, 0, 0.96), 0 1.3rem 5rem -3rem rgba(65, 126, 241, 0.7)`): The live proof frame in the hero.
- **Paper Preview Lift** (`0 3.5rem 7rem -3.5rem rgba(21, 23, 20, 0.48)`): The live reader after it settles into the light chapter.
- **Playback Glow** (`0 0.4rem 1.2rem rgba(57, 132, 255, 0.65)`): The two-pixel active progress line.

### Named Rules

**The Proof Has Weight Rule.** Shadows lift the live reader, actionable progress, and paper preview only; ordinary content rows stay flat and divided by hairlines.

## Shapes

The system is mostly linear: sections and reading rows are horizontal rules with no card shell. Compact controls use gently rounded corners from `0.8rem` to `1.1rem`, active Hebrew words use a small `0.35rem` field, and aliyah links remain perfect circles. The only large silhouette is the paper chapter, whose radius scales from `2rem` to `4.5rem` and makes the dark-to-light transition feel like a new page rather than another panel.

**The Circle Means Aliyah Rule.** Reserve circular controls for aliyah status links; actions and selectors remain rounded rectangles.

## Components

### Primary Button

- **Shape:** A filled rounded rectangle (`1rem`) with a `3.45rem` minimum height and `0.82rem 1.35rem` padding.
- **Color:** Practice Blue with white, weight-720 Noto Sans Hebrew text.
- **Hover / Active:** Shift to Practice Blue Hover and rise one pixel on hover; compress to 98% on press.
- **Focus:** Use a three-pixel Focus Blue outline with a four-pixel offset.

### Text Action

- **Shape:** An underline action with a `2.75rem` minimum touch height and no container.
- **Color:** Soft near-white (`rgba(235, 240, 247, 0.82)`) that becomes white on hover.
- **Use:** Secondary paths such as "See how it works" and reading coverage links.

### Header Navigation

- **Structure:** Brand at left; readings, tidbits, about, and a compact filled reader action at right.
- **Behavior:** Text links stay hidden until 48rem, but the brand and Open reader action remain available on small screens.
- **Styling:** Noto Sans Hebrew, muted links, and a rounded cool-white illuminated shell occupying one continuous `5rem` vertical slot across normal viewport widths.

### Live Reader Frame

- **Shape:** A `1.1rem` clipped cool-white frame with a dark toolbar above a `100 / 67` live same-origin reader viewport.
- **Depth:** Match the production homepage reader's rest perspective on wide screens, then remove that angle through the root-scroll settling motion. Do not add a separate hover transform to the reader frame.
- **State:** Keep a centered loading status until the iframe fades in over 220ms. A three-pixel inner Focus Blue border appears when focus enters the reader.
- **Interaction:** Keep embedded controls active while locking the reader's main scroll surface. Relay wheel and touch movement to the outer story with instant, frame-coalesced updates; preserve nested scrollable controls and never add smooth-scroll animation to the relay. On desktop, local film progress carries this same frame from the angled hero through theme selection and the practice sequence.

### Theme Selector

- **Structure:** One clipped group with four options, two columns on mobile and four at 48rem.
- **Option:** Each option is at least `4.8rem` high with `0.75rem 0.85rem` padding and stacked label/description text.
- **Selected:** Light is the preview default from first load. The selected option uses near-black (`#10110f`) with white text; unselected options remain transparent over Paper.
- **Behavior:** Light is applied to the live iframe from first load and remains the default preview. Each option updates that same reader without writing its saved preference.
- **Focus:** Draw the three-pixel blue outline inward so it remains visible inside the clipped group.

### Product Tour Scenes

- **Contents:** Open a compact contents panel containing the production `AliyahBubbles` component, real cue-status colors, and real aliyah deep links.
- **Playback:** Reserve the Torah highlight wash and two-pixel progress line for this beat only.
- **Continue:** Present a recent-place prompt whose Continue action points to the real first-aliyah route; state the product's 48-hour checkpoint window without inventing progress data.
- **Motion:** Swap scenes with one short settle inside the shared sticky stage; give each flow its own entrance rather than recycling the word-highlight effect.

### Torah Highlight Row

- **Text:** Center the Hebrew line in ShlomosemiStam with generous 1.8 line-height.
- **Active State:** Apply the Torah Highlight Wash and Ink only while the listening scene is active.
- **Progress:** Use a two-pixel Practice Blue line that arrives with the listening scene rather than changing across unrelated beats.

### Reading Row

- **Structure:** A hairline-separated row containing the parsha title and status, aliyah bubbles, and Open full reading action.
- **Responsive:** Stack with `1.6rem 0` padding on mobile; use three tracks and `1.75rem 0` padding from 48rem.
- **Type:** Lora for the parsha title; Noto Sans Hebrew for status and actions.

### Aliyah Status Bubbles

- **Shape:** Perfect circles (`2.54rem`, growing to `2.7rem` at 48rem) with Hebrew letter labels.
- **Synced:** Green-tinted border and surface with pale green text.
- **Draft:** Blue-tinted border and surface with pale blue text.
- **Needs Timing:** Yellow-tinted border and surface with pale yellow text.
- **Hover / Active:** Move linked bubbles up two pixels on hover; return to baseline and scale to 96% on press.

## Do's and Don'ts

### Do:

- **Do** keep practice copy and reader proof together in the first viewport.
- **Do** use hairline borders to group sections and reading rows.
- **Do** preserve circular aliyah links and their green, blue, and yellow status meanings.
- **Do** let each scroll beat demonstrate the product control it describes.
- **Do** let the white theme chapter act as the only major tonal interruption.
- **Do** honor `prefers-reduced-motion` by removing animations and shortening transitions.

### Don't:

- **Don't** replace the reader with generic feature cards or a detached transcript.
- **Don't** reuse playback highlighting to explain contents or saved-place behavior.
- **Don't** spread paper surfaces throughout the dark story.
- **Don't** use blue for decoration unrelated to reader or practice actions.
- **Don't** flatten the desktop hero into centered copy above a contained screenshot.
- **Don't** change theme controls into global reader preference writes.
