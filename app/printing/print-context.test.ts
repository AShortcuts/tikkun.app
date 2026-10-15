import { expect, test } from 'vitest'
import { LeiningGenerator } from '../calendar-model/generator.ts'
import { resolveParshaRun } from '../view-model/navigation/parsha-routes.ts'
import { createPrintContext } from './print-context.ts'
import { normalizeRanges } from './print-model.ts'

const generator = new LeiningGenerator({ israel: false, includeModernHolidays: false, ashkenazi: true })
const run = resolveParshaRun(generator, 'noach')!.run

test('dated printing includes the service scrolls and their honor labels', () => {
  const service = generator.parseId('2026-10-04:shacharis,main')!
  const context = createPrintContext(service, 6, 'Simchat Torah')
  expect(context.isParsha).toBe(false)
  expect(context.aliyot.map(aliyah => aliyah.label).slice(-3)).toEqual([
    'Chatan Torah', 'Chatan Beresheet', 'Maftir',
  ])
})

test('captures the active aliyah and Maftir using stable run identities', () => {
  const context = createPrintContext(run, 3, 'Noach')
  const current = context.aliyot.find(aliyah => aliyah.key === context.currentKey)!
  expect(current.start).toEqual(run.aliyot.find(aliyah => aliyah.index === 3)!.start)
  expect(current.label).toBe('Aliyah 3')
  expect(context.aliyot.some(aliyah => aliyah.label === 'Maftir')).toBe(true)
  expect(new Set(context.aliyot.map(aliyah => aliyah.key)).size).toBe(context.aliyot.length)
  expect(context.isParsha).toBe(true)
})

test('whole parsha merges adjacent aliyot and overlapping Maftir without enlarging the passage', () => {
  const context = createPrintContext(run, 3, 'Noach')
  const ranges = normalizeRanges(context.aliyot)
  expect(ranges).toHaveLength(1)
  expect(ranges[0].start).toEqual(run.aliyot[0].start)
  expect(ranges[0].end).toEqual(run.aliyot.find(aliyah => aliyah.index === 7)!.end)
})

test('separated aliyot keep their gap and context is independent of subsequent reader changes', () => {
  const context = createPrintContext(run, 3, 'Noach')
  const selected = context.aliyot.filter(aliyah => ['Aliyah 1', 'Aliyah 3'].includes(aliyah.label))
  expect(normalizeRanges(selected)).toHaveLength(2)
  expect(selected[0].start).not.toBe(run.aliyot[0].start)
})

test('unavailable current aliyah is a visible error instead of a sample fallback', () => {
  expect(() => createPrintContext(run, 99, 'Noach')).toThrow('current aliyah')
  expect(() => createPrintContext({ ...run, scroll: 'esther' }, 1, 'Esther')).toThrow('Esther passage is still loading')
})

test('Esther offers the whole Megillah without inventing numbered aliyot', () => {
  const esther = resolveParshaRun(generator, 'megillah-esther')!.run
  const context = createPrintContext(esther, undefined, 'Megillat Esther')
  expect(context.aliyot).toHaveLength(1)
  expect(context.aliyot[0]).toMatchObject({ key: context.currentKey, label: 'Whole Megillah', start: { scroll: 'esther', b: 1, c: 1, v: 1 }, end: { scroll: 'esther', b: 1, c: 10, v: 3 } })
})
