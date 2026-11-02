import { expect, test } from 'vitest'
import { loadScroll } from '../location.ts'
import { loadScrollPageLines } from '../view-model/scroll-view-model.ts'
import { verseEndLocation } from './verse-end-location.ts'

test.each([[1, 32, 3, 36, 37], [5, 33, 17, 244, 245]])('finishes %i:%i:%i across columns %i to %i', async (b, c, v, startPage, endPage) => {
  const resolver = await loadScroll('torah')
  const ref = { scroll: 'torah' as const, b, c, v }
  expect(resolver.physicalLocationFromRef(ref).pageNumber).toBe(startPage)
  expect((await verseEndLocation(ref, resolver, page => loadScrollPageLines('torah', page))).pageNumber).toBe(endPage)
})

test('keeps an ending inside its column and rejects an incomplete verse', async () => {
  const resolver = await loadScroll('torah')
  const ref = { scroll: 'torah' as const, b: 1, c: 1, v: 1 }
  expect(await verseEndLocation(ref, resolver, page => loadScrollPageLines('torah', page))).toEqual({ pageNumber: 1, lineNumber: 1 })
  const last = { scroll: 'torah' as const, b: 5, c: 34, v: 12 }
  await expect(verseEndLocation(last, resolver, async page => (await loadScrollPageLines('torah', page)).map(line => ({ ...line, text: line.text.map(column => column.map(text => text.replaceAll('׃', ''))) })))).rejects.toThrow('Missing verse ending')
})
