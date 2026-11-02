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

test('unavailable current aliyah is a visible error instead of a sample fallback', () => {
  expect(() => createPrintContext(run, 99, 'Noach')).toThrow('current aliyah')
  expect(() => createPrintContext({ ...run, scroll: 'esther' }, 1, 'Esther')).toThrow('Esther passage is still loading')
})
