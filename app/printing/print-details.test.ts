import { expect, test } from 'vitest'
import { printDetailsAliyot, printDetailsTitles } from './print-details.ts'
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
