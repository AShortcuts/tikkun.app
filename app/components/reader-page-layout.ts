import type { ReaderPagePresentation } from '../reader-presentation.ts'
import { verseStartWordIndex } from '../reading/aliyah-token-sequence.ts'
import { applyAnnotationMode } from './annotation-rendering.ts'
import { SEA_SHIRAH_UNITS, seaShirahLayout } from './sea-shirah-layout.ts'

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
  required: number
  hasAliyahLabels: boolean
  measuredRows: WeakSet<HTMLElement>
  pageFirstSpanWidths: WeakMap<HTMLElement, number>
}
// Keep the song's measured tracks when a neighboring physical page is evicted.
const shirahWidths = new WeakMap<HTMLElement, Map<string, ShirahWidths>>()
const matchLineWidths = new WeakMap<HTMLElement, { font: string; width: number }>()

function measureOrdinaryMatchLines(page: HTMLElement) {
  const flows = [...page.querySelectorAll<HTMLElement>(
    'tr:not([data-shirah-kind]) .reader-text-flow',
  )]
  if (!flows.length) return 0
  const font = getComputedStyle(page).font
  const key = `${font}:${document.fonts.status}`
  const cached = matchLineWidths.get(flows[0])
  if (cached?.font === key) return cached.width

  const probe = document.createElement('div')
  probe.className = 'match-shirah-measure'
  probe.style.font = font
  probe.setAttribute('aria-hidden', 'true')
  const samples = flows.map((flow) => flow.cloneNode(true) as HTMLElement)
  probe.append(...samples)
  page.append(probe)
  let width = 0
  for (const annotations of [true, false]) {
    applyAnnotationMode(probe, annotations)
    width = Math.max(width, ...samples.map((flow) => flow.getBoundingClientRect().width))
  }
  probe.remove()
  matchLineWidths.set(flows[0], { font: key, width })
  return width
}

function ordinaryMatchSideWidth(page: HTMLElement) {
  return page.querySelector<HTMLElement>(
    'tr:not([data-shirah-kind]) .reader-text-side',
  )?.getBoundingClientRect().width ?? Infinity
}

function sizeMatchShirah(
  page: HTMLElement,
  sides: ReaderPagePresentation['sides'],
) {
  const book = page.closest<HTMLElement>('.tikkun-book')
  if (!book) return
  const kind = page.querySelector<HTMLElement>('tr[data-shirah-kind]')?.dataset
    .shirahKind
  if (!kind) return
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
    member.style.removeProperty('--match-shirah-inline-size')
    member.style.removeProperty('--match-shirah-inline-offset')
    member.style.removeProperty('--match-shirah-text-scale')
    member.style.removeProperty('--match-haazinu-gap')
  }

  const font = getComputedStyle(page).font
  const cache = shirahWidths.get(book) ?? new Map<string, ShirahWidths>()
  shirahWidths.set(book, cache)
  const key = `${kind}:${font}:${document.fonts.status}`
  const widths = cache.get(key) ?? {
    half: 0,
    gap: 0,
    trailingSpace: 0,
    required: 0,
    hasAliyahLabels: false,
    measuredRows: new WeakSet<HTMLElement>(),
    pageFirstSpanWidths: new WeakMap<HTMLElement, number>(),
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
  const unmeasuredRows = rows.filter((row) => !widths.measuredRows.has(row))
  const samples = unmeasuredRows.map((row) => ({
    page: row.closest<HTMLElement>('.tikkun-page')!,
    seaLayout: seaShirahLayout(
      Number(row.dataset.pageNumber),
      Number(row.dataset.lineIndex),
    ),
    fragments: [...row.querySelectorAll<HTMLElement>('.fragment')].map(
      (fragment) => {
        const clone = fragment.cloneNode(true) as HTMLElement
        probe.append(clone)
        return clone
      },
    ),
  }))
  if (samples.length || (kind === 'haazinu' && !widths.gap)) book.append(probe)
  if (kind === 'haazinu' && !widths.gap) {
    widths.gap = gapSample.getBoundingClientRect().width
    // The original justification pseudo-element retained one trailing space.
    widths.trailingSpace = spaceSample.getBoundingClientRect().width
  }
  // Measure both existing forms at natural width, before justification stretches spaces.
  for (const annotations of [true, false]) {
    applyAnnotationMode(probe, annotations)
    for (const { page: member, seaLayout, fragments } of samples) {
      const measured = fragments.map(
        (fragment) => fragment.getBoundingClientRect().width,
      )
      if (seaLayout) {
        // Font measurement fits the whole template; it never moves its gaps.
        seaLayout.tracks.forEach(([, span], index) => {
          widths.required = Math.max(
            widths.required,
            ((measured[index] + 1) * SEA_SHIRAH_UNITS) / span,
          )
        })
      } else {
        widths.half = Math.max(widths.half, ...measured)
        widths.pageFirstSpanWidths.set(member, Math.max(
          widths.pageFirstSpanWidths.get(member) ?? 0,
          measured[0],
        ))
      }
    }
  }
  probe.remove()
  unmeasuredRows.forEach((row) => widths.measuredRows.add(row))
  cache.set(key, widths)

  if (kind === 'haazinu' && sides === 'one') {
    pages.forEach((member) => member.style.setProperty(
      '--match-haazinu-page-first-span-width',
      `${(widths.pageFirstSpanWidths.get(member) ?? 0) + widths.trailingSpace}px`,
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
  const required = kind === 'sea' ? widths.required : 2 * widths.half + gap
  widths.hasAliyahLabels ||= rows.some((row) =>
    row.querySelector('.line-gutter.mod-aliyot')?.textContent?.trim(),
  )
  const line = rows[0].querySelector<HTMLElement>('.line')!
  const gutterColumns = getComputedStyle(line)
    .gridTemplateColumns.split(' ')
    .map(Number.parseFloat)
  const showAliyahLabels =
    widths.hasAliyahLabels && (gutterColumns[3] ?? 0) > 0
  let gutterWidth =
    gutterColumns[2] + (showAliyahLabels ? gutterColumns[3] : 0)
  if (kind === 'haazinu' || sides === 'two') {
    // Compact One Side uses an overhanging verse rail instead of a grid track.
    if (gutterColumns[2] === 0) {
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
    }
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
    return
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
    member.style.setProperty(
      '--match-shirah-inline-offset',
      `${right - contentRects[index].right}px`,
    )
    member.style.setProperty(
      '--match-shirah-aliyah-display',
      widths.hasAliyahLabels ? 'flex' : 'none',
    )
  })
}

function synchronizeReadingWordWidths(page: HTMLElement) {
  clearPairedWordWidths(page)
  const torahWordsByToken = new Map<string, HTMLElement>()

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
    tikkunWord.style.setProperty('--reader-paired-word-width', value)
    torahWord.style.setProperty('--reader-paired-word-width', value)
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
  page.style.removeProperty('--reading-shirah-inline-size')
  page.style.removeProperty('--match-shirah-inline-expansion')
  page.style.removeProperty('--match-shirah-inline-offset')
  page.style.removeProperty('--match-shirah-inline-size')
  page.style.removeProperty('--match-shirah-aliyah-display')
  page.style.removeProperty('--match-shirah-text-scale')
  page.style.removeProperty('--match-text-scale')
  page.style.removeProperty('--match-haazinu-gap')

  clearPairedWordWidths(page)

  if (presentation.layout === 'match') {
    // Ordinary lines fit independently of any shirah sharing their physical page.
    if (presentation.sides === 'two') {
      const required = measureOrdinaryMatchLines(page)
      if (required) {
        const scale = Math.min(1, (ordinaryMatchSideWidth(page) - 1) / (required + 2))
        page.style.setProperty('--match-text-scale', `${scale}em`)
      }
    }
    sizeMatchShirah(page, presentation.sides)
    return
  }

  if (presentation.sides === 'two') {
    synchronizeReadingWordWidths(page)
    positionTwoSidedReadingGutters(page)
  } else {
    positionOneSidedReadingGutters(page)
  }
}
