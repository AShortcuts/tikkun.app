import { expect, test } from 'vitest'
import { LeiningGenerator } from '../calendar-model/generator.ts'
import { LeiningInstanceId, LeiningRunType } from '../calendar-model/model-types.ts'
import type { UserSettings } from '../calendar-model/user-settings.ts'
import {
  holidayLeiningKeywords,
  selectCommandPaletteHolidayRun,
} from './holiday-actions.ts'

const testSettings: UserSettings = {
  ashkenazi: true,
  includeModernHolidays: false,
  israel: false,
}

const generator = new LeiningGenerator(testSettings)

test('holiday command palette uses reader runs and skips haftarah-only entries', () => {
  const tishaBav = generator
    .forHebrewYear(5786)
    .find((date) => date.id === '2026-07-23')

  if (!tishaBav) throw new Error('Missing Tishah B’Av leining')

  const mincha = tishaBav.leinings.find(
    (leining) => leining.id === LeiningInstanceId.Mincha
  )

  if (!mincha) throw new Error('Missing Tishah B’Av Mincha leining')

  const selected = selectCommandPaletteHolidayRun(mincha)

  expect(selected?.id).toBe('2026-07-23:mincha,main')
  expect(selected?.type).toBe(LeiningRunType.Main)
  expect(selected?.type).not.toBe(LeiningRunType.Haftarah)
})

test('holiday command palette omits leinings with no supported reader run', () => {
  const tishaBav = generator
    .forHebrewYear(5786)
    .find((date) => date.id === '2026-07-23')

  if (!tishaBav) throw new Error('Missing Tishah B’Av leining')

  const mincha = tishaBav.leinings.find(
    (leining) => leining.id === LeiningInstanceId.Mincha
  )

  if (!mincha) throw new Error('Missing Tishah B’Av Mincha leining')

  const haftarahOnly = {
    ...mincha,
    runs: mincha.runs.filter((run) => run.type === LeiningRunType.Haftarah),
  }

  expect(selectCommandPaletteHolidayRun(haftarahOnly)).toBe(null)
})

test('holiday command palette aliases Tishah B’Av spelling', () => {
  const keywords = holidayLeiningKeywords(
    { en: "Tish'a B'Av", he: 'תשעה באב' },
    `${LeiningInstanceId.Mincha}`
  )

  expect(keywords).toEqual(expect.arrayContaining(['Tishah B’Av', "Tishah B'Av"]))
})

test('holiday command palette keeps Rosh Chodesh aliases', () => {
  const keywords = holidayLeiningKeywords(
    { en: 'Rosh Chodesh Iyyar', he: 'ראש חודש אייר' },
    `${LeiningInstanceId.Shacharis}`
  )

  expect(keywords).toEqual(
    expect.arrayContaining(['rosh chodesh', 'rosh hodesh', 'ראש חודש'])
  )
})
