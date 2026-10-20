import { expect, test } from 'vitest'
import { LeiningGenerator } from '../calendar-model/generator.ts'
import type { LeiningRun } from '../calendar-model/model-types.ts'
import { canonicalLineWords } from '../reader/canonical-line-words.ts'
import type { RefWithScroll } from '../ref.ts'
import { loadScrollPageLines, ScrollViewModel, type ScrollContentSource } from '../view-model/scroll-view-model.ts'
import { resolveParshaRun } from '../view-model/navigation/parsha-routes.ts'
import { createIsolatedAliyahViewModel } from './isolated-aliyah-view.ts'

const generator = new LeiningGenerator({ ashkenazi: true, includeModernHolidays: false, israel: false })
const ref = (b: number, c: number, v: number): RefWithScroll => ({ scroll: 'torah', b, c, v })

class RangeFixture extends ScrollViewModel {
  constructor(start: RefWithScroll, end: RefWithScroll) {
    const original = resolveParshaRun(generator, 'beresheet')!.run
    const run: LeiningRun = { ...original, aliyot: [{ index: 1, start, end }] }
    super(generator, [run], start, {}, run.id)
  }
  protected override async contentSourceFromIndex(index: number): Promise<ScrollContentSource | null> {
    return index >= 0 && index < 248 ? { type: 'page', pageNumber: index + 1 } : null
  }
  protected override async contentIndexFromPageNumber(page: number) { return page - 1 }
}

async function boundedRange(start: RefWithScroll, end = start, initialRef?: RefWithScroll) {
  const base = new RangeFixture(start, end)
  await base.startingLocation
  const model = await createIsolatedAliyahViewModel(base, { runId: base.initialRunId!, aliyahIndex: 1 }, initialRef)
  return { base, model, selection: model.isolatedAliyah! }
}

async function selectedWords(model: ScrollViewModel) {
  const pages = await Promise.all(model.isolatedAliyah!.pageNumbers.map(async page => ({ page, lines: await loadScrollPageLines('torah', page) })))
  return pages.flatMap(({ page, lines }) => lines.flatMap((line, index) => canonicalLineWords(page, index, line)))
    .filter(word => model.isolatedAliyah!.tokenKeys.has(word.tokenKey))
}

test('exposes initial inputs without changing a continuous model', async () => {
  const { base } = await boundedRange(ref(1, 1, 6), ref(1, 1, 13))
  expect(base.isolatedAliyah).toBeNull()
  expect(base.initialLocation).toEqual(ref(1, 1, 6))
  expect(base.initialRunId).toBe(base.relevantRuns[0].id)
  expect(await base.fetchPageByPageNumber(2)).not.toBeNull()
})

test('same-line boundaries preserve physical line/fragment/word identities and both masks', async () => {
  const { model, selection } = await boundedRange(ref(1, 1, 6), ref(1, 1, 13))
  const page = await model.fetchPageByPageNumber(1)
  if (!page || page.type !== 'page') throw new Error('Missing selected page')
  const original = await loadScrollPageLines('torah', 1)
  expect(page.lines).toHaveLength(original.length)
  page.lines.forEach((line, index) => expect(line.text).toEqual(original[index].text))
  const words = await selectedWords(model)
  expect(words[0].annotatedText).toContain('וַיֹּ֣אמֶר')
  expect(words.at(-1)!.annotatedText).toContain('שְׁלִישִֽׁי׃')
  expect(words.filter(word => word.annotatedText.includes('׃'))).toHaveLength(8)
  const firstKey = words[0].tokenKey
  expect(selection.initialTokenKey).toBe(firstKey)
  expect(firstKey.split(':').slice(1)).not.toEqual(['0', '0', '0'])
  expect(page.wordSelection!.unannotated.size).toBeGreaterThan(selection.tokenKeys.size)
  expect([...page.wordSelection!.unannotated].every(key => selection.containsRenderedTokenKey(key))).toBe(true)
  expect(selection.containsTokenKey('1:0:0:0')).toBe(false)
  expect(selection.containsRef(ref(1, 1, 5))).toBe(false)
  expect(selection.containsRef({ scroll: 'esther', b: 1, c: 1, v: 6 })).toBe(false)
})

test.each([
  [1, 32, 3, 36, 37], [1, 50, 26, 60, 61], [2, 34, 35, 102, 103],
  [3, 24, 23, 142, 143], [4, 9, 14, 163, 164], [5, 33, 17, 244, 245],
])('includes the full final verse %i:%i:%i across pages %i/%i without neighboring words', async (b, c, v, first, last) => {
  const { model, selection } = await boundedRange(ref(b, c, v))
  expect(selection.pageNumbers).toEqual([first, last])
  const words = await selectedWords(model)
  expect(words.filter(word => word.annotatedText.includes('׃'))).toHaveLength(1)
  expect(words.at(-1)!.annotatedText).toMatch(/׃$/)
  expect(words.at(-1)!.tokenKey.startsWith(`${last}:`)).toBe(true)
  expect(await model.fetchPreviousPage()).toBeNull()
  expect(await model.fetchNextPage()).toMatchObject({ pageNumber: last })
  expect(await model.fetchNextPage()).toBeNull()
  expect(await model.fetchPageByPageNumber(first - 1)).toBeNull()
  expect(await model.fetchPageByPageNumber(last + 1)).toBeNull()
  expect(await model.fetchPageByContentIndex(-1)).toBeNull()
  expect(await model.fetchPageByContentIndex(2)).toBeNull()
  expect(await model.fetchPageByPageNumber(first, { runId: 'another-run' })).toBeNull()
})

test('explicit initial verse retains the entire passage and its exact first token', async () => {
  const { model, selection } = await boundedRange(ref(1, 1, 6), ref(1, 1, 13), ref(1, 1, 9))
  const { model: single } = await boundedRange(ref(1, 1, 9))
  expect(selection.initialTokenKey).toBe(single.isolatedAliyah!.initialTokenKey)
  expect((await selectedWords(model)).filter(word => word.annotatedText.includes('׃'))).toHaveLength(8)
  expect(model.initialLocation).toEqual(ref(1, 1, 9))
})

test('overlapping Maftir keeps its identity and original token coordinates', async () => {
  const run = resolveParshaRun(generator, 'beresheet')!.run
  const base = ScrollViewModel.forRun(generator, run)!
  const seventh = await createIsolatedAliyahViewModel(base, { runId: run.id, aliyahIndex: 7 })
  const maftir = await createIsolatedAliyahViewModel(base, { runId: run.id, aliyahIndex: 'Maftir' })
  expect(maftir.isolatedAliyah!.aliyahIndex).toBe('Maftir')
  expect(maftir.relevantRuns).toBe(base.relevantRuns)
  expect([...maftir.isolatedAliyah!.tokenKeys].every(key => seventh.isolatedAliyah!.tokenKeys.has(key))).toBe(true)
  expect(maftir.isolatedAliyah!.tokenKeys.size).toBeLessThan(seventh.isolatedAliyah!.tokenKeys.size)
})

test('inverted nun stays decorative without consuming or renumbering canonical IDs', async () => {
  const { model, selection } = await boundedRange(ref(4, 10, 35), ref(4, 10, 36))
  const words = await selectedWords(model)
  const page = await model.fetchPageByPageNumber(165)
  if (!page || page.type !== 'page') throw new Error('Missing page')
  expect(words[0].tokenKey).toBe('165:26:1:1')
  expect(selection.tokenKeys.has('165:26:1:0')).toBe(false)
  expect(page.wordSelection!.annotated.has('165:26:1:0')).toBe(true)
  expect([...page.wordSelection!.annotated].filter(key => !selection.tokenKeys.has(key))).toHaveLength(2)
})

test('rejects unknown selections and explicit initial references outside the passage', async () => {
  const { base } = await boundedRange(ref(1, 1, 6), ref(1, 1, 13))
  await expect(createIsolatedAliyahViewModel(base, { runId: 'missing', aliyahIndex: 1 })).rejects.toThrow('Cannot isolate')
  await expect(createIsolatedAliyahViewModel(base, { runId: base.initialRunId!, aliyahIndex: 2 })).rejects.toThrow('Cannot isolate')
  await expect(createIsolatedAliyahViewModel(base, { runId: base.initialRunId!, aliyahIndex: 1 }, ref(1, 1, 5))).rejects.toThrow('outside aliyah')
})
