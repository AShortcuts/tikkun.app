import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { COMPACT_READER_QUERY } from '../adaptive/reader-viewport.ts'

const pageCss = readFileSync(new URL('../../css/page.css', import.meta.url), 'utf8')
const masterCss = readFileSync(
  new URL('../../css/master.css', import.meta.url),
  'utf8'
)
const hebrewUiFont = readFileSync(
  new URL('../../site/assets/fonts/NotoSansHebrew-Variable.ttf', import.meta.url)
)
const readerEnhancementsCss = readFileSync(
  new URL('../../css/reader-enhancements.css', import.meta.url),
  'utf8'
)
const mobileReaderCss = readFileSync(
  new URL('../../css/mobile-reader.css', import.meta.url),
  'utf8'
)
const toggleCss = readFileSync(
  new URL('../../css/toggle.css', import.meta.url),
  'utf8'
)
const tooltipCss = readFileSync(
  new URL('../../css/tooltip.css', import.meta.url),
  'utf8'
)
const readerSearchCss = readFileSync(
  new URL('../../css/reader-search.css', import.meta.url),
  'utf8'
)
const parshaPickerCss = readFileSync(
  new URL('../../css/parsha-picker.css', import.meta.url),
  'utf8'
)
const lineComponent = readFileSync(new URL('./Line.ts', import.meta.url), 'utf8')
const uiIconSource = readFileSync(
  new URL('./UiIcon.svelte', import.meta.url),
  'utf8'
)
const appSource = readFileSync(
  new URL('../reader/reader-runtime.ts', import.meta.url),
  'utf8'
)
const readerRouteSource = readFileSync(
  new URL('../reader/reader-route.ts', import.meta.url),
  'utf8'
)
const playbackTimelineSource = readFileSync(
  new URL('../reading/playback-timeline.ts', import.meta.url),
  'utf8'
)
const floatingPlayerComponentSource = readFileSync(
  new URL('../reading/FloatingPlayer.svelte', import.meta.url),
  'utf8'
)
const floatingPlayerSource = readFileSync(
  new URL('../reading/floating-player.ts', import.meta.url),
  'utf8'
)
const readerSettingsSource = readFileSync(
  new URL('../reader/reader-settings.ts', import.meta.url),
  'utf8'
)
const readerSettingsComponentSource = readFileSync(
  new URL('../reader/ReaderSettings.svelte', import.meta.url),
  'utf8'
)
const readerControlsSource = readFileSync(
  new URL('../reader/reader-controls.ts', import.meta.url),
  'utf8'
)
const readerControlsComponentSource = readFileSync(
  new URL('../reader/ReaderControls.svelte', import.meta.url),
  'utf8'
)
const readerShellComponentSource = readFileSync(
  new URL('../reader/ReaderShell.svelte', import.meta.url),
  'utf8'
)
const cueAuthoringSource = readFileSync(
  new URL('../admin/cue-authoring.ts', import.meta.url),
  'utf8'
)
const aliyahNavigationSource = readFileSync(
  new URL('../reading/aliyah-navigation/aliyah-navigation.ts', import.meta.url),
  'utf8'
)
const aliyahNavigationLayerSource = readFileSync(
  new URL(
    '../reading/aliyah-navigation/AliyahNavigationLayer.svelte',
    import.meta.url
  ),
  'utf8'
)
const aliyahStartMarkerSource = readFileSync(
  new URL('../reading/aliyah-start-marker.ts', import.meta.url),
  'utf8'
)
test('centers line content with a structural balance rail instead of nudge offsets', () => {
  expect(pageCss.includes('--line-side-balance-width')).toBe(true)
  expect(pageCss.includes('--verse-gutter-text-gap: 1ch')).toBe(true)
  expect(pageCss).toMatch(/--line-side-balance-width:\s*calc\(\s*var\(--verse-column-width\)\s*\+\s*var\(--verse-gutter-text-gap\)\s*\+\s*var\(--aliyah-column-width\)\s*\);/)
  expect(pageCss.includes('--tikkun-inline-gutter')).toBe(false)
  expect(pageCss.includes('--tikkun-table-max-width')).toBe(false)
  expect(pageCss.includes('--line-content-nudge')).toBe(false)
  expect(pageCss.includes('--line-content-shift')).toBe(false)
  expect(pageCss.includes('line-content-compensation-width')).toBe(false)
})

test('preserves the special Haazinu middle gap', () => {
  expect(pageCss).toMatch(
    /\.column:nth-child\(2\)\s*{[\s\S]*?margin-right:\s*5em;/
  )
})

test('aligns half-size Hebrew letters from measured font metrics', () => {
  const rule = pageCss.match(/\.special-letter\.mod-small\s*{([^}]*)}/)?.[1]
  expect(rule).toMatch(/font-size:\s*50%;/)
  expect(rule).toMatch(/line-height:\s*1;/)
  expect(rule).toMatch(
    /vertical-align:\s*var\(--special-letter-baseline-shift, baseline\);/
  )
  expect(rule).not.toMatch(/transform|text-top/)
  expect(appSource).toContain('alignSmallSpecialLettersWhenFontsReady')
  expect(appSource).toContain('scheduleSpecialLetterAlignment(pageRoot, scope.signal)')
})

test('uses one bundled Hebrew UI face throughout the app without changing Torah text', () => {
  expect(hebrewUiFont.byteLength).toBeGreaterThan(0)
  expect(masterCss).toMatch(
    /@font-face\s*{[\s\S]*?font-family:\s*'Noto Sans Hebrew UI';[\s\S]*?src:\s*url\('\/assets\/fonts\/NotoSansHebrew-Variable\.ttf'\) format\('truetype'\);[\s\S]*?font-weight:\s*100 900;[\s\S]*?font-display:\s*swap;[\s\S]*?unicode-range:\s*U\+0590-05FF, U\+FB1D-FB4F;/
  )
  expect(masterCss).toContain(
    "--hebrew-ui-font-family: 'Noto Sans Hebrew UI', -apple-system, sans-serif;"
  )
  expect(masterCss).toMatch(
    /body,\s*input,\s*button,\s*select,\s*textarea\s*{\s*font-family:\s*var\(--hebrew-ui-font-family\);/
  )
  expect(masterCss).toMatch(
    /\.parsha-title,[\s\S]*?\.toolbar-current-aliyah-label,[\s\S]*?\.aliyah-rail-button,[\s\S]*?mobile-current-aliyah[\s\S]*?\.mobile-aliyah-card-label,[\s\S]*?\.aliyah-label-text,[\s\S]*?\.aliyah-start-popup-value,[\s\S]*?\.aliyah-start-marker-capsule\s*{[\s\S]*?font-family:\s*var\(--hebrew-ui-font-family\);[\s\S]*?font-synthesis:\s*none;[\s\S]*?font-weight:\s*400;/
  )
  expect(pageCss).toMatch(
    /\.tikkun-page\s*{[\s\S]*?font-family:\s*ShlomosemiStam;/
  )
  expect(pageCss).toMatch(
    /\.location-indicator\s*{[\s\S]*?font-family:\s*var\(--hebrew-ui-font-family\);/
  )
  expect(toggleCss).toMatch(
    /\.annotations-toggle\s*{[\s\S]*?font-family:\s*ShlomosemiStam;/
  )
})

test('keeps the desktop reader column centered in the app body', () => {
  expect(readerEnhancementsCss).toContain('--reader-main-half-fit-width: 570px')
  expect(readerEnhancementsCss).toContain('--reader-side-rail-max-width: 80px')
  expect(readerEnhancementsCss).toMatch(
    /--reader-side-rail-width:\s*clamp\(\s*0px,\s*calc\(50vw\s*-\s*var\(--reader-main-half-fit-width\)\),\s*var\(--reader-side-rail-max-width\)\s*\);/
  )
  expect(readerEnhancementsCss).toMatch(/grid-template-columns:\s*var\(--reader-side-rail-width\)\s+minmax\(0,\s*1fr\)\s+var\(--reader-side-rail-width\);/)
  expect(readerEnhancementsCss).toMatch(
    /@media screen and \(max-width:\s*1250px\)\s*{[\s\S]*?--reader-side-rail-max-width:\s*48px;/
  )
  expect(readerEnhancementsCss).toMatch(
    /@media screen and \(max-width:\s*1180px\)\s*{[\s\S]*?--reader-main-half-fit-width:\s*534px;/
  )
  expect(readerEnhancementsCss).toMatch(
    /@media screen and \(max-width:\s*1120px\)\s*{[\s\S]*?--reader-main-half-fit-width:\s*434px;/
  )
  expect(readerEnhancementsCss).toMatch(
    /@media screen and \(max-width:\s*920px\)\s*{[\s\S]*?--reader-side-rail-max-width:\s*24px;/
  )
  expect(readerEnhancementsCss).toMatch(
    /@media screen and \(max-width:\s*870px\)\s*{[\s\S]*?--reader-main-half-fit-width:\s*352px;/
  )
})

test('keeps the programmatic reader focus target visually neutral', () => {
  expect(masterCss).toMatch(
    /\.tikkun-book:focus\s*{[\s\S]*?outline:\s*none;/
  )
})

test('uses the intended tikkun page responsive breakpoints', () => {
  expect(pageCss.includes('@media screen and (max-width: 1180px)')).toBe(true)
  expect(pageCss.includes('@media screen and (max-width: 1120px)')).toBe(true)
  expect(pageCss.includes('@media screen and (max-width: 870px)')).toBe(true)
  expect(pageCss.includes('@media screen and (max-width: 385px)')).toBe(true)
  expect(pageCss.includes('@media screen and (max-width: 1150px)')).toBe(false)
  expect(pageCss.includes('@media screen and (max-width: 1050px)')).toBe(false)
  expect(pageCss.includes('@media screen and (max-width: 850px)')).toBe(false)
})

test('shares one compact reader breakpoint contract between CSS and behavior', () => {
  expect(mobileReaderCss).toContain(
    `@media screen and ${COMPACT_READER_QUERY}`
  )
  expect(appSource).toContain('createReaderViewport(scope, window)')
  expect(appSource).not.toContain("window.matchMedia('(max-width: 550px)')")
  expect(appSource).not.toContain("window.matchMedia('(min-width: 551px)')")
})

test('shows absolute page numbers as hover-only page decoration', () => {
  expect(pageCss).not.toMatch(/(^|\n)\.tikkun-page\s*{[^}]*position:\s*relative;/)
  expect(pageCss).toMatch(/\.tikkun-page-number\s*{[\s\S]*?caption-side:\s*top;/)
  expect(pageCss).toMatch(/\.tikkun-page-number\s*{[\s\S]*?font-family:\s*'Lora', Georgia, serif;/)
  expect(pageCss).toMatch(/\.tikkun-page-number\s*{[\s\S]*?font-size:\s*1\.15em;/)
  expect(pageCss).toMatch(/\.tikkun-page-number\s*{[\s\S]*?font-weight:\s*400;/)
  expect(pageCss).toMatch(/\.tikkun-page-number\s*{[\s\S]*?opacity:\s*0;/)
  expect(pageCss).toMatch(/\.tikkun-page-number\s*{[\s\S]*?pointer-events:\s*auto;/)
  expect(pageCss).toMatch(/\.tikkun-page-number\s*{[\s\S]*?position:\s*relative;/)
  expect(pageCss).toMatch(/\.tikkun-page-number\s*{[\s\S]*?user-select:\s*none;/)
  expect(pageCss).toMatch(
    /\.tikkun-page-number::before\s*{[\s\S]*?position:\s*absolute;[\s\S]*?width:\s*6rem;[\s\S]*?height:\s*6rem;[\s\S]*?transform:\s*translate\(-50%, -50%\);/
  )
  expect(pageCss).toMatch(/\.tikkun-page:first-child \.tikkun-page-number\s*{[\s\S]*?display:\s*none;/)
  expect(pageCss).toMatch(/\.tikkun-page:first-child \.tikkun-page-number\.mod-route-reveal\s*{[\s\S]*?display:\s*table-caption;/)
  expect(pageCss).not.toMatch(/\.tikkun-page:hover \.tikkun-page-number\s*{/)
  expect(pageCss).toMatch(/\.tikkun-page-number:hover\s*{[\s\S]*?opacity:\s*1;/)
  expect(pageCss).toMatch(/\.tikkun-page-number\.mod-route-reveal\s*{[\s\S]*?animation:\s*page-number-route-reveal 1\.8s ease-out;/)
  expect(pageCss).toMatch(/@keyframes page-number-route-reveal\s*{[\s\S]*?42%\s*{[\s\S]*?opacity:\s*1;[\s\S]*?100%\s*{[\s\S]*?opacity:\s*0;/)
})

test('uses the completed cursor only while an aliyah link shows its copied state', () => {
  expect(pageCss).toMatch(/\.aliyah-link\s*{[\s\S]*?cursor:\s*pointer;/)
  expect(pageCss).toMatch(
    /\.aliyah-link\[data-copy-state='copied'\]\s*{[\s\S]*?cursor:\s*default;/
  )
})

test('keeps verse numbers offscreen for the mobile pull gutter', () => {
  const aliyotCollapseIndex = pageCss.indexOf('@media screen and (max-width: 550px)')
  const versesCollapseIndex = pageCss.indexOf('@media screen and (max-width: 455px)')

  expect(aliyotCollapseIndex).not.toBe(-1)
  expect(versesCollapseIndex).not.toBe(-1)
  expect(pageCss).toMatch(/@media screen and \(max-width:\s*455px\)\s*{[\s\S]*?grid-template-columns:\s*0\s+minmax\(0,\s*1fr\)\s+0;[\s\S]*?\.line-gutter\.mod-verses\s*{[\s\S]*?grid-column:\s*3;[\s\S]*?overflow:\s*visible;[\s\S]*?\.location-indicator\.mod-verses\s*{[\s\S]*?transform:\s*translateX\(0\.45rem\);/)
  expect(/@media screen and \(max-width:\s*455px\)\s*{[\s\S]*?\.line-gutter\.mod-verses,[\s\S]*?\.location-indicator\.mod-verses[\s\S]*?display:\s*none;/.test(
      pageCss
    )).toBe(false)
  expect(/@media screen and \(max-width:\s*455px\)\s*{[\s\S]*?\.tikkun-page table\s*{[\s\S]*?width:\s*100%;/.test(
      pageCss
    )).toBe(false)
  expect(pageCss.includes('--verse-column-width: 0ch')).toBe(false)
})

test('lets long verse labels overflow toward the side gutter', () => {
  expect(pageCss).toMatch(/\.line-gutter\.mod-verses\s*{[\s\S]*?justify-content:\s*flex-start;[\s\S]*?padding-left:\s*var\(--verse-gutter-text-gap\);/)
  expect(pageCss).toMatch(/\.location-indicator\.mod-verses\s*{[\s\S]*?text-align:\s*right;[\s\S]*?white-space:\s*nowrap;/)
  expect(pageCss.includes('overflow-wrap: anywhere')).toBe(false)
  expect(pageCss.includes('max-width: calc(var(--verse-column-width) - 1ch)')).toBe(false)
  expect(pageCss).toMatch(/@media screen and \(max-width:\s*455px\)\s*{[\s\S]*?--verse-gutter-text-gap:\s*0ch;/)
})

test('keeps aliyah audio buttons out of side-label flow', () => {
  const baseSideButtonIndex = pageCss.indexOf('.aliyah-badge .aliyah-audio-button')
  const constrainedSideButtonIndex = pageCss.indexOf(
    '@media screen and (max-width: 870px)',
    baseSideButtonIndex
  )

  expect(lineComponent.includes("mod-with-audio")).toBe(true)
  expect(pageCss.includes('.aliyah-badge.mod-with-audio')).toBe(true)
  expect(baseSideButtonIndex).not.toBe(-1)
  expect(constrainedSideButtonIndex).not.toBe(-1)
  expect(constrainedSideButtonIndex > baseSideButtonIndex).toBe(true)
  expect(pageCss).toMatch(/\.aliyah-badge \.aliyah-audio-button\s*{[\s\S]*?position:\s*absolute;[\s\S]*?transform:\s*translateY\(-50%\);/)
  expect(pageCss).toMatch(/@media screen and \(max-width:\s*870px\)\s*{[\s\S]*?\.aliyah-badge \.aliyah-audio-button\s*{[\s\S]*?top:\s*calc\(100% \+ 0\.22rem\);[\s\S]*?transform:\s*none;/)
  expect(/(?:^|\n)\.aliyah-audio-button\s*{[^}]*position:\s*absolute;/.test(pageCss)).toBe(false)
  expect(pageCss.includes('grid-row: 2')).toBe(false)
})

test('anchors the mobile aliyah overlay once without changing Torah text flow', () => {
  const popupSetup = appSource.slice(
    appSource.indexOf('function setupAliyahStartPopup('),
    appSource.indexOf('function setupShortcutCommands(')
  )

  expect(pageCss).toMatch(/@media screen and \(max-width:\s*550px\)\s*{[\s\S]*?\.line-content\s*{[\s\S]*?position:\s*relative;/)
  expect(pageCss).toMatch(/\.aliyah-start-marker\s*{[\s\S]*?position:\s*absolute;[\s\S]*?width:\s*44px;[\s\S]*?height:\s*44px;/)
  expect(pageCss).toMatch(/\.aliyah-start-chevron \.ui-icon\s*{[\s\S]*?stroke-width:\s*3\.5;/)
  expect(pageCss).not.toContain('tr[data-aliyah-starts] .line-content::before')
  expect(pageCss).not.toContain('.aliyah-start-overlay-layer')
  expect(appSource).not.toContain('getAliyahStartOverlayLayer')
  expect(appSource).not.toContain('positionAliyahStartWordMarkers')
  expect(appSource).toContain('content.getBoundingClientRect()')
  expect(appSource).toContain('content.append(marker)')
  expect(appSource).toContain('applyAliyahStartWordMarkers(book, pageRoot)')
  expect(popupSetup).toMatch(
    /book\.addEventListener\('scroll', closeAliyahStartPopup, \{\s*passive:\s*true,\s*signal:\s*scope\.signal,/
  )
  expect(popupSetup.match(/book\.addEventListener\('scroll'/g)).toHaveLength(1)
  expect(popupSetup).not.toContain('getFirstGraphemeRect')
  expect(popupSetup).not.toContain('ResizeObserver')
  expect(appSource).not.toContain("firstLetter.className = 'aliyah-start-letter'")
  expect(aliyahStartMarkerSource).toContain('createRange()')
  expect(aliyahStartMarkerSource).toContain('graphemeRect.width / 2')
})

test('shares the aliyah rail four-second reveal state with the mobile start overlay', () => {
  expect(aliyahNavigationSource).toContain(
    'export const ALIYAH_RAIL_AUTO_HIDE_MS = 4000'
  )
  expect(aliyahNavigationLayerSource).toContain(
    'ownerDocument.documentElement.dataset.aliyahRailVisibility'
  )
  expect(appSource).toMatch(
    /showAliyahStarts:\s*\(\)\s*=>\s*{[\s\S]*?aliyahNavigationGlobal\?\.revealWide\('peek'\)/
  )
  expect(readerControlsComponentSource).toContain(
    'data-toolbar-overflow-action="aliyah-starts"'
  )
  expect(pageCss).toContain("html[data-aliyah-rail-visibility='peek'] .aliyah-start-marker")
  expect(pageCss).toContain("html[data-aliyah-rail-visibility='expanded'] .aliyah-start-marker")
  expect(readerControlsComponentSource).toContain('Show Aliyah Starts')
})

test('keeps the mobile aliyah picker tap target while drawing a smaller capsule', () => {
  expect(mobileReaderCss).toMatch(/\.mobile-aliyah-picker-toggle:not\(\.u-hidden\)\s*{[\s\S]*?min-width:\s*4rem;[\s\S]*?min-height:\s*2\.75rem;/)
  expect(mobileReaderCss).toMatch(/\.mobile-aliyah-picker-toggle::before\s*{[\s\S]*?inset:\s*0\.25rem 0\.12rem;[\s\S]*?border:\s*1\.5px solid/)
  expect(mobileReaderCss).toMatch(/\.mobile-aliyah-picker-toggle \[data-target-id='mobile-current-aliyah'\]\s*{[\s\S]*?align-items:\s*center;[\s\S]*?line-height:\s*1;/)
  expect(mobileReaderCss).toMatch(/\.mobile-aliyah-picker-speaker \.ui-icon,[\s\S]*?\.mobile-aliyah-picker-chevron \.ui-icon\s*{[\s\S]*?display:\s*block;/)
})

test('draws the mobile aliyah picker focus indicator around its capsule', () => {
  expect(mobileReaderCss).toMatch(
    /\.mobile-aliyah-picker-toggle:not\(\.u-hidden\)\s*{[\s\S]*?border-radius:\s*999px;/
  )
  expect(mobileReaderCss).toMatch(
    /\.mobile-aliyah-picker-toggle:focus-visible\s*{[\s\S]*?outline:\s*none;[\s\S]*?}\s*\.mobile-aliyah-picker-toggle:focus-visible::before\s*{[\s\S]*?0 0 0 2px var\(--paper-color\),[\s\S]*?0 0 0 4px var\(--mobile-reader-blue\);/
  )
  expect(mobileReaderCss).toMatch(
    /@media screen and \(max-width:\s*550px\) and \(forced-colors:\s*active\)\s*{[\s\S]*?\.mobile-aliyah-picker-toggle:focus-visible,[\s\S]*?{[\s\S]*?outline:\s*2px solid Highlight;/
  )
})

test('animates the mobile aliyah picker before hiding it', () => {
  expect(mobileReaderCss).toMatch(/\.mobile-aliyah-picker\.is-closing \.mobile-aliyah-picker-backdrop\s*{[\s\S]*?mobile-aliyah-backdrop-exit 160ms/)
  expect(mobileReaderCss).toMatch(/\.mobile-aliyah-picker\.is-closing \.mobile-aliyah-sheet\s*{[\s\S]*?mobile-aliyah-sheet-exit 180ms/)
  expect(aliyahNavigationLayerSource).toContain(
    'pickerClosing = !reduceMotion'
  )
  expect(aliyahNavigationLayerSource).toContain(
    'view.setTimeout(finishClose, 180)'
  )
  expect(aliyahNavigationLayerSource).toMatch(
    /view\.matchMedia\(\s*'\(prefers-reduced-motion: reduce\)'\s*\)\.matches/
  )
})

test('orders the mobile aliyah grid from right to left without reversing card controls', () => {
  expect(mobileReaderCss).toMatch(/\.mobile-aliyah-grid\s*{[\s\S]*?direction:\s*rtl;/)
  expect(mobileReaderCss).toMatch(/\.mobile-aliyah-card\s*{[\s\S]*?direction:\s*ltr;/)
})

test('keeps the mobile app toolbar compact without shrinking its controls', () => {
  expect(mobileReaderCss).toMatch(/\.toolbar-content\s*{[\s\S]*?min-height:\s*3\.75rem;[\s\S]*?padding:\s*0 0\.375rem;/)
  expect(mobileReaderCss).toMatch(/\.mobile-aliyah-segments:not\(\.u-hidden\)\s*{[\s\S]*?padding:\s*0\.25rem 0\.375rem;/)
  expect(mobileReaderCss).toMatch(/\.mobile-aliyah-picker-toggle:not\(\.u-hidden\)\s*{[\s\S]*?min-height:\s*2\.75rem;/)
  expect(mobileReaderCss).toMatch(/\.toolbar-button\.mod-icon-label\.toolbar-overflow-toggle\s*{[\s\S]*?min-height:\s*2\.75rem;/)
})

test('gives the mobile settings button the desktop background treatment', () => {
  expect(mobileReaderCss).toMatch(/\.toolbar-button\.mod-icon-label\.toolbar-overflow-toggle\s*{[\s\S]*?background:\s*var\(--light-accent-color\);/)
  expect(mobileReaderCss).toMatch(/\.toolbar-overflow-menu\s*{[\s\S]*?background:\s*var\(--paper-color\);/)
})

test('uses an icon-only mobile home control that opens the About route', () => {
  expect(mobileReaderCss).toMatch(/\.mobile-library-button\s*{[\s\S]*?width:\s*2\.75rem;[\s\S]*?min-height:\s*2\.75rem;[\s\S]*?border:\s*1px solid var\(--mobile-reader-border\);[\s\S]*?border-radius:\s*0\.85rem;[\s\S]*?background:\s*var\(--mobile-reader-control-surface\);[\s\S]*?box-shadow:\s*var\(--mobile-reader-control-shadow\);/)
  expect(readerShellComponentSource).toContain('<UiIcon name="houseFilled" />')
  expect(appSource).toMatch(
    /onAboutClick:\s*\(\)\s*=>\s*{[\s\S]*?aliyahNavigationGlobal\?\.closeCompact\(\)[\s\S]*?readerRouteGlobal\?\.toggleAbout\(\)/
  )
  expect(readerShellComponentSource).toMatch(
    /data-target-id="mobile-library"[\s\S]*?onclick={onAboutClick}/
  )
})

test('centers a larger neutral parsha trigger between equal toolbar side columns', () => {
  expect(mobileReaderCss).toContain('--mobile-toolbar-title-width: min(9rem, calc(100vw - 15rem))')
  expect(mobileReaderCss).toMatch(/grid-template-columns:[\s\S]*?minmax\(0, 1fr\)[\s\S]*?minmax\(0, var\(--mobile-toolbar-title-width\)\)[\s\S]*?minmax\(0, 1fr\);/)
  expect(mobileReaderCss).toMatch(/\.toolbar-wrapper\.mod-center\s*{[\s\S]*?justify-self:\s*stretch;[\s\S]*?justify-content:\s*center;/)
  expect(mobileReaderCss).toMatch(/\.parsha-title\s*{[\s\S]*?width:\s*max-content;[\s\S]*?max-width:\s*100%;[\s\S]*?min-height:\s*3rem;[\s\S]*?border:\s*1px solid var\(--mobile-reader-border\);[\s\S]*?border-radius:\s*999px;[\s\S]*?box-shadow:\s*var\(--mobile-reader-control-shadow\);[\s\S]*?font-size:\s*1\.4rem;/)
  expect(mobileReaderCss).toMatch(/@media screen and \(max-width:\s*350px\)\s*{[\s\S]*?\.parsha-title\s*{[\s\S]*?font-size:\s*1\.2rem;/)
  expect(readerShellComponentSource).not.toMatch(
    /class="parsha-title"(?:(?!<\/button>)[\s\S])*<UiIcon/
  )
})

test('uses motion-only polish across reader controls', () => {
  expect(masterCss).toContain('--reader-control-press-scale: 0.97')
  expect(masterCss).toContain('--reader-motion-fast: 140ms')
  expect(masterCss).toContain('--reader-motion-color: 160ms')
  expect(readerEnhancementsCss).toMatch(
    /\.floating-player-button:not\(:disabled\):active,[\s\S]*?\.toolbar-button:not\(:disabled\):active,[\s\S]*?transform:\s*scale\(var\(--reader-control-press-scale\)\);/
  )
  expect(readerEnhancementsCss).toContain(
    '@media (hover: hover) and (pointer: fine)'
  )
  expect(readerEnhancementsCss).toContain(
    '@media (prefers-reduced-motion: reduce)'
  )
  expect(tooltipCss).toContain('opacity: 0')
  expect(tooltipCss).toContain('scale(0.96)')
  expect(tooltipCss).not.toContain('scale(0)')
  expect(readerSearchCss).toContain(
    '@media (hover: hover) and (pointer: fine)'
  )
  expect(readerSearchCss).toContain(
    'transform: scale(var(--reader-control-press-scale))'
  )
  expect(readerSearchCss).toContain('@media (prefers-reduced-motion: reduce)')
  expect(parshaPickerCss).not.toContain('@keyframes fade-in')
  expect(parshaPickerCss).toContain('.parsha-picker.mod-animate-open')
  expect(parshaPickerCss).toContain('@starting-style')
  expect(appSource).toContain('togglePicker({ animate: true })')
})

test('keeps the working keyboard search shortcut tip desktop-only', () => {
  expect(readerShellComponentSource).toContain(
    'data-tooltip="Tip: Press Cmd/Ctrl+K to search"'
  )
  expect(mobileReaderCss).toMatch(
    /\.parsha-title\[data-tooltip\]::after\s*{\s*display:\s*none;/
  )
})

test('keeps unavailable mobile aliyot fully visible and adds controls only for authoring', () => {
  expect(aliyahNavigationLayerSource).toContain(
    "if (!item.audioKey) return 'No audio'"
  )
  expect(aliyahNavigationLayerSource).toContain(
    '{#if item.audioKey || authoringEnabled}'
  )
  expect(aliyahNavigationLayerSource).toContain(
    'class:is-unavailable={!item.audioKey && !authoringEnabled}'
  )
  expect(aliyahNavigationLayerSource).toContain(
    'class:is-missing-audio={authoringEnabled && !item.recordingKey}'
  )
  expect(aliyahNavigationLayerSource).toContain(
    'class:is-cue-incomplete={itemCueNeedsWork(item)}'
  )
  expect(masterCss).toContain('--admin-missing-audio-color: #c45f66')
  expect(masterCss).toContain('--admin-cue-incomplete-color: #30d5c8')
  expect(pageCss).toContain(
    '.aliyah-audio-button.is-cue-incomplete:not(.is-missing-audio)'
  )
  expect(pageCss).not.toMatch(
    /html\[data-reader-mode='admin-authoring'\]\s*\.aliyah-audio-button\.is-cue-incomplete/
  )
  expect(mobileReaderCss).toContain(
    '.mobile-aliyah-play.is-cue-incomplete:not(.is-missing-audio)'
  )
  expect(mobileReaderCss).not.toMatch(
    /html\[data-reader-mode='admin-authoring'\]\s*\.mobile-aliyah-play\.is-cue-incomplete/
  )
  expect(aliyahNavigationLayerSource).toContain("? 'pause'")
  expect(aliyahNavigationLayerSource).not.toContain("'playOff'")
  expect(mobileReaderCss).toMatch(/\.mobile-aliyah-card\.is-unavailable\s*{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);/)
  expect(mobileReaderCss).not.toMatch(/\.mobile-aliyah-card\.is-unavailable\s*{[^}]*opacity:/)
})

test('centers the mobile aliyah segments when fewer than seven are rendered', () => {
  expect(mobileReaderCss).toMatch(/\.mobile-aliyah-segments:not\(\.u-hidden\)\s*{[\s\S]*?display:\s*flex;[\s\S]*?justify-content:\s*center;/)
  expect(mobileReaderCss).toMatch(/\.mobile-aliyah-segment\s*{[\s\S]*?flex:\s*0 1 calc\(100% \/ 7\);/)
})

test('uses genuine 44px touch targets without enlarging rail or seek artwork', () => {
  expect(mobileReaderCss).toMatch(/\.mobile-aliyah-segments:not\(\.u-hidden\)\s*{[\s\S]*?height:\s*2rem;[\s\S]*?padding:\s*0\.25rem 0\.375rem;[\s\S]*?overflow:\s*visible;/)
  expect(mobileReaderCss).toMatch(/\.mobile-aliyah-segment\s*{[\s\S]*?height:\s*2\.75rem;/)
  expect(mobileReaderCss).toMatch(/\.mobile-aliyah-segment::before\s*{[\s\S]*?inset:\s*50% 0\.25rem auto;[\s\S]*?height:\s*0\.26rem;/)
  expect(mobileReaderCss).toMatch(/\.mobile-player-seek,\s*\.floating-player\.mod-untimed \.mobile-player-seek\s*{[\s\S]*?height:\s*2\.75rem;[\s\S]*?margin:\s*-0\.375rem 0;/)
  expect(mobileReaderCss).toMatch(/\.floating-player-mobile-expand\s*{[\s\S]*?width:\s*4rem;[\s\S]*?min-height:\s*2\.75rem;/)
  expect(mobileReaderCss).toMatch(/\.floating-player\s*{[\s\S]*?padding:\s*0\.35rem 0\.75rem 3\.25rem;/)
  expect(mobileReaderCss).toMatch(/\.floating-player-mobile-expand\s*{[\s\S]*?bottom:\s*0;/)
})

test('shares pause-on-open behavior across both mobile aliyah picker entry points', () => {
  const openPolicy = appSource.slice(
    appSource.indexOf('function mountAliyahNavigation('),
    appSource.indexOf('function extendPendingAliyahRailSelectionForScroll(')
  )
  const pickerInteraction = aliyahNavigationLayerSource.slice(
    aliyahNavigationLayerSource.indexOf(
      'async function playCompactItem('
    ),
    aliyahNavigationLayerSource.indexOf(
      'function handleRailPointerEnter('
    )
  )

  expect(openPolicy).toContain('readerPlaybackGlobal?.pause()')
  expect(aliyahNavigationLayerSource).toContain(
    'syncPlayback(onBeforeCompactOpen())'
  )
  expect(aliyahNavigationLayerSource).toMatch(
    /returnFocus =\s*requestedReturnFocus \?\?\s*activeHtmlElement \?\?\s*getCompactToggle\(\) \?\?\s*closeButton/
  )
  expect(readerControlsComponentSource).toContain(
    'openAliyahNavigation(menuToggle)'
  )
  expect(appSource).toMatch(
    /openAliyahNavigation: \(returnFocus\) => \{[\s\S]*?if \(isCompactReaderViewport\(\)\) \{[\s\S]*?aliyahNavigationGlobal\?\.openCompact\(returnFocus\)/
  )
  expect(openPolicy).toMatch(
    /createAliyahNavigation\(scope, \{[\s\S]*?onBeforeCompactOpen:/
  )
  expect(pickerInteraction).toContain(
    'closeCompact({ focusTarget: getReaderFocusTarget() })'
  )
  expect(
    pickerInteraction.indexOf(
      'closeCompact({ focusTarget: getReaderFocusTarget() })'
    )
  ).toBeLessThan(pickerInteraction.indexOf('await onPlayCompact(target)'))
})

test('preserves focus when overflow actions open and close reader overlays', () => {
  expect(readerShellComponentSource).toMatch(/data-target-id="settings-toggle"[\s\S]*?aria-haspopup="dialog"[\s\S]*?aria-expanded="false"/)
  expect(readerShellComponentSource).toContain('data-target-id="settings-root"')
  expect(readerSettingsComponentSource).toMatch(/data-target-id="settings-pane"[\s\S]*?role="dialog"[\s\S]*?aria-labelledby="reader-settings-title"[\s\S]*?aria-hidden=/)
  expect(readerShellComponentSource).toContain('data-target-id="reader-controls-root"')
  expect(readerControlsSource).toContain('mount(ReaderControlsView')
  expect(readerControlsComponentSource).toContain('openSettings(menuToggle)')
  expect(appSource).toContain('readerSettingsGlobal?.open({ returnFocus })')
  expect(readerSettingsComponentSource).toContain(
    'returnFocus = requestedReturnFocus ?? activeElement ?? toggle'
  )
  expect(readerSettingsComponentSource).toContain(
    'if (focusTarget) restoreFocus(focusTarget)'
  )
  expect(readerSettingsSource).toContain('mount(ReaderSettingsPane')
  expect(appSource).toMatch(
    /if \(readerRouteGlobal\?\.snapshot\(\)\.pickerOpen\)\s*{[\s\S]*?readerRouteGlobal\.closePicker\(\)/
  )
  expect(readerRouteSource).toMatch(
    /returnFocus\?\.focus\(\{ preventScroll: true \}\)[\s\S]*?document\.activeElement !== returnFocus[\s\S]*?shell\.focusTitle\(\)/
  )
})

test('shows mobile word progress without changing the centered playback controls', () => {
  expect(floatingPlayerComponentSource).toContain(
    'data-target-id="mobile-player-word-progress"'
  )
  expect(playbackTimelineSource).toContain(
    'mobileWordProgress: `Word ${wordProgress.current} of ${wordProgress.total}`'
  )
  expect(floatingPlayerComponentSource).toContain(
    '{progress.mobileWordProgress}'
  )
  expect(mobileReaderCss).toMatch(/\.floating-player-controls\s*{[\s\S]*?grid-template-columns:\s*2\.75rem 2\.75rem 3rem 2\.75rem 2\.75rem;[\s\S]*?justify-content:\s*center;/)
  expect(mobileReaderCss).toMatch(/\.mobile-player-word-progress\s*{[\s\S]*?grid-column:\s*1 \/ 3;[\s\S]*?grid-row:\s*1;/)
  expect(mobileReaderCss).toMatch(/\.mobile-player-time\s*{[\s\S]*?grid-row:\s*2;/)
})

test('uses a symmetric five-control row and a layout-independent mobile player sheet', () => {
  const replayIndex = floatingPlayerComponentSource.indexOf(
    'data-target-id="floating-replay"'
  )
  const previousIndex = floatingPlayerComponentSource.indexOf(
    'data-target-id="floating-prev"'
  )
  const playIndex = floatingPlayerComponentSource.indexOf(
    'data-target-id="floating-play"'
  )
  const nextIndex = floatingPlayerComponentSource.indexOf(
    'data-target-id="floating-next"'
  )
  const speedIndex = floatingPlayerComponentSource.indexOf(
    'data-target-id="floating-speed-toggle"'
  )

  expect(replayIndex).toBeGreaterThan(-1)
  expect(replayIndex).toBeLessThan(previousIndex)
  expect(previousIndex).toBeLessThan(playIndex)
  expect(playIndex).toBeLessThan(nextIndex)
  expect(nextIndex).toBeLessThan(speedIndex)
  expect(readerShellComponentSource).toContain(
    'data-target-id="floating-player-root"'
  )
  expect(playbackTimelineSource).toContain('createFloatingPlayer(scope')
  expect(floatingPlayerSource).toContain('mount(FloatingPlayerView')
  expect(playbackTimelineSource).not.toContain(
    '[data-target-id="floating-player"]'
  )
  expect(floatingPlayerComponentSource).toContain(
    'data-target-id="floating-mobile-expand"'
  )
  expect(floatingPlayerComponentSource).toContain(
    'data-target-id="floating-mobile-close"'
  )
  expect(floatingPlayerComponentSource).toContain(
    'data-target-id="floating-player-backdrop"'
  )
  expect(mobileReaderCss).toMatch(/\.floating-player\s*{[\s\S]*?position:\s*fixed;/)
  expect(mobileReaderCss).toMatch(/\.floating-player\.is-expanded\s*{[\s\S]*?left:\s*0;[\s\S]*?right:\s*0;[\s\S]*?bottom:\s*0;/)
  expect(mobileReaderCss).toMatch(/\.floating-player-backdrop\s*{[\s\S]*?position:\s*fixed;[\s\S]*?inset:\s*0;/)
  expect(mobileReaderCss).toMatch(/\.floating-player\.is-expanded \.mobile-player-seek\s*{[\s\S]*?grid-column:\s*1 \/ 4;[\s\S]*?grid-row:\s*3;/)
  expect(mobileReaderCss).toMatch(/\.floating-player\.is-expanded \.floating-player-controls\s*{[\s\S]*?grid-template-columns:\s*2\.75rem 2\.75rem 3\.5rem 2\.75rem 2\.75rem;/)
  expect(floatingPlayerComponentSource).toContain(
    '<UiIcon name="chevronUp" />'
  )
  expect(floatingPlayerComponentSource).toContain(
    "setExpanded(true, 'mobile', requireElement(mobileExpand"
  )
  expect(playbackTimelineSource).toContain(
    'setExpanded(action.expanded, { returnFocus: action.returnFocus })'
  )
})

test('restores the legacy desktop player sidebar and expands into the current card', () => {
  expect(readerEnhancementsCss).toMatch(
    /\.floating-player:not\(\.is-expanded\),\s*\.floating-player\.mod-untimed:not\(\.is-expanded\)\s*{[\s\S]*?flex-direction:\s*column;[\s\S]*?width:\s*auto;[\s\S]*?border-radius:\s*1\.75rem;/
  )
  expect(readerEnhancementsCss).toMatch(
    /\.floating-player:not\(\.is-expanded\) \.floating-player-controls,[\s\S]*?{[\s\S]*?flex-direction:\s*column;/
  )
  expect(readerEnhancementsCss).toMatch(
    /\.floating-player:not\(\.is-expanded\) \.floating-player-button\.mod-expand,[\s\S]*?{[\s\S]*?order:\s*2;[\s\S]*?width:\s*2\.75rem;/
  )
  expect(readerEnhancementsCss).toMatch(
    /\.floating-player\.mod-untimed:not\(\.is-expanded\)[\s\S]*?\[data-target-id='floating-play'\]\s*{\s*order:\s*2;/
  )
  expect(readerEnhancementsCss).toMatch(
    /\.floating-player\.mod-untimed\.is-expanded[\s\S]*?\[data-target-id='floating-play'\]\s*{\s*order:\s*2;/
  )
  expect(readerEnhancementsCss).toMatch(
    /\.floating-player\.is-expanded,\s*\.floating-player\.mod-untimed\.is-expanded\s*{[\s\S]*?width:\s*min\(20rem,\s*calc\(100vw - 1\.7rem\)\);[\s\S]*?border-radius:\s*17px;/
  )
  expect(readerEnhancementsCss).toMatch(
    /\.floating-player\.is-expanded \.floating-player-details,\s*\.floating-player\.mod-untimed\.is-expanded \.floating-player-details\s*{\s*display:\s*none;/
  )
  expect(floatingPlayerComponentSource).toContain('title={expandLabel}')
  expect(floatingPlayerComponentSource).toContain('aria-label={expandLabel}')
  expect(floatingPlayerComponentSource).toMatch(
    /snapshot\.expanded \? 'Collapse player' : 'Expand player'/
  )
  expect(playbackTimelineSource).toContain(
    'resetPlayerPosition?.()'
  )
  expect(floatingPlayerComponentSource).toContain(
    'data-target-id="floating-player-cue-progress"'
  )
  expect(playbackTimelineSource).toContain('cueCount: session?.cues.length ?? 0')
  expect(playbackTimelineSource).toContain('cueProgress: cueProgress.label')
  expect(floatingPlayerComponentSource).toContain('{progress.cueProgress}')
  expect(readerEnhancementsCss).toMatch(
    /\.floating-player\.is-expanded \.floating-player-cue-progress:not\(\.u-hidden\)\s*{[\s\S]*?display:\s*block;/
  )
  expect(readerEnhancementsCss).toMatch(
    /\.floating-player:not\(\.is-expanded\) \.floating-player-mode-group,[\s\S]*?display:\s*none;/
  )
  expect(mobileReaderCss).toMatch(
    /\.floating-player-title\.mod-desktop,[\s\S]*?\.floating-player-mode-group,[\s\S]*?display:\s*none !important;/
  )
})

test('places timed playback arrows on their matching physical sides without changing actions', () => {
  expect(readerEnhancementsCss).toMatch(
    /\.floating-player:not\(\.mod-untimed\) \.floating-player-controls,\s*\.floating-player\.mod-untimed \.floating-player-controls\s*{[\s\S]*?direction:\s*ltr;/
  )
  expect(readerEnhancementsCss).toMatch(
    /\.floating-player:not\(\.mod-untimed\) \.floating-player-controls \[data-target-id='floating-next'\]\s*{\s*order:\s*1;/
  )
  expect(readerEnhancementsCss).toMatch(
    /\.floating-player:not\(\.mod-untimed\) \.floating-player-controls \[data-target-id='floating-prev'\]\s*{\s*order:\s*3;/
  )
  expect(floatingPlayerComponentSource).toContain(
    "snapshot.untimed ? 'rewind10' : 'arrowRight'"
  )
  expect(floatingPlayerComponentSource).toContain(
    "snapshot.untimed ? 'forward10' : 'arrowLeft'"
  )
  expect(floatingPlayerComponentSource).toContain(
    "send({ type: 'step', delta: -1 })"
  )
  expect(floatingPlayerComponentSource).toContain(
    "send({ type: 'step', delta: 1 })"
  )
})

test('uses one smooth highlight path for forward and backward cue recording navigation', () => {
  const sharedActivation = cueAuthoringSource.slice(
    cueAuthoringSource.indexOf('const activateCueToken ='),
    cueAuthoringSource.indexOf('const focusCueRow =')
  )
  const selectCue = cueAuthoringSource.slice(
    cueAuthoringSource.indexOf('const selectToken = async'),
    cueAuthoringSource.indexOf('const getTokenLabel =')
  )
  const recordCue = cueAuthoringSource.slice(
    cueAuthoringSource.indexOf('const recordNextCue ='),
    cueAuthoringSource.indexOf('const stepBack =')
  )
  const stepBack = cueAuthoringSource.slice(
    cueAuthoringSource.indexOf('const stepBack ='),
    cueAuthoringSource.indexOf('const undoLastCue =')
  )

  expect(sharedActivation).toContain('scrollBehavior: \'smooth\'')
  expect(selectCue).toContain('activateCueToken(')
  expect(recordCue).toContain('activateCueToken(')
  expect(stepBack).toContain('selectToken(')
  expect(stepBack).not.toContain('scrollBehavior:')
})

test('labels the automatic theme as System and keeps playing controls flat and neutral', () => {
  expect(readerSettingsComponentSource).toMatch(
    /data-theme-mode="automatic"[\s\S]*?>System<\/button/
  )
  expect(readerSettingsComponentSource).not.toMatch(
    /data-theme-mode="automatic"[\s\S]*?>Automatic<\/button/
  )
  expect(readerEnhancementsCss).toMatch(
    /\.floating-player\.is-playing \.floating-player-controls \[data-target-id='floating-play'\]\s*{[\s\S]*?box-shadow:\s*none;/
  )
  expect(readerEnhancementsCss).toMatch(
    /\.floating-player:not\(\.is-expanded\) \.floating-player-controls \.floating-player-button,[\s\S]*?background:\s*var\(--light-accent-color\);[\s\S]*?color:\s*var\(--text-color\);[\s\S]*?box-shadow:\s*none;/
  )
  expect(readerEnhancementsCss).not.toContain(
    '.floating-player:not(.is-expanded).is-playing'
  )
  expect(mobileReaderCss).toMatch(/\.floating-player\.is-playing \.floating-player-button\[data-target-id='floating-play'\]\s*{[\s\S]*?box-shadow:\s*none;/)
})

test('uses a consistent pointer and hover treatment for playback controls', () => {
  expect(readerEnhancementsCss).toMatch(
    /:where\([\s\S]*?\.aliyah-audio-button,[\s\S]*?\.mobile-aliyah-play,[\s\S]*?\[data-target-id='floating-play'\],[\s\S]*?\[data-target-id='admin-play-current'\][\s\S]*?\):not\(:disabled\)\s*{[\s\S]*?cursor:\s*pointer;/
  )
  expect(readerEnhancementsCss).toMatch(
    /@media screen and \(min-width:\s*551px\)\s*{[\s\S]*?\.floating-player\.is-expanded[\s\S]*?\.floating-player-button:not\(:disabled\):hover,[\s\S]*?\.floating-player\.is-expanded \.floating-player-button\.mod-expand:not\(:disabled\):hover\s*{[\s\S]*?background:\s*var\(--medium-accent-color\);/
  )
  expect(readerEnhancementsCss).toMatch(
    /\.floating-player\.is-expanded\.is-playing[\s\S]*?\[data-target-id='floating-play'\]:not\(:disabled\):hover\s*{[\s\S]*?background:\s*color-mix\(in srgb,\s*#0a84ff 86%,\s*white\);[\s\S]*?color:\s*white;/
  )
})

test('uses requested reader control icons and theme-aware playing text', () => {
  expect(readerShellComponentSource).toContain('<UiIcon name="settings2" />')
  expect(readerSettingsSource).not.toContain('toggle.innerHTML')
  expect(readerControlsComponentSource).toContain('<UiIcon name="cog" />')
  expect(uiIconSource).toContain(
    "import { iconMarkup, type IconName } from './icons.ts'"
  )
  expect(uiIconSource).toContain('{@html iconMarkup(name)}')
  expect(uiIconSource).not.toContain('<path')
  expect(mobileReaderCss).toContain('--mobile-aliyah-playing-text: #111')
  expect(mobileReaderCss).toMatch(/html\[data-reader-theme='dark'\] body\s*{[\s\S]*?--mobile-aliyah-playing-text:\s*#fff;/)
  expect(mobileReaderCss).toMatch(/\.mobile-aliyah-card\.is-playing \.mobile-aliyah-card-status\s*{[\s\S]*?color:\s*var\(--mobile-aliyah-playing-text\);/)
})
