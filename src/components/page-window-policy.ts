export type PageRetainReason =
  | 'viewport'
  | 'rail-target'
  | 'playback'
  | 'initial-neighbor'

export interface PageWindowPolicyConfig {
  viewportRadius: number
  playbackForwardPageCount: number
}

export interface PageWindowPolicyInput {
  mountedPageNumbers: number[]
  viewportPageNumber?: number | null
  railTargetPageNumber?: number | null
  playbackPageNumbers?: number[]
  initialNeighborPageNumbers?: number[]
  config?: Partial<PageWindowPolicyConfig>
}

export interface PageRetainReasonEntry {
  pageNumber: number
  reasons: PageRetainReason[]
}

export interface PageWindowPolicyResult {
  config: PageWindowPolicyConfig
  retainedPages: number[]
  evictionCandidates: number[]
  retainReasons: PageRetainReasonEntry[]
}

export interface PageVirtualizationApplication {
  enabled: boolean
  evictedPages: number[]
}

const DEFAULT_CONFIG: PageWindowPolicyConfig = {
  viewportRadius: 2,
  playbackForwardPageCount: 2,
}

const reasonPriority: PageRetainReason[] = [
  'viewport',
  'rail-target',
  'playback',
  'initial-neighbor',
]

export function computePageWindowPolicy({
  mountedPageNumbers,
  viewportPageNumber = null,
  railTargetPageNumber = null,
  playbackPageNumbers = [],
  initialNeighborPageNumbers = [],
  config: inputConfig = {},
}: PageWindowPolicyInput): PageWindowPolicyResult {
  const config = normalizeConfig(inputConfig)
  const mountedPages = sortedUniquePageNumbers(mountedPageNumbers)
  const reasonsByPage = new Map<number, Set<PageRetainReason>>()

  if (isPageNumber(viewportPageNumber)) {
    for (
      let pageNumber = viewportPageNumber - config.viewportRadius;
      pageNumber <= viewportPageNumber + config.viewportRadius;
      pageNumber += 1
    ) {
      addReason(reasonsByPage, pageNumber, 'viewport')
    }
  }

  if (isPageNumber(railTargetPageNumber)) {
    addReason(reasonsByPage, railTargetPageNumber, 'rail-target')
  }

  const playbackPages = sortedUniquePageNumbers(playbackPageNumbers).slice(
    0,
    config.playbackForwardPageCount + 1
  )
  playbackPages.forEach((pageNumber) => {
    addReason(reasonsByPage, pageNumber, 'playback')
  })

  sortedUniquePageNumbers(initialNeighborPageNumbers).forEach((pageNumber) => {
    addReason(reasonsByPage, pageNumber, 'initial-neighbor')
  })

  const retainedPages = [...reasonsByPage.keys()].sort((a, b) => a - b)
  const retainedPageSet = new Set(retainedPages)

  return {
    config,
    retainedPages,
    evictionCandidates: mountedPages.filter((pageNumber) => !retainedPageSet.has(pageNumber)),
    retainReasons: retainedPages.map((pageNumber) => ({
      pageNumber,
      reasons: sortReasons(reasonsByPage.get(pageNumber) ?? new Set()),
    })),
  }
}

export function applyPageWindowPolicyEviction({
  enabled,
  policy,
  evictPages,
}: {
  enabled: boolean
  policy: Pick<PageWindowPolicyResult, 'evictionCandidates'>
  evictPages: (pageNumbers: number[]) => number[]
}): PageVirtualizationApplication {
  if (!enabled) return { enabled, evictedPages: [] }
  return {
    enabled,
    evictedPages: evictPages(policy.evictionCandidates),
  }
}

function normalizeConfig(config: Partial<PageWindowPolicyConfig>) {
  return {
    viewportRadius: Math.max(
      0,
      Math.floor(config.viewportRadius ?? DEFAULT_CONFIG.viewportRadius)
    ),
    playbackForwardPageCount: Math.max(
      0,
      Math.floor(
        config.playbackForwardPageCount ?? DEFAULT_CONFIG.playbackForwardPageCount
      )
    ),
  }
}

function sortedUniquePageNumbers(pageNumbers: readonly number[]) {
  return [...new Set(pageNumbers.filter(isPageNumber))].sort((a, b) => a - b)
}

function isPageNumber(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0
}

function addReason(
  reasonsByPage: Map<number, Set<PageRetainReason>>,
  pageNumber: number,
  reason: PageRetainReason
) {
  if (!isPageNumber(pageNumber)) return
  const reasons = reasonsByPage.get(pageNumber) ?? new Set<PageRetainReason>()
  reasons.add(reason)
  reasonsByPage.set(pageNumber, reasons)
}

function sortReasons(reasons: Set<PageRetainReason>) {
  return reasonPriority.filter((reason) => reasons.has(reason))
}
