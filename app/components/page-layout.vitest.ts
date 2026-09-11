import { afterEach, expect, test } from 'vitest'
import { page } from 'vitest/browser'
import { COMPACT_READER_QUERY } from '../adaptive/reader-viewport.ts'
import {
  createAliyahStartMarker,
  getAliyahStartMarkerPosition,
  getFirstGraphemeRect,
} from '../reading/aliyah-start-marker.ts'
import { verseStartWordIndex } from '../reading/aliyah-token-sequence.ts'
import Page from './Page.ts'
import { applyReaderPageLayout } from './reader-page-layout.ts'
import type { RenderedPageInfo } from '../view-model/scroll-view-model.ts'
import beshalachPageJson from '../../text/pages/torah/78.json' with { type: 'json' }
import haazinuPageJson from '../../text/pages/torah/242.json' with { type: 'json' }
import haazinuSecondPageJson from '../../text/pages/torah/243.json' with { type: 'json' }
import { applyAnnotationMode } from './annotation-rendering.ts'
import vayishlachPage36Json from '../../text/pages/torah/36.json' with { type: 'json' }
import vayishlachPageJson from '../../text/pages/torah/37.json' with { type: 'json' }
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
  delete document.documentElement.dataset.readerSideMode
  delete document.documentElement.dataset.readerSideOrder
  delete document.documentElement.dataset.readerTextLayout
})

test.each(['light', 'dark', 'sepia', 'custom'])(
  'uses theme-neutral unavailable audio controls in the %s theme',
  async (theme) => {
    await page.viewport(390, 900)
    document.documentElement.dataset.readerTheme = theme
    install(`
      <span class="neutral-text" style="color: var(--light-text-color)"></span>
      <span class="neutral-surface" style="background: var(--light-accent-color)"></span>
      <div class="mobile-aliyah-capsule is-unavailable">
        <button class="mobile-aliyah-play-toggle" disabled>ראשון</button>
        <button class="mobile-aliyah-picker-toggle" aria-label="Choose aliyah"></button>
      </div>
      <button class="aliyah-audio-button" disabled aria-label="Recording unavailable"></button>
      <button class="aliyah-audio-button available" aria-label="Play ראשון"></button>
    `)
    const capsule = required('.mobile-aliyah-capsule')
    const inline = required<HTMLButtonElement>('.aliyah-audio-button:disabled')
    const neutralColor = getComputedStyle(required('.neutral-text')).color
    expect(getComputedStyle(capsule).color).toBe(neutralColor)
    expect(getComputedStyle(required('.mobile-aliyah-play-toggle')).opacity).toBe('1')
    expect(required<HTMLButtonElement>('.mobile-aliyah-picker-toggle').disabled).toBe(false)

    await page.viewport(1280, 900)
    expect(getComputedStyle(inline).color).toBe(neutralColor)
    expect(getComputedStyle(inline).opacity).toBe('1')
    const neutralBackground = getComputedStyle(required('.neutral-surface')).backgroundColor
    expect(getComputedStyle(inline).backgroundColor).toBe(neutralBackground)
    await page.elementLocator(inline).hover()
    expect(getComputedStyle(inline).backgroundColor).toBe(neutralBackground)
    expect(getComputedStyle(required('.available')).color).not.toBe(neutralColor)
  },
)

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
      <div class="reader-text-flow"><span class="column">A</span><span class="column">B</span></div>
    </section>
    <span class="aliyah-start-marker-capsule">ראשון</span>
  `)

  const shellColumns = getComputedStyle(
    required('.reader-shell'),
  ).gridTemplateColumns.split(' ')
  expect(shellColumns).toHaveLength(3)
  expect(shellColumns[0]).toBe(shellColumns[2])

  const torahPage = getComputedStyle(required('.tikkun-page'))
  expect(torahPage.fontFamily).toContain('ShlomosemiStam')
  const lineStyle = getComputedStyle(required('.line'))
  expect(lineStyle.gridTemplateColumns.split(' ')).toHaveLength(4)
  expect(lineStyle.getPropertyValue('--line-content-nudge')).toBe('')
  expect(lineStyle.getPropertyValue('--line-content-shift')).toBe('')
  expect(getComputedStyle(required('.line-content')).direction).toBe('rtl')
  expect(
    getComputedStyle(required('.line-gutter.mod-verses')).gridColumnStart,
  ).toBe('3')
  expect(
    getComputedStyle(required('.line-gutter.mod-aliyot')).gridColumnStart,
  ).toBe('4')
  expect(getComputedStyle(required('.column:nth-child(2)')).marginRight).toBe(
    '0px',
  )
  expect(
    Number.parseFloat(
      getComputedStyle(required('.reader-text-flow')).columnGap,
    ),
  ).toBeLessThan(32)
  const smallLetter = required('.special-letter.mod-small')
  // Respect the engine's minimum font size, while keeping the letter smaller.
  expect(Number.parseFloat(getComputedStyle(smallLetter).fontSize)).toBeLessThan(
    Number.parseFloat(getComputedStyle(smallLetter.parentElement!).fontSize),
  )

  const hebrewUiFont = getComputedStyle(
    required('.aliyah-start-marker-capsule'),
  ).fontFamily
  expect(hebrewUiFont).toContain('Noto Sans Hebrew UI')
  expect(
    await document.fonts.load('16px "Noto Sans Hebrew UI"', 'ראשון'),
  ).not.toHaveLength(0)
  expect(document.fonts.check('16px "Noto Sans Hebrew UI"', 'ראשון')).toBe(true)
})

test.each([320, 390, 550])(
  'keeps compact One Side Match on the existing reader geometry at %ipx',
  async (viewportWidth) => {
    await page.viewport(viewportWidth, 844)
    const vayishlach = renderedPage(36, vayishlachPage36Json)
    const markup = Page(vayishlach, {
      presentation: { layout: 'match', sides: 'one' },
    })
    install(`
      <div
        class="tikkun-book"
        data-test-reader="one-side-match"
        data-target-id="tikkun-book"
        data-reader-layout="match"
        data-reader-sides="one"
      >
        <section class="tikkun-page">${markup}</section>
      </div>
      <div
        class="tikkun-book"
        data-test-reader="legacy-one-side"
        data-target-id="tikkun-book"
      >
        <section class="tikkun-page">${markup}</section>
      </div>
    `)
    await document.fonts.ready

    const match = required<HTMLElement>('[data-test-reader="one-side-match"]')
    const legacy = required<HTMLElement>('[data-test-reader="legacy-one-side"]')
    const comparedSelectors = [
      '.tikkun-page',
      'table',
      '[data-line-index="20"]',
      '[data-line-index="20"] .line-content',
      '[data-line-index="20"] .location-indicator.mod-verses',
      '[data-line-index="20"] .reader-text-side',
    ]

    const matchBookStyle = getComputedStyle(match)
    const legacyBookStyle = getComputedStyle(legacy)
    expect(matchBookStyle.overflowX).toBe(legacyBookStyle.overflowX)
    expect(matchBookStyle.overscrollBehaviorX).toBe(
      legacyBookStyle.overscrollBehaviorX,
    )
    expect(matchBookStyle.touchAction).toBe(legacyBookStyle.touchAction)

    for (const selector of comparedSelectors) {
      const matchElement = required<HTMLElement>(selector, match)
      const legacyElement = required<HTMLElement>(selector, legacy)
      const matchStyle = getComputedStyle(matchElement)
      const legacyStyle = getComputedStyle(legacyElement)

      expect(matchStyle.fontSize).toBe(legacyStyle.fontSize)
      expect(matchStyle.lineHeight).toBe(legacyStyle.lineHeight)
      expect(matchStyle.whiteSpace).toBe(legacyStyle.whiteSpace)
      expect(matchStyle.gridTemplateColumns).toBe(
        legacyStyle.gridTemplateColumns,
      )
      expect(matchStyle.transform).toBe(legacyStyle.transform)
      expect(matchElement.getBoundingClientRect().width).toBeCloseTo(
        legacyElement.getBoundingClientRect().width,
        1,
      )
    }

    expect(
      Number.parseFloat(
        getComputedStyle(required('.tikkun-page', match)).fontSize,
      ),
    ).toBeGreaterThanOrEqual(14)
    expect(getComputedStyle(required('.line-content', match)).whiteSpace).toBe(
      'normal',
    )
  },
)

test('reflows real verses for compact Reading without horizontal clipping', async () => {
  await page.viewport(320, 844)
  const beshalach = renderedPage(78, beshalachPageJson)
  install(`
    <div
      class="tikkun-book"
      data-target-id="tikkun-book"
      data-reader-layout="reading"
      data-reader-sides="one"
      dir="rtl"
      style="height: 760px"
    >
      <section class="tikkun-page">${Page(beshalach, {
        presentation: { layout: 'reading', sides: 'one' },
      })}</section>
    </div>
  `)
  await document.fonts.ready
  applyReaderPageLayout(required<HTMLElement>('.tikkun-page'), {
    layout: 'reading',
    sides: 'one',
  })

  const book = required<HTMLElement>('.tikkun-book')
  const bookRect = book.getBoundingClientRect()
  const readingPageStyle = getComputedStyle(required('.tikkun-page'))
  const readingSideStyle = getComputedStyle(
    required('.reader-reading-page-side'),
  )
  expect(book.scrollWidth).toBeLessThanOrEqual(book.clientWidth + 1)
  expect(Number.parseFloat(readingPageStyle.fontSize)).toBeGreaterThanOrEqual(
    20,
  )
  expect(
    Number.parseFloat(readingSideStyle.lineHeight) /
      Number.parseFloat(readingPageStyle.fontSize),
  ).toBeCloseTo(1.72, 2)
  expect(requiredAll('.reader-pasuk-break').length).toBeGreaterThan(1)
  expect(requiredAll('.mod-shirah')).toHaveLength(0)
  expect(requiredAll('[data-shirah-kind]')).toHaveLength(0)
  for (const column of requiredAll<HTMLElement>('.column')) {
    expect(getComputedStyle(column).display).toBe('contents')
  }
  const verseGutter = requiredAll<HTMLElement>('.line-gutter.mod-verses').find(
    (gutter) => gutter.textContent?.trim(),
  )
  expect(verseGutter).toBeDefined()
  expect(getComputedStyle(verseGutter!).display).toBe('flex')
  const verseLine = verseGutter!.closest<HTMLElement>('.mod-reading-line')
  const verseWords = requiredAll<HTMLElement>(
    '[data-reader-canonical="true"] .word[data-token-key]:not([hidden])',
    verseLine!,
  )
  const precedingLine = verseLine?.previousElementSibling as HTMLElement | null
  const precedingWords = precedingLine
    ? requiredAll<HTMLElement>(
        '[data-reader-canonical="true"] .word[data-token-key]:not([hidden])',
        precedingLine,
      )
    : []
  const verseStartIndex = verseStartWordIndex({
    currentLineWords: verseWords,
    previousLineWords: precedingWords,
    verseOrdinal: 0,
  })
  const verseStartWord = verseWords[verseStartIndex] ?? verseWords[0]
  const gutterRect = verseGutter!.getBoundingClientRect()
  expect(
    Math.abs(gutterRect.top - verseStartWord.getBoundingClientRect().top),
  ).toBeLessThanOrEqual(1)
  expect(gutterRect.right).toBeLessThanOrEqual(bookRect.right - 15)
  expect(gutterRect.right).toBeGreaterThanOrEqual(bookRect.right - 17)
  expect(
    Math.max(
      ...requiredAll<HTMLElement>('.word:not([hidden])').map(
        (word) => word.getBoundingClientRect().right,
      ),
    ),
  ).toBeLessThanOrEqual(gutterRect.left + 1)

  for (const word of requiredAll<HTMLElement>('.word:not([hidden])')) {
    const rect = word.getBoundingClientRect()
    expect(rect.left).toBeGreaterThanOrEqual(bookRect.left - 1)
    expect(rect.right).toBeLessThanOrEqual(bookRect.right + 1)
  }
})

test.each([
  {
    label: 'Haazinu',
    pageNumber: 242,
    lines: haazinuPageJson,
    kind: 'haazinu',
  },
  {
    label: 'Beshalach',
    pageNumber: 78,
    lines: beshalachPageJson,
    kind: 'sea',
  },
])(
  'borrows unused Match width for $label shirah without changing typography',
  async ({ pageNumber, lines, kind }) => {
    await page.viewport(1280, 900)
    const rendered = renderedPage(pageNumber, lines)
    install(`
      <div
        class="tikkun-book"
        data-target-id="tikkun-book"
        data-reader-layout="match"
        data-reader-sides="one"
        dir="rtl"
        style="width: 1140px; height: 820px; margin-inline: auto"
      >
        <section class="tikkun-page">${Page(rendered, {
          presentation: { layout: 'match', sides: 'one' },
        })}</section>
      </div>
    `)
    await document.fonts.ready
    const pageElement = required<HTMLElement>('.tikkun-page')
    const book = required<HTMLElement>('.tikkun-book')
    const bookRect = book.getBoundingClientRect()
    const regularContent = required<HTMLElement>(
      'tr:not([data-shirah-kind]) .line-content',
    )
    const shirahRow = required<HTMLElement>(
      `tr.mod-shirah[data-shirah-kind="${kind}"]`,
    )
    const shirahContent = required<HTMLElement>('.line-content', shirahRow)
    const regularLine = required<HTMLElement>(
      'tr:not([data-shirah-kind]) > .line',
    )
    const shirahLine = required<HTMLElement>('.line', shirahRow)
    const visibleGutter = required<HTMLElement>(
      '.line-gutter.mod-aliyot',
      shirahRow,
    )

    applyReaderPageLayout(pageElement, {
      layout: 'match',
      sides: 'one',
    })

    const shirahRect = shirahContent.getBoundingClientRect()
    const regularRect = regularContent.getBoundingClientRect()
    const safeEdge = Number.parseFloat(
      getComputedStyle(document.documentElement).fontSize,
    )

    expect(shirahRect.width).toBeGreaterThanOrEqual(regularRect.width)
    expect(shirahRect.left).toBeGreaterThanOrEqual(bookRect.left + safeEdge - 1)
    expect(shirahRect.left).toBeCloseTo(regularRect.left, 1)
    expect(shirahRect.right).toBeCloseTo(regularRect.right, 1)
    expect(getComputedStyle(shirahLine).fontSize).toBe(
      getComputedStyle(regularLine).fontSize,
    )
    expect(getComputedStyle(shirahLine).lineHeight).toBe(
      getComputedStyle(regularLine).lineHeight,
    )
    expect(visibleGutter.getBoundingClientRect().right).toBeLessThanOrEqual(
      bookRect.right + 1,
    )
    expect(book.scrollWidth).toBeLessThanOrEqual(book.clientWidth + 1)

    for (const flow of requiredAll<HTMLElement>(
      'tr[data-shirah-kind] .reader-text-flow',
      pageElement,
    )) {
      expect(flow.scrollWidth).toBeLessThanOrEqual(flow.clientWidth + 1)
    }
    for (const column of requiredAll<HTMLElement>(
      'tr[data-shirah-kind] .column',
      pageElement,
    )) {
      expect(column.scrollWidth).toBeLessThanOrEqual(column.clientWidth + 1)
    }

    for (const fragment of requiredAll<HTMLElement>('.fragment', shirahRow)) {
      expect(getComputedStyle(fragment, '::after').content).toBe('""')
    }
  },
)

test.each([390, 550, 551, 768, 1280, 1600].flatMap((width) =>
  (width < 551 ? ['two'] as const : ['one', 'two'] as const).map((sides) => ({ width, sides })),
))('centers ordinary Match text within each song side with one verse gutter at $width px / $sides', async ({ width, sides }) => {
  await page.viewport(width, 900)
  document.documentElement.dataset.readerSideOrder = 'tikkun-right'
  const presentation = { layout: 'match', sides } as const
  const fixtures = [
    renderedPage(78, beshalachPageJson),
    renderedPage(242, haazinuPageJson),
    renderedPage(243, haazinuSecondPageJson),
  ]
  install(`<div class="tikkun-book" data-target-id="tikkun-book"
    data-reader-layout="match" data-reader-sides="${sides}" dir="rtl" style="width:100vw">
    ${fixtures.map((fixture) => `<section class="tikkun-page">${Page(fixture, { presentation })}</section>`).join('')}
  </div>`)
  await document.fonts.load('28.8px ShlomosemiStam', 'אשר')
  await document.fonts.ready
  const pages = requiredAll<HTMLElement>('.tikkun-page')
  const center = (element: HTMLElement) => {
    const rect = element.getBoundingClientRect()
    return rect.left + rect.width / 2
  }
  for (const order of ['tikkun-right', 'torah-right']) {
    document.documentElement.dataset.readerSideOrder = order
    pages.forEach((member) => applyReaderPageLayout(member, presentation))
    for (const member of pages) {
      const song = required('tr[data-shirah-kind]', member)
      const songGutter = required('.line-gutter.mod-verses', song).getBoundingClientRect()
      for (const row of requiredAll<HTMLElement>('tr', member)) {
        const label = `${row.dataset.pageNumber}:${row.dataset.lineIndex}:${order}`
        expect(required('.line-gutter.mod-verses', row).getBoundingClientRect().left, `${label} shared verse gutter`)
          .toBeCloseTo(songGutter.left, 1)
        for (const side of requiredAll<HTMLElement>('.reader-text-side', row)) {
          const surface = side.classList.contains('mod-tikkun') ? 'tikkun'
            : side.classList.contains('mod-torah') ? 'torah' : 'single'
          expect(center(required('.reader-text-flow', side)), `${label} centered ${surface} block`)
            .toBeCloseTo(center(required(`.reader-text-side.mod-${surface} .reader-text-flow`, song)), 1)
        }
      }
    }
  }
})

test('uses the same Haazinu and Sea boundary rows in both Match modes', () => {
  const fixtures = [
    renderedPage(78, beshalachPageJson),
    renderedPage(242, haazinuPageJson),
    renderedPage(243, haazinuSecondPageJson),
  ]
  install(
    fixtures
      .map(
        (fixture) =>
          `<section class="tikkun-page">${Page(fixture, {
            presentation: { layout: 'match', sides: 'two' },
          })}</section>`,
      )
      .join(''),
  )

  expect(requiredAll('[data-shirah-kind="haazinu"]')).toHaveLength(70)
  expect(requiredAll('[data-shirah-kind="sea"]')).toHaveLength(30)
  expect(required('tr[data-page-number="78"][data-line-index="5"]').getAttribute('data-shirah-pattern')).toBe('opening')
  expect(
    required('tr[data-page-number="78"][data-line-index="34"]').getAttribute(
      'data-shirah-pattern',
    ),
  ).toBe('closing')
})

test('clones One Side Match text, punctuation, special letters, and shirah tracks into both sides', () => {
  const fixtures = [
    renderedPage(78, beshalachPageJson),
    renderedPage(242, haazinuPageJson),
    renderedPage(243, haazinuSecondPageJson),
    renderedPage(37, vayishlachPageJson),
  ]
  const snapshot = (flow: HTMLElement) => requiredAll<HTMLElement>('.fragment', flow).map((fragment) => ({
    words: requiredAll<HTMLElement>('.word', fragment).map((word) => ({
      key: word.dataset.tokenKey,
      markup: word.innerHTML,
      hidden: word.hidden,
      classes: [...word.classList],
    })),
  }))
  for (const fixture of fixtures) {
    const single = document.createElement('section')
    single.innerHTML = Page(fixture, { presentation: { layout: 'match', sides: 'one' } })
    const paired = document.createElement('section')
    paired.innerHTML = Page(fixture, { presentation: { layout: 'match', sides: 'two' } })
    const compare = (surface: 'tikkun' | 'torah') => {
      const copies = requiredAll<HTMLElement>(`.mod-${surface} .reader-text-flow`, paired)
      requiredAll<HTMLElement>('.reader-text-flow', single).forEach((flow, index) => {
        expect(snapshot(copies[index]), `${fixture.pageNumber}:${index}:${surface}`).toEqual(snapshot(flow))
      })
    }
    compare('tikkun')
    applyAnnotationMode(single, false)
    compare('torah')
  }
})

test.each([551, 768, 1280])('fits identical Sea tracks in Two Sided Match at %ipx', async (viewportWidth) => {
  await page.viewport(viewportWidth, 900)
  document.documentElement.dataset.readerSideOrder = 'tikkun-right'
  install(`<div class="tikkun-book" data-reader-layout="match" data-reader-sides="two" style="width:100vw;height:800px">
    <section class="tikkun-page">${Page(renderedPage(78, beshalachPageJson), {
      presentation: { layout: 'match', sides: 'two' },
    })}</section></div>`)
  await document.fonts.ready
  applyReaderPageLayout(required('.tikkun-page'), { layout: 'match', sides: 'two' })
  const book = required<HTMLElement>('.tikkun-book')
  for (const row of requiredAll<HTMLElement>('[data-shirah-kind="sea"]')) {
    const flows = requiredAll<HTMLElement>('.reader-text-flow', row)
    expect(flows[0].getBoundingClientRect().width).toBeCloseTo(flows[1].getBoundingClientRect().width, 0)
    for (const flow of flows) {
      for (const fragment of requiredAll<HTMLElement>('.fragment', flow)) {
        const rect = fragment.getBoundingClientRect()
        const words = requiredAll<HTMLElement>('.word:not([hidden])', fragment)
        for (const word of words) {
          const wordRect = word.getBoundingClientRect()
          expect(wordRect.left).toBeGreaterThanOrEqual(rect.left - 1)
          expect(wordRect.right).toBeLessThanOrEqual(rect.right + 1)
        }
      }
    }
  }
  const bookRect = book.getBoundingClientRect()
  for (const label of requiredAll<HTMLElement>('.location-indicator.mod-verses', book)) {
    expect(label.getBoundingClientRect().right, `verse range ${label.textContent} (${label.closest('tr')?.dataset.shirahKind ?? 'ordinary'})`).toBeLessThanOrEqual(bookRect.right + 1)
  }
  expect(book.scrollWidth).toBeLessThanOrEqual(book.clientWidth + 1)
})

test.each([551, 768, 1280, 1600])(
  'fits Two Sided Match lines without coupling ordinary and shirah text sizes at %ipx',
  async (viewportWidth) => {
    await page.viewport(viewportWidth, 900)
    document.documentElement.dataset.readerSideOrder = 'tikkun-right'
    const fixtures = [
      renderedPage(78, beshalachPageJson),
      renderedPage(242, haazinuPageJson),
      renderedPage(243, haazinuSecondPageJson),
      renderedPage(37, vayishlachPageJson),
    ]
    install(`<div class="tikkun-book" data-target-id="tikkun-book"
      data-reader-layout="match" data-reader-sides="two" dir="rtl"
      style="width: 100vw; height: 820px">
      ${fixtures.map((fixture) => `<section class="tikkun-page">${Page(fixture, {
        presentation: { layout: 'match', sides: 'two' },
      })}</section>`).join('')}
    </div>`)
    await document.fonts.ready
    const pages = requiredAll<HTMLElement>('.tikkun-page')
    pages.forEach((member) => applyReaderPageLayout(member, { layout: 'match', sides: 'two' }))
    for (const member of pages) {
      const fontSizes = new Map<string, string>()
      for (const row of requiredAll<HTMLElement>('tr', member)) {
        const flows = requiredAll<HTMLElement>('.reader-text-flow', row)
        const kind = row.dataset.shirahKind ?? 'ordinary'
        const fontSize = fontSizes.get(kind) ?? getComputedStyle(flows[0]).fontSize
        fontSizes.set(kind, fontSize)
        const baselines: number[] = []
        for (const flow of flows) {
          expect(getComputedStyle(flow).fontSize).toBe(fontSize)
          const words = requiredAll<HTMLElement>('.word:not([hidden])', flow)
            .filter((word) => word.getClientRects().length)
          // Ketiv/kri badge padding is not part of the text baseline.
          const bottoms = words.map((word) => {
            const range = document.createRange()
            range.selectNodeContents(word)
            return range.getBoundingClientRect().bottom
          })
          if (!bottoms.length) continue
          expect(
            Math.max(...bottoms) - Math.min(...bottoms),
            `${row.dataset.pageNumber}:${row.dataset.lineIndex} remains one physical line`,
          ).toBeLessThan(Number.parseFloat(getComputedStyle(flow).lineHeight) / 2)
          baselines.push(Math.max(...bottoms))
        }
        if (baselines.length === 2) expect(baselines[0], `${row.dataset.pageNumber}:${row.dataset.lineIndex} paired baseline`).toBeCloseTo(baselines[1], 0)
      }
      // The same ordinary rows must fit identically with or without a neighboring song.
      const ordinaryReference = member.cloneNode(true) as HTMLElement
      ordinaryReference.querySelectorAll('tr[data-shirah-kind]').forEach((row) => row.remove())
      member.parentElement!.append(ordinaryReference)
      applyReaderPageLayout(ordinaryReference, { layout: 'match', sides: 'two' })
      const ordinaryFlows = requiredAll<HTMLElement>('tr:not([data-shirah-kind]) .reader-text-flow', member)
      const referenceFlows = requiredAll<HTMLElement>('.reader-text-flow', ordinaryReference)
      ordinaryFlows.forEach((flow, index) => {
        const reference = referenceFlows[index]
        expect(getComputedStyle(flow).fontSize).toBe(getComputedStyle(reference).fontSize)
        expect(flow.getBoundingClientRect().width).toBeCloseTo(reference.getBoundingClientRect().width, 1)
        expect(flow.closest('tr')!.getBoundingClientRect().height).toBeCloseTo(reference.closest('tr')!.getBoundingClientRect().height, 1)
      })
      ordinaryReference.remove()
    }
  },
)

test.each([390, 551, 768, 1024, 1280, 1600, 1920])(
  'preserves deployed Haazinu ordinary row geometry in One Side Match at %ipx',
  async (viewportWidth) => {
    await page.viewport(viewportWidth, 900)
    const pages = [
      renderedPage(242, haazinuPageJson),
      renderedPage(243, haazinuSecondPageJson),
    ]
    const markup = pages.map((member) => `<section class="tikkun-page">${Page(member, {
      presentation: { layout: 'match', sides: 'one' },
    })}</section>`).join('')
    install(`
      <style>
        [data-test-reader='deployed'] .line-content { display: flex; justify-content: space-between; }
        [data-test-reader='deployed'] .column { flex: 1; min-width: 18ch; max-width: none; }
        [data-test-reader='deployed'] .column:nth-child(2) { margin-right: 5em; width: 12em; }
      </style>
      <div class="tikkun-book" data-target-id="tikkun-book" data-test-reader="current"
        data-reader-layout="match" data-reader-sides="one" style="width:100vw">${markup}</div>
      <div class="tikkun-book" data-target-id="tikkun-book" data-test-reader="deployed"
        style="width:100vw">${markup}</div>
    `)
    const current = required<HTMLElement>('[data-test-reader="current"]')
    const deployed = required<HTMLElement>('[data-test-reader="deployed"]')
    // The deployed reader had columns directly inside each line-content.
    requiredAll<HTMLElement>('.line-content', deployed).forEach((content) => {
      content.replaceChildren(...required('.reader-text-flow', content).children)
    })
    await document.fonts.ready
    requiredAll<HTMLElement>('.tikkun-page', current).forEach((member) =>
      applyReaderPageLayout(member, { layout: 'match', sides: 'one' }),
    )
    for (const row of requiredAll<HTMLElement>('tr:not([data-shirah-kind])', current)) {
      const reference = required<HTMLElement>(
        `tr[data-page-number="${row.dataset.pageNumber}"][data-line-index="${row.dataset.lineIndex}"]`,
        deployed,
      )
      const content = required('.reader-text-flow', row)
      const original = required('.line-content', reference)
      const label = `${row.dataset.pageNumber}:${row.dataset.lineIndex}`
      const fitted = content.closest('.mod-match-fitted')
      if (fitted) {
        // A legacy row that wraps may borrow margins, but not change its line height.
        expect(content.getBoundingClientRect().width, `${label} fit`).toBeGreaterThanOrEqual(original.getBoundingClientRect().width)
        expect(getComputedStyle(content).lineHeight, `${label} line height`).toBe(getComputedStyle(original).lineHeight)
        expect(row.getBoundingClientRect().height, `${label} row spacing`).toBeLessThanOrEqual(reference.getBoundingClientRect().height + 1)
      } else {
        expect(content.getBoundingClientRect().width, `${label} width`).toBeCloseTo(original.getBoundingClientRect().width, 1)
        if (viewportWidth <= 550) {
          expect(content.getBoundingClientRect().left, `${label} placement`).toBeCloseTo(original.getBoundingClientRect().left, 1)
        }
        expect(row.getBoundingClientRect().height, `${label} row spacing`).toBeCloseTo(reference.getBoundingClientRect().height, 1)
      }
      expect(getComputedStyle(content).font, `${label} font`).toBe(getComputedStyle(original).font)
    }
  },
)

test.each([320, 390, 551, 768, 1024, 1280, 1600])(
  'uses the font-measured Haazinu gap in both Match modes at %ipx',
  async (viewportWidth) => {
    await page.viewport(viewportWidth, 900)
    for (const sides of (viewportWidth < 551 ? ['one'] : ['one', 'two']) as ('one' | 'two')[]) {
      fixture?.remove()
      document.documentElement.dataset.readerSideOrder = 'tikkun-right'
      const fixtures = [
        renderedPage(242, haazinuPageJson),
        renderedPage(243, haazinuSecondPageJson),
      ]
      fixtures[0].lines[7].labels = ['ראשון']
      install(`<div class="tikkun-book" data-target-id="tikkun-book"
        data-reader-layout="match" data-reader-sides="${sides}" dir="rtl"
        style="width: 100vw; height: 820px">
        ${fixtures.map((fixture) => `<section class="tikkun-page">${Page(fixture, {
          presentation: { layout: 'match', sides },
        })}</section>`).join('')}
      </div>`)
      await document.fonts.ready
      const book = required<HTMLElement>('.tikkun-book')
      const pages = requiredAll<HTMLElement>('.tikkun-page')
      const spacingReference = document.createElement('section')
      spacingReference.className = 'tikkun-page'
      spacingReference.innerHTML = Page(renderedPage(1, [{ text: [['אשר אשר']], verses: [], isPetucha: false }]), {
        presentation: { layout: 'match', sides },
      })
      book.append(spacingReference)
      const rowHeight = required('tr', spacingReference).getBoundingClientRect().height
      const refresh = () => pages.forEach((member) => applyReaderPageLayout(member, { layout: 'match', sides }))
      const verify = () => {
        const rows = requiredAll<HTMLElement>('[data-shirah-kind="haazinu"]')
        const sample = required<HTMLElement>('.fragment', rows[0])
        const probe = document.createElement('span')
        probe.textContent = 'אשר אשר אשר'
        probe.style.cssText = `position: absolute; visibility: hidden; white-space: pre; font: ${getComputedStyle(sample).font}`
        book.append(probe)
        const baseline = probe.getBoundingClientRect().width
        probe.remove()
        const firstFlow = required('.reader-text-flow', rows[0]).getBoundingClientRect()
        let largestWordSpace = 0
        for (const row of rows) {
          expect(row.getBoundingClientRect().height, `${sides}: row pitch`).toBeCloseTo(rowHeight, 0)
          for (const flow of requiredAll<HTMLElement>('.reader-text-flow', row)) {
            expect(flow.getBoundingClientRect().width).toBeCloseTo(firstFlow.width, 0)
            const [right, left] = requiredAll<HTMLElement>('.column', flow).map((column) => column.getBoundingClientRect())
            expect(right.width).toBeCloseTo(left.width, 0)
            expect(right.left - left.right, `${sides}: actual center gap`).toBeCloseTo(baseline, 0)
            for (const fragment of requiredAll<HTMLElement>('.fragment', flow)) {
              const rect = fragment.getBoundingClientRect()
              const words = requiredAll<HTMLElement>('.word:not([hidden])', fragment).filter((word) => word.getClientRects().length)
              for (let i = 0; i < words.length; i++) {
                const word = words[i].getBoundingClientRect()
                expect(word.left, `${sides}: word inside half`).toBeGreaterThanOrEqual(rect.left - 1)
                expect(word.right).toBeLessThanOrEqual(rect.right + 1)
                if (i) {
                  const previous = words[i - 1].getBoundingClientRect()
                  expect(Math.abs(word.top - previous.top), `${sides}: no wrapping`).toBeLessThan(Number.parseFloat(getComputedStyle(fragment).lineHeight) / 2)
                  largestWordSpace = Math.max(largestWordSpace, previous.left - word.right)
                }
              }
            }
          }
        }
        expect(largestWordSpace).toBeLessThan(baseline)
        expect(book.scrollWidth).toBeLessThanOrEqual(book.clientWidth + 1)
      }
      refresh()
      verify()
      applyAnnotationMode(book, false)
      refresh()
      verify()
      pages[0].remove()
      applyReaderPageLayout(pages[1], { layout: 'match', sides })
      verify()
    }
  },
)

test.each([551, 768, 1024, 1280, 1600])(
  'shares One Side Match shirah tracks across rows and physical pages at %ipx',
  async (viewportWidth) => {
    await page.viewport(viewportWidth, 900)
    const fixtures = [
      renderedPage(78, beshalachPageJson),
      renderedPage(242, haazinuPageJson),
      renderedPage(243, haazinuSecondPageJson),
    ]
    fixtures[1].lines[7].labels = ['ראשון']
    install(`<div class="tikkun-book" data-target-id="tikkun-book"
      data-reader-layout="match" data-reader-sides="one" dir="rtl"
      style="width: min(1140px, 100vw); height: 820px; margin-inline: auto">
      ${fixtures
        .map(
          (fixture) =>
            `<section class="tikkun-page">${Page(fixture, {
              presentation: { layout: 'match', sides: 'one' },
            })}</section>`,
        )
        .join('')}
    </div>`)
    await document.fonts.ready
    const book = required<HTMLElement>('.tikkun-book')
    const pages = requiredAll<HTMLElement>('.tikkun-page')
    const spacingReference = document.createElement('section')
    spacingReference.className = 'tikkun-page'
    const ordinaryLine = {
      text: [haazinuPageJson[8].text[0]],
      verses: [],
      isPetucha: false,
    }
    spacingReference.innerHTML = Page(
      renderedPage(1, [ordinaryLine, ordinaryLine]),
      {
        presentation: { layout: 'match', sides: 'one' },
      },
    )
    book.append(spacingReference)
    const referenceRows = requiredAll<HTMLElement>('tr', spacingReference)
    const referenceHeight = referenceRows[0].getBoundingClientRect().height
    const referencePitch =
      referenceRows[1].getBoundingClientRect().top -
      referenceRows[0].getBoundingClientRect().top
    const verifySpacing = () => {
      for (const row of requiredAll<HTMLElement>('tr[data-shirah-kind]')) {
        expect(
          row.getBoundingClientRect().height,
          `${row.dataset.pageNumber}:${row.dataset.lineIndex} row height`,
        ).toBeCloseTo(referenceHeight, 0)
        if (row.nextElementSibling?.matches('tr[data-shirah-kind]')) {
          expect(
            row.nextElementSibling.getBoundingClientRect().top -
              row.getBoundingClientRect().top,
            `${row.dataset.pageNumber}:${row.dataset.lineIndex} row pitch`,
          ).toBeCloseTo(referencePitch, 0)
        }
      }
    }
    const refresh = () =>
      pages.forEach((member) =>
        applyReaderPageLayout(member, { layout: 'match', sides: 'one' }),
      )
    refresh()
    verifySpacing()

    expect(requiredAll('[data-shirah-kind="haazinu"]')).toHaveLength(70)
    expect(requiredAll('[data-shirah-kind="sea"]')).toHaveLength(30)
    expect(
      required('[data-page-number="242"][data-line-index="7"]').getAttribute(
        'data-shirah-kind',
      ),
    ).toBe('haazinu')
    expect(
      required('[data-page-number="243"][data-line-index="0"]').getAttribute(
        'data-shirah-kind',
      ),
    ).toBe('haazinu')
    expect(
      required('[data-page-number="78"][data-line-index="5"]').getAttribute(
        'data-shirah-pattern',
      ),
    ).toBe('opening')
    expect(
      required('[data-page-number="78"][data-line-index="11"]').getAttribute(
        'data-shirah-pattern',
      ),
    ).toBe('extended-left')
    expect(
      required('[data-page-number="78"][data-line-index="33"]').getAttribute(
        'data-shirah-pattern',
      ),
    ).toBe('penultimate')
    expect(
      required('[data-page-number="78"][data-line-index="34"]').getAttribute(
        'data-shirah-pattern',
      ),
    ).toBe('closing')
    expect(
      required('[data-page-number="78"][data-line-index="37"]').hasAttribute(
        'data-shirah-kind',
      ),
    ).toBe(false)

    const geometry = () =>
      requiredAll<HTMLElement>('tr[data-shirah-kind]').map((row) => {
        const tracks = requiredAll<HTMLElement>(
          row.dataset.shirahKind === 'haazinu' ? '.column' : '.fragment',
          row,
        )
        return {
          pattern: row.dataset.shirahPattern,
          location: `${row.dataset.pageNumber}:${row.dataset.lineIndex}`,
          rects: tracks.map((track) => track.getBoundingClientRect()),
        }
      })
    const initial = geometry()
    // Check the empty spaces themselves, not only consistency between rows.
    for (const line of [5, 6, 7, 11, 33, 34]) {
      const row = required<HTMLElement>(
        `tr[data-page-number="78"][data-line-index="${line}"]`,
      )
      const content = required('.line-content', row).getBoundingClientRect()
      expect(content.left).toBeGreaterThanOrEqual(
        book.getBoundingClientRect().left + 16 - 1,
      )
      const fragments = requiredAll<HTMLElement>('.fragment', row)
      expect(fragments).toHaveLength(line === 5 ? 1 : line === 6 ? 3 : 2)
      expect(fragments[0].getBoundingClientRect().right).toBeCloseTo(content.right, 0)
      expect(fragments.at(-1)!.getBoundingClientRect().left).toBeCloseTo(content.left, 0)
      const flow = required<HTMLElement>('.reader-text-flow', row)
      const probe = document.createElement('span')
      probe.style.cssText = `position:absolute;white-space:nowrap;font:${getComputedStyle(flow).font}`
      probe.textContent = 'אשר אשר אשר'
      book.append(probe)
      const minimumGap = probe.getBoundingClientRect().width
      probe.remove()
      for (let index = 1; index < fragments.length; index++) {
        const actualGap = fragments[index - 1].getBoundingClientRect().left -
          fragments[index].getBoundingClientRect().right
        expect(actualGap, `protected blank in Sea row ${line}`).toBeGreaterThanOrEqual(minimumGap - 1)
      }
    }
    for (const pattern of ['columns-2', 'fragments-2', 'fragments-3']) {
      const repeated = initial.filter((row) => row.pattern === pattern)
      for (const row of repeated) {
        row.rects.forEach((rect, i) => {
          expect(rect.left, `${row.location} repeated track ${i} left`).toBeCloseTo(repeated[0].rects[i].left, 0)
          expect(rect.right, `${row.location} repeated track ${i} right`).toBeCloseTo(repeated[0].rects[i].right, 0)
        })
        expect(row.rects[0].width).toBeCloseTo(row.rects.at(-1)!.width, 0)
      }
    }

    for (const row of requiredAll<HTMLElement>('tr[data-shirah-kind]')) {
      const rect = required<HTMLElement>(
        '.line-content',
        row,
      ).getBoundingClientRect()
      for (const fragment of requiredAll<HTMLElement>('.fragment', row)) {
        const fragmentRect = fragment.getBoundingClientRect()
        expect(
          fragment.scrollWidth,
          `${row.dataset.pageNumber}:${row.dataset.lineIndex} ${fragment.textContent?.trim()}`,
        ).toBeLessThanOrEqual(fragment.clientWidth + 1)
        for (const word of requiredAll<HTMLElement>(
          '.word:not([hidden])',
          fragment,
        )) {
          const wordRect = word.getBoundingClientRect()
          expect(
            wordRect.left,
            'word must not enter a shirah gap',
          ).toBeGreaterThanOrEqual(fragmentRect.left - 1)
          expect(
            wordRect.right,
            'word must not enter a shirah gap',
          ).toBeLessThanOrEqual(fragmentRect.right + 1)
          expect(wordRect.left).toBeGreaterThanOrEqual(rect.left - 1)
          expect(wordRect.right).toBeLessThanOrEqual(rect.right + 1)
        }
      }
    }
    expect(book.scrollWidth).toBeLessThanOrEqual(book.clientWidth + 1)

    applyAnnotationMode(book, false)
    refresh()
    verifySpacing()
    geometry().forEach((row, index) =>
      row.rects.forEach((rect, i) => {
        expect(rect.left, `${row.location} track ${i} left after annotations`).toBeCloseTo(initial[index].rects[i].left, 0)
        expect(rect.right, `${row.location} track ${i} right after annotations`).toBeCloseTo(initial[index].rects[i].right, 0)
      }),
    )
    applyAnnotationMode(book, true)
    refresh()
    expect(book.querySelector('.match-shirah-measure')).toBeNull()
    const lastHaazinuTracks = geometry()
      .filter((row) => row.pattern === 'columns-2')
      .slice(-35)
    pages[1].remove()
    applyReaderPageLayout(pages[2], { layout: 'match', sides: 'one' })
    geometry()
      .filter((row) => row.pattern === 'columns-2')
      .forEach((row, index) => {
        row.rects.forEach((rect, i) => {
          expect(rect.left, `${row.location} after eviction`).toBeCloseTo(
            lastHaazinuTracks[index].rects[i].left,
            0,
          )
          expect(rect.right).toBeCloseTo(
            lastHaazinuTracks[index].rects[i].right,
            0,
          )
        })
      })
  },
)

test.each(['one', 'two'] as const)(
  'keeps Sea fragment placement with its CSS templates in %s Side Match',
  async (sides) => {
    await page.viewport(1280, 900)
    document.documentElement.dataset.readerSideOrder = 'tikkun-right'
    const presentation = { layout: 'match' as const, sides }
    install(`<div class="tikkun-book" data-reader-layout="match"
      data-reader-sides="${sides}" dir="rtl" style="width: 1140px">
      <section class="tikkun-page">${Page(renderedPage(78, beshalachPageJson), {
        presentation,
      })}</section>
    </div>`)
    await document.fonts.ready
    const member = required<HTMLElement>('.tikkun-page')
    applyReaderPageLayout(member, presentation)
    expect(member.querySelector('[style*="--match-shirah-track"]')).toBeNull()

    for (const row of requiredAll<HTMLElement>('tr[data-shirah-kind="sea"]')) {
      for (const column of requiredAll<HTMLElement>('.column', row)) {
        const fragments = requiredAll<HTMLElement>('.fragment', column)
        const initial = fragments.map((fragment) => fragment.getBoundingClientRect())
        // Already-mounted markup must not override an updated CSS template.
        fragments.forEach((fragment, index) => {
          fragment.style.setProperty('--match-shirah-track', `${index + 1} / span 8`)
        })
        fragments.forEach((fragment, index) => {
          const rect = fragment.getBoundingClientRect()
          expect(rect.width).toBeCloseTo(initial[index].width, 1)
          expect(rect.left).toBeCloseTo(initial[index].left, 1)
          const wordTops = requiredAll<HTMLElement>('.word:not([hidden])', fragment)
            .map((word) => word.getBoundingClientRect().top)
          expect(Math.max(...wordTops) - Math.min(...wordTops)).toBeLessThan(1)
        })
        if (row.dataset.shirahPattern === 'opening') {
          expect(fragments[0].getBoundingClientRect().width)
            .toBeCloseTo(column.getBoundingClientRect().width, 1)
        }
      }
    }
  },
)

test('joins one Reading pasuk across its physical JSON lines', async () => {
  await page.viewport(1800, 900)
  const vayishlach = renderedPage(37, vayishlachPageJson)
  install(`
    <div
      class="tikkun-book"
      data-target-id="tikkun-book"
      data-reader-layout="reading"
      data-reader-sides="one"
      style="height: 760px"
    >
      <section class="tikkun-page">${Page(vayishlach, {
        presentation: { layout: 'reading', sides: 'one' },
      })}</section>
    </div>
  `)
  await document.fonts.ready

  const line17Last = required<HTMLElement>('[data-token-key="37:17:0:7"]')
  const line18First = required<HTMLElement>('[data-token-key="37:18:0:0"]')
  const line18Last = required<HTMLElement>('[data-token-key="37:18:0:6"]')
  const line19First = required<HTMLElement>('[data-token-key="37:19:0:0"]')

  expect(getComputedStyle(required('.tikkun-page')).display).toBe('inline')
  expect(getComputedStyle(required('[data-line-index="18"]')).display).toBe(
    'inline',
  )
  expect(line17Last.compareDocumentPosition(line18First)).toBe(
    Node.DOCUMENT_POSITION_FOLLOWING,
  )
  expect(line18Last.compareDocumentPosition(line19First)).toBe(
    Node.DOCUMENT_POSITION_FOLLOWING,
  )
  expect(
    requiredAll('[data-line-index="18"] .reader-pasuk-break'),
  ).toHaveLength(0)
  expect(
    requiredAll('[data-line-index="19"] .reader-pasuk-break'),
  ).toHaveLength(1)
})

test('keeps both mirrored Reading sides complete in landscape', async () => {
  await page.viewport(844, 390)
  document.documentElement.dataset.readerSideOrder = 'tikkun-right'
  const haazinu = renderedPage(242, haazinuPageJson)
  install(`
    <div
      class="tikkun-book"
      data-target-id="tikkun-book"
      data-reader-layout="reading"
      data-reader-sides="two"
      style="height: 330px"
    >
      <section class="tikkun-page">${Page(haazinu, {
        presentation: { layout: 'reading', sides: 'two' },
      })}</section>
    </div>
  `)
  await document.fonts.ready
  applyReaderPageLayout(required<HTMLElement>('.tikkun-page'), {
    layout: 'reading',
    sides: 'two',
  })

  const book = required<HTMLElement>('.tikkun-book')
  const tikkunSide = required<HTMLElement>(
    '.reader-reading-page-side.mod-tikkun',
  )
  const torahSide = required<HTMLElement>('.reader-reading-page-side.mod-torah')
  const lines = requiredAll<HTMLElement>('.mod-reading-line', tikkunSide)
  expect(lines.length).toBeGreaterThan(1)
  expect(book.scrollWidth).toBeLessThanOrEqual(book.clientWidth + 1)
  expect(requiredAll('[data-token-key="242:7:0:0"]')).toHaveLength(2)
  expect(
    required('.reader-text-side.mod-torah').getAttribute('aria-hidden'),
  ).toBe('true')

  for (const line of lines) {
    const lineIndex = line.dataset.lineIndex
    const mirror = required<HTMLElement>(
      `[data-reader-mirror][data-line-index="${lineIndex}"]`,
      torahSide,
    )
    const tikkunWords = requiredAll<HTMLElement>('.word:not([hidden])', line)
    const torahWords = requiredAll<HTMLElement>('.word:not([hidden])', mirror)
    expect(torahWords.map((word) => word.dataset.tokenKey)).toEqual(
      tikkunWords.map((word) => word.dataset.tokenKey),
    )
    tikkunWords.forEach((word, wordIndex) => {
      expect(
        Math.abs(
          word.getBoundingClientRect().top -
            torahWords[wordIndex].getBoundingClientRect().top,
        ),
      ).toBeLessThanOrEqual(1)
    })
  }

  for (const side of [tikkunSide, torahSide]) {
    expect(requiredAll('.mod-shirah', side)).toHaveLength(0)
    expect(requiredAll('[data-shirah-kind]', side)).toHaveLength(0)
    for (const column of requiredAll<HTMLElement>('.column', side)) {
      expect(getComputedStyle(column).display).toBe('contents')
    }
  }
})

test('mirrors every Vayishlach token at the reported Two Sided wrap', async () => {
  await page.viewport(844, 700)
  document.documentElement.dataset.readerSideOrder = 'tikkun-right'
  const vayishlach = renderedPage(36, vayishlachPage36Json)
  install(`
    <div
      class="tikkun-book"
      data-target-id="tikkun-book"
      data-reader-layout="reading"
      data-reader-sides="two"
      style="height: 640px"
    >
      <section class="tikkun-page">${Page(vayishlach, {
        presentation: { layout: 'reading', sides: 'two' },
      })}</section>
    </div>
  `)
  await document.fonts.ready
  applyReaderPageLayout(required<HTMLElement>('.tikkun-page'), {
    layout: 'reading',
    sides: 'two',
  })

  const tikkunSide = required<HTMLElement>(
    '.reader-reading-page-side.mod-tikkun',
  )
  const torahSide = required<HTMLElement>('.reader-reading-page-side.mod-torah')
  expect(
    getComputedStyle(
      required<HTMLElement>('[data-line-index="20"]', tikkunSide),
    ).display,
  ).toBe('inline')

  for (const side of [tikkunSide, torahSide]) {
    const verseLine = required<HTMLElement>('[data-line-index="20"]', side)
    const previousLine = required<HTMLElement>('[data-line-index="19"]', side)
    const verseWords = requiredAll<HTMLElement>(
      '.word[data-token-key]:not([hidden])',
      verseLine,
    )
    const previousWords = requiredAll<HTMLElement>(
      '.word[data-token-key]:not([hidden])',
      previousLine,
    )
    const verseStartIndex = verseStartWordIndex({
      currentLineWords: verseWords,
      previousLineWords: previousWords,
      verseOrdinal: 0,
    })
    const verseStartWord = verseWords[verseStartIndex] ?? verseWords[0]
    const verseGutter = required<HTMLElement>(
      '.line-gutter.mod-verses',
      verseLine,
    )

    expect(verseStartIndex).toBeGreaterThan(0)
    expect(
      Number.parseFloat(
        verseGutter.style.getPropertyValue('--reading-verse-gutter-top'),
      ),
    ).toBeCloseTo(
      verseStartWord.getBoundingClientRect().top -
        required('.reader-reading-page').getBoundingClientRect().top,
      1,
    )
  }

  for (const lineIndex of [20, 21, 22, 23, 24, 25, 26, 27, 28]) {
    const line = required<HTMLElement>(
      `[data-line-index="${lineIndex}"]`,
      tikkunSide,
    )
    const mirror = required<HTMLElement>(
      `[data-reader-mirror][data-line-index="${lineIndex}"]`,
      torahSide,
    )
    const tikkunWords = requiredAll<HTMLElement>('.word', line)
    const torahWords = requiredAll<HTMLElement>('.word', mirror)

    expect(torahWords.map((word) => word.dataset.tokenKey)).toEqual(
      tikkunWords.map((word) => word.dataset.tokenKey),
    )
    expect(torahWords.map((word) => word.textContent)).toEqual(
      tikkunWords.map((word) =>
        word.textContent?.normalize('NFD').replace(/\p{M}/gu, ''),
      ),
    )
    tikkunWords.forEach((word, wordIndex) => {
      expect(
        Math.abs(
          word.getBoundingClientRect().top -
            torahWords[wordIndex].getBoundingClientRect().top,
        ),
      ).toBeLessThanOrEqual(1)
    })

    const breakTokenKeys = (root: ParentNode) =>
      requiredAll<HTMLElement>('.reader-pasuk-break', root).map(
        (breakElement) =>
          (breakElement.previousElementSibling as HTMLElement | null)?.dataset
            .tokenKey,
      )
    expect(breakTokenKeys(mirror)).toEqual(breakTokenKeys(line))
  }
})

test('keeps both mirrored Match sides on their physical Torah lines', async () => {
  await page.viewport(844, 390)
  document.documentElement.dataset.readerSideOrder = 'tikkun-right'
  const haazinu = renderedPage(242, haazinuPageJson)
  install(`
    <div
      class="tikkun-book"
      data-target-id="tikkun-book"
      data-reader-layout="match"
      data-reader-sides="two"
      style="height: 330px"
    >
      <section class="tikkun-page">${Page(haazinu, {
        presentation: { layout: 'match', sides: 'two' },
      })}</section>
    </div>
  `)
  await document.fonts.ready
  applyReaderPageLayout(required<HTMLElement>('.tikkun-page'), {
    layout: 'match',
    sides: 'two',
  })

  const book = required<HTMLElement>('.tikkun-book')
  const matchPage = required<HTMLElement>('.tikkun-page')
  expect(book.scrollWidth).toBeLessThanOrEqual(book.clientWidth + 1)
  expect(
    matchPage.style.getPropertyValue('--match-shirah-inline-expansion'),
  ).toBe('')
  expect(requiredAll('[data-token-key="242:7:0:0"]')).toHaveLength(2)
  expect(requiredAll('.mod-shirah').length).toBeGreaterThan(0)

  for (const line of requiredAll<HTMLElement>('[data-class="line"]')) {
    const sides = requiredAll<HTMLElement>('.reader-text-side', line)
    expect(sides).toHaveLength(2)
    expect(
      Math.abs(
        sides[0].getBoundingClientRect().top -
          sides[1].getBoundingClientRect().top,
      ),
    ).toBeLessThanOrEqual(1)
  }

  for (const side of requiredAll<HTMLElement>('.reader-text-side')) {
    const sideRect = side.getBoundingClientRect()
    const tops = requiredAll<HTMLElement>('.word:not([hidden])', side).map(
      (word) => word.getBoundingClientRect().top,
    )
    if (!tops.length) continue
    expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(4)
    for (const word of requiredAll<HTMLElement>('.word:not([hidden])', side)) {
      const rect = word.getBoundingClientRect()
      expect(rect.left).toBeGreaterThanOrEqual(sideRect.left - 1)
      expect(rect.right).toBeLessThanOrEqual(sideRect.right + 1)
    }
  }
})

test.each(['match', 'reading'] as const)(
  'keeps vocalized Tikkun swappable while the verse gutter stays fixed right in Two Sided %s',
  async (layout) => {
    await page.viewport(844, 390)
    document.documentElement.dataset.readerSideMode = 'two'
    document.documentElement.dataset.readerTextLayout = layout
    document.documentElement.dataset.readerSideOrder = 'tikkun-right'
    const beresheet = renderedPage(1, [
      {
        text: [['בְּרֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים׃']],
        verses: [{ book: 1, chapter: 1, verse: 1 }],
        isPetucha: false,
      },
    ])
    install(`
      <main class="reader-main" style="direction: rtl">
        <div class="reader-text-forehead">
          <div class="reader-side-heading mod-left" lang="he" dir="rtl">
            <span data-reader-heading-form="torah">תורה</span>
            <span data-reader-heading-form="tikkun">תיקון</span>
          </div>
          <button class="reader-side-swap" type="button">Swap</button>
          <div class="reader-side-heading mod-right" lang="he" dir="rtl">
            <span data-reader-heading-form="torah">תורה</span>
            <span data-reader-heading-form="tikkun">תיקון</span>
          </div>
        </div>
        <div
          class="tikkun-book"
          data-target-id="tikkun-book"
          data-reader-layout="${layout}"
          data-reader-sides="two"
        >
          <section class="tikkun-page">${Page(beresheet, {
            presentation: { layout, sides: 'two' },
          })}</section>
        </div>
      </main>
    `)
    await document.fonts.ready
    applyReaderPageLayout(required<HTMLElement>('.tikkun-page'), {
      layout,
      sides: 'two',
    })
    await new Promise((resolve) => setTimeout(resolve, 220))

    const sideSelector = (form: 'tikkun' | 'torah') =>
      layout === 'reading'
        ? `.reader-reading-page-side.mod-${form}`
        : `.reader-text-side.mod-${form}`
    const tikkun = required<HTMLElement>(sideSelector('tikkun'))
    const torah = required<HTMLElement>(sideSelector('torah'))
    const visibleVerseGutter = () => {
      const gutter = requiredAll<HTMLElement>('.line-gutter.mod-verses').find(
        (candidate) => getComputedStyle(candidate).display !== 'none',
      )
      if (!gutter) throw new Error('Missing visible verse gutter')
      return gutter
    }
    const verseGutter = visibleVerseGutter()
    expect(tikkun.textContent?.normalize('NFD')).toMatch(/\p{M}/u)
    expect(torah.textContent?.normalize('NFD')).not.toMatch(/\p{M}/u)
    expect(verseGutter.closest('.reader-text-side')).toBeNull()
    expect(getComputedStyle(verseGutter).display).toBe('flex')
    expect(getComputedStyle(required('.reader-text-forehead')).direction).toBe(
      'ltr',
    )

    const dividerRoot = required<HTMLElement>(
      layout === 'match' ? '.tikkun-page' : '.reader-reading-page',
    )
    const dividerStyle = getComputedStyle(dividerRoot, '::after')
    expect(dividerStyle.position).toBe('absolute')
    expect(dividerStyle.top).toBe('0px')
    expect(dividerStyle.bottom).toBe('0px')
    expect(dividerStyle.width).toBe('1px')
    expect(getComputedStyle(required('.line-content'), '::after').content).toBe(
      'none',
    )

    const center = (element: Element) => {
      const rect = element.getBoundingClientRect()
      return rect.left + rect.width / 2
    }
    const visibleHeading = (form: 'tikkun' | 'torah') => {
      const heading = requiredAll<HTMLElement>(
        `[data-reader-heading-form="${form}"]`,
      ).find((heading) => getComputedStyle(heading).opacity === '1')
      if (!heading) throw new Error(`Missing visible ${form} heading`)
      return heading
    }

    expect(center(tikkun)).toBeGreaterThan(center(torah))
    expect(center(verseGutter)).toBeGreaterThan(center(tikkun))
    expect(center(visibleHeading('tikkun'))).toBeGreaterThan(
      center(visibleHeading('torah')),
    )
    const fixedVerseGutterCenter = center(verseGutter)

    document.documentElement.dataset.readerSideOrder = 'torah-right'
    await new Promise((resolve) => setTimeout(resolve, 220))
    const swappedVerseGutter = visibleVerseGutter()
    expect(center(tikkun)).toBeLessThan(center(torah))
    expect(center(swappedVerseGutter)).toBeGreaterThan(center(torah))
    expect(center(swappedVerseGutter)).toBeCloseTo(fixedVerseGutterCenter, 1)
    expect(center(visibleHeading('tikkun'))).toBeLessThan(
      center(visibleHeading('torah')),
    )
  },
)

test.each([844, 1024, 1280, 1440, 1980])(
  'tightens Two Sided Match rhythm without changing justification or reported lines at %ipx',
  async (viewportWidth) => {
    await page.viewport(viewportWidth, 700)
    document.documentElement.dataset.readerSideOrder = 'tikkun-right'
    const vayishlach = renderedPage(36, vayishlachPage36Json)
    const oneSideMarkup = Page(vayishlach, {
      presentation: { layout: 'match', sides: 'one' },
    })
    install(`
      <div
        class="tikkun-book"
        data-test-reader="two-side-match"
        data-target-id="tikkun-book"
        data-reader-layout="match"
        data-reader-sides="two"
        style="height: 640px"
      >
        <section class="tikkun-page">${Page(vayishlach, {
          presentation: { layout: 'match', sides: 'two' },
        })}</section>
      </div>
      <div
        class="tikkun-book"
        data-test-reader="one-side-match"
        data-target-id="tikkun-book"
        data-reader-layout="match"
        data-reader-sides="one"
      >
        <section class="tikkun-page">${oneSideMarkup}</section>
      </div>
    `)
    await document.fonts.ready

    const twoSided = required<HTMLElement>(
      '[data-test-reader="two-side-match"]',
    )
    const oneSided = required<HTMLElement>(
      '[data-test-reader="one-side-match"]',
    )
    const twoSidedText = required<HTMLElement>(
      '[data-line-index="20"] .reader-text-side',
      twoSided,
    )
    const oneSidedText = required<HTMLElement>(
      '[data-line-index="20"] .reader-text-side',
      oneSided,
    )
    const twoSidedLineHeight = Number.parseFloat(
      getComputedStyle(
        required('[data-line-index="20"] .line-content', twoSided),
      ).lineHeight,
    )
    const oneSidedLineHeight = Number.parseFloat(
      getComputedStyle(
        required('[data-line-index="20"] .line-content', oneSided),
      ).lineHeight,
    )
    expect(twoSidedLineHeight).toBeLessThan(oneSidedLineHeight)
    expect(twoSidedLineHeight).toBeGreaterThanOrEqual(
      Number.parseFloat(getComputedStyle(twoSidedText).fontSize) * 1.08 - 0.1,
    )
    expect(getComputedStyle(twoSidedText).textAlign).toBe(
      getComputedStyle(oneSidedText).textAlign,
    )
    expect(getComputedStyle(twoSidedText).whiteSpace).toBe(
      getComputedStyle(oneSidedText).whiteSpace,
    )
    expect(getComputedStyle(twoSidedText).textAlign).toBe('justify')

    const rowTop = (root: ParentNode, lineIndex: number) =>
      required<HTMLElement>(
        `[data-line-index="${lineIndex}"] .line-content`,
        root,
      ).getBoundingClientRect().top
    expect(rowTop(twoSided, 21) - rowTop(twoSided, 20)).toBeLessThan(
      rowTop(oneSided, 21) - rowTop(oneSided, 20),
    )

    for (const lineIndex of [20, 21, 22, 23, 24, 25, 26, 27, 28]) {
      const line = required<HTMLElement>(
        `[data-line-index="${lineIndex}"]`,
        twoSided,
      )
      for (const side of requiredAll<HTMLElement>('.reader-text-side', line)) {
        const sideStyle = getComputedStyle(side)
        expect(sideStyle.textAlign).toBe('justify')
        const words = requiredAll<HTMLElement>('.word:not([hidden])', side)
        const tops = words.map((word) => word.getBoundingClientRect().top)
        expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(1)

        const sideRect = side.getBoundingClientRect()
        const leftEdge = Math.min(
          ...words.map((word) => word.getBoundingClientRect().left),
        )
        const rightEdge = Math.max(
          ...words.map((word) => word.getBoundingClientRect().right),
        )
        expect(Math.abs(leftEdge - sideRect.left)).toBeLessThanOrEqual(1)
        expect(Math.abs(rightEdge - sideRect.right)).toBeLessThanOrEqual(1)
        for (const word of words) {
          const rect = word.getBoundingClientRect()
          expect(rect.left).toBeGreaterThanOrEqual(sideRect.left - 1)
          expect(rect.right).toBeLessThanOrEqual(sideRect.right + 1)
        }
      }
    }
  },
)

test('leaves desktop One Side Match geometry identical to the existing reader', async () => {
  await page.viewport(1280, 700)
  const vayishlach = renderedPage(36, vayishlachPage36Json)
  const markup = Page(vayishlach, {
    presentation: { layout: 'match', sides: 'one' },
  })
  install(`
    <div
      class="tikkun-book"
      data-test-reader="one-side-match"
      data-reader-layout="match"
      data-reader-sides="one"
    >
      <section class="tikkun-page">${markup}</section>
    </div>
    <div class="tikkun-book" data-test-reader="legacy-one-side">
      <section class="tikkun-page">${markup}</section>
    </div>
  `)
  await document.fonts.ready

  const match = required<HTMLElement>('[data-test-reader="one-side-match"]')
  const legacy = required<HTMLElement>('[data-test-reader="legacy-one-side"]')
  const comparedSelectors = [
    '.tikkun-page',
    'table',
    '[data-line-index="20"]',
    '[data-line-index="20"] .line-content',
    '[data-line-index="20"] .reader-text-side',
  ]

  for (const selector of comparedSelectors) {
    const matchElement = required<HTMLElement>(selector, match)
    const legacyElement = required<HTMLElement>(selector, legacy)
    const matchStyle = getComputedStyle(matchElement)
    const legacyStyle = getComputedStyle(legacyElement)

    expect(matchStyle.fontSize).toBe(legacyStyle.fontSize)
    expect(matchStyle.lineHeight).toBe(legacyStyle.lineHeight)
    expect(matchStyle.whiteSpace).toBe(legacyStyle.whiteSpace)
    expect(matchElement.getBoundingClientRect().width).toBeCloseTo(
      legacyElement.getBoundingClientRect().width,
      1,
    )
  }
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
    graphemeRect,
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
    `${position.x}px`,
  )
})

test('switches once at the compact boundary while preserving genuine touch targets', async () => {
  install(`
    <header class="app-toolbar">
      <div class="toolbar-content">
        <button class="mobile-library-button">Home</button>
        <div class="mobile-aliyah-capsule">
          <button class="mobile-aliyah-play-toggle"><span data-target-id="mobile-current-aliyah">First</span></button>
          <button class="mobile-aliyah-picker-toggle" aria-label="Choose aliyah">⌄</button>
        </div>
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
  expect(getComputedStyle(required('.mobile-library-button')).display).toBe(
    'none',
  )

  await page.viewport(550, 900)
  expect(matchMedia(COMPACT_READER_QUERY).matches).toBe(true)
  expect(getComputedStyle(required('.mobile-library-button')).display).toBe(
    'flex',
  )
  expect(
    required('.mobile-library-button').getBoundingClientRect().height,
  ).toBeGreaterThanOrEqual(44)
  expect(
    required('.mobile-aliyah-capsule').getBoundingClientRect().width,
  ).toBeGreaterThanOrEqual(64)
  expect(
    required('.mobile-aliyah-capsule').getBoundingClientRect().height,
  ).toBeGreaterThanOrEqual(44)
  expect(
    required('.mobile-aliyah-play-toggle').getBoundingClientRect().width,
  ).toBeGreaterThan(
    required('.mobile-aliyah-picker-toggle').getBoundingClientRect().width,
  )
  expect(
    required('.mobile-aliyah-segment').getBoundingClientRect().height,
  ).toBe(44)
  expect(
    getComputedStyle(required('.mobile-aliyah-segments')).justifyContent,
  ).toBe('center')
  expect(getComputedStyle(required('.mobile-aliyah-grid')).direction).toBe(
    'rtl',
  )
  expect(getComputedStyle(required('.mobile-aliyah-card')).direction).toBe(
    'ltr',
  )

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
    'page-number-route-reveal',
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
  expect(
    getComputedStyle(required('[data-target-id="floating-next"]')).order,
  ).toBe('1')
  expect(
    getComputedStyle(required('[data-target-id="floating-play"]')).order,
  ).toBe('2')
  expect(
    getComputedStyle(required('[data-target-id="floating-prev"]')).order,
  ).toBe('3')
  expect(
    getComputedStyle(required('[data-target-id="floating-play"]')).boxShadow,
  ).toBe('none')

  await page.viewport(390, 844)
  document.documentElement.dataset.readerTheme = 'dark'
  expect(
    required('[data-target-id="floating-play"]').getBoundingClientRect().height,
  ).toBeGreaterThanOrEqual(44)
  expect(getComputedStyle(required('.mobile-aliyah-card-status')).color).toBe(
    'rgb(255, 255, 255)',
  )

  document.documentElement.dataset.readerTheme = 'light'
  expect(getComputedStyle(required('.mobile-aliyah-card-status')).color).toBe(
    'rgb(17, 17, 17)',
  )
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
    getComputedStyle(required('.parsha-picker')).transitionDuration,
  ).toContain('0.18s')
  expect(
    getComputedStyle(required('[data-tooltip]'), '::after').transform,
  ).not.toBe('none')

  const reducedMotionRules = styleRulesInsideMedia(
    '(prefers-reduced-motion: reduce)',
  )
  expect(
    reducedMotionRules.some(
      (rule) =>
        rule.selectorText.includes('.parsha-picker.mod-animate-open') &&
        rule.style.transition === 'none',
    ),
  ).toBe(true)
  expect(
    reducedMotionRules.some(
      (rule) =>
        rule.selectorText.includes('.reader-search-result-control') &&
        rule.style.transitionDuration === '0.01ms',
    ),
  ).toBe(true)
  expect(
    reducedMotionRules.some(
      (rule) =>
        rule.selectorText.includes('.mobile-library-button') &&
        rule.style.transition === 'none',
    ),
  ).toBe(true)
  expect(
    reducedMotionRules.some(
      (rule) =>
        rule.selectorText.includes('[data-tooltip]::after') &&
        rule.style.transitionDuration === '0.01ms',
    ),
  ).toBe(true)
})

function install(markup: string) {
  fixture = document.createElement('section')
  fixture.innerHTML = markup
  document.body.appendChild(fixture)
}

function required<T extends Element = HTMLElement>(
  selector: string,
  root: ParentNode | null = fixture,
): T {
  const element = root?.querySelector<T>(selector)
  if (!element) throw new Error(`Missing test element: ${selector}`)
  return element
}

function requiredAll<T extends Element = HTMLElement>(
  selector: string,
  root: ParentNode | null = fixture,
) {
  return [...(root?.querySelectorAll<T>(selector) ?? [])]
}

function renderedPage(
  pageNumber: number,
  lines: readonly {
    text: string[][]
    verses: { book: number; chapter: number; verse: number }[]
    isPetucha: boolean
  }[],
): RenderedPageInfo {
  let mostRecentRef: { b: number; c: number; v: number } | undefined
  return {
    type: 'page',
    contentIndex: pageNumber - 1,
    pageNumber,
    lines: lines.map((line) => {
      const verses = line.verses.map(({ book, chapter, verse }) => ({
        b: book,
        c: chapter,
        v: verse,
      }))
      const focalRef = mostRecentRef ?? verses[0]
      if (verses.length) mostRecentRef = verses[verses.length - 1]
      return {
        text: line.text,
        verses,
        focalRef,
        isPetucha: line.isPetucha,
        labels: [],
        aliyahStarts: [],
        run: undefined,
        aliyot: [],
      }
    }),
  }
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
