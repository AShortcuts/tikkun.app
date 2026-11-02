import { afterEach, expect, test } from 'vitest'
import { page } from 'vitest/browser'
import { COMPACT_READER_QUERY } from '../adaptive/reader-viewport.ts'
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
  delete document.documentElement.dataset.readerIsolated
  delete document.documentElement.dataset.readerPhone
  delete document.documentElement.dataset.verseNumbers
})

test.each([{ width: 390, height: 844, layout: 'reading' as const, sides: 'one' as const, reclaim: true }])('hiding pasuk numbers reclaims mobile Reading space only: $layout/$sides at $width', async ({ width, height, layout, sides, reclaim }) => {
  await page.viewport(width, height)
  document.documentElement.dataset.readerSideOrder = 'tikkun-right'
  const presentation = { layout, sides }
  install(`<div class="tikkun-book mod-annotations-on" data-target-id="tikkun-book" data-reader-layout="${layout}" data-reader-sides="${sides}" dir="rtl">
    <section class="tikkun-page">${Page(renderedPage(37, vayishlachPageJson), { presentation })}</section>
  </div>`)
  await document.fonts.ready
  const member = required<HTMLElement>('.tikkun-page')
  const book = required<HTMLElement>('.tikkun-book')
  const measure = () => {
    const container = sides === 'one' && layout === 'reading' ? book : required<HTMLElement>(layout === 'reading' ? '.reader-reading-page-side.mod-tikkun' : '.line-content')
    const style = getComputedStyle(container)
    return container.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
  }
  applyReaderPageLayout(member, presentation)
  const originalWidth = measure()
  const tokens = requiredAll<HTMLElement>('.word[data-token-key]').map(word => word.dataset.tokenKey)
  document.documentElement.dataset.verseNumbers = 'off'
  applyReaderPageLayout(member, presentation)
  if (reclaim) expect(measure()).toBeGreaterThan(originalWidth + 30)
  else expect(measure()).toBeCloseTo(originalWidth, 1)
  expect(getComputedStyle(required('.line-gutter.mod-verses')).visibility).toBe('hidden')
  expect(requiredAll<HTMLElement>('.word[data-token-key]').map(word => word.dataset.tokenKey)).toEqual(tokens)
  expect(book.scrollWidth).toBeLessThanOrEqual(book.clientWidth + 1)
  document.documentElement.dataset.verseNumbers = 'on'
  applyReaderPageLayout(member, presentation)
  expect(measure()).toBeCloseTo(originalWidth, 1)
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
  ).toBeCloseTo(1.85, 2)
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

test.each([{
    label: 'Haazinu',
    pageNumber: 242,
    lines: haazinuPageJson,
    kind: 'haazinu',
  }])(
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

test.each([768])(
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

test.each([{ width: 390, sides: 'one' as const }])('keeps Reading maqaf groups on one line at $width px/$sides', async ({ width, sides }) => {
  await page.viewport(width, 900)
  document.documentElement.dataset.readerSideOrder = 'tikkun-right'
  const presentation = { layout: 'reading', sides } as const
  install(`<div class="tikkun-book" data-reader-layout="reading" data-reader-sides="${sides}" dir="rtl">
    <section class="tikkun-page">${Page(renderedPage(78, beshalachPageJson), {
      presentation,
    })}</section></div>`)
  await document.fonts.ready
  const book = required<HTMLElement>('.tikkun-book')
  const readingPage = required<HTMLElement>('.tikkun-page')
  const words = requiredAll<HTMLElement>('[data-reader-canonical="true"] .word', book)
  const maqafWords = words.filter((word) => word.textContent?.includes('\u05be'))
  const originalTokens = words.map((word) => [word.dataset.tokenKey, word.textContent])
  expect(maqafWords.length).toBeGreaterThan(10)

  for (const scale of [1, 1.5]) {
    book.style.setProperty('--reading-font-scale', `${scale}`)
    applyReaderPageLayout(readingPage, presentation)
    for (const word of maqafWords) {
      const range = document.createRange()
      range.selectNodeContents(word)
      const rects = [...range.getClientRects()]
      expect(rects.length).toBeGreaterThan(0)
      for (const rect of rects) {
        expect(rect.top, `${word.textContent} at ${scale}x`).toBeCloseTo(rects[0].top, 0)
        expect(rect.left).toBeGreaterThanOrEqual(book.getBoundingClientRect().left - 1)
        expect(rect.right).toBeLessThanOrEqual(book.getBoundingClientRect().right + 1)
      }
    }
    for (const side of requiredAll<HTMLElement>('.reader-reading-page-side')) {
      const sideWords = requiredAll<HTMLElement>('.word:not([hidden])', side)
      sideWords.forEach((word, index) => {
        if (!word.textContent?.endsWith('\u05be') || !sideWords[index + 1]) return
        expect(sideWords[index + 1].getBoundingClientRect().top, `${word.textContent} source boundary at ${scale}x`)
          .toBeCloseTo(word.getBoundingClientRect().top, 0)
      })
    }
  }

  applyAnnotationMode(book, false)
  applyReaderPageLayout(readingPage, presentation)
  applyAnnotationMode(book, true)
  applyReaderPageLayout(readingPage, presentation)
  expect(words.map((word) => [word.dataset.tokenKey, word.textContent])).toEqual(originalTokens)
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
    // Only the outer side shows verse numbers.
    if (verseGutter.getClientRects().length) {
      expect(verticalCenter(verseGutter)).toBeCloseTo(verticalCenter(verseStartWord), 1)
    }
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

function install(markup: string) {
  fixture = document.createElement('section')
  fixture.innerHTML = markup
  document.body.appendChild(fixture)
}

function verticalCenter(element: Element) {
  const rect = element.getBoundingClientRect()
  return rect.top + rect.height / 2
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
