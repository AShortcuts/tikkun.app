import { expect, test } from 'vitest'
import { selectedPrintRange } from './print-selection.ts'
import type { LineType } from '../components/Page.ts'
import { passageTitle } from './print-model.ts'

const line = (text: string, verses: [number, number, number][]): LineType => ({ text: [[text]], verses: verses.map(([book, chapter, verse]) => ({ book, chapter, verse })), aliyot: [], isPetucha: false })
const words = (word: number, annotated = true, page = 1, line = 0) => ({ page, line, fragment: 0, word, annotated })
const ref = (c: number, v: number) => ({ scroll: 'torah', b: 1, c, v })

test('a selection in Esther retains its scroll identity', async () => {
  const range = await selectedPrintRange([words(0)], undefined, 'esther')
  expect(range).toEqual({ start: { scroll: 'esther', b: 1, c: 1, v: 1 }, end: { scroll: 'esther', b: 1, c: 1, v: 1 } })
})

test('partial words resolve to whole verses and reversed endpoints are ordered', async () => {
  const load = async () => [line('אב גד׃ הו זח׃', [[1, 1, 1], [1, 1, 2]])]
  expect(await selectedPrintRange([words(2)], load)).toEqual({ start: ref(1, 2), end: ref(1, 2) })
  expect(await selectedPrintRange([words(3), words(0)], load)).toEqual({ start: ref(1, 1), end: ref(1, 2) })
})

test('Torah without marks uses its expanded maqaf word positions', async () => {
  const load = async () => [line('אב־גד הו׃ זח טי׃', [[1, 1, 1], [1, 1, 2]])]
  expect(await selectedPrintRange([words(2, false)], load)).toEqual({ start: ref(1, 1), end: ref(1, 1) })
  expect(await selectedPrintRange([words(3, false)], load)).toEqual({ start: ref(1, 2), end: ref(1, 2) })
  expect(await selectedPrintRange([words(2, true)], load)).toEqual({ start: ref(1, 2), end: ref(1, 2) })
})

test('continuations at page and chapter boundaries retain the preceding verse', async () => {
  const load = async (page: number) => page === 1
    ? [line('אב גד', [[1, 1, 31]])]
    : [line('הו זח׃ טי כך׃', [[1, 2, 1]])]
  expect(await selectedPrintRange([words(0, true, 2), words(3, true, 2)], load)).toEqual({ start: ref(1, 31), end: ref(2, 1) })
})

test('empty selection retains the default, but an unresolvable selected word reports an error', async () => {
  expect(await selectedPrintRange([])).toBeUndefined()
  await expect(selectedPrintRange([words(99)], async () => [line('אב׃', [[1, 1, 1]])])).rejects.toThrow('matched to a pasuk')
})

test('a selection across sefarim retains both books in the range and title', async () => {
  const range = await selectedPrintRange([words(0), words(1)], async () => [line('אב׃ גד׃', [[1, 50, 26], [2, 1, 1]])])
  expect(range).toEqual({ start: ref(50, 26), end: { scroll: 'torah', b: 2, c: 1, v: 1 } })
  expect(passageTitle([range!])).toBe('בראשית נ:כו–שמות א:א')
})
