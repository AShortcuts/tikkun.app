import { expect, test } from 'vitest'
import { joinReadingTitle, printDetailsAliyot, printDetailsTitles, printReadingHeading as readingTitle } from './print-details.ts'

// Most expectations compare the one-line running-head form.
const printReadingHeading = (...args: Parameters<typeof readingTitle>) => {
  const title = readingTitle(...args)
  return title && joinReadingTitle(title)
}
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

test('a printout chosen by reading is headed by the reading and its aliyot', () => {
  const generator = new LeiningGenerator({ israel: false, includeModernHolidays: false, ashkenazi: true })
  const context = createPrintContext(resolveParshaRun(generator, 'chayei-sarah')!.run, 1, 'חיי שרה')
  const key = (index: number | 'Maftir') => context.aliyot.find(aliyah => aliyah.key.endsWith(`:${index}`))!
  const heading = (keys?: (number | 'Maftir')[], ranges = context.aliyot.filter(aliyah => keys?.some(index => key(index) === aliyah)) as PassageRange[]) =>
    printReadingHeading(ranges, context, keys?.map(index => key(index).key))

  expect(heading([1])).toEqual({ he: 'חיי שרה, ראשון', en: 'Chayei Sara, Aliyah 1' })
  expect(heading([1, 2, 3, 5])).toEqual({ he: 'חיי שרה, ראשון–שלישי, חמישי', en: 'Chayei Sara, Aliyot 1–3, 5' })
  expect(heading([7, 'Maftir'])).toEqual({ he: 'חיי שרה, שביעי–מפטיר', en: 'Chayei Sara, Aliyah 7–Maftir' })
  expect(printReadingHeading(context.aliyot, context, [])).toEqual({ he: 'חיי שרה, כל הפרשה', en: 'Chayei Sara, Whole parsha' })

  // Text selected on the page names the aliyot it touches.
  expect(heading(undefined, [range(23, 2, 23, 3)])).toEqual({ he: 'חיי שרה, ראשון', en: 'Chayei Sara, Aliyah 1' })
  const firstTwo = { start: key(1).start, end: key(2).end }
  expect(heading(undefined, [{ start: { ...firstTwo.start, v: firstTwo.start.v + 2 }, end: firstTwo.end }]))
    .toEqual({ he: 'חיי שרה, ראשון–שני', en: 'Chayei Sara, Aliyot 1–2' })
  // A Maftir inside the seventh aliyah adds nothing to a span across it.
  expect(heading(undefined, [{ start: key(6).start, end: key(7).end }])?.en).toBe('Chayei Sara, Aliyot 6–7')
  // Selections in a neighboring reading of the continuous Reader name that reading.
  expect(heading(undefined, [range(22, 24)])).toEqual({ he: 'וירא, שביעי', en: 'Vayera, Aliyah 7' })
})

test('holiday headings use the Reading Index names, and Esther keeps its verses', () => {
  const generator = new LeiningGenerator({ israel: false, includeModernHolidays: false, ashkenazi: true })
  const roshChodesh = createPrintContext(generator.parseId('2026-11-11:shacharis,main')!, 2, 'ראש חודש כסלו')
  expect(printReadingHeading(roshChodesh.aliyot, roshChodesh, [roshChodesh.currentKey]))
    .toEqual({ he: 'ראש חודש כסלו, שני', en: 'Rosh Chodesh Kislev, Aliyah 2' })
  expect(createPrintContext(generator.parseId('2027-04-22:shacharis,main')!, 1, 'פסח א׳').englishTitle).toBe('Pesach 1st day')
  const esther = createPrintContext(resolveParshaRun(generator, 'megillah-esther')!.run, undefined, 'Esther')
  expect(printReadingHeading(esther.aliyot, esther, [esther.currentKey])).toBeUndefined()
})
