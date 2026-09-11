---
name: Tikkun Reader Privacy and Support
description: Scoped as-built reference for the two public information pages.
colors:
  background: "#06080b"
  panel: "rgba(15, 19, 25, 0.84)"
  text: "#f5f7fa"
  muted: "rgba(235, 240, 247, 0.66)"
  link: "#79aaff"
  divider: "rgba(255, 255, 255, 0.11)"
  border: "rgba(255, 255, 255, 0.18)"
  action: "#2164c7"
  action-hover: "#286cce"
  action-label: "#fff"
  selection: "#29466e"
typography:
  display:
    fontFamily: "Lora, Georgia, serif"
    fontSize: "clamp(2.75rem, 4.5vw, 4rem)"
    fontWeight: 400
    lineHeight: 1.08
    letterSpacing: "-0.035em"
  body:
    fontFamily: "Noto Sans Hebrew, sans-serif"
    fontSize: "1rem"
    lineHeight: 1.75
  title:
    fontFamily: "Noto Sans Hebrew, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 650
    lineHeight: 1.4
  label:
    fontFamily: "Noto Sans Hebrew, sans-serif"
    fontSize: "0.875rem"
rounded:
  panel: "1rem"
  action: "0.85rem"
spacing:
  paragraph: "1rem"
  section: "2rem"
  panel: "clamp(1.5rem, 3.5vw, 3rem)"
components:
  information-panel:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.muted}"
    rounded: "{rounded.panel}"
    padding: "{spacing.panel}"
    typography: "{typography.body}"
  support-action:
    backgroundColor: "{colors.action}"
    textColor: "{colors.action-label}"
    rounded: "{rounded.action}"
    padding: "0.7rem 1rem"
  support-action-hover:
    backgroundColor: "{colors.action-hover}"
    textColor: "{colors.action-label}"
---

# Design System: Tikkun Reader Privacy and Support

## Overview

This reference applies only to `/privacy/` and `/support/`. It records the built extension of Tikkun's public site: the existing dark shell, ambient background, Lora titles, Noto Sans Hebrew reading text, blue links, and quiet borders. It neither replaces nor defines the global visual system.

The confirmed direction in [the surface brief](../privacy-support-design.md) uses the user-pinned Ocean of Torah composition: an introduction beside one readable panel, stacked on mobile. No new visual identity, product interview, or generated raster assets belong to this extension.

Source of truth: `src/lib/components/InformationPage.svelte`, both route files under `src/routes/(site)/`, `css/site.css`, and `css/site-shell.css`. The shared site layout owns the header, footer, navigation, and existing `home-ambient.jpg` artwork.

## Colors

Primary: soft blue identifies links and the current local-navigation underline. The support action uses the deeper action colors with a white label; these are scoped overrides, not replacements for the global site accent.

Neutral: near-black background, translucent dark panel, bright headings, muted reading text, and white-alpha borders inherit the public site. Preserve the source alpha values. Selection uses the scoped selection background and white text.

## Typography

Lora sets the page title; Noto Sans Hebrew sets the introduction, panel, section headings, and local navigation. Preserve this distinction. The title balances its wrapping; section headings remain compact rather than repeating the display treatment. The privacy date uses tabular numerals at 0.8rem; the email link scales from 1rem to 1.25rem.

## Layout

Desktop uses `minmax(14rem, 0.8fr) minmax(0, 1.8fr)` columns, aligned at the top, in `min(100% - 4rem, 76rem)`. The column gap is `clamp(2rem, 6vw, 5.5rem)`; vertical padding is `clamp(3.5rem, 7vw, 6rem)` above and `clamp(4rem, 8vw, 7rem)` below.

At 48rem and below, stack the introduction above the panel, use `min(100% - 2.5rem, 38rem)`, a 1.5rem gap, and 3rem top padding. The shared site action fills its container at 620px and below. The panel allows long text and email addresses to wrap; do not introduce a fixed content height.

## Elevation & Depth

The information panel has no shadow. Its translucent fill and thin border provide separation over the inherited ambient artwork. Existing shell elevation remains owned by the shell; do not generalize it into new information-page effects.

## Shapes

One rounded, bordered panel contains the body. Rounded buttons retain the site's action shape. Section boundaries rely on spacing, except the support contact block, which ends with a quiet divider. No new cards, chips, or fields are introduced.

## Components

`InformationPage` renders a labeled main landmark, introductory header, local Support/Privacy navigation, and content panel. Current navigation uses `aria-current="page"`, bright text, and a blue underline. Links brighten on hover and inherit the shell's visible keyboard focus outline.

Support leads with the real `support@oceanoftorah.com` link and an "Email support" action. The action opens a mail client with the Tikkun Reader support subject. Its minimum height is 2.75rem and weight is 700. It inherits the site's 150ms state transition and 1px hover lift; there is no page entrance animation or decorative motion.

Privacy uses a dated, sequential set of section headings and paragraphs. Support uses a contact section, a short details list, and links to existing diagnostics and privacy guidance. There is no support form or automatic diagnostic submission.

## Do's and Don'ts

- Do preserve the incumbent shell and the scoped two-column-to-stack composition.
- Do retain the corrected support-action colors and white label in both default and hover states.
- Do use actual project content, working route links, and the shared support contact source.
- Don't turn these page-specific measurements into global site rules.
- Don't add decorative motion, generated raster assets, or invented UI primitives to this extension.
- Don't treat visual or automated verification as approval of privacy claims: hosting configuration and support-mail retention require owner review before publication.

Verification recorded by the implementation task: desktop 1280px and mobile 390px recaptures showed no horizontal overflow; corrected action contrast measured 5.66:1 default and 5.09:1 hover. Typecheck, scoped lint, and 12 browser tests passed. Independent review verdict: ship. Its sole contrast finding was corrected; its resumed browser was unavailable, so the parent task supplied the final live recaptures.
