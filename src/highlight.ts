type ElementMatcher = (node: Node) => node is HTMLElement

const ancestorOf = (
  node: Node | null,
  options: { matching: ElementMatcher },
): HTMLElement | null => {
  if (!node) return null
  if (options.matching(node)) return node
  return ancestorOf(node.parentNode, options)
}

const onHighlightIntentComplete = (
  node: Node,
  callback: (selection: Selection) => void,
) => {
  let lastMouseUpAt = 0
  let lastSelectionStartAt = 0
  const handlePointerUp = () => {
    const previousLastMouseUp = lastMouseUpAt
    lastMouseUpAt = Date.now()
    if (lastSelectionStartAt <= previousLastMouseUp) return

    const selection = window.getSelection()
    if (!selection || selection.isCollapsed) return
    callback(selection)
  }
  const handleSelectionStart = () => {
    lastSelectionStartAt = Date.now()
  }

  node.addEventListener('pointerup', handlePointerUp)
  node.addEventListener('selectstart', handleSelectionStart)
  return () => {
    node.removeEventListener('pointerup', handlePointerUp)
    node.removeEventListener('selectstart', handleSelectionStart)
  }
}

type HighlightPosition = {
  page: number
  line: number
  offset: number
  node: Node
  lineElement: HTMLElement
}

function isBefore(left: HighlightPosition, right: HighlightPosition) {
  return (
    left.page < right.page ||
    (left.page === right.page && left.line < right.line) ||
    (left.page === right.page &&
      left.line === right.line &&
      left.offset < right.offset)
  )
}

function positionFromSelection(
  node: Node,
  offset: number,
  lineOf: (node: Node) => HTMLElement | null,
  pageOf: (node: Node) => HTMLElement | null,
): HighlightPosition | null {
  const lineElement = lineOf(node)
  if (!lineElement) return null
  const pageElement = pageOf(lineElement)
  if (!pageElement) return null

  const page = Number(pageElement.dataset.pageNumber)
  const line = Number(lineElement.dataset.lineIndex)
  if (
    !Number.isSafeInteger(page) ||
    page <= 0 ||
    !Number.isSafeInteger(line) ||
    line < 0
  ) {
    return null
  }

  return { page, line, offset, node, lineElement }
}

export const watchForHighlighting = () => {
  const book = document.querySelector<HTMLElement>('.tikkun-book')
  if (!book) throw new Error('Cannot watch for highlighting without a tikkun book')

  return onHighlightIntentComplete(book, (selection) => {
    const anchorNode = selection.anchorNode
    const focusNode = selection.focusNode
    if (!anchorNode || !focusNode) return

    const isLine = (node: Node): node is HTMLElement =>
      node instanceof HTMLElement && node.dataset.class === 'line'
    const isPage = (node: Node): node is HTMLElement =>
      node instanceof HTMLElement && node.classList.contains('tikkun-page')
    const lineOf = (node: Node) => ancestorOf(node, { matching: isLine })
    const pageOf = (node: Node) => ancestorOf(node, { matching: isPage })
    const anchor = positionFromSelection(
      anchorNode,
      selection.anchorOffset,
      lineOf,
      pageOf,
    )
    const focus = positionFromSelection(
      focusNode,
      selection.focusOffset,
      lineOf,
      pageOf,
    )
    if (!anchor || !focus) return

    const [selectionStart, selectionEnd] = isBefore(focus, anchor)
      ? [focus, anchor]
      : [anchor, focus]
    const startLine = selectionStart.lineElement
    const endLine = selectionEnd.lineElement
    const lineContainer = startLine.parentElement
    if (!lineContainer || endLine.parentElement !== lineContainer) return

    const allLines = [
      ...lineContainer.querySelectorAll<HTMLElement>('[data-class="line"]'),
    ]
    const firstLineIndex = allLines.indexOf(startLine)
    const lastLineIndex = allLines.indexOf(endLine)
    if (firstLineIndex < 0 || lastLineIndex < firstLineIndex) return

    const selectedLines = allLines.slice(firstLineIndex, lastLineIndex + 1)
    const selectedFragments: Array<{
      fragment: HTMLElement
      text: string
    }> = []
    for (const line of selectedLines) {
      const fragment = line.querySelector<HTMLElement>(
        '.fragment.mod-annotations-on',
      )
      if (!fragment) return
      selectedFragments.push({ fragment, text: fragment.textContent ?? '' })
    }
    if (!selectedFragments.length) return

    const highlight = (
      selected: { fragment: HTMLElement; text: string },
      start: number,
      end: number,
    ) => {
      const boundedStart = Math.max(0, Math.min(start, selected.text.length))
      const boundedEnd = Math.max(
        boundedStart,
        Math.min(end, selected.text.length),
      )
      const mark = document.createElement('mark')
      mark.style.background = 'orange'
      mark.style.color = 'black'
      mark.textContent = selected.text.slice(boundedStart, boundedEnd)
      selected.fragment.replaceChildren(
        selected.text.slice(0, boundedStart),
        mark,
        selected.text.slice(boundedEnd),
      )
    }

    if (selectedFragments.length === 1) {
      const [selected] = selectedFragments
      if (!selected) return
      highlight(selected, selectionStart.offset, selectionEnd.offset)
    } else {
      const first = selectedFragments[0]
      const last = selectedFragments[selectedFragments.length - 1]
      if (!first || !last) return
      highlight(first, selectionStart.offset, first.text.length)
      for (const selected of selectedFragments.slice(1, -1)) {
        highlight(selected, 0, selected.text.length)
      }
      highlight(last, 0, selectionEnd.offset)
    }

    selection.collapseToEnd()
  })
}
