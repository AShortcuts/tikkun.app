# Refined A: toolbar and side panel

Prepared October 18, 2026. The refined images were generated through the existing ChatGPT subscription using OpenCodex's local image-generation route. No separate OpenAI API key was required. These are static design concepts; no application implementation was changed.

## Completed images

- [Desktop toolbar and side panel](./refined-a-desktop.png).
- [Mobile reading and settings sheet](./refined-a-mobile-final.png).

Exact submitted prompts are saved in [the desktop prompt](./refined-a-desktop.prompt.md) and [the final mobile prompt](./refined-a-mobile-v2.prompt.md). The mobile image received one local bitmap cleanup to remove a generated chevron from the disabled Media & Storage row. Earlier image variants remain alongside the selected outputs.

Visual review confirmed the compact toolbar structure, labeled categories, independent line-layout and sides choices, mobile landscape restriction, font-size slider, and single rounded-square print action. Both PNG files opened successfully. The images illustrate unavailable browser storage; native availability must follow the existing capability check. Generated Hebrew and icon shapes are illustrative; implementation must reuse the real renderer and icon set. Gestures, keyboard access, and reading-position preservation have not been implemented or tested by this image work.

## Shared direction

Use `variant-a-toolbar-side-panel.png` as a visual reference. Preserve the existing calm reader identity: pale neutral background, graphite text, blue selected states, Hebrew reading typography, and Lucide-style icons in rounded-square buttons. This is a refinement of A, with design variance 5, motion intensity 3, and visual density 4. Use realistic readable interface proportions, generous touch targets, and clear hierarchy. Keep Reading Layout versus Match Torah Lines independent of One Side versus Two Sided. Preserve direct play, aliyah selection, and nekudot access. Use the canonical visible name Beresheet where an English reading name is needed.

## Image 1: desktop reader with settings

Use case: ui-mockup.

Create one polished, high-fidelity desktop application screenshot refining the supplied A reference. Show a wide reading canvas with an open docked settings panel on the right, approximately 340 logical pixels wide. Use a single compact toolbar across the top. Left: a chevron and Readings. Middle: the existing Beresheet reading selector. Right: a blue rounded-square play button, a separate aliyah dropdown, direct nekudot control, selected Settings button, and an overflow button. Keep controls grouped by purpose with quiet spacing, rather than enclosing every group in a card. The Hebrew passage is the dominant visual element. Retain authentic text from the reference rather than inventing Hebrew. Use a few large readable verses with small verse numbers and ample line spacing.

The side panel starts with Reader settings and a visible close icon. Below, use three evenly spaced labeled tabs: Reading, Appearance, Audio. Reading is selected with a restrained blue underline. Arrange the main controls in this order: Font size with minus, slider, 100%, and plus; Line layout with Reading and Match Torah lines; Sides with One Side and Two Sided, both available on desktop. Add one collapsed Advanced disclosure. Separate occasional utilities with a thin divider. Show Media & Storage and Privacy & support as quiet navigation rows. Show Print passage as a single compact row with one printer icon button in the same rounded-square style as the toolbar; do not add a second print entry or a chevron implying a print settings screen. If depicting unavailable Media & Storage, use a disabled-looking label with an information icon, without an enabled navigation chevron.

Use crisp contemporary UI typography consistent with the reference, high contrast, quiet separators, 14-pixel-style button corners, and a restrained shadow only where elevation has meaning. Do not show a Save button, a second player, a persistent navigation rail, decorative dashboard cards, marketing copy, or invented features. Show the interface straight-on without laptop hardware, perspective, or presentation annotations. The image should make the hierarchy immediately assessable at full size.

## Image 2: mobile reading and settings sheet

Use case: ui-mockup.

Create a polished, high-fidelity comparison image with two mobile viewports of the same refined A interface, each using realistic 390 by 844 logical-pixel proportions. Place them side by side with a modest neutral gap and small outside captions Reading and Reader settings. Preserve the same typography, blue accent, icon family, and rounded-square buttons as the desktop image. Avoid bulky device frames.

Both screens have exactly two compact toolbar rows below the safe area. First row: Readings back control at left, Beresheet reading selector in the center, and a rounded-square Settings icon button at right. Second row: blue play button, separate aliyah selector, direct Hide nekudot control, and overflow. Maintain at least 44 logical pixels for touch targets. Omit a redundant third heading row and do not add bottom tab navigation. Long reading names must fit through sensible truncation rather than shrinking every control. The left screen shows a calm, spacious Hebrew reading surface below this toolbar, with authentic passage text based on the reference and quiet verse numbers.

On the right screen, show the same reader behind a lightly dimmed scrim and an open bottom sheet occupying about three quarters of the screen. Include a subtle drag handle, Reader settings heading, visible close button, and the same Reading, Appearance, Audio tabs. Reading is selected. Put Font size, Line layout, and Sides first. Show Reading and Match Torah lines as distinct layout choices. One Side is selected; Two Sided is disabled with a small Landscape label. Below these controls, show a collapsed Advanced row and a divider before utilities. Let lower utilities continue naturally in the scrollable sheet; do not shrink all controls merely to fit everything above the bottom edge. Respect the bottom safe area. Include the single rounded-square print icon action only if it fits without compressing the common controls.

Keep the background reader visible enough to communicate continuity. No Save button, no floating second player, no extra navigation destinations, no decorative panels, and no invented product data. This is a static concept image, not proof of implemented or tested behavior.

## Review before presenting

- Verify two toolbar rows on mobile and one on desktop.
- Verify independent layout and sides controls, with the correct portrait restriction.
- Verify a visible sheet/panel close control, direct nekudot access, and separate play and aliyah selection.
- Verify readable labels, consistent rounded-square buttons, and one print action.
- Save new images as sibling files without overwriting the original A board; show both images inline.
