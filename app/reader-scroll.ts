export type ReaderFocalPointMode = 'browser' | 'reader'

export type CenterElementInScrollRootOptions = ScrollToOptions & {
  minimumScrollDistance?: number
}

let readerFocalPointMode: ReaderFocalPointMode = 'reader'

export function setReaderFocalPointMode(mode: ReaderFocalPointMode) {
  readerFocalPointMode = mode
}

export function getReaderFocalPointClientY(root: HTMLElement) {
  const rootRect = root.getBoundingClientRect()
  const focalY =
    readerFocalPointMode === 'browser'
      ? document.documentElement.clientHeight / 2
      : rootRect.top + root.clientHeight / 2

  return Math.max(rootRect.top, Math.min(rootRect.bottom - 1, focalY))
}

export function getReaderFocalPointScrollTop(root: HTMLElement) {
  const rootRect = root.getBoundingClientRect()
  return root.scrollTop + (getReaderFocalPointClientY(root) - rootRect.top)
}

export function getVisibleReaderFocalWord(root: HTMLElement): HTMLElement | null {
  const focalY = getReaderFocalPointClientY(root)
  let closest: HTMLElement | null = null
  let distance = Number.POSITIVE_INFINITY
  for (const word of root.querySelectorAll<HTMLElement>(
    '[data-reader-canonical="true"] .word:not([hidden]):not(.mod-passage-context)',
  )) {
    const rect = word.getBoundingClientRect()
    if (!rect.width || !rect.height) continue
    const candidateDistance = Math.abs((rect.top + rect.bottom) / 2 - focalY)
    if (candidateDistance < distance ||
      (Math.abs(candidateDistance - distance) < 1 && word.classList.contains('is-active-word'))) {
      closest = word
      distance = candidateDistance
    }
  }
  return closest
}

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

  if (scrollOptions.behavior) {
    root.scrollTo({ ...scrollOptions, top })
    return true
  }

  root.scrollTop = top
  return true
}
