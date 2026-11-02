import { expect, test } from 'vitest'
import Page from '../components/Page.ts'
import { loadScroll } from '../location.ts'
import type { RefWithScroll } from '../ref.ts'
import { collectTokenKeysForExactAliyahRange } from '../reading/aliyah-token-sequence.ts'
import { loadScrollPageLines } from '../view-model/scroll-view-model.ts'
import { loadPassageTokens } from './passage-tokens.ts'

const ref = (b: number, c: number, v: number, scroll: RefWithScroll['scroll'] = 'torah'): RefWithScroll => ({ scroll, b, c, v })
const ranges = [
  { name: 'Behalotecha inverted nuns', start: ref(4, 10, 35), end: ref(4, 11, 1) },
]

test.each(ranges)('data-only $name words match the existing renderer in all four layouts', async ({ start, end }) => {
  // Resolve before creating any rendered content: word collection needs no DOM.
  const tokens = await loadPassageTokens({ start, end })
  expect(tokens.length).toBeGreaterThan(0)
  expect(new Set(tokens).size).toBe(tokens.length)
  const resolver = await loadScroll(start.scroll)
  const first = resolver.physicalLocationFromRef(start)
  const last = resolver.physicalLocationFromRef(end)
  const pages = await Promise.all(Array.from({
    length: Math.min(resolver.getPageCount(), last.pageNumber + 1) - Math.max(1, first.pageNumber - 1) + 1,
  }, async (_, index) => {
    const pageNumber = Math.max(1, first.pageNumber - 1) + index
    const lines = await loadScrollPageLines(start.scroll, pageNumber)
    return { type: 'page' as const, contentIndex: index, pageNumber, lines: lines.map(line => ({
      ...line,
      verses: line.verses.map(({ book, chapter, verse }) => ({ b: book, c: chapter, v: verse })),
      labels: [], aliyahStarts: [], aliyot: [],
    })) }
  }))
  const locate = (target: RefWithScroll) => {
    for (const page of pages) {
      for (const [lineIndex, line] of page.lines.entries()) {
        const ordinal = line.verses.findIndex(verse => verse.b === target.b && verse.c === target.c && verse.v === target.v)
        if (ordinal >= 0) return { pageNumber: page.pageNumber, lineNumber: lineIndex + 1, ordinal }
      }
    }
    throw new Error(`Missing reference ${target.b}:${target.c}:${target.v}`)
  }
  const startLocation = locate(start)
  const endLocation = locate(end)
  for (const layout of ['match', 'reading'] as const) {
    for (const sides of ['one', 'two'] as const) {
      const book = document.createElement('main')
      book.innerHTML = pages.map(page => Page(page, { presentation: { layout, sides } })).join('')
      const line = (pageNumber: number, lineNumber: number) => {
        const result = book.querySelector<HTMLElement>(`[data-class="line"][data-page-number="${pageNumber}"][data-line-index="${lineNumber - 1}"]`)
        if (!result) throw new Error(`Missing rendered line ${pageNumber}:${lineNumber}`)
        return result
      }
      expect(collectTokenKeysForExactAliyahRange({
        book,
        startLine: line(startLocation.pageNumber, startLocation.lineNumber),
        startVerseOrdinal: startLocation.ordinal,
        endLine: line(endLocation.pageNumber, endLocation.lineNumber),
        endVerseOrdinal: endLocation.ordinal,
      }), `${layout} / ${sides}`).toEqual(tokens)
    }
  }
})

test('rejects cross-scroll ranges instead of collecting unrelated words', async () => {
  await expect(loadPassageTokens({ start: ref(1, 1, 1), end: ref(1, 1, 1, 'esther') }))
    .rejects.toThrow('same scroll')
})
