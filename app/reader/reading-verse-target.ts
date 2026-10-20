import { compareRefs } from '../calendar-model/ref-utils.ts'
import type { Ref } from '../ref.ts'
import { verseStartSequenceIndex, type SequencedWord } from '../reading/exact-token-range.ts'
import { projectPassageWords, type PassageWordSelection } from '../reading/passage-selection.ts'
import type { RenderedPageInfo } from '../view-model/scroll-view-model.ts'
import { canonicalLineWords } from './canonical-line-words.ts'

const wordSelections = new WeakMap<RenderedPageInfo, PassageWordSelection>()

function readingWordSelection(source: RenderedPageInfo) {
  if (source.wordSelection) return source.wordSelection
  let selection = wordSelections.get(source)
  if (!selection) {
    const lines = source.lines.map(line => ({
      text: line.text,
      verses: line.verses.map(({ b, c, v }) => ({ book: b, chapter: c, verse: v })),
      isPetucha: line.isPetucha,
      aliyot: [],
    }))
    const keys = new Set(lines.flatMap((line, index) =>
      canonicalLineWords(source.pageNumber, index, line).map(word => word.tokenKey),
    ))
    selection = projectPassageWords([{ pageNumber: source.pageNumber, lines }], keys)
    wordSelections.set(source, selection)
  }
  return selection
}

const unknownContinuation: readonly SequencedWord[] = [{ tokenKey: '', annotatedText: '' }]

/** The preceding source row, read from page data instead of rescanning the DOM. */
function previousLineWords(page: HTMLElement, source: RenderedPageInfo, lineIndex: number, words: readonly SequencedWord[]) {
  if (lineIndex > 0) return canonicalLineWords(source.pageNumber, lineIndex - 1, source.lines[lineIndex - 1])
  if (source.pageNumber === 1) return []
  const previous = page.previousElementSibling?.tikkunPage
  const lastLine = previous?.pageNumber === source.pageNumber - 1 ? previous.lines.at(-1) : undefined
  if (lastLine) return canonicalLineWords(previous!.pageNumber, previous!.lines.length - 1, lastLine)
  // Without the previous page, infer from this row: every pasuk starting
  // here follows a sof pasuk unless the row itself opens a pasuk.
  const info = source.lines[lineIndex]
  const startsAfterSofPasuk = words.filter((word, index) => index < words.length - 1 && word.annotatedText.includes('׃')).length
  return startsAfterSofPasuk < info.verses.length ? [] : unknownContinuation
}

/** Reading reflows physical lines; anchor the requested verse in its visible form. */
export function findReadingVerseStartWord(book: HTMLElement, line: HTMLElement, ref: Ref) {
  const page = line.closest<HTMLElement>('.tikkun-page')
  const source = page?.tikkunPage
  const lineIndex = Number(line.dataset.lineIndex)
  const info = source?.lines[lineIndex]
  if (!page || !source || !info) return null
  const ordinal = info.verses.findIndex(verse => compareRefs(verse, ref) === 0)
  if (ordinal < 0) return null
  const words = canonicalLineWords(source.pageNumber, lineIndex, info)
  const tokenKey = words[verseStartSequenceIndex({
    currentLineWords: words,
    previousLineWords: previousLineWords(page, source, lineIndex, words),
    verseOrdinal: ordinal,
  })]?.tokenKey
  if (!tokenKey) return null

  // Plain Reading expands maqaf groups; paired Reading retains canonical IDs.
  const keys = book.dataset.readerSides !== 'two' && book.classList.contains('mod-annotations-off')
    ? readingWordSelection(source).unannotatedKeysByAnnotated.get(tokenKey) ?? []
    : [tokenKey]
  return keys.map(key => line.querySelector<HTMLElement>(`.word[data-token-key="${key}"]:not([hidden])`))
    .find(word => word && word.getClientRects().length) ?? null
}

export function readingVerseAtWord(book: HTMLElement, word: HTMLElement): Ref | null {
  const line = word.closest<HTMLElement>('[data-class="line"]')
  const page = line?.closest<HTMLElement>('.tikkun-page')
  const source = page?.tikkunPage
  const lineIndex = Number(line?.dataset.lineIndex)
  const info = source?.lines[lineIndex]
  if (!line || !source || !info) return null

  // The pasuk already in progress when this row begins.
  let ref: Ref | null = source.lines.slice(0, lineIndex).findLast(candidate => candidate.verses.length)?.verses.at(-1) ?? null
  if (!ref) {
    const previous = page?.previousElementSibling?.tikkunPage
    ref = previous?.pageNumber === source.pageNumber - 1
      ? previous.lines.findLast(candidate => candidate.verses.length)?.verses.at(-1) ?? null
      : null
  }
  for (const verse of info.verses) {
    const start = findReadingVerseStartWord(book, line, verse)
    if (start && (start === word || start.compareDocumentPosition(word) & Node.DOCUMENT_POSITION_FOLLOWING)) {
      ref = verse
    }
  }
  return ref
}
