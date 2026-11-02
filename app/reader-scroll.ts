export type ReaderFocalPointMode = 'browser' | 'reader'

export type CenterElementInScrollRootOptions = ScrollToOptions & {
  minimumScrollDistance?: number
}

let readerFocalPointMode: ReaderFocalPointMode = 'browser'

export function setReaderFocalPointMode(mode: ReaderFocalPointMode) {
  readerFocalPointMode = mode
}

export function getReaderFocalPointClientY(root: HTMLElement) {
  const rootRect = root.getBoundingClientRect()
  const focalY =
    readerFocalPointMode === 'browser'
      ? root.ownerDocument.documentElement.clientHeight / 2
      : rootRect.top + root.clientHeight / 2

  return Math.max(rootRect.top, Math.min(rootRect.bottom - 1, focalY))
}

export function getReaderFocalPointScrollTop(root: HTMLElement) {
  const rootRect = root.getBoundingClientRect()
  return root.scrollTop + (getReaderFocalPointClientY(root) - rootRect.top)
}

/**
 * Scroll and presentation code asks for this every frame. Canonical words run
 * top to bottom in document order, so bisect to the focal line and compare only
 * the words within a pixel of the nearest one; measuring every mounted word made
 * each scroll frame grow with the amount of loaded text.
 */
const focalWordSelector = '[data-reader-canonical="true"] .word:not([hidden]):not(.mod-passage-context)'

export function getVisibleReaderFocalWord(root: HTMLElement): HTMLElement | null {
  const focalY = getReaderFocalPointClientY(root)
  // The browser keeps this live list current, so only probed words pay for the filter.
  const words = root.getElementsByClassName('word') as HTMLCollectionOf<HTMLElement>
  const offsets = new Map<number, number | null>()
  const offsetAt = (index: number) => {
    let offset = offsets.get(index)
    if (offset === undefined) {
      const word = words[index]!
      const rect = word.matches(focalWordSelector) ? word.getBoundingClientRect() : null
      offset = rect?.width && rect.height ? (rect.top + rect.bottom) / 2 - focalY : null
      offsets.set(index, offset)
    }
    return offset
  }

  // First measurable word whose center is at or below the focal line.
  let low = 0
  let high = words.length
  while (low < high) {
    const middle = (low + high) >> 1
    let probe = middle
    while (probe < high && offsetAt(probe) === null) probe += 1
    if (probe < high && offsetAt(probe)! < 0) low = probe + 1
    else high = middle
  }

  let nearest = Number.POSITIVE_INFINITY
  for (let index = low - 1; index >= 0; index -= 1) {
    const offset = offsetAt(index)
    if (offset !== null) { nearest = -offset; break }
  }
  for (let index = low; index < words.length; index += 1) {
    const offset = offsetAt(index)
    if (offset !== null) { nearest = Math.min(nearest, offset); break }
  }
  if (nearest === Number.POSITIVE_INFINITY) return null

  // Only words within a pixel of the nearest can win, including the active-word tie.
  const inBand = (index: number) => {
    const offset = offsetAt(index)
    return offset === null || Math.abs(offset) <= nearest + 1
  }
  let first = low
  let last = low - 1
  while (first > 0 && inBand(first - 1)) first -= 1
  while (last < words.length - 1 && inBand(last + 1)) last += 1

  let closest: HTMLElement | null = null
  let distance = Number.POSITIVE_INFINITY
  for (let index = first; index <= last; index += 1) {
    const offset = offsetAt(index)
    if (offset === null) continue
    const word = words[index]!
    const candidateDistance = Math.abs(offset)
    if (candidateDistance < distance ||
      (Math.abs(candidateDistance - distance) < 1 && word.classList.contains('is-active-word'))) {
      closest = word
      distance = candidateDistance
    }
  }
  return closest
}

const SMOOTH_SCROLL_RESTART_MS = 600
const runningSmoothScrolls = new WeakMap<HTMLElement, { element: HTMLElement; top: number; startedAt: number }>()

export function getElementTopWithinScrollRoot(root: HTMLElement, element: HTMLElement) {
  const rootRect = root.getBoundingClientRect()
  const elementRect = element.getBoundingClientRect()
  return root.scrollTop + (elementRect.top - rootRect.top)
}

export function getCenteredElementScrollTop(root: HTMLElement, element: HTMLElement) {
  const elementRect = element.getBoundingClientRect()
  const elementCenterY = elementRect.top + elementRect.height / 2
  return Math.max(
    0,
    root.scrollTop + elementCenterY - getReaderFocalPointClientY(root)
  )
}

export function centerElementInScrollRoot(
  root: HTMLElement,
  element: HTMLElement,
  options: CenterElementInScrollRootOptions = {}
) {
  const top = getCenteredElementScrollTop(root, element)
  const { minimumScrollDistance = 0, ...scrollOptions } = options
  if (Math.abs(top - root.scrollTop) <= Math.max(0, minimumScrollDistance)) {
    return false
  }

  if (scrollOptions.behavior === 'smooth') {
    // Playback asks again every frame for the same word; WebKit restarts a repeated smooth scroll, so it never moves.
    const now = performance.now()
    const running = runningSmoothScrolls.get(root)
    if (running?.element === element && Math.abs(running.top - top) < 1 &&
      now - running.startedAt < SMOOTH_SCROLL_RESTART_MS) return true
    runningSmoothScrolls.set(root, { element, top, startedAt: now })
    root.scrollTo({ ...scrollOptions, top })
    return true
  }

  runningSmoothScrolls.delete(root)
  if (scrollOptions.behavior) {
    root.scrollTo({ ...scrollOptions, top })
    return true
  }

  root.scrollTop = top
  return true
}
