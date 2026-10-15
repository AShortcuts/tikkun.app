import { compareRefs } from '../calendar-model/ref-utils.ts'
import type { LineType } from '../components/Page.ts'
import { tokenizeReaderWords } from '../reader/word-tokenization.ts'
import type { RefWithScroll, ScrollName } from '../ref.ts'
import textFilter from '../text-filter.ts'
import { loadScrollPageLines } from '../view-model/scroll-view-model.ts'
import type { PassageRange } from './print-model.ts'

type SelectedWord = { page: number; line: number; fragment: number; word: number; annotated: boolean }

export function capturePrintSelection(book: HTMLElement, selection = book.ownerDocument.getSelection()): SelectedWord[] {
  if (!selection || selection.isCollapsed) return []
  const ranges = Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index))
  return [...book.querySelectorAll<HTMLElement>('.word[data-word-index]')].filter(word => {
    if (word.hidden) return false
    return ranges.some(range => {
      if (!range.intersectsNode(word) || !word.getClientRects().length) return false
      const contents = word.ownerDocument.createRange()
      contents.selectNodeContents(word)
      const overlap = range.cloneRange()
      if (overlap.compareBoundaryPoints(Range.START_TO_START, contents) < 0) overlap.setStart(contents.startContainer, contents.startOffset)
      if (overlap.compareBoundaryPoints(Range.END_TO_END, contents) > 0) overlap.setEnd(contents.endContainer, contents.endOffset)
      return !overlap.collapsed && Boolean(overlap.toString().trim())
    })
  }).map(word => ({
    page: Number(word.dataset.pageNumber), line: Number(word.dataset.lineIndex),
    fragment: Number(word.dataset.fragmentIndex), word: Number(word.dataset.wordIndex),
    // Paired Reader strips marks but retains the annotated word grouping.
    annotated: word.dataset.annotationsMode === 'on' || Boolean(word.closest('.reader-reading-page.mod-two-side')),
  }))
}

function lastReference(lines: LineType[], scroll: ScrollName): RefWithScroll | undefined {
  for (const line of [...lines].reverse()) {
    const verse = line.verses.at(-1)
    if (verse) return { scroll, b: verse.book, c: verse.chapter, v: verse.verse }
  }
}

export async function selectedPrintRange(words: SelectedWord[], loadPage?: (page: number) => Promise<LineType[]>, scroll: ScrollName = 'torah'): Promise<PassageRange | undefined> {
  if (!words.length) return undefined
  const pageNumbers = new Set(words.flatMap(word => word.page > 1 ? [word.page - 1, word.page] : [word.page]))
  const loader = loadPage ?? ((page: number) => loadScrollPageLines(scroll, page))
  const pages = new Map(await Promise.all([...pageNumbers].map(async page => [page, await loader(page)] as const)))
  const references: RefWithScroll[] = []
  for (const page of new Set(words.map(word => word.page))) {
    const previous = pages.get(page - 1) ?? []
    let current = lastReference(previous, scroll)
    let startsVerse = !previous.length || previous.flatMap(line => line.text.flat()).join(' ').trim().endsWith('׃')
    for (const [lineIndex, line] of pages.get(page)!.entries()) {
      let nextVerse = 0
      const advance = () => {
        const verse = line.verses[nextVerse++]
        if (verse) current = { scroll, b: verse.book, c: verse.chapter, v: verse.verse }
      }
      const selected = words.filter(word => word.page === page && word.line === lineIndex)
      line.text.forEach((column, columnIndex) => column.forEach((fragment, fragmentIndex) => {
        let annotatedIndex = 0
        let plainIndex = 0
        for (const part of fragment.split(/(?<=׃)/u).filter(part => part.trim())) {
          if (startsVerse) { advance(); startsVerse = false }
          const annotatedCount = tokenizeReaderWords(textFilter({ text: part, annotated: true })).length
          const plainCount = tokenizeReaderWords(textFilter({ text: part, annotated: false })).length
          for (const word of selected) {
            const start = word.annotated ? annotatedIndex : plainIndex
            const count = word.annotated ? annotatedCount : plainCount
            if (word.fragment !== columnIndex * 100 + fragmentIndex || word.word < start || word.word >= start + count) continue
            if (!current) throw new Error('The selected text could not be matched to a pasuk. Select the passage again.')
            references.push({ ...current })
          }
          annotatedIndex += annotatedCount
          plainIndex += plainCount
          if (part.includes('׃')) startsVerse = true
        }
      }))
    }
  }
  if (references.length !== words.length) throw new Error('The selected text could not be matched to a pasuk. Select the passage again.')
  references.sort(compareRefs)
  return { start: references[0], end: references[references.length - 1] }
}
