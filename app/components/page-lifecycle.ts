export type PageMountState = 'mounted' | 'mounting' | 'missing' | 'evicted'

export interface PageLifecycleSnapshotEntry {
  pageNumber: number
  state: PageMountState
  measuredHeight: number | null
  lastAccessedAt: number
}

export interface PageLifecycleSnapshot {
  mountedPageCount: number
  pages: PageLifecycleSnapshotEntry[]
}

export function measurePageHeight(node: HTMLElement) {
  const rectHeight = node.getBoundingClientRect().height
  return rectHeight || node.offsetHeight || null
}

export function createPageLifecycleSnapshot(
  pages: PageLifecycleSnapshotEntry[]
): PageLifecycleSnapshot {
  const sortedPages = [...pages].sort((a, b) => a.pageNumber - b.pageNumber)
  return {
    mountedPageCount: sortedPages.filter((page) => page.state === 'mounted').length,
    pages: sortedPages,
  }
}
