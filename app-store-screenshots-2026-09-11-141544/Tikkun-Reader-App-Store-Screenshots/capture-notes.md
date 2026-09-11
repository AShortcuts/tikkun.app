# Capture and asset provenance

## Native product evidence

App: Tikkun Reader, bundle `com.adamn.tikkunreader`. Capture date: 2026-09-11.
No production app source changed for this artwork. Concurrent repository edits
belong to other work and are not claimed as part of these installed builds.

- iPhone 17 Pro Max, iOS 26.5 Simulator,
  `EDAED5C9-A5C7-4FA1-825A-75D5A1D28E3C`, native 1320 x 2868.
- iPad Pro 13-inch (M5), iOS 26.5 Simulator,
  `37C203E3-2FB2-4492-A763-5863CD068E40`, native 2064 x 2752.
- Reader, practice, and playing-audio captures (01-03) reuse original,
  full-resolution PNGs from `metadata/screenshots/en-US/`. The repository's
  `metadata/README.md` records their origin in build 1.0 (2).
- Phone Media and Storage (04-05) reuse build 1.0 (3) PNGs documented in that
  same release record. All new 06-10 phone captures use the installed build 3;
  its CFBundleVersion was verified from the installed app's Info.plist.
- iPad initially had build 2. Installed the existing universal build 3 from the
  phone Simulator with XcodeBuildMCP; no rebuild. New iPad captures 04-10 use it.
- New captures used XcodeBuildMCP for app lifecycle and CUA for real interactions.
  XcodeBuildMCP's screenshot output was a downscaled JPEG, so final native PNGs
  used `xcrun simctl io ... screenshot` instead. No compressed previews serve as
  product-image inputs.
- Native status bars use 9:41 and full battery. Light capture state is System
  appearance on a light Simulator. Dark captures use a dark Simulator state.
  The final Simulator appearance was restored to light.
- iPad playback capture shows a real 0.9x value selected through the control.
  Phone playback capture shows its actual 1x control. No rendered text overlays
  were placed on native settings.
- iPad Media/Storage shows the actual Beresheet Aliyah 5 download, 489.6 KB.
  Only this small recording was downloaded for the capture. No synthetic
  download counts or totals were inserted.
- Audio/timing coverage varies. The audio poster uses actual playing-audio
  captures with visible word highlights; it makes no all-readings coverage claim.
- Dark and light are distinct captured states, not recolored images. No fake
  UI, mock purchase, account, entitlement, or production integration is depicted.

`capture-manifest.json` records native dimensions, builds, origins, and SHA-256
hashes. Captures remain unedited. Enlarged settings/selector details are clipped
views of these exact images, labeled "Inside the app" alongside native context.

## Hardware assets

Existing local Apple assets reused from:
`/Users/adambh/Documents/Apps/Building Apps/Yahrtzeit/brag-output-2026-09-08-222059/v3/composition/assets/`.
These are hardware assets only; no Yahrtzeit artwork or UI was reused.
Original resource entrypoint: https://developer.apple.com/design/resources/#product-bezels
Retained `Apple Design Resources License.rtf`; no new download agreement accepted.

| Asset | Canvas | Screen aperture x,y,w,h | Mask radius |
| --- | --- | --- | --- |
| iPhone 17 Pro Max silver | 1470 x 3000 | 75,66,1320,2868 | 185 |
| iPad Pro 13-inch silver | 2300 x 3000 | 118,124,2064,2752 | 65 |

Dimensions and horizontal alpha apertures verified from original PNGs. Midrow
transparent display spans are x=75..1394 and x=118..2181 respectively. Geometry
matches native capture dimensions exactly; the entire device scales uniformly.
Apple's original bezel sits above the capture; no second artificial island added.
Phone hero and tablet hero deliberately crop at the bottom. Detail scenes crop
the secondary device edge deliberately while the enlarged feature remains clear.

## Typography

Lora Regular reused from Tikkun's `site/assets/fonts/Lora-Regular.ttf` unchanged.
Its SIL Open Font License is retained as `composition/assets/Lora-OFL.txt`, from
https://raw.githubusercontent.com/cyrealtype/Lora-Cyrillic/master/OFL.txt
Supporting Helvetica Neue uses the existing macOS installation; not bundled.
Hebrew fonts are already pixels in the unmodified native captures.

## Export and readiness

Installed Playwright/Chromium renders opaque canvases with forced sRGB. Final
images are non-interlaced 8-bit RGB PNGs, without alpha. Preferred export sizes:
iPhone 1284 x 2778 (6.5-inch slot), iPad 2064 x 2752 (13-inch slot).
Apple specifications verified live on 2026-09-11:
https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/
The phone set targets 6.5-inch, while the older listing also has 6.9-inch images.
No remote slot replacement, upload, review submission, or publishing performed.
Local checks do not prove App Store submission readiness.

## Reproduce

Run from this repository with its existing Playwright dependency:

```sh
node app-store-screenshots-2026-09-11-141544/composition/render.cjs
python3 /Users/adambh/.codex/skills/app-store-screenshots/scripts/validate_exports.py app-store-screenshots-2026-09-11-141544/exports --report app-store-screenshots-2026-09-11-141544/validation.json
```

Pillow generates only lightweight gallery thumbnails. Edit `composition/scenes.js`
for copy, capture mapping, crop rectangles and device position; `style.css` for
typography and palette. Open `preview.html` for the complete collection.
