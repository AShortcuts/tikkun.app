export type ReaderFocalPointMode = 'browser' | 'reader'

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
  options: ScrollToOptions = {}
) {
  const top = getCenteredElementScrollTop(root, element)
  if (options.behavior) {
    root.scrollTo({ ...options, top })
    return
  }

  root.scrollTop = top
}
