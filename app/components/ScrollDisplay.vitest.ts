import { LeiningGenerator } from '../calendar-model/generator'
import type { UserSettings } from '../calendar-model/user-settings'
import { last } from '../calendar-model/utils'
import { type ScrollContentSource, ScrollViewModel } from '../view-model/scroll-view-model'
import type { LeiningRun } from '../calendar-model/model-types.ts'
import type { RefWithScroll } from '../ref.ts'
import { createIsolatedAliyahViewModel } from '../reading/isolated-aliyah-view.ts'
import { resolveParshaRun } from '../view-model/navigation/parsha-routes.ts'
import { applyAnnotationMode } from './annotation-rendering.ts'
import { ScrollDisplay } from './ScrollDisplay'
import { getCenteredElementScrollTop, getReaderFocalPointClientY, setReaderFocalPointMode } from '../reader-scroll'
import '/css/master.css'

import { afterEach, beforeEach, expect, test, vi } from 'vitest'

const testSettings: UserSettings = {
  ashkenazi: true,
  includeModernHolidays: false,
  israel: false,
}

const generator = new LeiningGenerator(testSettings)

// TODO(later): Consider extracting this to a shared helper
let root: HTMLDivElement
let vm: ScrollViewModel
const displays: ScrollDisplay[] = []

function createDisplay() {
  const display = new ScrollDisplay(vm, root)
  displays.push(display)
  return display
}

beforeEach(() => {
  root = document.createElement('div')
  root.className = 'tikkun-book mod-annotations-off'
  document.body.appendChild(root)
})
afterEach(() => {
  displays.splice(0).forEach((display) => display.destroy())
  document.body.removeChild(root)
})

for (const testCase of [{
    name: 'at the top of the page',
    label: 'שלח־לך',
    runId: '2025-06-21:shacharis,main',
  }] as const) {
  test(`centers the first line for ${testCase.label} ${testCase.name}`, async () => {
    await renderRun(testCase.runId)

    const elementAtCenter = document
      .elementFromPoint(
        ...([root.clientWidth / 2, root.clientHeight / 2] as const)
      )
      ?.closest<HTMLTableRowElement>('tr') ?? null

    expect(getAliyahLabel(elementAtCenter)).toBe(testCase.label)
  })
}

test('renders the next page', async () => {
  // פרשת ויקהל is near the bottom of the page, so we
  // will fetch the previous page, not the next page.
  await renderRun('2025-03-22:shacharis,main')

  expect(textFromLine(last(root.querySelectorAll('tr')))).toBe(
    'אשר נשא לבן אתנה בחכמה טוו את העזים'
  )
  root.scrollTop = root.scrollHeight
  const beforeAnchor = getViewportAnchorSnapshot()
  root.dispatchEvent(new Event('scroll'))
  await vi.waitFor(() => {
    expect(textFromLine(last(root.querySelectorAll('tr')))).toBe(
      'השנית חמשים ללאת עשה ביריעה האחת'
    )
  })
  expectSameViewportAnchor(getViewportAnchorSnapshot(), beforeAnchor)
})

test('switches one display between Match, Reading, and mirrored sides', async () => {
  const display = await renderRun('2025-10-04:shacharis,main')
  expect(root.querySelector('table')).not.toBeNull()

  expect(
    display.setPresentation({ layout: 'reading', sides: 'one' })
  ).toBe(true)
  expect(root.dataset.readerLayout).toBe('reading')
  expect(root.dataset.readerSides).toBe('one')
  expect(root.querySelector('.reader-reading-page')).not.toBeNull()
  expect(
    root.querySelector<HTMLElement>('[data-aliyah-starts]')
      ?.getBoundingClientRect().height
  ).toBeGreaterThan(0)

  expect(
    display.setPresentation({ layout: 'reading', sides: 'two' })
  ).toBe(true)
  const readingLines = [
    ...root.querySelectorAll<HTMLElement>('.mod-reading-line'),
  ]
  expect(readingLines.length).toBeGreaterThan(0)
  readingLines.forEach((line) => {
    expect(line.querySelectorAll('.reader-text-side')).toHaveLength(1)
  })
  const canonicalLines = root.querySelectorAll(
    '.reader-reading-page-side.mod-tikkun [data-class="line"]'
  )
  const mirrorLines = root.querySelectorAll(
    '.reader-reading-page-side.mod-torah [data-reader-mirror]'
  )
  expect(mirrorLines).toHaveLength(canonicalLines.length)
  expect(
    root.querySelectorAll('[data-reader-canonical="true"]').length
  ).toBe(canonicalLines.length)
  expect(root.querySelectorAll('[data-aliyah-starts][data-reader-mirror]')).toHaveLength(
    0
  )
  expect(
    display.setPresentation({ layout: 'reading', sides: 'two' })
  ).toBe(false)
})

test('waits for the actual reader font before initial centering', async () => {
  const originalLoad = document.fonts.load.bind(document.fonts)
  let releaseFont: () => void = () => {}
  const fontReady = new Promise<void>((resolve) => { releaseFont = resolve })
  const load = vi.spyOn(document.fonts, 'load').mockImplementation(async (font, text) => {
    await fontReady
    return originalLoad(font, text)
  })
  let centered = false
  const pending = renderRun('2025-10-04:shacharis,main').then((display) => {
    centered = true
    return display
  })
  try {
    await vi.waitFor(() => expect(load).toHaveBeenCalledWith(
      expect.stringContaining('ShlomosemiStam'), 'אשר',
    ))
    expect(centered).toBe(false)
  } finally {
    releaseFont()
    load.mockRestore()
    const display = await pending
    display.destroy()
  }
})

test.each(['match'] as const)('preserves the focal token across %s side switches', async (layout) => {
  root.style.height = '650px'
  root.style.width = '1000px'
  root.dataset.readerLayout = layout
  root.dataset.readerSides = 'two'
  document.documentElement.dataset.readerSideOrder = 'tikkun-right'
  const display = await renderRun('2025-10-04:shacharis,main')
  try {
    for (const focalMode of ['browser', 'reader'] as const) {
      setReaderFocalPointMode(focalMode)
      const words = [...root.querySelectorAll<HTMLElement>('[data-reader-canonical="true"] .word:not([hidden])')]
      const word = words.find((candidate) => candidate.dataset.lineIndex === '24')!
      root.scrollTop = getCenteredElementScrollTop(root, word)
      const focalY = getReaderFocalPointClientY(root)
      const focalWord = words.filter((candidate) => candidate.getClientRects().length).sort((a, b) => {
        const aRect = a.getBoundingClientRect(), bRect = b.getBoundingClientRect()
        return Math.abs((aRect.top + aRect.bottom) / 2 - focalY) - Math.abs((bRect.top + bRect.bottom) / 2 - focalY)
      })[0]
      const key = focalWord.dataset.tokenKey
      const offset = () => {
        const current = [...root.querySelectorAll<HTMLElement>('[data-reader-canonical="true"] .word')].find((candidate) => candidate.dataset.tokenKey === key)!
        const rect = current.getBoundingClientRect()
        return (rect.top + rect.bottom) / 2 - getReaderFocalPointClientY(root)
      }
      const before = offset()
      for (const sides of ['one', 'two', 'one', 'two'] as const) {
        display.setPresentation({ layout, sides })
        await new Promise(requestAnimationFrame)
        expect(Math.abs(offset() - before), `${layout}:${focalMode}:${sides}:${key}:before=${before}:after=${offset()}`).toBeLessThan(2)
      }
    }
  } finally {
    display.destroy()
    setReaderFocalPointMode('reader')
    delete document.documentElement.dataset.readerSideOrder
  }
})

test('renders the previous page', async () => {
  // פרשת תצוה is near the bottom of the page, so we
  // will fetch the next page, not the previous page. The parsha route scrolls
  // through חומש; 2025-03-08 adds Zachor, so its dated view is that service only.
  await renderRun('parsha:tetzaveh,main')

  expect(textFromLine(root.querySelector('tr'))).toBe(
    'ובין קדש הקדשים ונתת את הכפרת על ארון'
  )
  root.scrollTop = 0
  const beforeAnchor = getViewportAnchorSnapshot()
  root.dispatchEvent(new Event('scroll'))
  await vi.waitFor(() => {
    expect(textFromLine(root.querySelector('tr'))).toBe(
      'ואת שש היריעת לבד וכפלת את היריעה'
    )
  })
  expectSameViewportAnchor(getViewportAnchorSnapshot(), beforeAnchor)
})

test('mounts earlier pages while preserving scroll position', async () => {
  const sd = await renderNoachFromLaterPage()
  root.scrollTop = 100

  const resolver = await vm.resolver
  const target = resolver.physicalLocationFromRef({
    scroll: 'torah',
    b: 1,
    c: 6,
    v: 9,
  })
  const beforePages = sd.getMountedPageNumbers()
  await sd.ensurePageMounted(target.pageNumber)

  expect(sd.getMountedPageNumbers()).toContain(target.pageNumber)
  expect(sd.getMountedPageNumbers()).toEqual(
    [...new Set([...beforePages, target.pageNumber])].sort((a, b) => a - b)
  )
  expect(root.scrollTop).toBeGreaterThanOrEqual(100)
})

test('edge loading unlocks and retries after a rejected fetch', async () => {
  const sd = await renderNoachFromLaterPage()
  const mountedPages = sd.getMountedPageNumbers()
  const lastPage = mountedPages[mountedPages.length - 1]
  if (!lastPage) throw new Error('Expected mounted pages')
  const nextEntry = await vm.fetchPageByPageNumber(lastPage + 1)
  if (!nextEntry) throw new Error('Expected next page')
  vi.spyOn(vm, 'fetchNextPage')
    .mockRejectedValueOnce(new Error('temporary page failure'))
    .mockResolvedValueOnce(nextEntry)
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

  scrollToReaderEdge('next')
  await vi.waitFor(() => expect(consoleError).toHaveBeenCalledOnce())
  root.dispatchEvent(new Event('scroll'))
  await vi.waitFor(() => expect(sd.isPageMounted(lastPage + 1)).toBe(true))

  consoleError.mockRestore()
})

test('evicts a mounted page into a same-height placeholder', async () => {
  const sd = await renderNoachFromLaterPage()
  const pageNumber = sd.getMountedPageNumbers()[0]
  const pageNode = sd.getMountedPageNode(pageNumber)
  if (!pageNode) throw new Error('Expected mounted page')
  const measuredHeight = pageNode.getBoundingClientRect().height || pageNode.offsetHeight

  const evicted = sd.evictPage(pageNumber)
  const snapshot = sd.getPageLifecycleSnapshot()
  const record = snapshot.pages.find((page) => page.pageNumber === pageNumber)

  expect(evicted).toBe(true)
  expect(record?.state).toBe('evicted')
  expect(record?.measuredHeight).toBe(measuredHeight)
  expect(sd.getMountedPageNumbers()).not.toContain(pageNumber)
  expect(sd.getKnownPageNumbers()).toContain(pageNumber)
  const placeholder = root.querySelector<HTMLElement>(
    `[data-page-placeholder="${pageNumber}"]`
  )
  expect(placeholder?.style.height).toBe(`${measuredHeight}px`)
})

async function renderRun(runId: string) {
  const model = ScrollViewModel.forId(generator, runId)
  if (!model) throw new Error(`ID ${runId} not found`)
  vm = model
  const sd = createDisplay()
  await sd.scrolled
  return sd
}

async function renderNoachFromLaterPage() {
  const model = ScrollViewModel.forId(generator, '2026-10-17:shacharis,main', {
    scroll: 'torah',
    b: 1,
    c: 9,
    v: 18,
  })
  if (!model) throw new Error('Noach model not found')
  vm = model
  const sd = createDisplay()
  await sd.scrolled
  return sd
}

function getAliyahLabel(lineEl: HTMLTableRowElement | null) {
  if (!lineEl) throw new Error('Expected a rendered line')
  return lineEl.querySelector('.aliyah-label-text')?.textContent
}

function textFromLine(lineEl: HTMLTableRowElement | null) {
  if (!lineEl) throw new Error('Expected a rendered line')
  return [...lineEl.querySelectorAll('.fragment')]
    .map((e) => e.textContent)
    .join('\t')
}

function scrollToReaderEdge(direction: 'previous' | 'next') {
  root.scrollTop = direction === 'previous' ? 0 : root.scrollHeight
  root.dispatchEvent(new Event('scroll'))
}

function getViewportAnchorSnapshot() {
  const rootRect = root.getBoundingClientRect()
  const focalY = rootRect.top + root.clientHeight / 2
  let closestLine: HTMLElement | null = null
  let closestDistance = Number.POSITIVE_INFINITY

  for (const line of root.querySelectorAll<HTMLElement>('[data-line-index]')) {
    const rect = line.getBoundingClientRect()
    const distance = Math.abs((rect.top + rect.bottom) / 2 - focalY)
    if (distance >= closestDistance) continue
    closestLine = line
    closestDistance = distance
  }
  if (!closestLine) return null

  return {
    pageNumber: Number(closestLine.dataset.pageNumber),
    lineIndex: Number(closestLine.dataset.lineIndex),
    viewportOffset: closestLine.getBoundingClientRect().top - rootRect.top,
  }
}

function expectSameViewportAnchor(
  actual: ReturnType<typeof getViewportAnchorSnapshot>,
  expected: ReturnType<typeof getViewportAnchorSnapshot>
) {
  expect(actual).not.toBeNull()
  expect(expected).not.toBeNull()
  expect(actual?.pageNumber).toBe(expected?.pageNumber)
  expect(actual?.lineIndex).toBe(expected?.lineIndex)
  const offsetDifference = Math.abs(
    (actual?.viewportOffset ?? 0) - (expected?.viewportOffset ?? 0)
  )
  expect(
    offsetDifference,
    `Anchor offsets differ: ${JSON.stringify({ actual, expected })}`
  ).toBeLessThanOrEqual(5)
}

class IsolatedRangeFixture extends ScrollViewModel {
  constructor(start: RefWithScroll, end: RefWithScroll) {
    const original = resolveParshaRun(generator, 'beresheet')!.run
    const run: LeiningRun = { ...original, aliyot: [{ index: 1, start, end }] }
    super(generator, [run], start, {}, run.id)
  }
  protected override async contentSourceFromIndex(index: number): Promise<ScrollContentSource | null> {
    return index >= 0 && index < 248 ? { type: 'page', pageNumber: index + 1 } : null
  }
  protected override async contentIndexFromPageNumber(page: number) { return page - 1 }
}

const isolatedRef = (b: number, c: number, v: number): RefWithScroll => ({ scroll: 'torah', b, c, v })

async function isolatedDisplay(start: RefWithScroll, end = start, initialRef?: RefWithScroll, annotations = true) {
  root.dataset.readerLayout = 'reading'
  root.dataset.readerSides = 'one'
  root.className = `tikkun-book mod-annotations-${annotations ? 'on' : 'off'}`
  const base = new IsolatedRangeFixture(start, end)
  await base.startingLocation
  vm = await createIsolatedAliyahViewModel(base, { runId: base.initialRunId!, aliyahIndex: 1 }, initialRef)
  return createDisplay()
}

function setIsolatedAnnotations(display: ScrollDisplay, enabled: boolean) {
  display.updateAnnotations(() => {
    root.classList.toggle('mod-annotations-on', enabled)
    root.classList.toggle('mod-annotations-off', !enabled)
    applyAnnotationMode(root, enabled)
  })
}

function isolatedVisibleWords(surface = '[data-reader-canonical="true"]') {
  return [...root.querySelectorAll<HTMLElement>(`${surface} .word:not([hidden])`)]
}

test('isolated passage omits same-line neighbors in both forms and repeated annotation toggles', async () => {
  const display = await isolatedDisplay(isolatedRef(1, 1, 6), isolatedRef(1, 1, 13))
  await display.scrolled
  const canonicalKeys = [...root.querySelectorAll<HTMLElement>('.word[data-token-key][data-annotations-on-present="true"]')].map(word => word.dataset.tokenKey!)
  expect(new Set(canonicalKeys)).toEqual(vm.isolatedAliyah!.tokenKeys)
  expect(root.scrollTop).toBe(0)
  expect(root.querySelector('[data-class="line"][data-line-index="0"]')).toBeNull()
  for (const enabled of [false, true, false, true]) {
    display.updateAnnotations(() => {
      root.classList.toggle('mod-annotations-on', enabled)
      root.classList.toggle('mod-annotations-off', !enabled)
      applyAnnotationMode(root, enabled)
    })
    const words = isolatedVisibleWords()
    const text = words.map(word => word.textContent!.replace(/\p{M}/gu, '')).join(' ')
    expect(text).toMatch(/^ויאמר אלהים יהי רקיע/)
    expect(text).toMatch(enabled ? /יום שלישי׃$/ : /יום שלישי$/)
    expect(text).not.toContain('בראשית')
    expect(text).not.toContain('יום רביעי')
    expect(words.filter(word => word.dataset.tokenKey).every(word => vm.isolatedAliyah!.containsRenderedTokenKey(word.dataset.tokenKey!))).toBe(true)
    expect([...root.querySelectorAll<HTMLElement>('.reader-pasuk-break')].filter(br => getComputedStyle(br).display !== 'none')).toHaveLength(8)
  }
})

test('isolated ktiv/kri keeps each form and its source identity after annotation toggles', async () => {
  const display = await isolatedDisplay(isolatedRef(1, 8, 17))
  await display.scrolled
  const kri = isolatedVisibleWords().find(word => word.textContent!.replace(/\p{M}/gu, '') === 'היצא')!
  expect(kri.classList.contains('ktiv-kri')).toBe(true)
  const canonicalKey = kri.dataset.tokenKey!
  expect(vm.isolatedAliyah!.tokenKeys.has(canonicalKey)).toBe(true)
  const page = await vm.fetchPageByPageNumber(Number(kri.dataset.pageNumber))
  if (!page || page.type !== 'page') throw new Error('Missing page')
  const plainKey = page.wordSelection!.unannotatedKeysByAnnotated.get(canonicalKey)![0]
  setIsolatedAnnotations(display, false)
  const ktiv = root.querySelector<HTMLElement>(`.word[data-token-key="${plainKey}"]`)!
  expect(ktiv.textContent).toBe('הוצא')
  expect(ktiv.classList.contains('ktiv-kri')).toBe(false)
  setIsolatedAnnotations(display, true)
  expect(kri.textContent!.replace(/\p{M}/gu, '')).toBe('היצא')
  expect(kri.dataset.tokenKey).toBe(canonicalKey)
  expect(kri.classList.contains('ktiv-kri')).toBe(true)
})
