import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { COMPACT_READER_QUERY } from '../adaptive/reader-viewport.ts'

const pageCss = readFileSync(new URL('../../css/page.css', import.meta.url), 'utf8')
const readerEnhancementsCss = readFileSync(
  new URL('../../css/reader-enhancements.css', import.meta.url),
  'utf8'
)
const mobileReaderCss = readFileSync(
  new URL('../../css/mobile-reader.css', import.meta.url),
  'utf8'
)
const lineComponent = readFileSync(new URL('./Line.ts', import.meta.url), 'utf8')
const uiIconSource = readFileSync(
  new URL('./UiIcon.svelte', import.meta.url),
  'utf8'
)
const appSource = readFileSync(new URL('../index.ts', import.meta.url), 'utf8')
const playbackTimelineSource = readFileSync(
  new URL('../reading/playback-timeline.ts', import.meta.url),
  'utf8'
)
const floatingPlayerComponentSource = readFileSync(
  new URL('../reading/FloatingPlayer.svelte', import.meta.url),
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
const cueAuthoringSource = readFileSync(
  new URL('../admin/cue-authoring.ts', import.meta.url),
  'utf8'
)
const desktopAliyahRailSource = readFileSync(
  new URL('../reading/aliyah-navigation/desktop-rail.ts', import.meta.url),
  'utf8'
)
const mobileAliyahPickerSource = readFileSync(
  new URL('../reading/aliyah-navigation/mobile-picker.ts', import.meta.url),
  'utf8'
)
const aliyahStartMarkerSource = readFileSync(
  new URL('../reading/aliyah-start-marker.ts', import.meta.url),
  'utf8'
)
const indexHtml = readFileSync(new URL('../../index.html', import.meta.url), 'utf8')

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

test('keeps the desktop reader column centered in the app body', () => {
  expect(readerEnhancementsCss.includes('--reader-side-rail-width: 80px')).toBe(true)
  expect(readerEnhancementsCss.includes('@media screen and (max-width: 1250px)')).toBe(true)
  expect(readerEnhancementsCss).toMatch(/grid-template-columns:\s*var\(--reader-side-rail-width\)\s+minmax\(0,\s*1fr\)\s+var\(--reader-side-rail-width\);/)
  expect(readerEnhancementsCss.includes('--reader-side-rail-width: 48px')).toBe(true)
  expect(readerEnhancementsCss.includes('--reader-side-rail-width: 24px')).toBe(true)
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
  expect(pageCss).toMatch(/\.tikkun-page-number\s*{[\s\S]*?user-select:\s*none;/)
  expect(pageCss).toMatch(/\.tikkun-page:first-child \.tikkun-page-number\s*{[\s\S]*?display:\s*none;/)
  expect(pageCss).toMatch(/\.tikkun-page:first-child \.tikkun-page-number\.mod-route-reveal\s*{[\s\S]*?display:\s*table-caption;/)
  expect(pageCss).not.toMatch(/\.tikkun-page:hover \.tikkun-page-number\s*{/)
  expect(pageCss).toMatch(/\.tikkun-page-number:hover\s*{[\s\S]*?opacity:\s*1;/)
  expect(pageCss).toMatch(/\.tikkun-page-number\.mod-route-reveal\s*{[\s\S]*?animation:\s*page-number-route-reveal 1\.8s ease-out;/)
  expect(pageCss).toMatch(/@keyframes page-number-route-reveal\s*{[\s\S]*?42%\s*{[\s\S]*?opacity:\s*1;[\s\S]*?100%\s*{[\s\S]*?opacity:\s*0;/)
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
  expect(desktopAliyahRailSource).toContain(
    'const ALIYAH_RAIL_AUTO_HIDE_MS = 4000'
  )
  expect(desktopAliyahRailSource).toContain(
    'documentRoot.dataset.aliyahRailVisibility'
  )
  expect(appSource).toMatch(
    /showAliyahStarts:\s*\(\)\s*=>\s*{[\s\S]*?revealAliyahRail\('peek'\)/
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

test('animates the mobile aliyah picker before hiding it', () => {
  expect(mobileReaderCss).toMatch(/\.mobile-aliyah-picker\.is-closing \.mobile-aliyah-picker-backdrop\s*{[\s\S]*?mobile-aliyah-backdrop-exit 160ms/)
  expect(mobileReaderCss).toMatch(/\.mobile-aliyah-picker\.is-closing \.mobile-aliyah-sheet\s*{[\s\S]*?mobile-aliyah-sheet-exit 180ms/)
  expect(mobileAliyahPickerSource).toContain("picker.classList.add('is-closing')")
  expect(mobileAliyahPickerSource).toContain(
    'view.setTimeout(finishClose, 180)'
  )
  expect(mobileAliyahPickerSource).toContain(
    "view.matchMedia('(prefers-reduced-motion: reduce)').matches"
  )
})

test('orders the mobile aliyah grid from right to left without reversing card controls', () => {
  expect(mobileReaderCss).toMatch(/\.mobile-aliyah-grid\s*{[\s\S]*?direction:\s*rtl;/)
  expect(mobileReaderCss).toMatch(/\.mobile-aliyah-card\s*{[\s\S]*?direction:\s*ltr;/)
})

test('keeps the mobile app toolbar compact without shrinking its controls', () => {
  expect(mobileReaderCss).toMatch(/\.toolbar-content\s*{[\s\S]*?min-height:\s*3\.75rem;/)
  expect(mobileReaderCss).toMatch(/\.mobile-aliyah-picker-toggle:not\(\.u-hidden\)\s*{[\s\S]*?min-height:\s*2\.75rem;/)
  expect(mobileReaderCss).toMatch(/\.toolbar-button\.mod-icon-label\.toolbar-overflow-toggle\s*{[\s\S]*?min-height:\s*2\.75rem;/)
})

test('gives the mobile settings button the desktop background treatment', () => {
  expect(mobileReaderCss).toMatch(/\.toolbar-button\.mod-icon-label\.toolbar-overflow-toggle\s*{[\s\S]*?background:\s*var\(--light-accent-color\);/)
  expect(mobileReaderCss).toMatch(/\.toolbar-overflow-menu\s*{[\s\S]*?background:\s*var\(--paper-color\);/)
})

test('uses an icon-only mobile home control that opens the About route', () => {
  expect(mobileReaderCss).toMatch(/\.mobile-library-button\s*{[\s\S]*?width:\s*2\.75rem;[\s\S]*?min-height:\s*2\.75rem;/)
  expect(appSource).toContain("setControlIcon(document.querySelector('[data-target-id=\"mobile-library-icon\"]'), 'houseFilled')")
  expect(appSource).toMatch(/libraryButton\.addEventListener\('click',[\s\S]*?toggleAboutRoute\(audioController\)/)
})

test('centers a wider mobile title between equal toolbar side columns', () => {
  expect(mobileReaderCss).toContain('--mobile-toolbar-title-width: min(9rem, calc(100vw - 15rem))')
  expect(mobileReaderCss).toMatch(/grid-template-columns:[\s\S]*?minmax\(0, 1fr\)[\s\S]*?minmax\(0, var\(--mobile-toolbar-title-width\)\)[\s\S]*?minmax\(0, 1fr\);/)
  expect(mobileReaderCss).toMatch(/\.toolbar-wrapper\.mod-center\s*{[\s\S]*?justify-self:\s*stretch;[\s\S]*?justify-content:\s*center;/)
  expect(mobileReaderCss).toMatch(/\.parsha-title\s*{[\s\S]*?width:\s*100%;[\s\S]*?max-width:\s*none;/)
})

test('keeps unavailable mobile aliyot fully visible without an audio control', () => {
  expect(mobileAliyahPickerSource).toContain(
    "status.dataset.durationLabel = available ? 'Loading…' : 'No audio'"
  )
  expect(mobileAliyahPickerSource).toContain('if (available) {')
  expect(mobileAliyahPickerSource).toContain("setIcon(playButton, 'play')")
  expect(mobileAliyahPickerSource).not.toContain("'playOff'")
  expect(mobileReaderCss).toMatch(/\.mobile-aliyah-card\.is-unavailable\s*{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);/)
  expect(mobileReaderCss).not.toMatch(/\.mobile-aliyah-card\.is-unavailable\s*{[^}]*opacity:/)
})

test('centers the mobile aliyah segments when fewer than seven are rendered', () => {
  expect(mobileReaderCss).toMatch(/\.mobile-aliyah-segments:not\(\.u-hidden\)\s*{[\s\S]*?display:\s*flex;[\s\S]*?justify-content:\s*center;/)
  expect(mobileReaderCss).toMatch(/\.mobile-aliyah-segment\s*{[\s\S]*?flex:\s*0 1 calc\(\(100% - 3rem\) \/ 7\);/)
})

test('shares pause-on-open behavior across both mobile aliyah picker entry points', () => {
  const openPolicy = appSource.slice(
    appSource.indexOf('function setupAliyahNavigationChrome('),
    appSource.indexOf('function extendPendingAliyahRailSelectionForScroll(')
  )
  const pickerInteraction = mobileAliyahPickerSource.slice(
    mobileAliyahPickerSource.indexOf("grid.addEventListener("),
    mobileAliyahPickerSource.indexOf("picker.addEventListener(")
  )

  expect(openPolicy).toContain('audioController.pause()')
  expect(mobileAliyahPickerSource).toContain('syncPlayback(onBeforeOpen())')
  expect(mobileAliyahPickerSource).toContain(
    'returnFocus = requestedReturnFocus ?? activeElement ?? toggle'
  )
  expect(readerControlsComponentSource).toContain(
    'openAliyahNavigation(menuToggle)'
  )
  expect(appSource).toMatch(
    /openAliyahNavigation: \(returnFocus\) => \{[\s\S]*?if \(isCompactReaderViewport\(\)\) \{[\s\S]*?openMobileAliyahPickerFromControl\(returnFocus\)/
  )
  expect(openPolicy).toMatch(
    /createMobileAliyahPicker\(scope, \{[\s\S]*?\n\s+toggle,/
  )
  expect(pickerInteraction).toContain(
    'close({ focusTarget: getReaderFocusTarget() })'
  )
  expect(
    pickerInteraction.indexOf(
      'close({ focusTarget: getReaderFocusTarget() })'
    )
  ).toBeLessThan(pickerInteraction.indexOf('await onPlay(target)'))
})

test('preserves focus when overflow actions open and close reader overlays', () => {
  expect(indexHtml).toMatch(/data-target-id="settings-toggle"[\s\S]*?aria-haspopup="dialog"[\s\S]*?aria-expanded="false"/)
  expect(indexHtml).toContain('data-target-id="settings-root"')
  expect(readerSettingsComponentSource).toMatch(/data-target-id="settings-pane"[\s\S]*?role="dialog"[\s\S]*?aria-labelledby="reader-settings-title"[\s\S]*?aria-hidden=/)
  expect(indexHtml).toContain('data-target-id="reader-controls-root"')
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
  expect(appSource).toMatch(/if \(isShowingParshaPicker\(\)\)\s*{[\s\S]*?hideParshaPicker\(\)[\s\S]*?getTitleEl\(\)\.focus\(\{ preventScroll: true \}\)/)
})

test('shows mobile word progress without changing the centered playback controls', () => {
  expect(floatingPlayerComponentSource).toContain(
    'data-target-id="mobile-player-word-progress"'
  )
  expect(playbackTimelineSource).toMatch(
    /mobileWordProgress\.textContent\s*=\s*`Word \$\{wordProgress\.current\} of \$\{wordProgress\.total\}`/
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
  expect(indexHtml).toContain('data-target-id="floating-player-root"')
  expect(playbackTimelineSource).toContain('mount(FloatingPlayerView')
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
  expect(playbackTimelineSource).toContain(
    'setExpanded(true, { returnFocus: elements.mobileExpand })'
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
  expect(floatingPlayerComponentSource).toMatch(
    /title="Expand player"[\s\S]*?aria-label="Expand player"/
  )
  expect(playbackTimelineSource).toContain(
    "const expandLabel = nextExpanded ? 'Collapse player' : 'Expand player'"
  )
  expect(playbackTimelineSource).toContain(
    'resetPlayerPosition?.()'
  )
  expect(floatingPlayerComponentSource).toContain(
    'data-target-id="floating-player-cue-progress"'
  )
  expect(playbackTimelineSource).toContain('cueCount: session?.cues.length ?? 0')
  expect(playbackTimelineSource).toContain(
    'elements.cueProgress.textContent = cueProgress.label'
  )
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
  expect(playbackTimelineSource).toMatch(
    /setControlIcon\(\s*elements\.previous,\s*hasTimedCues \? 'arrowRight' : 'rewind10'/
  )
  expect(playbackTimelineSource).toMatch(
    /setControlIcon\(\s*elements\.next,\s*hasTimedCues \? 'arrowLeft' : 'forward10'/
  )
  expect(playbackTimelineSource).toMatch(
    /elements\.previous\.addEventListener\([\s\S]*?step\(-1\)/
  )
  expect(playbackTimelineSource).toMatch(
    /elements\.next\.addEventListener\([\s\S]*?step\(1\)/
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
  expect(readerSettingsSource).toContain(
    "toggle.innerHTML = iconMarkup('settings2')"
  )
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
