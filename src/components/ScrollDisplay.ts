import {
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
  pageNumber: number
  state: PageMountState
  node: HTMLElement | null
  placeholderNode: HTMLElement | null
  measuredHeight: number | null
  lastAccessedAt: number
  mountPromise: Promise<HTMLElement | null> | null
}

interface ScrollPreservationAnchor {
  pageNumber: number
  lineIndex: number
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
  private readonly renderedPages = new Map<number, HTMLElement>()
  private readonly pageMounts = new Map<number, PageMountRecord>()
  private disposed = false
  private accessCounter = 0
  private edgeLoadingReady = false
  private edgeLoadPromise: Promise<void> | null = null

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
        this.pageMounts.get(entry.pageNumber)?.state === 'evicted'
      const render = () => {
        let renderedNode: Element
        if (entry.type === 'message') {
          renderedNode = renderMessageNode(entry)
        } else {
          renderedNode = this.mountPageEntry(entry, insertPosition)
        }
        if (!this.disposed && entry.type === 'message') {
          this.root.insertAdjacentElement(insertPosition, renderedNode)
        }
        return renderedNode
      }
      const node = preserveViewport
        ? this.mutatePreservingViewport(
            entry.type === 'page' ? entry.pageNumber : null,
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
    if (!entry || this.disposed) return

    if (direction === 'previous') this.renderPrevious(entry)
    else this.renderNext(entry)
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
    affectedPageNumber: number | null,
    mutation: () => T
  ) {
    const anchor = getScrollPreservationAnchor(this.root)
    const previousScrollHeight = this.root.scrollHeight
    const previousScrollTop = this.root.scrollTop
    const result = mutation()
    restoreScrollPreservationAnchor(this.root, anchor, {
      affectedPageNumber,
      previousScrollHeight,
      previousScrollTop,
    })
    return result
  }

  getPageNode(pageNumber: number) {
    return this.getMountedPageNode(pageNumber)
  }

  getMountedPageNode(pageNumber: number) {
    const record = this.pageMounts.get(pageNumber)
    if (record?.state === 'mounted' && record.node) {
      this.touchPageRecord(record)
      return record.node
    }
    return this.renderedPages.get(pageNumber) ?? null
  }

  getRenderedPageNumbers() {
    return this.getMountedPageNumbers()
  }

  getMountedPageNumbers() {
    return [...this.renderedPages.keys()].sort((a, b) => a - b)
  }

  getKnownPageNumbers() {
    return [...this.pageMounts.keys()].sort((a, b) => a - b)
  }

  getViewportAnchorPageNumber() {
    const mountedPages = this.getMountedPageNumbers()
    if (!mountedPages.length) return null

    const rootRect = this.root.getBoundingClientRect()
    const viewportCenter = rootRect.top + rootRect.height / 2
    let bestPageNumber: number | null = null
    let bestDistance = Number.POSITIVE_INFINITY

    for (const pageNumber of mountedPages) {
      const node = this.getMountedPageNode(pageNumber)
      if (!node) continue
      const rect = node.getBoundingClientRect()
      const distance =
        rect.top <= viewportCenter && rect.bottom >= viewportCenter
          ? 0
          : Math.min(
              Math.abs(rect.top - viewportCenter),
              Math.abs(rect.bottom - viewportCenter)
            )
      if (distance < bestDistance) {
        bestDistance = distance
        bestPageNumber = pageNumber
      }
    }

    return bestPageNumber ?? mountedPages[0] ?? null
  }

  isPageMounted(pageNumber: number) {
    const record = this.pageMounts.get(pageNumber)
    return Boolean(record?.state === 'mounted' && record.node?.isConnected)
  }

  async ensurePageMounted(pageNumber: number) {
    if (this.disposed) return null
    return this.mountPageByNumber(pageNumber)
  }

  private async mountPageByNumber(pageNumber: number) {
    if (this.disposed) return null
    const existing = this.pageMounts.get(pageNumber)
    if (existing?.state === 'mounted' && existing.node) {
      this.touchPageRecord(existing)
      return existing.node
    }
    if (existing?.state === 'mounting' && existing.mountPromise) {
      return existing.mountPromise
    }
    if (existing?.state === 'missing') return null

    const wasEvicted = existing?.state === 'evicted'
    const evictedPlaceholder = wasEvicted ? existing?.placeholderNode : null
    const record = this.setPageRecord(pageNumber, 'mounting')
    if (evictedPlaceholder) record.placeholderNode = evictedPlaceholder
    const mountPromise = (async () => {
      const entry = await this.viewModel.fetchPageByPageNumber(pageNumber)
      if (this.disposed) return null
      if (!entry) {
        this.setPageRecord(pageNumber, 'missing')
        return null
      }
      if (entry.type !== 'page') {
        this.setPageRecord(pageNumber, 'missing')
        return null
      }
      if (record.state === 'mounted' && record.node?.isConnected) {
        return record.node
      }

      const node = this.mutatePreservingViewport(pageNumber, () =>
        wasEvicted && record.placeholderNode
          ? this.mountEvictedPage(entry, record)
          : this.mountPageInOrder(entry)
      )
      if (wasEvicted) this.dispatchPageRemounted(pageNumber, node)
      this.dispatchPageRendered(entry, node)
      return node
    })().catch((error) => {
      if (record.state === 'mounted' && record.node?.isConnected) {
        return record.node
      }
      if (wasEvicted) {
        record.state = 'evicted'
        record.mountPromise = null
      } else {
        this.pageMounts.delete(pageNumber)
      }
      throw error
    })
    record.mountPromise = mountPromise
    return mountPromise
  }

  evictPage(pageNumber: number) {
    if (this.disposed) return false
    const record = this.pageMounts.get(pageNumber)
    if (!record || record.state !== 'mounted' || !record.node) return false
    if (record.mountPromise) return false

    const node = record.node
    const measuredHeight = measurePageHeight(node) ?? record.measuredHeight ?? 0
    const placeholder = renderPagePlaceholder(pageNumber, measuredHeight)

    this.mutatePreservingViewport(pageNumber, () => {
      node.replaceWith(placeholder)
      this.renderedPages.delete(pageNumber)
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
          pageNumber,
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
    const rootRect = this.root.getBoundingClientRect()
    const top = rootRect.top - Math.max(0, marginPx)
    const bottom = rootRect.bottom + Math.max(0, marginPx)
    const nearPages: number[] = []

    for (const record of this.pageMounts.values()) {
      if (
        record.state !== 'evicted' ||
        !record.placeholderNode?.isConnected
      ) {
        continue
      }

      const rect = record.placeholderNode.getBoundingClientRect()
      if (rect.bottom >= top && rect.top <= bottom) {
        nearPages.push(record.pageNumber)
      }
    }

    return nearPages.sort((a, b) => a - b)
  }

  async ensureEvictedPagesMountedNearViewport(options?: { marginPx?: number }) {
    const pageNumbers = this.getEvictedPageNumbersNearViewport(options)
    const mountedPages: number[] = []

    for (const pageNumber of pageNumbers) {
      const node = await this.ensurePageMounted(pageNumber)
      if (node) mountedPages.push(pageNumber)
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

  private markPageMounted(pageNumber: number, node: HTMLElement) {
    const record = this.setPageRecord(pageNumber, 'mounted')
    record.node = node
    record.placeholderNode = null
    record.measuredHeight = measurePageHeight(node)
    record.mountPromise = null
    this.touchPageRecord(record)
  }

  private setPageRecord(pageNumber: number, state: PageMountState) {
    const existing = this.pageMounts.get(pageNumber)
    if (existing) {
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
      pageNumber,
      state,
      node: null,
      placeholderNode: null,
      measuredHeight: null,
      lastAccessedAt: this.nextAccessToken(),
      mountPromise: null,
    }
    this.pageMounts.set(pageNumber, record)
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
    if (this.disposed) return renderPageNode(page)
    const existing = this.pageMounts.get(page.pageNumber)
    if (existing?.state === 'mounted' && existing.node?.isConnected) {
      this.touchPageRecord(existing)
      return existing.node
    }
    if (existing?.state === 'evicted' && existing.placeholderNode?.isConnected) {
      return this.mountEvictedPage(page, existing)
    }

    const node = renderPageNode(page)
    this.insertPageNodeInOrder(page.pageNumber, node, insertPosition)
    this.renderedPages.set(page.pageNumber, node)
    this.markPageMounted(page.pageNumber, node)
    return node
  }

  private mountPageInOrder(page: RenderedPageInfo) {
    const node = renderPageNode(page)
    if (this.disposed) return node
    this.insertPageNodeInOrder(page.pageNumber, node)
    this.renderedPages.set(page.pageNumber, node)
    this.markPageMounted(page.pageNumber, node)
    return node
  }

  private insertPageNodeInOrder(
    pageNumber: number,
    node: HTMLElement,
    fallbackInsertPosition: InsertPosition = 'beforeend'
  ) {
    const nextNode = this.getNextKnownPageDomNode(pageNumber)
    if (nextNode) {
      this.root.insertBefore(node, nextNode)
    } else {
      this.root.insertAdjacentElement(fallbackInsertPosition, node)
    }
  }

  private getNextKnownPageDomNode(pageNumber: number) {
    let nextRecord: PageMountRecord | null = null

    for (const record of this.pageMounts.values()) {
      if (record.pageNumber <= pageNumber) continue
      const node = this.getConnectedPageRecordNode(record)
      if (!node) continue
      if (!nextRecord || record.pageNumber < nextRecord.pageNumber) {
        nextRecord = record
      }
    }

    return nextRecord ? this.getConnectedPageRecordNode(nextRecord) : null
  }

  private getConnectedPageRecordNode(record: PageMountRecord) {
    if (record.state === 'mounted' && record.node?.isConnected) {
      return record.node
    }
    if (record.state === 'evicted' && record.placeholderNode?.isConnected) {
      return record.placeholderNode
    }
    return null
  }

  private mountEvictedPage(page: RenderedPageInfo, record: PageMountRecord) {
    const node = renderPageNode(page)
    if (this.disposed) return node
    record.placeholderNode?.replaceWith(node)
    this.renderedPages.set(page.pageNumber, node)
    this.markPageMounted(page.pageNumber, node)
    return node
  }
}

function renderPageNode(page: RenderedPageInfo) {
  const node = document.createElement('div')
  node.classList.add('tikkun-page')
  node.tikkunPage = page

  node.appendChild(htmlToElement(Page(page)))

  return node
}

function renderPagePlaceholder(pageNumber: number, height: number) {
  const node = document.createElement('div')
  node.className = 'tikkun-page-placeholder'
  node.dataset.pagePlaceholder = `${pageNumber}`
  node.setAttribute('aria-hidden', 'true')
  node.style.minHeight = `${Math.max(0, height)}px`
  node.style.height = `${Math.max(0, height)}px`
  return node
}

function renderMessageNode(entry: RenderedMessageInfo) {
  const node = document.createElement('div')
  node.classList.add('tikkun-message')

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
  const pageNumber = Number(closestLine.dataset.pageNumber)
  const lineIndex = Number(closestLine.dataset.lineIndex)
  if (!Number.isInteger(pageNumber) || !Number.isInteger(lineIndex)) return null

  return {
    pageNumber,
    lineIndex,
    viewportOffset: closestLine.getBoundingClientRect().top - rootRect.top,
  }
}

function restoreScrollPreservationAnchor(
  root: HTMLElement,
  anchor: ScrollPreservationAnchor | null,
  {
    affectedPageNumber,
    previousScrollHeight,
    previousScrollTop,
  }: {
    affectedPageNumber: number | null
    previousScrollHeight: number
    previousScrollTop: number
  }
) {
  if (!anchor) return
  const line = root.querySelector<HTMLElement>(
    `[data-page-number="${anchor.pageNumber}"][data-line-index="${anchor.lineIndex}"]`
  )
  if (line) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const rootRect = root.getBoundingClientRect()
      const currentOffset = line.getBoundingClientRect().top - rootRect.top
      const correction = currentOffset - anchor.viewportOffset
      if (Math.abs(correction) <= 0.5) break
      root.scrollTop += correction
    }
    return
  }

  if (
    affectedPageNumber !== null &&
    affectedPageNumber < anchor.pageNumber
  ) {
    root.scrollTop =
      previousScrollTop + (root.scrollHeight - previousScrollHeight)
  }
}

async function waitForDocumentFonts() {
  const fonts = document.fonts
  if (!fonts || fonts.status === 'loaded') return
  await fonts.ready
}
