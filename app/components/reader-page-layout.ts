import type { ReaderPagePresentation } from '../reader-presentation.ts'
import { verseStartWordIndex } from '../reading/aliyah-token-sequence.ts'
import { applyAnnotationMode } from './annotation-rendering.ts'
import { seaShirahGeometry, seaShirahLayout, type SeaShirahMeasurements } from './sea-shirah-layout.ts'
import { matchShirahSamples } from './match-shirah-source.ts'

const visibleWords = (root: ParentNode, selector: string) =>
  [...root.querySelectorAll<HTMLElement>(selector)].filter(
    (word) => !word.hidden && word.getClientRects().length > 0,
  )

function clearPairedWordWidths(page: HTMLElement) {
  page
    .querySelectorAll<HTMLElement>('.word[data-token-key]')
    .forEach((word) => word.style.removeProperty('--reader-paired-word-width'))
}

type ShirahWidths = {
  half: number
  gap: number
  trailingSpace: number
  sea: SeaShirahMeasurements
  pageFirstSpanWidths: Map<number, number>
}
// Keep the song's measured tracks when a neighboring physical page is evicted.
const shirahWidths = new WeakMap<HTMLElement, Map<string, ShirahWidths>>()
type MatchLineWidth = { width: number; fixedInsets: number }
const matchLineWidths = new WeakMap<HTMLElement, { font: string; widths: MatchLineWidth[] }>()

export function readerPageFont(page: HTMLElement) {
  const style = getComputedStyle(page)
  // Forced-colors mode can leave the computed font shorthand empty. Read the
  // actual typeface metrics explicitly instead of caching a fallback font.
  return `${style.fontStyle} ${style.fontWeight} ${style.fontSize}/${style.lineHeight} ${style.fontFamily}`
}

function measureOrdinaryMatchLines(page: HTMLElement) {
  const flows = [...page.querySelectorAll<HTMLElement>(
    'tr:not([data-shirah-kind]) [data-reader-canonical="true"] .reader-text-flow',
  )]
  if (!flows.length) return []
  const font = readerPageFont(page)
  const cached = matchLineWidths.get(flows[0])
  if (cached?.font === font && document.fonts.check(font, 'אשר')) return cached.widths

  const probe = document.createElement('div')
  probe.className = 'match-shirah-measure'
  probe.style.font = font
  probe.setAttribute('aria-hidden', 'true')
  // Samples must be independent of the live column's constrained width.
  const samples = flows.map((flow) => flow.cloneNode(true) as HTMLElement)
  probe.append(...samples)
  document.body.append(probe)
  const widths: MatchLineWidth[] = []
  for (const annotations of [true, false]) {
    applyAnnotationMode(probe, annotations)
    for (const flow of samples) {
      // Kri/ktiv badges retain rem padding and pixel borders when the glyphs
      // get smaller. Those insets cannot be multiplied by the text-fit scale.
      const fixedInsets = [...flow.querySelectorAll<HTMLElement>('.ktiv-kri:not([hidden])')].reduce((sum, word) => {
        const style = getComputedStyle(word)
        return sum + Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight)
          + Number.parseFloat(style.borderLeftWidth) + Number.parseFloat(style.borderRightWidth)
      }, 0)
      widths.push({ width: flow.getBoundingClientRect().width, fixedInsets })
    }
  }
  probe.remove()
  if (document.fonts.check(font, 'אשר')) {
    matchLineWidths.set(flows[0], { font, widths })
  }
  return widths
}

function sizeOrdinaryMatchLines(page: HTMLElement, sides: ReaderPagePresentation['sides']) {
  if (sides === 'one' && !window.matchMedia('(min-width: 551px)').matches) return
  const row = page.querySelector<HTMLElement>('tr:not([data-shirah-kind])')
  const book = page.closest<HTMLElement>('.tikkun-book')
  const table = page.querySelector('table')
  if (!row || !book || !table || book.clientWidth === 0) return

  const measured = measureOrdinaryMatchLines(page)
  const required = Math.max(...measured.map((line) => line.width)) + 2
  const content = row.querySelector<HTMLElement>('.line-content')!
  const original = content.getBoundingClientRect()
  const divider = sides === 'two' ? 1 + 2 * Number.parseFloat(getComputedStyle(content).columnGap) : 0
  const copies = sides === 'two' ? 2 : 1
  const desired = copies * required + divider
  if (desired <= original.width) return

  const bookRect = book.getBoundingClientRect()
  const tracks = getComputedStyle(row.querySelector('.line')!).gridTemplateColumns.split(' ').map(Number.parseFloat)
  const gutter = tracks[2] + tracks[3]
  const edge = Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
  const center = (original.left + original.right) / 2
  const available = sides === 'two'
    ? 2 * Math.min(center - bookRect.left - edge, bookRect.right - gutter - edge - center)
    : bookRect.width - gutter - 2 * edge
  const width = Math.max(original.width, Math.min(desired, available))
  const right = sides === 'two' ? center + width / 2 : Math.min(center + width / 2, bookRect.right - gutter - edge)

  // Borrow unused margins first. Freeze the original table measure so fitting
  // its contents cannot feed back into the next intrinsic-width calculation.
  table.style.width = getComputedStyle(table).width
  page.classList.add('mod-match-fitted')
  page.style.setProperty('--match-ordinary-inline-size', `${width}px`)
  page.style.setProperty('--match-ordinary-inline-offset', `${right - original.right}px`)
  const sideWidth = (width - divider) / copies
  const scale = Math.min(1, ...measured.map((line) =>
    (sideWidth - line.fixedInsets) / (line.width - line.fixedInsets + 2),
  ))
  page.style.setProperty('--match-text-scale', `${scale}em`)
}

function clearMatchSongFrame(page: HTMLElement) {
  page.classList.remove('mod-match-song-frame')
  for (const property of ['inline-size', 'inline-offset', 'gutter-inline-offset', 'ordinary-flow-size', 'shirah-flow-size']) {
    page.style.removeProperty(`--match-page-${property}`)
  }
}

function alignMatchSongFrame(page: HTMLElement, sides: ReaderPagePresentation['sides']) {
  if (sides === 'one' && !window.matchMedia('(min-width: 551px)').matches) return
  const ordinary = page.querySelector<HTMLElement>('tr:not([data-shirah-kind]) .line-content')
  const song = page.querySelector<HTMLElement>('tr[data-shirah-kind] .line-content')
  const book = page.closest('.tikkun-book')
  if (!ordinary || !song || !book) return

  const ordinaryRect = ordinary.getBoundingClientRect()
  const songRect = song.getBoundingClientRect()
  const frame = ordinaryRect.width > songRect.width ? ordinaryRect : songRect
  const transform = getComputedStyle(song).transform
  const originalRight = songRect.right - (transform === 'none' ? 0 : new DOMMatrixReadOnly(transform).m41)
  const table = page.querySelector('table')!
  table.style.width = getComputedStyle(table).width
  // Keep both existing text measures and row pitches. Only their shared page
  // frame changes; each mirrored flow centers inside its own side of it.
  page.style.setProperty('--match-page-ordinary-flow-size', `${ordinary.querySelector('.reader-text-flow')!.getBoundingClientRect().width}px`)
  page.style.setProperty('--match-page-shirah-flow-size', `${song.querySelector('.reader-text-flow')!.getBoundingClientRect().width}px`)
  page.style.setProperty('--match-page-inline-size', `${frame.width}px`)
  page.style.setProperty('--match-page-inline-offset', `${frame.right - originalRight}px`)
  page.classList.add('mod-match-song-frame')
  // A wider ordinary-text frame must not push the song's verse labels offscreen.
  const bookRight = book.getBoundingClientRect().right
  const labels = [...page.querySelectorAll<HTMLElement>('.location-indicator.mod-verses')]
  const overhang = Math.max(0, ...labels.map((label) => label.getBoundingClientRect().right - bookRight + 1))
  page.style.setProperty('--match-page-gutter-inline-offset', `${frame.right - originalRight - overhang}px`)
}

function sizeMatchShirah(
  page: HTMLElement,
  sides: ReaderPagePresentation['sides'],
) {
  const book = page.closest<HTMLElement>('.tikkun-book')
  if (!book || book.clientWidth === 0) return
  const kind = page.querySelector<HTMLElement>('tr[data-shirah-kind]')?.dataset
    .shirahKind
  if (kind !== 'sea' && kind !== 'haazinu') return
  if (
    kind !== 'haazinu' &&
    sides === 'one' && !window.matchMedia('(min-width: 551px)').matches
  ) return

  const rows = [
    ...book.querySelectorAll<HTMLElement>(`tr[data-shirah-kind="${kind}"]`),
  ]
  const pages = [
    ...new Set(rows.map((row) => row.closest<HTMLElement>('.tikkun-page')!)),
  ]
  for (const member of pages) {
    clearMatchSongFrame(member)
    member.style.removeProperty('--match-shirah-inline-size')
    member.style.removeProperty('--match-shirah-inline-offset')
    member.style.removeProperty('--match-shirah-text-scale')
    member.style.removeProperty('--match-haazinu-gap')
  }

  const font = readerPageFont(page)
  const cache = shirahWidths.get(book) ?? new Map<string, ShirahWidths>()
  shirahWidths.set(book, cache)
  const key = `${kind}:${font}`
  const widths = cache.get(key) ?? {
    half: 0,
    gap: 0,
    trailingSpace: 0,
    sea: {},
    pageFirstSpanWidths: new Map<number, number>(),
  }
  const probe = document.createElement('div')
  probe.className = 'match-shirah-measure'
  probe.style.font = font
  probe.setAttribute('aria-hidden', 'true')
  const gapSample = document.createElement('span')
  gapSample.className = 'fragment'
  gapSample.textContent = 'אשר אשר אשר'
  const spaceSample = document.createElement('span')
  spaceSample.textContent = '\u00a0'
  probe.append(gapSample, spaceSample)
  const samples = widths.gap ? [] : matchShirahSamples(kind).map(({ pageNumber, lineIndex, markup }) => {
    const source = document.createElement('div')
    source.innerHTML = markup
    const fragments = [...source.querySelectorAll<HTMLElement>('.fragment')]
    probe.append(...fragments)
    return { pageNumber, seaLayout: seaShirahLayout(pageNumber, lineIndex), fragments }
  })
  if (samples.length || !widths.gap) document.body.append(probe)
  if (!widths.gap) {
    widths.gap = gapSample.getBoundingClientRect().width
    // The original justification pseudo-element retained one trailing space.
    widths.trailingSpace = spaceSample.getBoundingClientRect().width
  }
  // Measure both existing forms at natural width, before justification stretches spaces.
  for (const annotations of [true, false]) {
    applyAnnotationMode(probe, annotations)
    for (const { pageNumber, seaLayout, fragments } of samples) {
      const measured = fragments.map(
        (fragment) => fragment.getBoundingClientRect().width,
      )
      if (seaLayout) {
        const trackWidths = widths.sea[seaLayout.pattern] ?? []
        measured.forEach((width, index) => {
          trackWidths[index] = Math.max(trackWidths[index] ?? 0, width + 1)
        })
        widths.sea[seaLayout.pattern] = trackWidths
      } else {
        widths.half = Math.max(widths.half, ...measured)
        widths.pageFirstSpanWidths.set(pageNumber, Math.max(
          widths.pageFirstSpanWidths.get(pageNumber) ?? 0,
          measured[0],
        ))
      }
    }
  }
  probe.remove()
  if (document.fonts.check(font, 'אשר')) cache.set(key, widths)

  const sea = kind === 'sea' ? seaShirahGeometry(widths.sea, widths.gap) : null
  if (sea) {
    const fontSize = Number.parseFloat(getComputedStyle(page).fontSize)
    pages.forEach((member) => {
      member.style.setProperty('--match-sea-outer', `${sea.outer / fontSize}em`)
      member.style.setProperty('--match-sea-middle', `${sea.middle / fontSize}em`)
      member.style.setProperty('--match-sea-half', `${sea.half / fontSize}em`)
      member.style.setProperty('--match-sea-extended-left', `${sea.extendedLeft / fontSize}em`)
      member.style.setProperty('--match-sea-penultimate-right', `${sea.penultimateRight / fontSize}em`)
      member.style.setProperty('--match-sea-gap', `${widths.gap / fontSize}em`)
    })
  }

  if (kind === 'haazinu' && sides === 'one') {
    pages.forEach((member) => member.style.setProperty(
      '--match-haazinu-page-first-span-width',
      `${(widths.pageFirstSpanWidths.get(Number(member.querySelector('table')?.dataset.pageNumber)) ?? 0) + widths.trailingSpace}px`,
    ))
  }

  const contentRects = pages.map((member) =>
    member
      .querySelector<HTMLElement>(
        `tr[data-shirah-kind="${kind}"] .line-content`,
      )!
      .getBoundingClientRect(),
  )
  const gapOwner = rows[0].querySelector<HTMLElement>(
    kind === 'haazinu' ? '.reader-text-flow' : '.column',
  )!
  const gap =
    kind === 'haazinu'
      ? widths.gap
      : Number.parseFloat(getComputedStyle(gapOwner).columnGap)
  const bookRect = book.getBoundingClientRect()
  const safeEdge = Number.parseFloat(
    getComputedStyle(document.documentElement).fontSize,
  )
  const required = sea?.required ?? 2 * widths.half + gap
  // Haazinu has aliyah starts across both pages. Reserve its rail even when
  // the page carrying a label is not mounted; UI font loading is irrelevant.
  const hasAliyahLabels = kind === 'haazinu' || rows.some((row) =>
    row.querySelector('.line-gutter.mod-aliyot')?.textContent?.trim(),
  )
  const line = rows[0].querySelector<HTMLElement>('.line')!
  const gutterColumns = getComputedStyle(line)
    .gridTemplateColumns.split(' ')
    .map(Number.parseFloat)
  const showAliyahLabels =
    hasAliyahLabels && (gutterColumns[3] ?? 0) > 0
  let gutterWidth =
    gutterColumns[2] + (showAliyahLabels ? gutterColumns[3] : 0)
  if (kind === 'haazinu' || sides === 'two') {
    // Verse ranges use the UI font and can exceed their nominal Torah-font
    // track. Include that overhang, also used by compact One Side's verse rail.
    gutterWidth = Math.max(
      gutterWidth,
      ...rows.map((row) => {
        const label = row.querySelector<HTMLElement>(
          '.location-indicator.mod-verses',
        )
        const content = row.querySelector<HTMLElement>('.line-content')!
        return label
          ? label.getBoundingClientRect().right - content.getBoundingClientRect().right
          : 0
      }),
    )
    const copies = sides === 'two' ? 2 : 1
    const content = rows[0].querySelector<HTMLElement>('.line-content')!
    const dividerWidth =
      sides === 'two'
        ? 1 + 2 * Number.parseFloat(getComputedStyle(content).columnGap)
        : 0
    const naturalWidth = copies * (required + 2)
    const desiredWidth = Math.ceil(naturalWidth + dividerWidth)
    const edge = Math.min(
      safeEdge,
      Math.max(2, (bookRect.width - gutterWidth - desiredWidth) / 2),
    )
    // Keep the paired layout centered on the existing continuous divider.
    const center =
      sides === 'two'
        ? (contentRects[0].left + contentRects[0].right) / 2
        : (bookRect.left + bookRect.right) / 2
    const availableWidth =
      sides === 'two'
        ? 2 * Math.min(
            center - bookRect.left - edge,
            bookRect.right - gutterWidth - edge - center,
          )
        : bookRect.width - gutterWidth - 2 * edge
    const scale = Math.min(
      1,
      (availableWidth - dividerWidth) / naturalWidth,
    )
    const width = sides === 'two'
      ? naturalWidth * scale + dividerWidth
      : Math.min(desiredWidth, availableWidth)
    const right =
      sides === 'two'
        ? center + width / 2
        : Math.min(center + width / 2, bookRect.right - gutterWidth - edge)
    const fontSize = Number.parseFloat(getComputedStyle(page).fontSize)
    pages.forEach((member, index) => {
      member.style.setProperty('--match-shirah-inline-size', `${width}px`)
      member.style.setProperty(
        '--match-shirah-inline-offset',
        `${right - contentRects[index].right}px`,
      )
      // Only glyphs and horizontal geometry fit; the existing row pitch is inherited.
      member.style.setProperty('--match-shirah-text-scale', `${scale}em`)
      member.style.setProperty('--match-haazinu-gap', `${gap / fontSize}em`)
      member.style.setProperty(
        '--match-shirah-aliyah-display',
        showAliyahLabels ? 'flex' : 'none',
      )
    })
    return pages
  }
  const desiredWidth = Math.ceil(required + 1)
  // Keep the song clear of the reader's left overlay scrollbar. On tight
  // widths, borrow the outer right margin before intruding into that rail.
  const leftEdge = safeEdge
  const rightEdge = Math.min(
    safeEdge,
    Math.max(2, bookRect.width - gutterWidth - leftEdge - desiredWidth),
  )
  const width = Math.min(
    desiredWidth,
    bookRect.width - gutterWidth - leftEdge - rightEdge,
  )
  const right = Math.min(
    (bookRect.left + bookRect.right + width) / 2,
    bookRect.right - gutterWidth - rightEdge,
  )

  pages.forEach((member, index) => {
    member.style.setProperty('--match-shirah-inline-size', `${width}px`)
    member.style.setProperty('--match-shirah-text-scale', `${Math.min(1, width / desiredWidth)}em`)
    member.style.setProperty(
      '--match-shirah-inline-offset',
      `${right - contentRects[index].right}px`,
    )
    member.style.setProperty(
      '--match-shirah-aliyah-display',
      hasAliyahLabels ? 'flex' : 'none',
    )
  })
  return pages
}

function synchronizeReadingWordWidths(page: HTMLElement) {
  clearPairedWordWidths(page)
  const torahWordsByToken = new Map<string, HTMLElement>()
  const updates: { torah: HTMLElement; tikkun: HTMLElement; width: string }[] = []

  for (const word of visibleWords(
    page,
    '.reader-reading-page-side.mod-torah .word[data-token-key]',
  )) {
    const tokenKey = word.dataset.tokenKey
    if (tokenKey) torahWordsByToken.set(tokenKey, word)
  }

  for (const tikkunWord of visibleWords(
    page,
    '.reader-reading-page-side.mod-tikkun .word[data-token-key]',
  )) {
    const tokenKey = tikkunWord.dataset.tokenKey
    const torahWord = tokenKey ? torahWordsByToken.get(tokenKey) : undefined
    if (!torahWord) continue

    const tikkunFontSize = Number.parseFloat(
      getComputedStyle(tikkunWord).fontSize,
    )
    const torahFontSize = Number.parseFloat(
      getComputedStyle(torahWord).fontSize,
    )
    const fontSize = Math.max(tikkunFontSize, torahFontSize)
    if (!Number.isFinite(fontSize) || fontSize <= 0) continue

    const pairedWidth = Math.max(
      tikkunWord.getBoundingClientRect().width,
      torahWord.getBoundingClientRect().width,
    )
    const value = `${(pairedWidth / fontSize).toFixed(4)}em`
    updates.push({ torah: torahWord, tikkun: tikkunWord, width: value })
  }
  // Measure the natural widths first; interleaved writes force layout per word.
  for (const { torah, tikkun, width } of updates) {
    tikkun.style.setProperty('--reader-paired-word-width', width)
    torah.style.setProperty('--reader-paired-word-width', width)
  }
}

function positionTwoSidedReadingGutters(page: HTMLElement) {
  const readingPage = page.querySelector<HTMLElement>('.reader-reading-page')
  const book = page.closest<HTMLElement>('.tikkun-book')
  if (!readingPage || !book) return
  const pageRect = readingPage.getBoundingClientRect()

  for (const side of page.querySelectorAll<HTMLElement>(
    '.reader-reading-page-side',
  )) {
    const surfaceClass = side.classList.contains('mod-torah')
      ? 'mod-torah'
      : 'mod-tikkun'
    const allLines = [
      ...book.querySelectorAll<HTMLElement>(
        `.reader-reading-page-side.${surfaceClass} .mod-reading-line`,
      ),
    ]

    for (const line of side.querySelectorAll<HTMLElement>(
      '.mod-reading-line',
    )) {
      const gutter = line.querySelector<HTMLElement>('.line-gutter.mod-verses')
      if (!gutter?.textContent?.trim()) continue

      const lineIndex = allLines.indexOf(line)
      const currentLineWords = visibleWords(line, '.word[data-token-key]')
      const previousLineWords =
        lineIndex > 0
          ? visibleWords(allLines[lineIndex - 1], '.word[data-token-key]')
          : []
      const startWordIndex = verseStartWordIndex({
        currentLineWords,
        previousLineWords,
        verseOrdinal: 0,
      })
      const anchorWord = currentLineWords[startWordIndex] ?? currentLineWords[0]
      if (!anchorWord) continue

      gutter.style.setProperty(
        '--reading-verse-gutter-top',
        `${anchorWord.getBoundingClientRect().top - pageRect.top}px`,
      )
    }
  }
}

function positionOneSidedReadingGutters(page: HTMLElement) {
  const book = page.closest<HTMLElement>('.tikkun-book')
  if (!book) return

  const bookRect = book.getBoundingClientRect()
  const allLines = [
    ...book.querySelectorAll<HTMLElement>(
      '.mod-reading-line[data-class="line"]',
    ),
  ]

  for (const line of page.querySelectorAll<HTMLElement>(
    '.mod-reading-line[data-class="line"]',
  )) {
    const gutter = line.querySelector<HTMLElement>('.line-gutter.mod-verses')
    if (!gutter?.textContent?.trim()) continue

    const lineIndex = allLines.indexOf(line)
    const currentLineWords = visibleWords(
      line,
      '[data-reader-canonical="true"] .word[data-token-key]',
    )
    const previousLineWords =
      lineIndex > 0
        ? visibleWords(
            allLines[lineIndex - 1],
            '[data-reader-canonical="true"] .word[data-token-key]',
          )
        : []
    const startWordIndex = verseStartWordIndex({
      currentLineWords,
      previousLineWords,
      verseOrdinal: 0,
    })
    const anchorWord = currentLineWords[startWordIndex] ?? currentLineWords[0]
    if (!anchorWord) continue

    gutter.style.setProperty(
      '--reading-verse-gutter-top',
      `${anchorWord.getBoundingClientRect().top - bookRect.top + book.scrollTop}px`,
    )
  }
}

export function applyReaderPageLayout(
  page: HTMLElement,
  presentation: ReaderPagePresentation,
) {
  clearMatchSongFrame(page)
  page.style.removeProperty('--reading-shirah-inline-size')
  page.style.removeProperty('--match-shirah-inline-expansion')
  page.style.removeProperty('--match-shirah-inline-offset')
  page.style.removeProperty('--match-shirah-inline-size')
  page.style.removeProperty('--match-shirah-aliyah-display')
  page.style.removeProperty('--match-shirah-text-scale')
  page.style.removeProperty('--match-text-scale')
  page.style.removeProperty('--match-haazinu-gap')
  page.style.removeProperty('--match-ordinary-inline-size')
  page.style.removeProperty('--match-ordinary-inline-offset')
  page.classList.remove('mod-match-fitted')
  page.querySelector('table')?.style.removeProperty('width')

  clearPairedWordWidths(page)

  if (presentation.layout === 'match') {
    const songPages = sizeMatchShirah(page, presentation.sides)
    // Ordinary lines fit independently of any shirah sharing their physical page.
    sizeOrdinaryMatchLines(page, presentation.sides)
    songPages?.forEach((member) => alignMatchSongFrame(member, presentation.sides))
    return
  }

  if (presentation.sides === 'two') {
    synchronizeReadingWordWidths(page)
    positionTwoSidedReadingGutters(page)
  } else {
    positionOneSidedReadingGutters(page)
  }
}
