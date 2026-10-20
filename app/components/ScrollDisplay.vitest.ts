import { LeiningGenerator } from '../calendar-model/generator'
import type { UserSettings } from '../calendar-model/user-settings'
import { last } from '../calendar-model/utils'
import {
  type RenderedEntry,
  type ScrollContentSource,
  ScrollViewModel,
} from '../view-model/scroll-view-model'
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

for (const testCase of [
  {
    name: 'at the top of the page',
    label: 'שלח־לך',
    runId: '2025-06-21:shacharis,main',
  },
  {
    name: 'near the top of the page',
    label: 'ויקהל',
    // 2025-03-22 adds the Parah maftir, so its dated view shows only that service.
    runId: 'parsha:vayakhel,main',
  },
  {
    name: 'at the center of the page',
    label: 'נצבים',
    runId: '2025-09-20:shacharis,main',
  },
  {
    name: 'near the bottom of the page',
    label: 'תצוה',
    runId: '2025-03-08:shacharis,main',
  },
  {
    name: 'for the very first page',
    label: 'בראשית',
    runId: '2024-10-26:shacharis,main',
    // This label should appear at the top of the screen.
    expectedCoordinates: [document.body.clientWidth / 2, 48],
  },
] as const) {
  test(`centers the first line for ${testCase.label} ${testCase.name}`, async () => {
    await renderRun(testCase.runId)

    const elementAtCenter = document
      .elementFromPoint(
        ...(testCase.expectedCoordinates ??
          ([root.clientWidth / 2, root.clientHeight / 2] as const))
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

test('renders absolute page numbers inside the page table decoration', async () => {
  await renderRun('2026-10-17:shacharis,main')

  const page = root.querySelector<HTMLElement>('.tikkun-page')
  const table = page?.querySelector<HTMLTableElement>('table')
  const caption = table?.querySelector<HTMLTableCaptionElement>('.tikkun-page-number')

  expect(caption?.textContent).toBe(table?.dataset.pageNumber)
  expect(caption?.getAttribute('aria-hidden')).toBe('true')
  expect(caption?.textContent).toMatch(/^\d+$/)
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

test('centers the first token for the starting line', async () => {
  // Use Noach for scroll-position regressions: Beresheet is clamped at
  // the top, so it cannot reveal playback-time scroll adjustments.
  root.style.height = '1000px'
  await renderRun('2026-10-17:shacharis,main')
  await expectInitialCenteringWithoutEdgeLoading()

  const startingLine = [...root.querySelectorAll<HTMLTableRowElement>('tr')].find(
    (line) => getAliyahLabel(line) === 'נח'
  )
  const token = startingLine?.querySelector<HTMLElement>(
    '.fragment .word'
  )
  if (!token) throw new Error('Expected a starting token')

  const expectedScrollTop = getCenteredElementScrollTop(root, token)

  expect(Math.abs(root.scrollTop - expectedScrollTop)).toBeLessThan(5)
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

test.each([
  ['one', true], ['one', false], ['two', true], ['two', false],
] as const)('centers the exact Reading verse in %s side mode with annotations=%s', async (sides, annotations) => {
  root.style.height = '560px'
  root.style.width = '1000px'
  root.dataset.readerLayout = 'reading'
  root.dataset.readerSides = sides
  root.className = `tikkun-book mod-annotations-${annotations ? 'on' : 'off'}`
  const plain = sides === 'one' && !annotations
  for (const { ref, tokenKey, text } of [
    { ref: { b: 1, c: 7, v: 17 }, tokenKey: '7:39:0:4', text: 'ויהי' },
    // The verse begins on a new physical page, after a maqaf group in the previous verse.
    { ref: { b: 1, c: 7, v: 19 }, tokenKey: `8:0:0:${plain ? 5 : 4}`, text: 'והמים' },
    { ref: { b: 1, c: 9, v: 26 }, tokenKey: '10:0:0:7', text: 'ויאמר' },
  ]) {
    const model = ScrollViewModel.forId(generator, '2026-10-17:shacharis,main', { scroll: 'torah', ...ref })
    if (!model) throw new Error('Noach model not found')
    vm = model
    const display = createDisplay()
    await display.scrolled
    const word = root.querySelector<HTMLElement>(`[data-reader-canonical="true"] .word[data-token-key="${tokenKey}"]:not([hidden])`)!
    expect(word.textContent!.normalize('NFD').replace(/\p{M}/gu, '').trim()).toBe(text)
    const rect = word.getBoundingClientRect()
    expect(Math.abs(rect.top + rect.height / 2 - getReaderFocalPointClientY(root))).toBeLessThan(2)
    display.destroy()
  }
})

test.each(['match', 'reading'] as const)('preserves the focal token across %s side switches', async (layout) => {
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

test('mounting the next Yitro page preserves the focal word exactly', async () => {
  root.style.height = '1000px'
  const display = await renderRun('2026-02-07:shacharis,main')
  await expectInitialCenteringWithoutEdgeLoading()
  const startingLine = [...root.querySelectorAll<HTMLTableRowElement>('tr')].find(
    (line) => getAliyahLabel(line) === 'יתרו'
  )
  const token = startingLine?.querySelector<HTMLElement>(
    '.fragment .word'
  )
  if (!token) throw new Error('Expected the first Yitro token')

  const beforeScrollTop = root.scrollTop
  const beforeOffset = getWordCenterViewportOffset(token)
  const mountedPages = display.getMountedPageNumbers()
  const lastMountedPage = mountedPages[mountedPages.length - 1]
  if (!lastMountedPage) throw new Error('Expected a mounted Yitro page')

  await display.ensurePageMounted(lastMountedPage + 1)

  expect(root.scrollTop).toBe(beforeScrollTop)
  expect(getWordCenterViewportOffset(token)).toBe(beforeOffset)
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

test('renders earlier aliyah markers when started later in Noach', async () => {
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

  const resolver = await vm.resolver
  const target = resolver.physicalLocationFromRef({
    scroll: 'torah',
    b: 1,
    c: 8,
    v: 15,
  })
  await sd.ensurePageMounted(target.pageNumber)

  expect(
    root.querySelector(
      '[data-aliyah-marker="true"][data-run-id="2026-10-17:shacharis,main"][data-aliyah-index="4"]'
    )
  ).not.toBeNull()
})

test('mounts an exact page by page number through the page lifecycle API', async () => {
  const sd = await renderNoachFromLaterPage()
  const resolver = await vm.resolver
  const target = resolver.physicalLocationFromRef({
    scroll: 'torah',
    b: 1,
    c: 8,
    v: 15,
  })

  const mounted = await sd.ensurePageMounted(target.pageNumber)

  expect(mounted).toBe(sd.getMountedPageNode(target.pageNumber))
  expect(sd.isPageMounted(target.pageNumber)).toBe(true)
  expect(sd.getMountedPageNumbers()).toContain(target.pageNumber)
})

test('reuses an already mounted page without rendering a duplicate node', async () => {
  const sd = await renderNoachFromLaterPage()
  const resolver = await vm.resolver
  const target = resolver.physicalLocationFromRef({
    scroll: 'torah',
    b: 1,
    c: 8,
    v: 15,
  })

  const first = await sd.ensurePageMounted(target.pageNumber)
  const renderedPageCount = root.querySelectorAll('.tikkun-page').length
  const second = await sd.ensurePageMounted(target.pageNumber)

  expect(second).toBe(first)
  expect(root.querySelectorAll('.tikkun-page').length).toBe(renderedPageCount)
})

test('prefetches page data without mounting or moving the reader', async () => {
  const sd = await renderNoachFromLaterPage()
  const resolver = await vm.resolver
  const target = resolver.physicalLocationFromRef({
    scroll: 'torah',
    b: 1,
    c: 6,
    v: 9,
  })
  const beforePages = sd.getMountedPageNumbers()
  const beforeScrollTop = root.scrollTop
  const beforeAnchor = getViewportAnchorSnapshot()

  const [first, second] = await Promise.all([
    vm.fetchPageByPageNumber(target.pageNumber),
    vm.fetchPageByPageNumber(target.pageNumber),
  ])

  expect(first).toBe(second)
  expect(sd.getMountedPageNumbers()).toEqual(beforePages)
  expect(root.scrollTop).toBe(beforeScrollTop)
  expectSameViewportAnchor(getViewportAnchorSnapshot(), beforeAnchor)
})

test('mounts a future page by absolute number without filling intermediate pages', async () => {
  const sd = await renderNoachFromLaterPage()
  const mountedPages = sd.getMountedPageNumbers()
  const lastPage = mountedPages[mountedPages.length - 1]
  if (!lastPage) throw new Error('Expected mounted pages')

  await sd.ensurePageMounted(lastPage + 2)

  expect(pageNumbersInDom()).toEqual(sd.getMountedPageNumbers())
  expect(pageNumbersInDom()).not.toContain(lastPage + 1)
  expect(pageNumbersInDom()).toContain(lastPage + 2)
})

test('mounts a stable contiguous path before navigating to a distant aliyah', async () => {
  const model = ScrollViewModel.forId(
    generator,
    '2026-10-10:shacharis,main',
    { scroll: 'torah', b: 1, c: 2, v: 4 }
  )
  if (!model) throw new Error('Beresheet model not found')
  vm = model
  const sd = createDisplay()
  await sd.scrolled

  const run = vm.relevantRuns.find(
    (candidate) => candidate.id === '2026-10-10:shacharis,main'
  )
  const aliyah = run?.aliyot.find((candidate) => candidate.index === 6)
  if (!run || !aliyah) throw new Error('Beresheet aliyah 6 not found')
  const resolver = await vm.resolver
  const target = resolver.physicalLocationFromRef(aliyah.start)
  const anchorPage = sd.getViewportAnchorPageNumber()
  if (!anchorPage) throw new Error('Expected a viewport anchor page')
  const beforeAnchor = getViewportAnchorSnapshot()

  const targetPage = await sd.ensurePageMountedForNavigation(
    target.pageNumber,
    { runId: run.id }
  )

  expect(targetPage).not.toBeNull()
  expect(
    targetPage?.querySelector(
      '[data-aliyah-marker="true"][data-aliyah-index="6"]'
    )
  ).not.toBeNull()
  for (let page = anchorPage; page <= target.pageNumber + 1; page += 1) {
    expect(sd.getMountedPageNumbers()).toContain(page)
  }
  expectSameViewportAnchor(getViewportAnchorSnapshot(), beforeAnchor)
})

test('mounts sparse pages in absolute page order', async () => {
  const sd = await renderNoachFromLaterPage()
  const resolver = await vm.resolver
  const earlierTarget = resolver.physicalLocationFromRef({
    scroll: 'torah',
    b: 1,
    c: 6,
    v: 9,
  })
  const middleTarget = resolver.physicalLocationFromRef({
    scroll: 'torah',
    b: 1,
    c: 8,
    v: 15,
  })

  await sd.ensurePageMounted(earlierTarget.pageNumber)
  await sd.ensurePageMounted(middleTarget.pageNumber)

  expect(pageNumbersInDom()).toEqual(sd.getMountedPageNumbers())
})

test('mounts pages before the next higher placeholder when one exists', async () => {
  const sd = await renderNoachFromLaterPage()
  const resolver = await vm.resolver
  const earlierTarget = resolver.physicalLocationFromRef({
    scroll: 'torah',
    b: 1,
    c: 6,
    v: 9,
  })
  await sd.ensurePageMounted(earlierTarget.pageNumber)
  const mountedPageNumbers = sd.getMountedPageNumbers()
  const highPageNumber = mountedPageNumbers[mountedPageNumbers.length - 1]
  if (!highPageNumber) throw new Error('Expected mounted high page')
  expect(sd.evictPage(highPageNumber)).toBe(true)

  const middleTarget = resolver.physicalLocationFromRef({
    scroll: 'torah',
    b: 1,
    c: 8,
    v: 15,
  })
  await sd.ensurePageMounted(middleTarget.pageNumber)

  expect(pageNumbersAndPlaceholdersInDom()).toEqual(
    [...sd.getKnownPageNumbers()].sort((a, b) => a - b)
  )
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

test('mounting an earlier page keeps the same viewport anchor page', async () => {
  const sd = await renderNoachFromLaterPage()
  const beforeAnchorPage = sd.getViewportAnchorPageNumber()
  if (!beforeAnchorPage) throw new Error('Expected viewport anchor page')

  const resolver = await vm.resolver
  const target = resolver.physicalLocationFromRef({
    scroll: 'torah',
    b: 1,
    c: 6,
    v: 9,
  })
  await sd.ensurePageMounted(target.pageNumber)

  expect(sd.getViewportAnchorPageNumber()).toBe(beforeAnchorPage)
})

test('mounting multiple earlier pages preserves the anchor in insertion order', async () => {
  const sd = await renderNoachFromLaterPage()
  const beforeAnchor = getViewportAnchorSnapshot()

  const resolver = await vm.resolver
  const earlierTarget = resolver.physicalLocationFromRef({
    scroll: 'torah',
    b: 1,
    c: 6,
    v: 9,
  })
  const middleTarget = resolver.physicalLocationFromRef({
    scroll: 'torah',
    b: 1,
    c: 8,
    v: 15,
  })

  await sd.ensurePageMounted(earlierTarget.pageNumber)
  await sd.ensurePageMounted(middleTarget.pageNumber)

  expectSameViewportAnchor(getViewportAnchorSnapshot(), beforeAnchor)
})

test('page-rendered fires after viewport restoration', async () => {
  const sd = await renderNoachFromLaterPage()
  const beforeAnchor = getViewportAnchorSnapshot()
  const resolver = await vm.resolver
  const target = resolver.physicalLocationFromRef({
    scroll: 'torah',
    b: 1,
    c: 6,
    v: 9,
  })
  let eventAnchor: ReturnType<typeof getViewportAnchorSnapshot> = null
  root.addEventListener('page-rendered', (event) => {
    const pageNumber =
      event instanceof CustomEvent ? event.detail?.entry?.pageNumber : null
    if (pageNumber === target.pageNumber) {
      eventAnchor = getViewportAnchorSnapshot()
    }
  })

  await sd.ensurePageMounted(target.pageNumber)

  expectSameViewportAnchor(eventAnchor, beforeAnchor)
})

test('a user scroll during page fetch becomes the preserved anchor', async () => {
  const sd = await renderNoachFromLaterPage()
  const resolver = await vm.resolver
  const target = resolver.physicalLocationFromRef({
    scroll: 'torah',
    b: 1,
    c: 6,
    v: 9,
  })
  const entry = await vm.fetchPageByPageNumber(target.pageNumber)
  if (!entry) throw new Error('Expected prefetched page')
  let resolveFetch: (entry: RenderedEntry | null) => void = () => {}
  const deferredFetch = new Promise<RenderedEntry | null>((resolve) => {
    resolveFetch = resolve
  })
  vi.spyOn(vm, 'fetchPageByPageNumber').mockReturnValueOnce(deferredFetch)

  const mounting = sd.ensurePageMounted(target.pageNumber)
  root.scrollTop += 120
  const userAnchor = getViewportAnchorSnapshot()
  resolveFetch(entry)
  await mounting

  expectSameViewportAnchor(getViewportAnchorSnapshot(), userAnchor)
})

test('destroying a display prevents a late page insertion', async () => {
  const sd = await renderNoachFromLaterPage()
  const resolver = await vm.resolver
  const target = resolver.physicalLocationFromRef({
    scroll: 'torah',
    b: 1,
    c: 6,
    v: 9,
  })
  const entry = await vm.fetchPageByPageNumber(target.pageNumber)
  if (!entry) throw new Error('Expected prefetched page')
  let resolveFetch: (entry: RenderedEntry | null) => void = () => {}
  const deferredFetch = new Promise<RenderedEntry | null>((resolve) => {
    resolveFetch = resolve
  })
  vi.spyOn(vm, 'fetchPageByPageNumber').mockReturnValueOnce(deferredFetch)

  const mounting = sd.ensurePageMounted(target.pageNumber)
  sd.destroy()
  resolveFetch(entry)

  expect(await mounting).toBeNull()
  expect(sd.isPageMounted(target.pageNumber)).toBe(false)
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

test('concurrent edge and direct mounting render a page only once', async () => {
  const sd = await renderNoachFromLaterPage()
  const mountedPages = sd.getMountedPageNumbers()
  const lastPage = mountedPages[mountedPages.length - 1]
  if (!lastPage) throw new Error('Expected mounted pages')
  const pageNumber = lastPage + 1
  const entry = await vm.fetchPageByPageNumber(pageNumber)
  if (!entry) throw new Error('Expected next page')
  let resolveDirectFetch: (entry: RenderedEntry | null) => void = () => {}
  const directFetch = new Promise<RenderedEntry | null>((resolve) => {
    resolveDirectFetch = resolve
  })
  vi.spyOn(vm, 'fetchPageByPageNumber').mockReturnValueOnce(directFetch)
  vi.spyOn(vm, 'fetchNextPage').mockResolvedValueOnce(entry)

  const directMount = sd.ensurePageMounted(pageNumber)
  scrollToReaderEdge('next')
  await vi.waitFor(() => expect(sd.isPageMounted(pageNumber)).toBe(true))
  resolveDirectFetch(entry)
  await directMount

  expect(
    root.querySelectorAll(
      `.tikkun-page table[data-page-number="${pageNumber}"]`
    )
  ).toHaveLength(1)
})

test('reports a sorted page lifecycle snapshot for mounted pages', async () => {
  const sd = await renderNoachFromLaterPage()
  const resolver = await vm.resolver
  const target = resolver.physicalLocationFromRef({
    scroll: 'torah',
    b: 1,
    c: 6,
    v: 9,
  })
  await sd.ensurePageMounted(target.pageNumber)

  const snapshot = sd.getPageLifecycleSnapshot()
  const mountedPages = snapshot.pages
    .filter((page) => page.state === 'mounted')
    .map((page) => page.pageNumber)

  expect(snapshot.mountedPageCount).toBe(sd.getMountedPageNumbers().length)
  expect(mountedPages).toEqual([...mountedPages].sort((a, b) => a - b))
  expect(snapshot.pages.every((page) => page.lastAccessedAt > 0)).toBe(true)
})

test('reports a viewport anchor page from mounted page geometry', async () => {
  const sd = await renderNoachFromLaterPage()
  const anchorPage = sd.getViewportAnchorPageNumber()

  expect(anchorPage).not.toBeNull()
  expect(sd.getMountedPageNumbers()).toContain(anchorPage)
})

test('does not mark lifecycle pages as evicted during the dry-run foundation', async () => {
  const sd = await renderNoachFromLaterPage()
  const resolver = await vm.resolver
  const target = resolver.physicalLocationFromRef({
    scroll: 'torah',
    b: 1,
    c: 6,
    v: 9,
  })
  await sd.ensurePageMounted(target.pageNumber)

  expect(
    sd.getPageLifecycleSnapshot().pages.map((page) => page.state)
  ).not.toContain('evicted')
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

test('remounts an evicted page in the placeholder position', async () => {
  const sd = await renderNoachFromLaterPage()
  const pageNumber = sd.getMountedPageNumbers()[0]
  const pageNode = sd.getMountedPageNode(pageNumber)
  if (!pageNode) throw new Error('Expected mounted page')
  Object.defineProperty(pageNode, 'offsetHeight', { configurable: true, value: 320 })

  expect(sd.evictPage(pageNumber)).toBe(true)
  const placeholderIndex = [...root.children].findIndex(
    (child) => child instanceof HTMLElement && child.dataset.pagePlaceholder === `${pageNumber}`
  )
  const mounted = await sd.ensurePageMounted(pageNumber)
  const mountedIndex = [...root.children].indexOf(mounted!)

  expect(mounted).toBe(sd.getMountedPageNode(pageNumber))
  expect(mountedIndex).toBe(placeholderIndex)
  expect(sd.getMountedPageNumbers()).toContain(pageNumber)
  expect(root.querySelector(`[data-page-placeholder="${pageNumber}"]`)).toBeNull()
})

test('remounting an evicted page does not duplicate page DOM nodes', async () => {
  const sd = await renderNoachFromLaterPage()
  const pageNumber = sd.getMountedPageNumbers()[0]
  const pageNode = sd.getMountedPageNode(pageNumber)
  if (!pageNode) throw new Error('Expected mounted page')
  Object.defineProperty(pageNode, 'offsetHeight', { configurable: true, value: 320 })

  expect(sd.evictPage(pageNumber)).toBe(true)
  await sd.ensurePageMounted(pageNumber)
  await sd.ensurePageMounted(pageNumber)

  expect(
    [...root.querySelectorAll<HTMLElement>('.tikkun-page')].filter(
      (page) => page.tikkunPage?.pageNumber === pageNumber
    )
  ).toHaveLength(1)
})

test('fires page-remounted when restoring an evicted page', async () => {
  const sd = await renderNoachFromLaterPage()
  const pageNumber = sd.getMountedPageNumbers()[0]
  const pageNode = sd.getMountedPageNode(pageNumber)
  if (!pageNode) throw new Error('Expected mounted page')
  Object.defineProperty(pageNode, 'offsetHeight', { configurable: true, value: 320 })
  const remountedPages: number[] = []
  root.addEventListener('page-remounted', (event) => {
    const pageNumber =
      event instanceof CustomEvent ? event.detail?.pageNumber : null
    if (Number.isInteger(pageNumber)) remountedPages.push(pageNumber)
  })

  expect(sd.evictPage(pageNumber)).toBe(true)
  await sd.ensurePageMounted(pageNumber)

  expect(remountedPages).toEqual([pageNumber])
})

test('reports evicted placeholder pages near the viewport', async () => {
  const sd = await renderNoachFromLaterPage()
  const pageNumber = sd.getMountedPageNumbers()[0]
  const pageNode = sd.getMountedPageNode(pageNumber)
  if (!pageNode) throw new Error('Expected mounted page')
  Object.defineProperty(pageNode, 'offsetHeight', { configurable: true, value: 320 })
  Object.defineProperty(root, 'clientHeight', { configurable: true, value: 500 })
  root.getBoundingClientRect = () =>
    ({ top: 0, bottom: 500, height: 500 } as DOMRect)

  expect(sd.evictPage(pageNumber)).toBe(true)
  const placeholder = root.querySelector<HTMLElement>(
    `[data-page-placeholder="${pageNumber}"]`
  )
  if (!placeholder) throw new Error('Expected placeholder')
  placeholder.getBoundingClientRect = () =>
    ({ top: 700, bottom: 1020, height: 320 } as DOMRect)

  expect(sd.getEvictedPageNumbersNearViewport({ marginPx: 100 })).toEqual([])
  expect(sd.getEvictedPageNumbersNearViewport({ marginPx: 250 })).toEqual([
    pageNumber,
  ])
})

test('remounts evicted placeholder pages near the viewport', async () => {
  const sd = await renderNoachFromLaterPage()
  const pageNumber = sd.getMountedPageNumbers()[0]
  const pageNode = sd.getMountedPageNode(pageNumber)
  if (!pageNode) throw new Error('Expected mounted page')
  Object.defineProperty(pageNode, 'offsetHeight', { configurable: true, value: 320 })
  Object.defineProperty(root, 'clientHeight', { configurable: true, value: 500 })
  root.getBoundingClientRect = () =>
    ({ top: 0, bottom: 500, height: 500 } as DOMRect)

  expect(sd.evictPage(pageNumber)).toBe(true)
  const placeholder = root.querySelector<HTMLElement>(
    `[data-page-placeholder="${pageNumber}"]`
  )
  if (!placeholder) throw new Error('Expected placeholder')
  placeholder.getBoundingClientRect = () =>
    ({ top: 450, bottom: 770, height: 320 } as DOMRect)

  const remounted = await sd.ensureEvictedPagesMountedNearViewport({
    marginPx: 100,
  })

  expect(remounted).toEqual([pageNumber])
  expect(sd.isPageMounted(pageNumber)).toBe(true)
  expect(root.querySelector(`[data-page-placeholder="${pageNumber}"]`)).toBeNull()
})

test('renders message entries', async () => {
  // ראש חודש חנוכה has a page, then a message, then one more page.
  await renderRun('2025-01-01:shacharis,main')

  expect(
    getAliyahLabel(
      root.firstElementChild?.querySelector<HTMLTableRowElement>('tr') ?? null
    )
  ).toBe(
    'חנוכה יום ז׳ (ראש חודש)'
  )
  if (!root.querySelector('.tikkun-message')) scrollToReaderEdge('next')
  await vi.waitFor(() => {
    expect(root.querySelector('.tikkun-message')?.textContent).toBe(
      '✃ 28 עמודים ✁'
    )
  })
  if (root.querySelectorAll('.tikkun-page').length < 2) {
    scrollToReaderEdge('next')
  }
  await vi.waitFor(() => {
    expect(root.querySelectorAll('.tikkun-page')).toHaveLength(2)
  })
  expect(
    [...root.children].map((child) =>
      child.tikkunPage ? child.tikkunPage.pageNumber : 'message'
    )
  ).toEqual([189, 'message', 160])
})

test('mounts messages and repeated page occurrences along a navigation path', async () => {
  const sourceModel = ScrollViewModel.forId(
    generator,
    '2026-10-17:shacharis,main'
  )
  if (!sourceModel) throw new Error('Noach model not found')
  const sourcePage = (await sourceModel.startingLocation).page
  if (sourcePage.type !== 'page') throw new Error('Noach page not found')

  const entries: RenderedEntry[] = [
    { ...sourcePage, contentIndex: 0, pageNumber: 20, runId: 'first-run' },
    { type: 'message', contentIndex: 1, text: 'logical skip' },
    { ...sourcePage, contentIndex: 2, pageNumber: 3 },
    { ...sourcePage, contentIndex: 3, pageNumber: 20, runId: 'second-run' },
  ]
  const fakeViewModel = {
    startingLocation: Promise.resolve({ page: entries[0], lineNumber: 1 }),
    fetchPreviousPage: async (): Promise<RenderedEntry | null> => null,
    fetchNextPage: async (): Promise<RenderedEntry | null> => null,
    fetchPageByPageNumber: async (
      pageNumber: number,
      hint?: { runId: string }
    ) =>
      entries.find(
        (entry) =>
          entry.type === 'page' &&
          entry.pageNumber === pageNumber &&
          (!hint || entry.runId === hint.runId)
      ) ?? null,
    fetchPageByContentIndex: async (contentIndex: number) =>
      entries.find((entry) => entry.contentIndex === contentIndex) ?? null,
  } as unknown as ScrollViewModel
  vm = fakeViewModel
  const sd = createDisplay()
  await sd.scrolled

  const target = await sd.ensurePageMountedForNavigation(20, {
    runId: 'second-run',
  })

  expect(target?.dataset.contentIndex).toBe('3')
  expect(logicalEntriesInDom()).toEqual([
    'page:20:0',
    'message:logical skip:1',
    'page:3:2',
    'page:20:3',
  ])
})

test('preserves logical order and identity for non-linear repeated pages', async () => {
  const sourceModel = ScrollViewModel.forId(
    generator,
    '2026-10-17:shacharis,main'
  )
  if (!sourceModel) throw new Error('Noach model not found')
  const sourcePage = (await sourceModel.startingLocation).page
  if (sourcePage.type !== 'page') throw new Error('Noach page not found')

  const entries: RenderedEntry[] = [
    { ...sourcePage, contentIndex: 0, pageNumber: 20, runId: 'first-run' },
    { type: 'message', contentIndex: 1, text: 'logical skip' },
    { ...sourcePage, contentIndex: 2, pageNumber: 3 },
    { ...sourcePage, contentIndex: 3, pageNumber: 20, runId: 'second-run' },
  ]
  const pendingEntries = entries.slice(1)
  const fakeViewModel = {
    startingLocation: Promise.resolve({ page: entries[0], lineNumber: 1 }),
    fetchPreviousPage: async (): Promise<RenderedEntry | null> => null,
    fetchNextPage: async (): Promise<RenderedEntry | null> =>
      pendingEntries.shift() ?? null,
    fetchPageByPageNumber: async (
      pageNumber: number,
      hint?: { runId: string }
    ) =>
      entries.find(
        (entry) =>
          entry.type === 'page' &&
          entry.pageNumber === pageNumber &&
          (!hint || entry.runId === hint.runId)
      ) ?? null,
    fetchPageByContentIndex: async (contentIndex: number) =>
      entries.find((entry) => entry.contentIndex === contentIndex) ?? null,
  } as unknown as ScrollViewModel
  vm = fakeViewModel
  const sd = createDisplay()
  await sd.scrolled

  while (root.children.length < entries.length) {
    const previousChildCount = root.children.length
    scrollToReaderEdge('next')
    await vi.waitFor(() => {
      expect(root.children.length).toBeGreaterThan(previousChildCount)
    })
  }

  expect(logicalEntriesInDom()).toEqual([
    'page:20:0',
    'message:logical skip:1',
    'page:3:2',
    'page:20:3',
  ])
  expect(sd.getMountedPageNumbers()).toEqual([20, 3, 20])
  expect(sd.getMountedPageNode(20)?.dataset.contentIndex).toBe('3')
  expect(
    (await sd.ensurePageMounted(20, { runId: 'first-run' }))?.dataset.contentIndex
  ).toBe('0')
  expect(
    (await sd.ensurePageMounted(20, { runId: 'second-run' }))?.dataset.contentIndex
  ).toBe('3')

  expect(sd.evictPage(20)).toBe(true)
  expect(root.querySelectorAll('[data-page-placeholder="20"]')).toHaveLength(2)
  expect(sd.getMountedPageNumbers()).toEqual([3])

  expect(
    await sd.ensureEvictedPagesMountedNearViewport({
      marginPx: Number.POSITIVE_INFINITY,
    })
  ).toEqual([20, 20])
  expect(logicalEntriesInDom()).toEqual([
    'page:20:0',
    'message:logical skip:1',
    'page:3:2',
    'page:20:3',
  ])
})

test('renders just one page', async () => {
  await renderRun('2024-11-01:shacharis,main')

  expect(
    getAliyahLabel(
      root.firstElementChild?.querySelector<HTMLTableRowElement>('tr') ?? null
    )
  ).toBe(
    'ראש חודש חשון'
  )
  expect(textFromLine(last(root.querySelectorAll('tr')))).toBe(
    'קדש יהיה לכם כל מלאכת עבדה לא תעשו'
  )
})

async function renderRun(runId: string) {
  const model = ScrollViewModel.forId(generator, runId)
  if (!model) throw new Error(`ID ${runId} not found`)
  vm = model
  const sd = createDisplay()
  await sd.scrolled
  return sd
}

test('prepares the recording path and pins pages until the last owner releases them', async () => {
  const display = await renderRun('2024-10-26:shacharis,main')
  const first = await display.prepareRecordingPages([1, 3, 3])
  const second = await display.prepareRecordingPages([2])
  for (const pageNumber of [1, 2, 3]) {
    expect(root.querySelector(`.tikkun-page table[data-page-number="${pageNumber}"]`)).not.toBeNull()
    expect(display.evictPage(pageNumber)).toBe(false)
  }
  const fetchNext = vi.spyOn(vm, 'fetchNextPage')
  root.scrollTop = root.scrollHeight
  root.dispatchEvent(new Event('scroll'))
  await nextAnimationFrame()
  expect(fetchNext).not.toHaveBeenCalled()
  first()
  first()
  expect(display.evictPage(1)).toBe(false)
  second()
  expect(display.evictPage(1)).toBe(true)
})

test('releases recording page pins when preparation fails', async () => {
  const display = await renderRun('2024-10-26:shacharis,main')
  vi.spyOn(display, 'ensurePageMountedForNavigation').mockRejectedValueOnce(new Error('Page unavailable'))
  await expect(display.prepareRecordingPages([1])).rejects.toThrow('Page unavailable')
  expect(display.evictPage(1)).toBe(true)
})

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

function nextAnimationFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
}

async function expectInitialCenteringWithoutEdgeLoading() {
  const fetchPreviousPage = vi.spyOn(vm, 'fetchPreviousPage')
  const fetchNextPage = vi.spyOn(vm, 'fetchNextPage')
  await nextAnimationFrame()
  expect(fetchPreviousPage).not.toHaveBeenCalled()
  expect(fetchNextPage).not.toHaveBeenCalled()
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

function pageNumbersInDom() {
  return [...root.querySelectorAll<HTMLElement>('.tikkun-page')]
    .map((page) => page.tikkunPage?.pageNumber)
    .filter((pageNumber): pageNumber is number => Number.isInteger(pageNumber))
}

function pageNumbersAndPlaceholdersInDom() {
  return [...root.children]
    .map((child) => {
      if (!(child instanceof HTMLElement)) return null
      if (child.tikkunPage) return child.tikkunPage.pageNumber
      const placeholderPage = Number(child.dataset.pagePlaceholder)
      return Number.isInteger(placeholderPage) ? placeholderPage : null
    })
    .filter((pageNumber): pageNumber is number => Number.isInteger(pageNumber))
}

function logicalEntriesInDom() {
  return [...root.children].map((child) => {
    if (!(child instanceof HTMLElement)) return 'unknown'
    const contentIndex = child.dataset.contentIndex
    if (child.tikkunPage) {
      return `page:${child.tikkunPage.pageNumber}:${contentIndex}`
    }
    return `message:${child.textContent}:${contentIndex}`
  })
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

function getWordCenterViewportOffset(word: HTMLElement) {
  const rootRect = root.getBoundingClientRect()
  const wordRect = word.getBoundingClientRect()
  return (wordRect.top + wordRect.bottom) / 2 - rootRect.top
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

test('isolated passage mounts its complete final verse before ready and rejects outside mounts/eviction', async () => {
  const display = await isolatedDisplay(isolatedRef(5, 33, 17))
  await display.rendered
  expect(display.getMountedPageNumbers()).toEqual([244, 245])
  await display.scrolled
  const beforeKeys = new Set(isolatedVisibleWords().map(word => word.dataset.tokenKey).filter(Boolean))
  expect(beforeKeys).toEqual(vm.isolatedAliyah!.tokenKeys)
  expect(isolatedVisibleWords().at(-1)!.textContent).toContain('מְנַשֶּֽׁה׃')
  expect(await display.ensurePageMounted(243)).toBeNull()
  expect(await display.ensurePageMountedForNavigation(246)).toBeNull()
  expect(await display.ensurePageMounted(244, { runId: 'another-run' })).toBeNull()
  expect(await display.ensureNextContentMounted()).toBeNull()
  expect(display.evictPages([244, 245])).toEqual([])
  const fetchNext = vi.spyOn(vm, 'fetchNextPage')
  root.scrollTop = root.scrollHeight
  root.dispatchEvent(new Event('scroll'))
  await nextAnimationFrame()
  expect(fetchNext).not.toHaveBeenCalled()
  expect(display.getMountedPageNumbers()).toEqual([244, 245])
  for (const sides of ['two', 'one'] as const) {
    display.setPresentation({ layout: 'reading', sides })
    expect(new Set(isolatedVisibleWords().map(word => word.dataset.tokenKey).filter(Boolean))).toEqual(beforeKeys)
    if (sides === 'two') {
      expect(new Set(isolatedVisibleWords('.reader-text-side.mod-torah').map(word => word.dataset.tokenKey).filter(Boolean))).toEqual(beforeKeys)
    }
    expect(display.getMountedPageNumbers()).toEqual([244, 245])
  }
})

test.each([true, false])('isolated explicit verse centers its source token in annotations=%s', async (annotations) => {
  root.style.height = '240px'
  const display = await isolatedDisplay(isolatedRef(1, 1, 1), isolatedRef(1, 2, 3), isolatedRef(1, 1, 9), annotations)
  await display.scrolled
  const { page } = await vm.startingLocation
  if (page.type !== 'page') throw new Error('Missing page')
  const initialKey = vm.isolatedAliyah!.initialTokenKey
  const key = annotations ? initialKey : page.wordSelection!.unannotatedKeysByAnnotated.get(initialKey)![0]
  const word = root.querySelector<HTMLElement>(`.word[data-token-key="${key}"]:not([hidden])`)!
  expect(word.textContent!.replace(/\p{M}/gu, '')).toBe('ויאמר')
  expect(Math.abs(root.scrollTop - getCenteredElementScrollTop(root, word))).toBeLessThan(5)
  expect(display.getMountedPageNumbers()).toEqual(vm.isolatedAliyah!.pageNumbers)
})

test('isolated inverted-nun decorations keep source coordinates and survive both forms', async () => {
  const display = await isolatedDisplay(isolatedRef(4, 10, 35), isolatedRef(4, 10, 36))
  await display.scrolled
  for (const enabled of [true, false, true]) {
    setIsolatedAnnotations(display, enabled)
    const words = isolatedVisibleWords()
    const nuns = words.filter(word => word.textContent!.trim() === '\u05c6')
    expect(nuns).toHaveLength(2)
    expect(nuns.every(word => !word.dataset.tokenKey)).toBe(true)
    const first = words.find(word => word.dataset.tokenKey)!
    expect(first.dataset.tokenKey).toBe('165:26:1:1')
    expect(first.textContent!.replace(/\p{M}/gu, '')).toBe('ויהי')
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

test.each([
  [1, 2, 4, 'genesis-2-4-small-he'],
  [5, 32, 18, 'deuteronomy-32-18-small-yod'],
] as const)('isolated special letter %i:%i:%i preserves %s in both forms', async (b, c, v, id) => {
  const display = await isolatedDisplay(isolatedRef(b, c, v))
  await display.scrolled
  for (const enabled of [true, false, true]) {
    setIsolatedAnnotations(display, enabled)
    const letter = root.querySelector<HTMLElement>(`[data-special-letter-id="${id}"]`)!
    expect(letter).not.toBeNull()
    const word = letter.closest<HTMLElement>('.word')!
    expect(word.hidden).toBe(false)
    expect(vm.isolatedAliyah!.containsRenderedTokenKey(word.dataset.tokenKey!)).toBe(true)
    expect(letter.classList.contains('mod-small')).toBe(true)
  }
})
