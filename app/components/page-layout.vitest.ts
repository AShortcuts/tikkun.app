import { afterEach, expect, test } from 'vitest'
import { page } from 'vitest/browser'
import { COMPACT_READER_QUERY } from '../adaptive/reader-viewport.ts'
import {
  createAliyahStartMarker,
  getAliyahStartMarkerPosition,
  getFirstGraphemeRect,
} from '../reading/aliyah-start-marker.ts'
import '../../css/master.css'
import '../../css/page.css'
import '../../css/reader-enhancements.css'
import '../../css/mobile-reader.css'
import '../../css/parsha-picker.css'
import '../../css/reader-search.css'
import '../../css/tooltip.css'

let fixture: HTMLElement | null = null

afterEach(() => {
  fixture?.remove()
  fixture = null
  delete document.documentElement.dataset.aliyahRailVisibility
  delete document.documentElement.dataset.readerTheme
})

test('computes a centered wide reader and balanced Torah line', async () => {
  await page.viewport(1280, 900)
  install(`
    <div class="reader-shell">
      <aside class="reader-side mod-left"></aside>
      <main class="reader-main"></main>
      <aside class="reader-side mod-right"></aside>
    </div>
    <section class="tikkun-page">
      <div class="line">
        <div class="line-content"><span class="special-letter mod-small">כ</span></div>
        <div class="line-gutter mod-verses">1</div>
        <div class="line-gutter mod-aliyot">First</div>
      </div>
      <div class="columns"><span class="column">A</span><span class="column">B</span></div>
    </section>
    <span class="aliyah-start-marker-capsule">ראשון</span>
  `)

  const shellColumns = getComputedStyle(required('.reader-shell'))
    .gridTemplateColumns.split(' ')
  expect(shellColumns).toHaveLength(3)
  expect(shellColumns[0]).toBe(shellColumns[2])

  const torahPage = getComputedStyle(required('.tikkun-page'))
  expect(torahPage.fontFamily).toContain('ShlomosemiStam')
  const lineStyle = getComputedStyle(required('.line'))
  expect(lineStyle.gridTemplateColumns.split(' ')).toHaveLength(4)
  expect(lineStyle.getPropertyValue('--line-content-nudge')).toBe('')
  expect(lineStyle.getPropertyValue('--line-content-shift')).toBe('')
  expect(getComputedStyle(required('.line-content')).direction).toBe('rtl')
  expect(getComputedStyle(required('.line-gutter.mod-verses')).gridColumnStart).toBe('3')
  expect(getComputedStyle(required('.line-gutter.mod-aliyot')).gridColumnStart).toBe('4')
  expect(getComputedStyle(required('.column:nth-child(2)')).marginRight).toBe('80px')
  expect(getComputedStyle(required('.special-letter.mod-small')).fontSize).toBe('8px')

  const hebrewUiFont = getComputedStyle(
    required('.aliyah-start-marker-capsule')
  ).fontFamily
  expect(hebrewUiFont).toContain('Noto Sans Hebrew UI')
  expect(
    await document.fonts.load('16px "Noto Sans Hebrew UI"', 'ראשון')
  ).not.toHaveLength(0)
  expect(document.fonts.check('16px "Noto Sans Hebrew UI"', 'ראשון')).toBe(
    true
  )
})

test('measures a real first grapheme and appends one semantic inline marker', async () => {
  await page.viewport(1280, 900)
  install(`
    <div class="line-content" style="font: 48px serif; padding: 12px">
      <span class="word" data-token-key="1:0:0:0">שָׁלוֹם</span>
    </div>
  `)
  await document.fonts.ready

  const content = required<HTMLElement>('.line-content')
  const word = required<HTMLElement>('.word')
  const graphemeRect = getFirstGraphemeRect(word)
  expect(graphemeRect).not.toBeNull()
  if (!graphemeRect) return
  expect(graphemeRect.width).toBeGreaterThan(0)
  expect(graphemeRect.width).toBeLessThan(word.getBoundingClientRect().width)

  const position = getAliyahStartMarkerPosition(
    content.getBoundingClientRect(),
    graphemeRect
  )
  const marker = createAliyahStartMarker({
    label: 'ראשון',
    tokenKey: '1:0:0:0',
  })
  marker.style.setProperty('--aliyah-start-anchor-x', `${position.x}px`)
  marker.style.setProperty('--aliyah-start-anchor-y', `${position.y}px`)
  content.append(marker)

  expect(marker.parentElement).toBe(content)
  expect(content.querySelectorAll('.aliyah-start-marker')).toHaveLength(1)
  expect(marker.getAttribute('aria-label')).toBe('Aliyah ראשון begins here')
  expect(marker.getAttribute('aria-haspopup')).toBe('dialog')
  expect(marker.dataset.tokenKey).toBe('1:0:0:0')
  expect(marker.style.getPropertyValue('--aliyah-start-anchor-x')).toBe(
    `${position.x}px`
  )
})

test('switches once at the compact boundary while preserving genuine touch targets', async () => {
  install(`
    <header class="app-toolbar">
      <div class="toolbar-content">
        <button class="mobile-library-button">Home</button>
        <button class="mobile-aliyah-picker-toggle"><span data-target-id="mobile-current-aliyah">First</span></button>
      </div>
    </header>
    <section class="tikkun-page">
      <div class="line">
        <div class="line-content">
          Text
          <button class="aliyah-start-marker">Start</button>
        </div>
        <div class="line-gutter mod-verses">1</div>
        <div class="line-gutter mod-aliyot">First</div>
      </div>
    </section>
    <div class="mobile-aliyah-segments"><button class="mobile-aliyah-segment">First</button></div>
    <div class="mobile-aliyah-grid"><article class="mobile-aliyah-card"><span>First</span></article></div>
  `)

  await page.viewport(551, 900)
  expect(matchMedia(COMPACT_READER_QUERY).matches).toBe(false)
  expect(getComputedStyle(required('.mobile-library-button')).display).toBe('none')

  await page.viewport(550, 900)
  expect(matchMedia(COMPACT_READER_QUERY).matches).toBe(true)
  expect(getComputedStyle(required('.mobile-library-button')).display).toBe('flex')
  expect(required('.mobile-library-button').getBoundingClientRect().height).toBeGreaterThanOrEqual(44)
  expect(required('.mobile-aliyah-picker-toggle').getBoundingClientRect().width).toBeGreaterThanOrEqual(64)
  expect(required('.mobile-aliyah-picker-toggle').getBoundingClientRect().height).toBeGreaterThanOrEqual(44)
  expect(required('.mobile-aliyah-segment').getBoundingClientRect().height).toBe(44)
  expect(getComputedStyle(required('.mobile-aliyah-segments')).justifyContent).toBe('center')
  expect(getComputedStyle(required('.mobile-aliyah-grid')).direction).toBe('rtl')
  expect(getComputedStyle(required('.mobile-aliyah-card')).direction).toBe('ltr')

  document.documentElement.dataset.aliyahRailVisibility = 'peek'
  const markerStyle = getComputedStyle(required('.aliyah-start-marker'))
  expect(markerStyle.width).toBe('44px')
  expect(markerStyle.height).toBe('44px')
  expect(markerStyle.pointerEvents).toBe('auto')
})

test('reveals absolute page numbers only through hover or direct-route state', async () => {
  await page.viewport(1280, 900)
  install(`
    <section class="tikkun-page"><span class="tikkun-page-number">1</span></section>
    <section class="tikkun-page"><span class="tikkun-page-number" style="height: 1px" aria-label="Page 12">12</span></section>
  `)

  const firstMarker = required('.tikkun-page:first-child .tikkun-page-number')
  const secondMarker = required('[aria-label="Page 12"]')
  expect(getComputedStyle(firstMarker).display).toBe('none')
  expect(getComputedStyle(secondMarker).opacity).toBe('0')

  await page.getByText('12', { exact: true }).hover({ force: true })
  await new Promise((resolve) => setTimeout(resolve, 180))
  expect(getComputedStyle(secondMarker).opacity).toBe('1')

  firstMarker.classList.add('mod-route-reveal')
  expect(getComputedStyle(firstMarker).display).not.toBe('none')
  expect(getComputedStyle(firstMarker).animationName).toBe(
    'page-number-route-reveal'
  )
})

test('computes physical player order and theme-aware compact playback text', async () => {
  install(`
    <div class="floating-player is-expanded is-playing">
      <div class="floating-player-controls">
        <button data-target-id="floating-replay">Replay</button>
        <button data-target-id="floating-prev">Previous</button>
        <button data-target-id="floating-play" class="floating-player-button">Pause</button>
        <button data-target-id="floating-next">Next</button>
        <span class="floating-speed-control">Speed</span>
      </div>
    </div>
    <article class="mobile-aliyah-card is-playing"><span class="mobile-aliyah-card-status">Playing</span></article>
  `)

  await page.viewport(1280, 900)
  const controls = required('.floating-player-controls')
  expect(getComputedStyle(controls).flexDirection).toBe('row')
  expect(getComputedStyle(required('[data-target-id="floating-next"]')).order).toBe('1')
  expect(getComputedStyle(required('[data-target-id="floating-play"]')).order).toBe('2')
  expect(getComputedStyle(required('[data-target-id="floating-prev"]')).order).toBe('3')
  expect(getComputedStyle(required('[data-target-id="floating-play"]')).boxShadow).toBe('none')

  await page.viewport(390, 844)
  document.documentElement.dataset.readerTheme = 'dark'
  expect(required('[data-target-id="floating-play"]').getBoundingClientRect().height).toBeGreaterThanOrEqual(44)
  expect(getComputedStyle(required('.mobile-aliyah-card-status')).color).toBe('rgb(255, 255, 255)')

  document.documentElement.dataset.readerTheme = 'light'
  expect(getComputedStyle(required('.mobile-aliyah-card-status')).color).toBe('rgb(17, 17, 17)')
})

test('compiles purposeful motion with reduced-motion fallbacks', async () => {
  await page.viewport(1280, 900)
  install(`
    <section class="parsha-picker mod-animate-open"></section>
    <button class="reader-search-result-control">Result</button>
    <button class="mobile-library-button">Home</button>
    <button data-tooltip="Settings">Settings</button>
  `)

  expect(
    getComputedStyle(required('.parsha-picker')).transitionDuration
  ).toContain('0.18s')
  expect(
    getComputedStyle(required('[data-tooltip]'), '::after').transform
  ).not.toBe('none')

  const reducedMotionRules = styleRulesInsideMedia(
    '(prefers-reduced-motion: reduce)'
  )
  expect(
    reducedMotionRules.some(
      (rule) =>
        rule.selectorText.includes('.parsha-picker.mod-animate-open') &&
        rule.style.transition === 'none'
    )
  ).toBe(true)
  expect(
    reducedMotionRules.some(
      (rule) =>
        rule.selectorText.includes('.reader-search-result-control') &&
        rule.style.transitionDuration === '0.01ms'
    )
  ).toBe(true)
  expect(
    reducedMotionRules.some(
      (rule) =>
        rule.selectorText.includes('.mobile-library-button') &&
        rule.style.transition === 'none'
    )
  ).toBe(true)
  expect(
    reducedMotionRules.some(
      (rule) =>
        rule.selectorText.includes('[data-tooltip]::after') &&
        rule.style.transitionDuration === '0.01ms'
    )
  ).toBe(true)
})

function install(markup: string) {
  fixture = document.createElement('section')
  fixture.innerHTML = markup
  document.body.appendChild(fixture)
}

function required<T extends Element = HTMLElement>(selector: string): T {
  const element = fixture?.querySelector<T>(selector)
  if (!element) throw new Error(`Missing test element: ${selector}`)
  return element
}

function styleRulesInsideMedia(condition: string) {
  const matches: CSSStyleRule[] = []

  const visit = (rules: CSSRuleList, insideMatch = false) => {
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSMediaRule) {
        visit(rule.cssRules, insideMatch || rule.conditionText === condition)
      } else if (insideMatch && rule instanceof CSSStyleRule) {
        matches.push(rule)
      } else if ('cssRules' in rule) {
        visit((rule as CSSGroupingRule).cssRules, insideMatch)
      }
    }
  }

  for (const sheet of Array.from(document.styleSheets)) visit(sheet.cssRules)
  return matches
}
