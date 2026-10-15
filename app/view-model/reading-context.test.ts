import { expect, test } from 'vitest'
import { HDate } from '@hebcal/hdate'
import { LeiningGenerator } from '../calendar-model/generator.ts'
import { readingTitle } from '../calendar-model/model-types.ts'
import { buildParshaPickerModel } from '../components/parsha-picker-model.ts'
import { parseAliyahIndex } from '../reading/aliyah-identity.ts'
import { getAliyahNavigationEntriesForRun, formatAliyahLabel } from '../reading/aliyah-navigation/model.ts'
import { createLastReadingHash } from '../reading/last-reading.ts'
import { aliyahName } from './aliyah-labeller.ts'
import { resolveParshaRun } from './navigation/parsha-routes.ts'
import { parseUrl } from './navigation/url-parser.ts'
import { TopBarTracker } from './navigation/top-bar-model.ts'

const generator = (israel = false) => new LeiningGenerator({ israel, ashkenazi: true, includeModernHolidays: false })

test.each([false, true])('Vezot parsha is independent of date and location (Israel: %s)', israel => {
  const g = generator(israel)
  for (const year of [2023, 2026, 2027, 2030]) {
    const run = resolveParshaRun(g, 'vezos-haberacha', new Date(year, 8, 30))!.run
    expect(run.id).toBe('parsha:vezot-haberacha,main')
    expect(run.leining.date).toBeUndefined()
    expect(run.leining.runs).toEqual([run])
    expect(run.aliyot.map(a => a.index)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(run.aliyot.at(-1)?.start).toMatchObject({ b: 5, c: 34, v: 1 })
    expect(aliyahName(7, run)).toBe('שביעי')
    expect(createLastReadingHash(run, run.aliyot[6].start)).toBe('#/torah/parsha/vezot-haberacha/5-34-1')
  }
})

test.each(['/torah/parsha/vezot-haberacha', '/torah/5-34-1', '/torah/page/245'])('plain Torah route %s contains only parsha readings', async path => {
  const route = parseUrl(generator(), path)
  if (route?.view !== 'reader') throw new Error(`Missing reader for ${path}`)
  await route.model.startingLocation
  expect(route.model.relevantRuns.every(run => run.leining.kind === 'parsha')).toBe(true)
  const run = route.model.relevantRuns.find(run => run.id === 'parsha:vezot-haberacha,main')!
  expect(getAliyahNavigationEntriesForRun(run)).toHaveLength(7)
  expect(aliyahName(7, run, { title: route.model.displayTitleForRun(run) })).toBe('שביעי')
})

test.each([
  ['2026-10-04', false, 6, 7],
  ['2026-10-03', true, 7, 8],
  ['2025-10-14', true, 6, 7],
] as const)('service %s preserves its divisions and labels', async (date, israel, torah, beresheet) => {
  const g = generator(israel)
  const path = `/run/${date}:shacharis,main`
  const route = parseUrl(g, path)
  if (route?.view !== 'reader') throw new Error('Missing service')
  await route.model.startingLocation
  const [main, genesis, maftir] = route.model.relevantRuns
  expect(main.leining.kind).toBe('service')
  expect(main.aliyot.at(-1)?.index).toBe(torah)
  expect(genesis.aliyot[0].index).toBe(beresheet)
  expect(maftir.aliyot[0].index).toBe('Maftir')
  expect(aliyahName(torah, main)).toBe('חתן תורה')
  expect(formatAliyahLabel(beresheet, genesis)).toBe('חתן בראשית')
  expect(readingTitle(main.leining).he).toContain('שמחת תורה')
  expect(createLastReadingHash(main)).toBe(`#${path}`)
  expect(createLastReadingHash(genesis)).toBe(`#/run/${date}:shacharis,last-aliyah`)
})

test('picker and search preserve the entry point context', () => {
  const now = new Date('2026-10-02T12:00:00')
  const model = buildParshaPickerModel(generator(), new HDate(now), now)
  expect(model.comingUp.find(entry => entry.label === 'שמחת תורה')?.href).toBe('#/run/2026-10-04:shacharis,main')
  expect(model.holidayColumns.flat().find(entry => entry.label === 'שמחת תורה')?.href).toBe('#/run/2026-10-04:shacharis,main')
  const parsha = model.parshaBooks.flat().find(entry => entry.label === 'וזאת הברכה')!
  expect(parsha.aliyahGroups[0].choices).toHaveLength(7)
  expect(model.search('Vezot Haberacha 7')[0].href).toBe('#/torah/parsha/vezot-haberacha/5-34-1')
  expect(model.search('Simchat Torah 7')[0].href).toBe('#/run/2026-10-04:shacharis,last-aliyah/1-1-1')
})

test('the eighth reading is searchable and selectable in Israel', () => {
  const now = new Date('2026-10-02T12:00:00')
  const model = buildParshaPickerModel(generator(true), new HDate(now), now)
  expect(parseAliyahIndex('8')).toBe(8)
  expect(model.search('Simchat Torah on Shabbat 8')[0]?.href).toBe('#/run/2026-10-03:shacharis,last-aliyah/1-1-1')
})

test('other services keep their own aliyah counts', () => {
  const g = generator()
  expect(g.parseId('2026-10-03:maariv,main')?.aliyot.map(aliyah => aliyah.index)).toEqual([1, 2, 3])
  expect(g.parseId('2026-09-30:shacharis,main')?.aliyot.map(aliyah => aliyah.index)).toEqual([1, 2, 3, 4])
})

test('old mixed parsha links preserve the verse in plain Torah context', () => {
  const route = parseUrl(generator(), '/torah/parsha/vezos-haberacha/1-1-1')
  if (route?.view !== 'reader') throw new Error('Missing reader')
  expect(route.canonicalHash).toBe('#/torah/1-1-1')
  expect(route.model.initialTitle).toBe('פרשת בראשית')
})

test.each([
  ['/torah/parsha/vezot-haberacha', 'parsha'],
  ['/run/2026-10-04:shacharis,main', 'service'],
] as const)('previous and next navigation preserve the context of %s', async (path, kind) => {
  const route = parseUrl(generator(), path)
  if (route?.view !== 'reader') throw new Error('Missing reader')
  const { page } = await route.model.startingLocation
  if (page.type !== 'page') throw new Error('Missing Torah page')
  const id = kind === 'parsha' ? 'parsha:vezot-haberacha,main' : '2026-10-04:shacharis,main'
  const line = page.lines.find(line => line.run?.id === id)!
  const navigation = new TopBarTracker().setLine(route.model, { first: line, center: line, last: line })
  expect(navigation.currentRun?.leining.kind).toBe(kind)
  expect(navigation.previousLink?.targetRun.leining.kind).toBe(kind)
  if (kind === 'parsha') {
    expect(navigation.previousLink?.targetRun.id).toBe('parsha:haazinu,main')
    expect(navigation.nextLink).toBeNull()
    expect(navigation.relatedRuns).toHaveLength(1)
  } else {
    expect(navigation.nextLink?.targetRun.leining.kind).toBe('service')
    expect(navigation.relatedRuns).toHaveLength(3)
  }
})
