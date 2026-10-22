# Tikkun Reader - header and search artwork

Created 2026-10-20. Two English-language still assets; authentic Hebrew app content.
Brag entrypoint: /Users/adambh/.agents/skills/brag/SKILL.md. Applied inspection and planning references as a still-artwork workflow. No video or audio production.

## Product and audience

Torah readers preparing an aliyah. The central job is supported reading followed by independent practice. Evidence: current README.md, metadata/app-info/en-US.json, metadata/version/1.0/en-US.json, and existing native captures. Core text, hide-nekudot practice, and available recordings are supported. No pricing or entitlement claim is included.

## Brag rubric

1. App: a digital tikkun for Torah reading, listening, and practice.
2. Strongest claim: move from pointed text to independent reading in the same reader.
3. Visual hook: real Hebrew text, large editorial type, and the blue app controls.
4. Show: native Beresheet reading; enlarged first verse from the actual practice capture.
5. Shortest satisfying story: two independent placements, discovery then preparation. Duration not applicable.
6. Tone: polished; a contemporary study edition, respectful and reassuring.
7. Audio: not applicable.
8. Share copy: Your next aliyah, within reach. Read, listen, and practice with Tikkun Reader.
9. Flow: choose a reading -> read with nekudot -> hide them and practice.

## Direction and scene plan

Considered: oversized Hebrew letterform brand poster; photographic study desk; editorial paper with real native UI. Selected the third to preserve the approved September palette and prove the actual reading feature. This extends the existing portrait collection into landscape placements rather than reusing its layouts.

Revised header: "Torah reading practice." Preserve the selected search composition, add "Listen. Follow. Practice.", and show an unpointed native practice screen behind an enlarged first-verse playback detail. An enlarged native passage makes the key audio benefit visible. Supporting copy retains practice without nekudot. The on-image coverage disclaimer is removed at the user's request. Coverage still varies; the pictured first verse has published word timing. Headline and popout fit Apple's header safe area.

Search: "Torah reading practice." Make the purpose immediately clear. A native reader and a selective popout of the actual practice first verse explain the change from supported reading to independent practice. Bridge: after recognizing the app's purpose, the viewer sees how it helps practice. The popout is a marketing enlargement, not a fabricated floating app control. These are separate placements, not a connected screenshot pair.

Typography: existing licensed Lora, Helvetica Neue for secondary labels. Palette: paper #f4f0e7, ink #202b32, brand blue #146ac3. Native UI colors are unchanged. Simple paper planes and blue light support the content; no generated Hebrew, decorative sacred text, fake reviews, or awards.

## Capture provenance

Reused the project's full-resolution native iPhone 17 Pro Max captures from 2026-09-11, build 1.0 (2): 01-reader.png, 02-practice.png, and 03-audio.png, 1320 x 2868. Original source: app-store-screenshots-2026-09-11-141544/captures/iphone/. These are not fresh captures or evidence of the latest build. Core pictured functions are corroborated by current source/metadata. No app code was changed. A fresh current-release capture review remains appropriate before publication.

Authentic Apple iPhone 17 Pro Max silver bezel reused with its license. Original geometry: 1470 x 3000; aperture x75 y66 w1320 h2868; corner mask radius185. Entire assembly scales uniformly.

Practice popout crop: x40 y560 width1240 height260 from the original 1320 x 2868 capture; includes the complete first verse. Crop coordinates and source are retained in the composition and manifest.

## Apple specifications checked 2026-10-20

- https://developer.apple.com/app-store/asset-best-practices/
- https://developer.apple.com/help/app-store-connect/reference/app-information/creative-assets-specifications/
- https://devimages-cdn.apple.com/design/resources/download/app-store/creative_assets-product_page_header_template-static.psd
- https://devimages-cdn.apple.com/design/resources/download/app-store/creative_assets-search_results_template-static.psd

Header: 3840 x 1646. Search: 3840 x 2560 (maximum 3:2 size). PNG, opaque RGB, sRGB. The current table gives no separate image file-size ceiling for these two placements; the 500 MB limit in that page belongs to event cards and is not reused here.

Safe rectangles measured from Apple's PSD "Art Safe Area" layers: header x1097 y493 w1646 h661; search x836 y765 w2168 h1030. This run uses those exact guides, with additional inner margins. Templates remain in /tmp; small reference previews and template URLs are included. Template reference imagery is not part of upload exports.

Local preview images simulate store context and conservative safe crops, and are labeled mockups. They do not verify account eligibility, App Store Connect's live rendering, asset approval, or publication. Apple currently describes the placements for iOS 27 and iPadOS 27 and later. Actual ASC preview remains a publication gate.

## Completion checks

Render two editable compositions, verify fonts and image loading, assert essential content inside template safe rectangles, inspect full assets and conservative crops, check dimensions/PNG encoding/opacity/sRGB, and verify final ZIP contents. No upload requested.

## Header revision evidence

User requested unpointed text in the background phone, no background highlighting, no bottom disclaimer, and Beresheet's first verse in the foreground. Background uses unchanged native 02-practice.png. Foreground uses a fresh, genuine public-web playback capture from https://tikkunreader.com/reader/#/torah/parsha/beresheet/1-1-1 on 2026-10-20, Chromium viewport440x956 at 3x, 1320x2868 pixels. Clicked Play ראשון after load and captured active token 1:0:0:0, בְּרֵאשִׁ֖ית. No text, highlight, or UI was drawn or edited in the source capture. Cropped x280 y400 width1000 height300 to include all of Genesis1:1 with its real first-word audio highlight. Only the foreground has highlighted text. Header retains the approved composition and copy. Search asset is unchanged.

## Final copy and playback refinement

User requested a catchier title, less text, a cleaner highlight, and a visible play control. Final header headline: "Your aliyah. In tune." Supporting line: "Listen. Follow. Practice." Removed the two explanatory sentences. Foreground caption: "Follow every word". Background remains unpointed and unhighlighted; no bottom disclaimer.

Fresh source capture 05-beresheet-soft-highlight.png is genuine paused public-web playback at the first word of Beresheet 1:1. Used the reader's supported stored appearance preferences: fill #ffd700, opacity0.30, outline #e6c14a, width1px, offset0, radius3px, glow0. No fabricated UI or painted highlight. See capture-evidence.json and composition/capture-audio.cjs. Foreground crop remains x280 y400 w1000 h300.

06-play-button.png is the real paused-player Play control, captured with its browser element bounds. Displayed at64x64 with a circular isolation mask to remove content outside the round control. It is a static marketing image, not an interactive player. Existing search artwork is unchanged.

## CSS-faithful Parsha revision

Headline now "Your Parsha. In tune." The boxy experimental highlight is replaced with a fresh paused-playback capture using app defaults without overrides. Sources inspected: css/master.css default highlight tokens; css/page.css .word and .word.is-active-word; app/reader-preferences.ts. Default geometry: 15% fill, 2px gold outline, 3.5px expansion offset, 10px outer radius, 3.5px glow. The outer stroke is formed by box shadows rather than a generic border; capture occurs after the transition settles. See 07-beresheet-css-highlight.png and capture-evidence.json.

The blue play badge is a static promotional overlay, not a changed screenshot or claimed in-app paused-state color. It reuses the exact play path from app/components/icons.ts, white on #0a84ff from css/mobile-reader.css, following the blue playback treatment in css/reader-player.css. Source: composition/assets/play-blue.svg. The unpointed background, first-verse foreground, reduced copy, and lack of bottom disclaimer remain as requested.

## Final vertical alignment

Moved the complete left typography group down65px: brand y575, rule y660, headline block y702. Its combined bounds now have approximately82px above and below inside the official header safe area. Lowered the phone assembly from y245 to y535 so its top bezel is visible in the safe-area preview. Preserved copy, type sizes, highlight, popout, and search artwork.

## Upload clarity and phone visibility

Verified the actual header PNG is3840x1646. The1646x661 safe-crop preview is not an upload file. Added a clearly named header PNG and an upload-only ZIP containing just that PNG. Reduced the phone width to550px at x2170 y515 with6-degree rotation and lowered the foreground card to848px, with tighter card-header spacing. This reveals the top frame and unpointed first verse above the popout while preserving the centered left typography and header safe area.
