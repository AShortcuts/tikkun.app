# Reader navigation and settings concepts

Image concepts prepared on October 6, 2026. These explore navigation and settings organization; they do not implement or replace the reader. The running desktop/mobile reader, `ReaderShell.svelte`, `ReaderControls.svelte`, `ReaderSettings.svelte`, and `CONTEXT.md` informed the concepts.

## Direction

Keep the Hebrew reading surface dominant. Use the existing neutral paper, blue selection accent, Hebrew UI type, and Lucide family with rounded-square utility buttons. Design variance: 5; motion intensity: 3; visual density: 4. Taste informs visual consistency and redesign discipline; Emil informs responsiveness, disclosure, touch feedback, and panel behavior.

| Current structure | Proposed change | Why |
| --- | --- | --- |
| Settings categories use an icon-only rail. | Use visible category labels. | Users can find a category without trying each icon. |
| Mobile Reader Settings is inside Reader controls. | Expose a direct Settings or View entry. | Common adjustments take fewer taps. |
| More mixes printing, storage, privacy, and diagnostics. | Give utilities named destinations; keep diagnostics under support. | New options can fit without expanding a miscellaneous panel. |
| Display, playback, navigation, and utilities compete for space. | Separate current-reading actions from persistent preferences. | Keep frequently used actions close without crowding the page. |

## Variants

The image boards are [A: Toolbar + side panel](./variant-a-toolbar-side-panel.png), [B: Reading dock](./variant-b-reading-dock.png), and [C: Side navigation](./variant-c-side-navigation.png).

| Concept | Desktop | Mobile | Tradeoff |
| --- | --- | --- | --- |
| A: Toolbar + side panel | Reading selector and direct play in a slim toolbar; docked settings panel with labeled tabs. | Direct settings entry opens a bottom sheet with the same categories. | Best fit for the existing product. Docking must preserve the current reading position when width changes. |
| B: Reading dock | Playback and quick View controls live in a bottom dock; All settings opens the full index. | Daily controls sit within thumb reach; View expands into a sheet. | Calm header and fast practice controls, but the dock consumes vertical reading space. |
| C: Side navigation | Labeled navigation rail plus a searchable settings column. | Three bottom destinations and a full-height settings view. | Most room for future features, with more persistent navigation and less reading width. |

Recommendation: start with A. Its labeled tabs and distinct utility destinations solve the current discovery issues with the least disruption. Consider B's compact View panel only if font/layout adjustments are frequent enough to justify a second level of settings.

## Shared behavior to preserve

- Keep Reading Layout versus Match Torah Lines independent of One Side versus Two Sided. Two Sided remains available on desktop; mobile portrait explains that landscape is required.
- Keep play/pause separate from choosing an aliyah. Unavailable audio leaves the chooser usable and explains the limitation.
- Keep direct nekudot access, bookmark/share actions, the existing reading search, and native back-to-Readings behavior. Secondary actions may live in the ellipsis menu, without adding another player.
- Apply settings immediately and preserve focal position and playback. Keep deeper highlight/color/focal options under named disclosures; no Save button.
- Show Media & Storage according to actual capability. Explain unavailable states. Keep privacy-preserving analytics and diagnostic exports in their existing user-controlled form.
- Use immediate keyboard actions, short origin-aware pointer popovers, interruptible mobile sheets, visible close buttons, focus return, and reduced-motion alternatives. Reserve space for controls and safe areas rather than covering text.

## Review boundary

Each board shows desktop, mobile reading, and mobile settings. The images establish visual direction and hierarchy, not exact typography or tested gestures. An eventual implementation must use the real Hebrew renderer and existing controls, then verify long reading titles, light/dark themes, narrow screens, landscape, keyboard focus, large text, and native safe areas. No application code was changed for these concepts.
