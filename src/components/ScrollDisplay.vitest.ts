import { LeiningGenerator } from '../calendar-model/generator'
import type { UserSettings } from '../calendar-model/user-settings'
import { last } from '../calendar-model/utils'
import { ScrollViewModel } from '../view-model/scroll-view-model'
import { ScrollDisplay } from './ScrollDisplay'
import { getCenteredElementScrollTop } from '../reader-scroll'
import '/css/master.css'

import { afterEach, beforeEach, expect, test } from 'vitest'

const testSettings: UserSettings = {
  ashkenazi: true,
  includeModernHolidays: false,
  israel: false,
}

const generator = new LeiningGenerator(testSettings)

// TODO(later): Consider extracting this to a shared helper
let root: HTMLDivElement
let vm: ScrollViewModel

beforeEach(() => {
  root = document.createElement('div')
  root.className = 'tikkun-book mod-annotations-off'
  document.body.appendChild(root)
})
afterEach(() => {
  document.body.removeChild(root)
  vm = null
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
    runId: '2025-03-22:shacharis,main',
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
      .closest('tr')

    expect(getAliyahLabel(elementAtCenter)).toBe(testCase.label)
  })
}

test('renders the next page', async () => {
  // פרשת ויקהל is near the bottom of the page, so we
  // will fetch the previous page, not the next page.
  const sd = await renderRun('2025-03-22:shacharis,main')

  expect(textFromLine(last(root.querySelectorAll('tr')))).toBe(
    'אשר נשא לבן אתנה בחכמה טוו את העזים'
  )
  await sd.renderNext(await vm.fetchNextPage())
  expect(textFromLine(last(root.querySelectorAll('tr')))).toBe(
    'השנית חמשים ללאת עשה ביריעה האחת'
  )
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

test('centers the first token for the starting line', async () => {
  // Use Noach for scroll-position regressions: Bereshit is clamped at
  // the top, so it cannot reveal playback-time scroll adjustments.
  await renderRun('2026-10-17:shacharis,main')

  const startingLine = [...root.querySelectorAll<HTMLTableRowElement>('tr')].find(
    (line) => getAliyahLabel(line) === 'נח'
  )
  const token = startingLine?.querySelector<HTMLElement>(
    '.fragment.mod-annotations-off .word'
  )
  if (!token) throw new Error('Expected a starting token')

  const expectedScrollTop = getCenteredElementScrollTop(root, token)

  expect(Math.abs(root.scrollTop - expectedScrollTop)).toBeLessThan(5)
})

test('renders the previous page', async () => {
  // פרשת תצוה is near the bottom of the page, so we
  // will fetch the next page, not the previous page.
  const sd = await renderRun('2025-03-08:shacharis,main')

  expect(textFromLine(root.querySelector('tr'))).toBe(
    'ובין קדש הקדשים ונתת את הכפרת על ארון'
  )
  await sd.renderPrevious(await vm.fetchPreviousPage())
  expect(textFromLine(root.querySelector('tr'))).toBe(
    'ואת שש היריעת לבד וכפלת את היריעה'
  )
})

test('renders earlier aliyah markers when started later in Noach', async () => {
  vm = ScrollViewModel.forId(generator, '2026-10-17:shacharis,main', {
    scroll: 'torah',
    b: 1,
    c: 9,
    v: 18,
  })
  if (!vm) throw new Error('Noach model not found')
  const sd = new ScrollDisplay(vm, root)
  await sd.scrolled

  const resolver = await vm.resolver
  const target = resolver.physicalLocationFromRef({
    scroll: 'torah',
    b: 1,
    c: 8,
    v: 15,
  })
  await sd.ensurePageRendered(target.pageNumber)

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

test('does not duplicate a page when sequential rendering reaches an absolute pre-mount', async () => {
  const sd = await renderNoachFromLaterPage()
  const previousEntry = await vm.fetchPreviousPage()
  if (previousEntry?.type !== 'page') throw new Error('Expected previous page')

  const mounted = await sd.ensurePageMounted(previousEntry.pageNumber)
  const beforePages = pageNumbersInDom()
  const rendered = sd.renderPrevious(previousEntry)

  expect(rendered).toBe(mounted)
  expect(pageNumbersInDom()).toEqual(beforePages)
  expect(
    root.querySelectorAll(
      `.tikkun-page table[data-page-number="${previousEntry.pageNumber}"]`
    )
  ).toHaveLength(1)
})

test('inserts sequentially rendered pages before higher absolute pre-mounts', async () => {
  const sd = await renderNoachFromLaterPage()
  const nextEntry = await vm.fetchNextPage()
  if (nextEntry?.type !== 'page') throw new Error('Expected next page')
  await sd.ensurePageMounted(nextEntry.pageNumber + 1)

  sd.renderNext(nextEntry)

  expect(pageNumbersInDom()).toEqual(sd.getMountedPageNumbers())
  expect(pageNumbersInDom()).toContain(nextEntry.pageNumber)
  expect(pageNumbersInDom()).toContain(nextEntry.pageNumber + 1)
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

test('pre-renders earlier pages while preserving scroll position', async () => {
  const sd = await renderNoachFromLaterPage()
  root.scrollTop = 100

  const resolver = await vm.resolver
  const target = resolver.physicalLocationFromRef({
    scroll: 'torah',
    b: 1,
    c: 6,
    v: 9,
  })
  const beforePages = sd.getRenderedPageNumbers()
  await sd.ensurePageRenderedPreservingScroll(target.pageNumber)

  expect(sd.getRenderedPageNumbers()).toContain(target.pageNumber)
  expect(sd.getRenderedPageNumbers()).toEqual(
    [...new Set([...beforePages, target.pageNumber])].sort((a, b) => a - b)
  )
  expect(root.scrollTop).toBeGreaterThanOrEqual(100)
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
  const sd = await renderRun('2025-01-01:shacharis,main')

  expect(getAliyahLabel(root.firstElementChild.querySelector('tr'))).toBe(
    'חנוכה יום ז׳ (ראש חודש)'
  )
  await sd.renderNext(await vm.fetchNextPage())
  expect(root.lastElementChild?.textContent).toBe('✃ -29 עמודים ✁')
})

test('renders just one page', async () => {
  await renderRun('2024-11-01:shacharis,main')

  expect(getAliyahLabel(root.firstElementChild.querySelector('tr'))).toBe(
    'ראש חודש חשון'
  )
  expect(textFromLine(last(root.querySelectorAll('tr')))).toBe(
    'קדש יהיה לכם כל מלאכת עבדה לא תעשו'
  )
})

async function renderRun(runId: string) {
  vm = ScrollViewModel.forId(generator, runId)
  if (!vm) throw new Error(`ID ${runId} not found`)
  const sd = new ScrollDisplay(vm, root)
  await sd.scrolled
  return sd
}

async function renderNoachFromLaterPage() {
  vm = ScrollViewModel.forId(generator, '2026-10-17:shacharis,main', {
    scroll: 'torah',
    b: 1,
    c: 9,
    v: 18,
  })
  if (!vm) throw new Error('Noach model not found')
  const sd = new ScrollDisplay(vm, root)
  await sd.scrolled
  return sd
}

function getAliyahLabel(lineEl: HTMLTableRowElement) {
  return lineEl.querySelector('.aliyah-label-text')?.textContent
}

function textFromLine(lineEl: HTMLTableRowElement) {
  return [...lineEl.querySelectorAll('.mod-annotations-off')]
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
