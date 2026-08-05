import {
  type PageOccurrenceHint,
  RenderedEntry,
  RenderedMessageInfo,
  RenderedPageInfo,
  ScrollViewModel,
} from '../view-model/scroll-view-model'
import Page from './Page.ts'
import utils from './utils.ts'
import { centerElementInScrollRoot } from '../reader-scroll.ts'
import {
  createPageLifecycleSnapshot,
  measurePageHeight,
  type PageLifecycleSnapshot,
  type PageMountState,
} from './page-lifecycle.ts'

const { htmlToElement, purgeNode } = utils

interface PageMountRecord {
  contentIndex: number
  pageNumber: number
  state: PageMountState
  node: HTMLElement | null
  placeholderNode: HTMLElement | null
  measuredHeight: number | null
  lastAccessedAt: number
  mountPromise: Promise<HTMLElement | null> | null
}

interface ScrollPreservationAnchor {
  contentIndex: number
  pageNumber: number
  lineIndex: number
  tokenKey: string | null
  alignment: 'center' | 'top'
  viewportOffset: number
}

type EdgeLoadDirection = 'previous' | 'next'

const EDGE_LOAD_THRESHOLD_RATIO = 0.5

/**
 * Renders pages of a ScrollViewModel into a root element.
 * This is used by index.ts to render the main UI, and by
 * unit tests to test code that interact with the scroll.
 */
export class ScrollDisplay {
  /** Renders an entry (from the view model) to the top of the scroll. */
  private readonly renderPrevious = this.generateRender('afterbegin')
  /** Renders an entry (from the view model) to the bottom of the scroll. */
  private readonly renderNext = this.generateRender('beforeend')

  /** Resolves to the starting line after all initial pages have been rendered on the root. */
  readonly rendered: Promise<HTMLElement>
  /** Resolves after we scroll to the starting line. */
  readonly scrolled: Promise<void>
  /** Mounted page nodes keyed by logical content index, not physical page number. */
  private readonly renderedPages = new Map<number, HTMLElement>()
  private readonly pageMounts = new Map<number, PageMountRecord>()
  private readonly renderedEntries = new Map<number, Element>()
  private readonly pageNumberMountPromises = new Map<
    number,
    Promise<HTMLElement | null>
  >()
  private readonly contentMountPromises = new Map<
    number,
    Promise<HTMLElement | null>
  >()
  private disposed = false
  private accessCounter = 0
  private edgeLoadingReady = false
  private edgeLoadPromise: Promise<Element | null> | null = null

  constructor(readonly viewModel: ScrollViewModel, readonly root: HTMLElement) {
    root.scrollTop = 0
    purgeNode(root)
    root.addEventListener('scroll', this.handleEdgeScroll, { passive: true })

    this.rendered = viewModel.startingLocation.then(
      async ({ page, lineNumber }) => {
        const pageNode = this.renderNext(page, { preserveViewport: false })
        const lines = [...pageNode.querySelectorAll<HTMLElement>('.line')]
        const lineIndex = lineNumber - 1

        // If the target is in the top half of the page, render the previous page
        // so that we can scroll down to center the target.
        if (lineIndex < lines.length / 2) {
          const previousPage = await viewModel.fetchPreviousPage()
          if (previousPage) {
            this.renderPrevious(previousPage, { preserveViewport: false })
          }
        } else {
          const nextPage = await viewModel.fetchNextPage()
          if (nextPage) {
            this.renderNext(nextPage, { preserveViewport: false })
          }
        }

        return lines[lineIndex]
      }
    )
    this.scrolled = this.rendered.then(async (line) => {
      // Wait for parsha picker to close (from `this.rendered`)
      // so that we become measurable.
      await waitForDocumentFonts()
      await new Promise(requestAnimationFrame)
      this.scrollTo({ element: line })
      this.edgeLoadingReady = true
    })
  }

  destroy() {
    this.disposed = true
    this.edgeLoadingReady = false
    this.root.removeEventListener('scroll', this.handleEdgeScroll)
  }

  private scrollTo({ element }: { element: HTMLElement }) {
    if (this.disposed) return
    const target = getFirstVisibleWord(element) ?? element
    centerElementInScrollRoot(this.root, target)
    // Raise an event so that the title updates.
    this.root.dispatchEvent(new Event('scroll'))
  }

  private generateRender(insertPosition: InsertPosition) {
    return (
      entry: RenderedEntry,
      { preserveViewport = true }: { preserveViewport?: boolean } = {}
    ) => {
      const wasEvicted =
        entry.type === 'page' &&
        this.pageMounts.get(entry.contentIndex)?.state === 'evicted'
      const render = () => {
        let renderedNode: Element
        if (entry.type === 'message') {
          renderedNode = this.mountMessageEntry(entry, insertPosition)
        } else {
          renderedNode = this.mountPageEntry(entry, insertPosition)
        }
        return renderedNode
      }
      const node = preserveViewport
        ? this.mutatePreservingViewport(
            entry.contentIndex,
            render
          )
        : render()
      if (this.disposed) return node
      if (entry.type === 'page' && wasEvicted) {
        this.dispatchPageRemounted(entry.pageNumber, node)
      }
      this.dispatchPageRendered(entry, node)
      return node
    }
  }

  private readonly handleEdgeScroll = () => {
    if (this.disposed || !this.edgeLoadingReady || this.edgeLoadPromise) return
    const direction = this.getEdgeLoadDirection()
    if (!direction) return

    const request = this.loadAdjacentPage(direction)
    this.edgeLoadPromise = request
    void request
      .catch((error) => {
        console.error(`Failed to load ${direction} reader page`, error)
      })
      .finally(() => {
        if (this.edgeLoadPromise === request) this.edgeLoadPromise = null
      })
  }

  private getEdgeLoadDirection(): EdgeLoadDirection | null {
    const visibleHeight = this.root.clientHeight
    if (this.root.scrollTop < EDGE_LOAD_THRESHOLD_RATIO * visibleHeight) {
      return 'previous'
    }

    const hiddenBelowHeight =
      this.root.scrollHeight - (visibleHeight + this.root.scrollTop)
    return hiddenBelowHeight < EDGE_LOAD_THRESHOLD_RATIO * visibleHeight
      ? 'next'
      : null
  }

  private async loadAdjacentPage(direction: EdgeLoadDirection) {
    const entry =
      direction === 'previous'
        ? await this.viewModel.fetchPreviousPage()
        : await this.viewModel.fetchNextPage()
    if (!entry || this.disposed) return null

    return direction === 'previous'
      ? this.renderPrevious(entry)
      : this.renderNext(entry)
  }

  ensureNextContentMounted() {
    return this.loadAdjacentPage('next')
  }

  private dispatchPageRendered(entry: RenderedEntry, node: Element) {
    this.root.dispatchEvent(
      new CustomEvent('page-rendered', {
        detail: {
          entry,
          node,
        },
      })
    )
  }

  private dispatchPageRemounted(pageNumber: number, node: Element) {
    this.root.dispatchEvent(
      new CustomEvent('page-remounted', {
        detail: {
          pageNumber,
          node,
        },
      })
    )
  }

  private mutatePreservingViewport<T>(
    affectedContentIndex: number | null,
    mutation: () => T
  ) {
    const anchor = getScrollPreservationAnchor(this.root)
    const previousScrollHeight = this.root.scrollHeight
    const previousScrollTop = this.root.scrollTop
    const result = mutation()
    restoreScrollPreservationAnchor(this.root, anchor, {
      affectedContentIndex,
      previousScrollHeight,
      previousScrollTop,
    })
    return result
  }

  getMountedPageNode(pageNumber: number) {
    const record = this.getNearestMountedPageRecord(pageNumber)
    if (!record?.node) return null
    this.touchPageRecord(record)
    return record.node
  }

  getMountedPageNumbers() {
    return [...this.renderedPages.entries()]
      .sort(([left], [right]) => left - right)
      .flatMap(([, node]) =>
        node.tikkunPage ? [node.tikkunPage.pageNumber] : []
      )
  }

  getKnownPageNumbers() {
    return [...this.pageMounts.values()]
      .sort((left, right) => left.contentIndex - right.contentIndex)
      .map((record) => record.pageNumber)
  }

  private getViewportAnchorPageRecord() {
    const mountedRecords = [...this.pageMounts.values()].filter(
      (record) => record.state === 'mounted' && record.node?.isConnected
    )
    if (!mountedRecords.length) return null

    const rootRect = this.root.getBoundingClientRect()
    const viewportCenter = rootRect.top + rootRect.height / 2
    let bestRecord: PageMountRecord | null = null
    let bestDistance = Number.POSITIVE_INFINITY

    for (const record of mountedRecords) {
      const node = record.node
      if (!node) continue
      const distance = distanceFromElement(node, viewportCenter)
      if (distance < bestDistance) {
        bestDistance = distance
        bestRecord = record
      }
    }

    return bestRecord ?? mountedRecords[0] ?? null
  }

  getViewportAnchorPageNumber() {
    return this.getViewportAnchorPageRecord()?.pageNumber ?? null
  }

  isPageMounted(pageNumber: number) {
    return this.getPageRecords(pageNumber).some(
      (record) => record.state === 'mounted' && record.node?.isConnected
    )
  }

  async ensurePageMounted(pageNumber: number, hint?: PageOccurrenceHint) {
    if (this.disposed) return null
    if (hint) {
      const entry = await this.viewModel.fetchPageByPageNumber(pageNumber, hint)
      if (this.disposed || !entry || entry.type !== 'page') return null
      return this.mountPageByContentIndex(entry.contentIndex)
    }
    return this.mountPageByNumber(pageNumber)
  }

  /**
   * Mounts the logical path to a page before a user-facing scroll begins.
   * Sparse direct mounts are useful for playback and preloading, but scrolling
   * to one while missing entries are inserted ahead of it makes its position
   * stale. One entry beyond the target also leaves enough layout for centering
   * aliyot near a page edge.
   */
  async ensurePageMountedForNavigation(
    pageNumber: number,
    hint?: PageOccurrenceHint
  ) {
    if (this.disposed) return null
    const targetEntry = await this.viewModel.fetchPageByPageNumber(pageNumber, hint)
    if (this.disposed || !targetEntry || targetEntry.type !== 'page') return null

    const targetIndex = targetEntry.contentIndex
    const anchorIndex = this.getViewportAnchorPageRecord()?.contentIndex
    if (anchorIndex === undefined) {
      return this.mountPageByContentIndex(targetIndex)
    }

    const direction = targetIndex >= anchorIndex ? 1 : -1
    const firstIndex =
      targetIndex === anchorIndex ? targetIndex : anchorIndex + direction
    const overscanIndex = targetIndex + direction
    let targetNode: HTMLElement | null = null

    for (
      let contentIndex = firstIndex;
      direction > 0
        ? contentIndex <= overscanIndex
        : contentIndex >= overscanIndex;
      contentIndex += direction
    ) {
      const entry =
        contentIndex === targetIndex
          ? targetEntry
          : await this.viewModel.fetchPageByContentIndex(contentIndex)
      if (this.disposed) return null
      if (!entry) {
        if (contentIndex === overscanIndex) break
        return null
      }

      const node = await this.ensureRenderedEntryMounted(entry)
      if (this.disposed) return null
      if (contentIndex === targetIndex && node instanceof HTMLElement) {
        targetNode = node
      }
    }

    return targetNode ?? this.renderedPages.get(targetIndex) ?? null
  }

  private async ensureRenderedEntryMounted(entry: RenderedEntry) {
    if (entry.type === 'page') {
      return this.mountPageByContentIndex(entry.contentIndex)
    }

    const existing = this.renderedEntries.get(entry.contentIndex)
    if (existing?.isConnected) return existing
    const node = this.mutatePreservingViewport(entry.contentIndex, () =>
      this.mountMessageEntry(entry)
    )
    if (!this.disposed) this.dispatchPageRendered(entry, node)
    return node
  }

  private async mountPageByNumber(pageNumber: number) {
    if (this.disposed) return null
    const mounted = this.getNearestMountedPageRecord(pageNumber)
    if (mounted?.node) {
      this.touchPageRecord(mounted)
      return mounted.node
    }

    const evicted = this.getPageRecords(pageNumber).find(
      (record) => record.state === 'evicted'
    )
    if (evicted) return this.mountPageByContentIndex(evicted.contentIndex)

    const activeMount = this.pageNumberMountPromises.get(pageNumber)
    if (activeMount) return activeMount

    const mountPromise = (async () => {
      const entry = await this.viewModel.fetchPageByPageNumber(pageNumber)
      if (this.disposed || !entry || entry.type !== 'page') return null
      return this.mountFetchedPage(entry)
    })()
    this.pageNumberMountPromises.set(pageNumber, mountPromise)
    void mountPromise.then(
      () => this.clearPageNumberMount(pageNumber, mountPromise),
      () => this.clearPageNumberMount(pageNumber, mountPromise)
    )
    return mountPromise
  }

  private async mountPageByContentIndex(contentIndex: number) {
    if (this.disposed) return null
    const existing = this.pageMounts.get(contentIndex)
    if (existing?.state === 'mounted' && existing.node?.isConnected) {
      this.touchPageRecord(existing)
      return existing.node
    }

    const activeMount = this.contentMountPromises.get(contentIndex)
    if (activeMount) return activeMount

    const mountPromise = (async () => {
      const entry = await this.viewModel.fetchPageByContentIndex(contentIndex)
      if (this.disposed || !entry || entry.type !== 'page') return null
      return this.mountFetchedPage(entry)
    })()
    this.contentMountPromises.set(contentIndex, mountPromise)
    if (existing) existing.mountPromise = mountPromise
    void mountPromise.then(
      () => this.clearContentMount(contentIndex, mountPromise),
      () => this.clearContentMount(contentIndex, mountPromise)
    )
    return mountPromise
  }

  private clearPageNumberMount(
    pageNumber: number,
    mountPromise: Promise<HTMLElement | null>
  ) {
    if (this.pageNumberMountPromises.get(pageNumber) === mountPromise) {
      this.pageNumberMountPromises.delete(pageNumber)
    }
  }

  private clearContentMount(
    contentIndex: number,
    mountPromise: Promise<HTMLElement | null>
  ) {
    if (this.contentMountPromises.get(contentIndex) === mountPromise) {
      this.contentMountPromises.delete(contentIndex)
    }
    const current = this.pageMounts.get(contentIndex)
    if (current?.mountPromise === mountPromise) current.mountPromise = null
  }

  private mountFetchedPage(entry: RenderedPageInfo) {
    const existing = this.pageMounts.get(entry.contentIndex)
    if (existing?.state === 'mounted' && existing.node?.isConnected) {
      this.touchPageRecord(existing)
      return existing.node
    }
    const wasEvicted = existing?.state === 'evicted'
    const node = this.mutatePreservingViewport(entry.contentIndex, () =>
      wasEvicted && existing.placeholderNode
        ? this.mountEvictedPage(entry, existing)
        : this.mountPageEntry(entry, 'beforeend')
    )
    if (wasEvicted) this.dispatchPageRemounted(entry.pageNumber, node)
    this.dispatchPageRendered(entry, node)
    return node
  }

  private getPageRecords(pageNumber: number) {
    return [...this.pageMounts.values()]
      .filter((record) => record.pageNumber === pageNumber)
      .sort((left, right) => left.contentIndex - right.contentIndex)
  }

  private getNearestMountedPageRecord(pageNumber: number) {
    const mountedRecords = this.getPageRecords(pageNumber).filter(
      (record) => record.state === 'mounted' && record.node?.isConnected
    )
    if (mountedRecords.length <= 1) return mountedRecords[0] ?? null

    const rootRect = this.root.getBoundingClientRect()
    const viewportCenter = rootRect.top + rootRect.height / 2
    return mountedRecords.reduce((nearest, candidate) => {
      if (!nearest.node || !candidate.node) return nearest
      return distanceFromElement(candidate.node, viewportCenter) <
        distanceFromElement(nearest.node, viewportCenter)
        ? candidate
        : nearest
    })
  }

  evictPage(pageNumber: number) {
    if (this.disposed) return false
    const records = this.getPageRecords(pageNumber)
    let didEvict = false
    for (const record of records) {
      if (this.evictPageRecord(record)) didEvict = true
    }
    return didEvict
  }

  private evictPageRecord(record: PageMountRecord) {
    if (!record || record.state !== 'mounted' || !record.node) return false
    if (record.mountPromise) return false

    const node = record.node
    const measuredHeight = measurePageHeight(node) ?? record.measuredHeight ?? 0
    const placeholder = renderPagePlaceholder(
      record.pageNumber,
      record.contentIndex,
      measuredHeight
    )

    this.mutatePreservingViewport(record.contentIndex, () => {
      node.replaceWith(placeholder)
      this.renderedPages.delete(record.contentIndex)
      this.renderedEntries.set(record.contentIndex, placeholder)
      record.state = 'evicted'
      record.node = null
      record.placeholderNode = placeholder
      record.measuredHeight = measuredHeight
      record.mountPromise = null
      this.touchPageRecord(record)
    })
    this.root.dispatchEvent(
      new CustomEvent('page-evicted', {
        detail: {
          pageNumber: record.pageNumber,
          node,
        },
      })
    )
    return true
  }

  evictPages(pageNumbers: number[]) {
    return pageNumbers.filter((pageNumber) => this.evictPage(pageNumber))
  }

  getEvictedPageNumbersNearViewport({
    marginPx = this.root.clientHeight,
  }: {
    marginPx?: number
  } = {}) {
    return this.getEvictedPageRecordsNearViewport({ marginPx }).map(
      (record) => record.pageNumber
    )
  }

  private getEvictedPageRecordsNearViewport({
    marginPx = this.root.clientHeight,
  }: {
    marginPx?: number
  } = {}) {
    const rootRect = this.root.getBoundingClientRect()
    const top = rootRect.top - Math.max(0, marginPx)
    const bottom = rootRect.bottom + Math.max(0, marginPx)
    const nearRecords: PageMountRecord[] = []

    for (const record of this.pageMounts.values()) {
      if (
        record.state !== 'evicted' ||
        !record.placeholderNode?.isConnected
      ) {
        continue
      }

      const rect = record.placeholderNode.getBoundingClientRect()
      if (rect.bottom >= top && rect.top <= bottom) {
        nearRecords.push(record)
      }
    }

    return nearRecords.sort(
      (left, right) => left.contentIndex - right.contentIndex
    )
  }

  async ensureEvictedPagesMountedNearViewport(options?: { marginPx?: number }) {
    const records = this.getEvictedPageRecordsNearViewport(options)
    const mountedPages: number[] = []

    for (const record of records) {
      const node = await this.mountPageByContentIndex(record.contentIndex)
      if (node) mountedPages.push(record.pageNumber)
    }

    return mountedPages
  }

  getPageLifecycleSnapshot(): PageLifecycleSnapshot {
    return createPageLifecycleSnapshot(
      [...this.pageMounts.values()].map((record) => ({
        pageNumber: record.pageNumber,
        state: record.state,
        measuredHeight: record.measuredHeight,
        lastAccessedAt: record.lastAccessedAt,
      }))
    )
  }

  private markPageMounted(page: RenderedPageInfo, node: HTMLElement) {
    const record = this.setPageRecord(
      page.contentIndex,
      page.pageNumber,
      'mounted'
    )
    record.node = node
    record.placeholderNode = null
    record.measuredHeight = measurePageHeight(node)
    record.mountPromise = null
    this.touchPageRecord(record)
  }

  private setPageRecord(
    contentIndex: number,
    pageNumber: number,
    state: PageMountState
  ) {
    const existing = this.pageMounts.get(contentIndex)
    if (existing) {
      existing.pageNumber = pageNumber
      existing.state = state
      existing.lastAccessedAt = this.nextAccessToken()
      if (state !== 'mounted') {
        existing.node = null
        if (state !== 'evicted') {
          existing.placeholderNode = null
          existing.measuredHeight = null
        }
      }
      if (state !== 'mounting') existing.mountPromise = null
      return existing
    }

    const record: PageMountRecord = {
      contentIndex,
      pageNumber,
      state,
      node: null,
      placeholderNode: null,
      measuredHeight: null,
      lastAccessedAt: this.nextAccessToken(),
      mountPromise: null,
    }
    this.pageMounts.set(contentIndex, record)
    return record
  }

  private touchPageRecord(record: PageMountRecord) {
    record.lastAccessedAt = this.nextAccessToken()
    if (record.node) record.measuredHeight = measurePageHeight(record.node)
  }

  private nextAccessToken() {
    this.accessCounter += 1
    return this.accessCounter
  }

  private mountPageEntry(page: RenderedPageInfo, insertPosition: InsertPosition) {
    if (this.disposed) return renderPageNode(page, this.annotationsEnabled())
    const existing = this.pageMounts.get(page.contentIndex)
    if (existing?.state === 'mounted' && existing.node?.isConnected) {
      this.touchPageRecord(existing)
      return existing.node
    }
    if (existing?.state === 'evicted' && existing.placeholderNode?.isConnected) {
      return this.mountEvictedPage(page, existing)
    }

    const node = renderPageNode(page, this.annotationsEnabled())
    this.insertEntryNodeInOrder(page.contentIndex, node, insertPosition)
    this.renderedPages.set(page.contentIndex, node)
    this.renderedEntries.set(page.contentIndex, node)
    this.markPageMounted(page, node)
    return node
  }

  private mountMessageEntry(
    message: RenderedMessageInfo,
    fallbackInsertPosition: InsertPosition = 'beforeend'
  ) {
    const existing = this.renderedEntries.get(message.contentIndex)
    if (existing?.isConnected) return existing

    const node = renderMessageNode(message)
    if (this.disposed) return node
    this.insertEntryNodeInOrder(
      message.contentIndex,
      node,
      fallbackInsertPosition
    )
    this.renderedEntries.set(message.contentIndex, node)
    return node
  }

  private insertEntryNodeInOrder(
    contentIndex: number,
    node: Element,
    fallbackInsertPosition: InsertPosition = 'beforeend'
  ) {
    const nextNode = this.getNextKnownEntryDomNode(contentIndex)
    if (nextNode) {
      this.root.insertBefore(node, nextNode)
    } else {
      this.root.insertAdjacentElement(fallbackInsertPosition, node)
    }
  }

  private getNextKnownEntryDomNode(contentIndex: number) {
    let nextIndex = Number.POSITIVE_INFINITY
    let nextNode: Element | null = null

    for (const [candidateIndex, candidateNode] of this.renderedEntries) {
      if (
        candidateIndex <= contentIndex ||
        candidateIndex >= nextIndex ||
        !candidateNode.isConnected
      ) {
        continue
      }
      nextIndex = candidateIndex
      nextNode = candidateNode
    }
    return nextNode
  }

  private mountEvictedPage(page: RenderedPageInfo, record: PageMountRecord) {
    const node = renderPageNode(page, this.annotationsEnabled())
    if (this.disposed) return node
    record.placeholderNode?.replaceWith(node)
    this.renderedPages.set(page.contentIndex, node)
    this.renderedEntries.set(page.contentIndex, node)
    this.markPageMounted(page, node)
    return node
  }

  private annotationsEnabled() {
    return this.root.classList.contains('mod-annotations-on')
  }
}

function renderPageNode(page: RenderedPageInfo, annotationsEnabled: boolean) {
  const node = document.createElement('div')
  node.classList.add('tikkun-page')
  node.dataset.contentIndex = `${page.contentIndex}`
  node.tikkunPage = page

  node.appendChild(htmlToElement(Page(page, { annotationsEnabled })))

  return node
}

function distanceFromElement(node: Element, viewportCenter: number) {
  const rect = node.getBoundingClientRect()
  return rect.top <= viewportCenter && rect.bottom >= viewportCenter
    ? 0
    : Math.min(
        Math.abs(rect.top - viewportCenter),
        Math.abs(rect.bottom - viewportCenter)
      )
}

function renderPagePlaceholder(
  pageNumber: number,
  contentIndex: number,
  height: number
) {
  const node = document.createElement('div')
  node.className = 'tikkun-page-placeholder'
  node.dataset.pagePlaceholder = `${pageNumber}`
  node.dataset.contentIndex = `${contentIndex}`
  node.setAttribute('aria-hidden', 'true')
  node.style.minHeight = `${Math.max(0, height)}px`
  node.style.height = `${Math.max(0, height)}px`
  return node
}

function renderMessageNode(entry: RenderedMessageInfo) {
  const node = document.createElement('div')
  node.classList.add('tikkun-message')
  node.dataset.contentIndex = `${entry.contentIndex}`

  const span = document.createElement('span')
  span.classList.add('tikkun-message-text')
  span.textContent = entry.text

  node.appendChild(span)
  return node
}

function getFirstVisibleWord(line: HTMLElement) {
  return [...line.querySelectorAll<HTMLElement>('.word')].find((word) => {
    const rect = word.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0
  }) ?? null
}

function getScrollPreservationAnchor(
  root: HTMLElement
): ScrollPreservationAnchor | null {
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
  const contentIndex = Number(
    closestLine.closest<HTMLElement>('[data-content-index]')?.dataset.contentIndex
  )
  const pageNumber = Number(closestLine.dataset.pageNumber)
  const lineIndex = Number(closestLine.dataset.lineIndex)
  if (
    !Number.isInteger(contentIndex) ||
    !Number.isInteger(pageNumber) ||
    !Number.isInteger(lineIndex)
  ) {
    return null
  }

  const activeWord = [
    ...closestLine.querySelectorAll<HTMLElement>('.word.is-active-word'),
  ].find(isVisibleElement)
  const target = activeWord ?? getFirstVisibleWord(closestLine) ?? closestLine
  const alignment = target === closestLine ? 'top' : 'center'
  return {
    contentIndex,
    pageNumber,
    lineIndex,
    tokenKey: target.dataset.tokenKey ?? null,
    alignment,
    viewportOffset: getViewportOffset(rootRect, target, alignment),
  }
}

function restoreScrollPreservationAnchor(
  root: HTMLElement,
  anchor: ScrollPreservationAnchor | null,
  {
    affectedContentIndex,
    previousScrollHeight,
    previousScrollTop,
  }: {
    affectedContentIndex: number | null
    previousScrollHeight: number
    previousScrollTop: number
  }
) {
  if (!anchor) return
  const entry = root.querySelector<HTMLElement>(
    `[data-content-index="${anchor.contentIndex}"]`
  )
  const line = entry?.querySelector<HTMLElement>(
    `[data-page-number="${anchor.pageNumber}"][data-line-index="${anchor.lineIndex}"]`
  )
  if (line) {
    const matchingWord = anchor.tokenKey
      ? [...line.querySelectorAll<HTMLElement>('.word')].find(
          (word) =>
            word.dataset.tokenKey === anchor.tokenKey &&
            isVisibleElement(word)
        ) ?? null
      : null
    const target = matchingWord ?? line
    const alignment = matchingWord ? anchor.alignment : 'top'
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const rootRect = root.getBoundingClientRect()
      const currentOffset = getViewportOffset(rootRect, target, alignment)
      const correction = currentOffset - anchor.viewportOffset
      if (Math.abs(correction) <= 0.5) break
      root.scrollTop += correction
    }
    return
  }

  if (
    affectedContentIndex !== null &&
    affectedContentIndex < anchor.contentIndex
  ) {
    root.scrollTop =
      previousScrollTop + (root.scrollHeight - previousScrollHeight)
  }
}

function isVisibleElement(element: HTMLElement) {
  const rect = element.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

function getViewportOffset(
  rootRect: DOMRect,
  element: HTMLElement,
  alignment: ScrollPreservationAnchor['alignment']
) {
  const rect = element.getBoundingClientRect()
  const elementPosition =
    alignment === 'center' ? (rect.top + rect.bottom) / 2 : rect.top
  return elementPosition - rootRect.top
}

async function waitForDocumentFonts() {
  const fonts = document.fonts
  if (!fonts || fonts.status === 'loaded') return
  await fonts.ready
}
