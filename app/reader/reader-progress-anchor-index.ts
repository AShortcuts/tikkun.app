import type { LeiningRun } from '../calendar-model/model-types.ts'
import type { PlaybackAliyahIndex } from '../reading/aliyah-dom-target.ts'
import { parseAliyahIndex } from '../reading/aliyah-identity.ts'

const ALIYAH_PROGRESS_ANCHOR_SELECTOR = '[data-line-index][data-aliyah-starts]'

export type ReaderProgressAnchorInvalidation =
  | 'reader-model'
  | 'page-rendered'
  | 'page-evicted'
  | 'viewport-resized'
  | 'annotations'
  | 'text-layout'

export interface ReaderProgressAnchor {
  readonly line: HTMLElement | null
  readonly label: string
  readonly run: LeiningRun | null
  readonly aliyahIndex: PlaybackAliyahIndex | null
  readonly position: number
}

export interface ReaderProgressAnchorSelection {
  readonly index: number
  readonly current: ReaderProgressAnchor | null
  readonly next: ReaderProgressAnchor | null
}

export interface ReaderProgressAnchorSnapshot {
  readonly revision: number
  readonly anchors: readonly ReaderProgressAnchor[]
  at(position: number): ReaderProgressAnchorSelection
}

export interface ReaderProgressAnchorIndex {
  /**
   * Returns one immutable anchor snapshot. A clean read performs no DOM query or
   * geometry measurement; invalidations coalesce into the next lazy rebuild.
   */
  snapshot(): ReaderProgressAnchorSnapshot
  /** Resolves from a clean index without a full scan; a dirty index rebuilds first. */
  anchorForElement(element: HTMLElement): ReaderProgressAnchor | null
  invalidate(reason: ReaderProgressAnchorInvalidation): void
  destroy(): void
}

export function createReaderProgressAnchorIndex(
  root: HTMLElement,
  timing?: Performance,
): ReaderProgressAnchorIndex {
  let destroyed = false
  let dirty = true
  let revision = 0
  let cachedSnapshot: ReaderProgressAnchorSnapshot | null = null
  let anchorByLine = new Map<HTMLElement, ReaderProgressAnchor>()

  const assertActive = () => {
    if (destroyed) {
      throw new Error('Reader progress anchor index has been destroyed')
    }
  }

  const selectAt = (
    anchors: readonly ReaderProgressAnchor[],
    position: number,
  ): ReaderProgressAnchorSelection => {
    if (anchors.length === 0) {
      return Object.freeze({ index: -1, current: null, next: null })
    }

    let lower = 0
    let upper = anchors.length
    while (lower < upper) {
      const middle = lower + Math.floor((upper - lower) / 2)
      if (anchors[middle].position <= position) lower = middle + 1
      else upper = middle
    }

    const index = Math.max(0, lower - 1)
    return Object.freeze({
      index,
      current: anchors[index] ?? null,
      next: anchors[index + 1] ?? null,
    })
  }

  const getLineInfo = (line: HTMLElement) => {
    const pageNode = line.closest<HTMLElement>('.tikkun-page')
    if (!pageNode) return null
    return pageNode.tikkunPage?.lines[Number(line.dataset.lineIndex)] ?? null
  }

  const rebuild = () => {
    const startedAt = timing?.now()
    const rootRect = root.getBoundingClientRect()
    const lines = [
      ...root.querySelectorAll<HTMLElement>(ALIYAH_PROGRESS_ANCHOR_SELECTOR),
    ]
    const nextAnchorByLine = new Map<HTMLElement, ReaderProgressAnchor>()
    const anchors = lines
      .map((line, sourceIndex) => {
        const rect = line.getBoundingClientRect()
        const label =
          line.querySelector('.aliyah-label-text')?.textContent?.trim() ?? '—'
        const aliyahStarts = (line.dataset.aliyahStarts ?? '').split(',')
        const aliyahIndex = parseAliyahIndex(
          aliyahStarts[aliyahStarts.length - 1],
        )
        const lineInfo = getLineInfo(line)
        const anchor: ReaderProgressAnchor = Object.freeze({
          line,
          label: aliyahStarts.includes('1') ? 'ראשון' : label,
          run: lineInfo?.run ?? null,
          aliyahIndex,
          position: root.scrollTop + (rect.top - rootRect.top),
        })
        return { anchor, sourceIndex }
      })
      .sort(
        (left, right) =>
          left.anchor.position - right.anchor.position ||
          left.sourceIndex - right.sourceIndex,
      )
      .map(({ anchor }) => anchor)
    const frozenAnchors = Object.freeze(anchors)
    const nextRevision = revision + 1
    const nextSnapshot: ReaderProgressAnchorSnapshot = Object.freeze({
      revision: nextRevision,
      anchors: frozenAnchors,
      at: (position: number) => selectAt(frozenAnchors, position),
    })

    for (const anchor of frozenAnchors) {
      if (anchor.line) nextAnchorByLine.set(anchor.line, anchor)
    }

    revision = nextRevision
    anchorByLine = nextAnchorByLine
    cachedSnapshot = nextSnapshot
    dirty = false
    if (timing && startedAt !== undefined) {
      timing.measure('tikkun:reader:progress-anchor-rebuild', {
        start: startedAt,
        end: timing.now(),
        detail: { anchorCount: frozenAnchors.length },
      })
    }
    return nextSnapshot
  }

  const snapshot = () => {
    assertActive()
    if (!dirty && cachedSnapshot) return cachedSnapshot
    return rebuild()
  }

  return {
    snapshot,
    anchorForElement(element) {
      assertActive()
      const line = element.closest<HTMLElement>('[data-line-index]')
      if (!line) return null

      const currentSnapshot = snapshot()
      const exactAnchor = anchorByLine.get(line)
      if (exactAnchor) return exactAnchor

      const rootRect = root.getBoundingClientRect()
      const lineRect = line.getBoundingClientRect()
      const linePosition = root.scrollTop + (lineRect.top - rootRect.top)
      return currentSnapshot.at(linePosition).current
    },
    invalidate() {
      if (destroyed) return
      dirty = true
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      dirty = false
      cachedSnapshot = null
      anchorByLine.clear()
    },
  }
}
