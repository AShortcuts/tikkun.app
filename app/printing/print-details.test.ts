import { expect, test } from 'vitest'
import { printColumnNumbers, printDetailsAliyot, printDetailsTitles } from './print-details.ts'
import type { PassageRange } from './print-model.ts'
import { createPrintContext } from './print-context.ts'
import { LeiningGenerator } from '../calendar-model/generator.ts'
import { resolveParshaRun } from '../view-model/navigation/parsha-routes.ts'

const range = (c: number, v: number, endChapter = c, endVerse = v): PassageRange => ({
  start: { scroll: 'torah', b: 1, c, v }, end: { scroll: 'torah', b: 1, c: endChapter, v: endVerse },
})

test('details resolve only the parshiot touched by the actual selected ranges', () => {
  expect(printDetailsTitles([range(1, 6, 1, 13)])).toEqual([{ he: 'בראשית', en: 'Beresheet' }])
  expect(printDetailsTitles([range(6, 8, 6, 9)])).toEqual([{ he: 'בראשית', en: 'Beresheet' }, { he: 'נח', en: 'Noach' }])
  expect(printDetailsTitles([range(6, 9)]).map(title => title.he)).toEqual(['נח'])
  expect(printDetailsTitles([range(1, 1), range(12, 1), range(1, 1)]).map(title => title.he)).toEqual(['בראשית', 'לך־לך'])
})

test('Esther details use the Megillah name rather than a Torah parsha', () => {
  expect(printDetailsTitles([{ start: { scroll: 'esther', b: 1, c: 9, v: 7 }, end: { scroll: 'esther', b: 1, c: 9, v: 9 } }])).toEqual([{ he: 'אסתר', en: 'Esther' }])
})

test('original columns compact consecutive numbers without implying missing columns were selected', () => {
  expect(printColumnNumbers([1])).toBe('1')
  expect(printColumnNumbers([4, 2, 1, 2, 7, 8, 9])).toBe('1–2, 4, 7–9')
})

test('aliyah details reuse selected labels, infer contained custom ranges, and omit whole readings', () => {
  const generator = new LeiningGenerator({ israel: false, includeModernHolidays: false, ashkenazi: true })
  const run = resolveParshaRun(generator, 'beresheet')!.run
  const context = createPrintContext(run, 1, 'בראשית')
  expect(printDetailsAliyot([range(1, 6, 1, 13)], context)).toEqual([{ he: 'ראשון', en: 'Aliyah 1' }])
  expect(printDetailsAliyot([range(1, 6, 1, 13)], context, [])).toEqual([])
  expect(printDetailsAliyot([range(1, 6, 2, 10)], context)).toEqual([])
  const selected = context.aliyot.filter(aliyah => aliyah.label === 'Aliyah 1' || aliyah.label === 'Aliyah 3')
  expect(printDetailsAliyot(selected, context, selected.map(aliyah => aliyah.key))).toEqual([
    { he: 'ראשון', en: 'Aliyah 1' }, { he: 'שלישי', en: 'Aliyah 3' },
  ])
  const maftir = context.aliyot.find(aliyah => aliyah.label === 'Maftir')!
  expect(printDetailsAliyot([maftir], context, [maftir.key])).toEqual([{ he: 'מפטיר', en: 'Maftir' }])
  expect(printDetailsAliyot([maftir], context)).toEqual([{ he: 'מפטיר', en: 'Maftir' }])
  expect(printDetailsAliyot([range(6, 9)], context)).toEqual([{ he: 'ראשון', en: 'Aliyah 1' }])
})

test('details keep dated service honor names and never give Esther an aliyah label', () => {
  const generator = new LeiningGenerator({ israel: false, includeModernHolidays: false, ashkenazi: true })
  const service = generator.parseId('2026-10-04:shacharis,main')!
  const context = createPrintContext(service, 6, 'Simchat Torah')
  const honor = context.aliyot.find(aliyah => aliyah.label === 'Chatan Beresheet')!
  expect(printDetailsAliyot([honor], context, [honor.key])).toEqual([{ he: 'חתן בראשית', en: 'Chatan Beresheet' }])
  expect(printDetailsAliyot([range(1, 6, 1, 13)], context)).toEqual([{ he: 'חתן בראשית', en: 'Chatan Beresheet' }])
  const esther = createPrintContext(resolveParshaRun(generator, 'megillah-esther')!.run, undefined, 'Esther')
  expect(printDetailsAliyot(esther.aliyot, esther, [esther.currentKey])).toEqual([])
})
