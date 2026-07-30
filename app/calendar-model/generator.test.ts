import { expect, test } from 'vitest'
import type { UserSettings } from './user-settings.ts'
import { LeiningGenerator } from './generator.ts'
import { Locale } from '@hebcal/leyning/dist/esm/locale'
import { HDate, months } from '@hebcal/hdate'
import type { LeiningAliyah, LeiningDate, LeiningRun } from './model-types.ts'
import hebrewNumeralFromInteger from '../hebrew-numeral.ts'
import type { Ref } from '../ref.ts'
import { getBookName } from './hebcal-conversions.ts'
import { last, toISODateString } from './utils.ts'
import { getHolidaysOnDate } from '@hebcal/core/dist/esm/holidays'

const testSettings: UserSettings = {
  ashkenazi: true,
  includeModernHolidays: false,
  israel: false,
}

const generator = new LeiningGenerator(testSettings)

for (let year = 5780; year < 5790; year++) {
  test(`runs round-trip via ID for ${year}`, () => {
    function assertNotEmpty<T>(arr: T[], message: string) {
      expect(arr, message).not.toEqual([])
      return arr
    }

    const calendar = generator.forHebrewYear(year)

    calendar.forEach((ld) => {
      expect(ld.title.en, ld.id).not.toMatch(/TODO/)
      // Catch missing translations
      expect(ld.title.he, `${ld.id}: ${ld.title.en}`).not.toMatch(/[a-z]/i)
    })

    calendar
      .flatMap((d) => assertNotEmpty(d.leinings, d.title.he))
      .flatMap((o) => assertNotEmpty(o.runs, `${o.date.title.he}: ${o.id}`))
      .forEach((run) => {
        const parsed = generator.parseId(run.id)

        // Only compare the full objects if they summary is equal.
        // This gives better error messages.
        expect(dumpLeiningRun(parsed), `Parsed ${run.id}`).toEqual(dumpLeiningRun(run))
        expect(parsed, `Parsed ${run.id}`).toEqual(run)
      })
  })
}

const fourParshaDescriptions = [
  'Shabbat Shekalim',
  'Shabbat Zachor',
  'Shabbat Parah',
  'Shabbat HaChodesh',
]
test('4 פרשיות always get separate runs', () => {
  for (let year = 5785; year < 5805; year++) {
    const start = new HDate(20, months.SHVAT, year)
    for (let day = 0; day < 100; day++) {
      const date = start.add(day, 'days')
      const events = getHolidaysOnDate(date)
      if (!events?.some((d) => fourParshaDescriptions.includes(d.desc)))
        continue

      const isRoshChodesh = [1, 30].includes(date.getDate())
      const run = generator.parseId(
        `${toISODateString(date.greg())}:shacharis,maftir`
      )
      expect(run?.leining.isParsha).toBe(true)
      expect(run?.leining.runs.length, run?.id).toBe(isRoshChodesh ? 4 : 3)
    }
  }
})

function testForEntireChumash(providedTitle: string, date: HDate) {
  test(
    `forEntireChumash returns everything from בראשית to שמחת תורה ${providedTitle} on ${date}`,
    () => {
    const dates = generator.forEntireChumash(date)
    expect(dates[0].title.he).toBe('פרשת בראשית')
    expect(last(dates).title.he).toBe('שמחת תורה')
    expect(dates.some((d) => d.date.toDateString() === date.greg().toDateString())).toBe(true)
    }
  )
}

testForEntireChumash('before סוכות', new HDate(1, months.TISHREI, 5785))
testForEntireChumash('on פרשת בראשית', new HDate(24, months.TISHREI, 5785))
testForEntireChumash('after פרשת בראשית', new HDate(30, months.TISHREI, 5785))

test('generates יום כיפור', () => {
  expect(dumpLeiningDate(new HDate(10, months.TISHREI, 5784)), 'These tests verify the returned information, in easily readable format').toMatchSnapshot()
})

test('generates שמחת תורה', () => {
  expect(dumpLeiningDate(new HDate(23, months.TISHREI, 5784))).toMatchSnapshot()
})

test('generates תענית אסתר', () => {
  expect(dumpLeiningDate(new HDate(13, months.ADAR_II, 5785))).toMatchSnapshot()
})

test('generates פורים', () => {
  expect(dumpLeiningDate(new HDate(14, months.ADAR_II, 5784))).toMatchSnapshot()
})

test('generates ערב תשעה באב', () => {
  expect(dumpLeiningDate(new HDate(8, months.AV, 5784))).toMatchSnapshot()
})

test('generates תשעה באב', () => {
  expect(dumpLeiningDate(new HDate(9, months.AV, 5784))).toMatchSnapshot()
})

test('generates שבת ראש חודש חנוכה', () => {
  expect(dumpLeiningDate(new HDate(30, months.KISLEV, 5782))).toMatchSnapshot()
})

test('generates ראש חודש חנוכה', () => {
  expect(dumpLeiningDate(new HDate(30, months.KISLEV, 5787))).toMatchSnapshot()
})

test('generates leinings surrounding פרשת וירא', () => {
  const results = generator.aroundDate(new Date(2024, 10, 16))
  expect(results.map((ld) => `${ld.id}: ${ld.title.he}`)).toMatchSnapshot()
})

test('generates leinings surrounding שבת שובה', () => {
  const results = generator.aroundDate(new Date(2024, 9, 5))
  expect(results.map((ld) => `${ld.id}: ${ld.title.he}`)).toMatchSnapshot()
})

test('generates leinings surrounding שקלים / ראש חודש as פרשה', () => {
  const results = generator.aroundDate(new Date(2025, 2, 1))
  expect(results.map((ld) => `${ld.id}: ${ld.title.he}`), 'Warning: These must be unique!').toMatchSnapshot()
})

test('generates leinings surrounding חנוכה', () => {
  const results = generator.aroundDate(new Date(2025, 11, 19))
  expect(results.map((ld) => `${ld.id}: ${ld.title.he}`), 'Warning: These must be unique!').toMatchSnapshot()
})

test('generates leinings surrounding פורים', () => {
  const results = generator.aroundDate(new Date(2025, 2, 13))
  expect(results.map((ld) => `${ld.id}: ${ld.title.he}`)).toMatchSnapshot()
})

/** Prints the information in a `LeiningDate`, to be easily readable in the Markdown snapshot. */
function dumpLeiningDate(date: HDate) {
  const ld = generator.createLeiningDate(date)
  if (!ld) return null
  if (new Set(ld.leinings.map((o) => o.id)).size !== ld.leinings.length)
    throw new Error(`${ld.id} (${ld.title.he}) has duplicate leinings!`)
  return {
    date: ld.id,
    title: ld.title.he,
    leinings: ld.leinings.map((o) => ({
      isParsha: o.isParsha,
      id: o.id,
      runs: o.runs.map(dumpLeiningRun),
    })),
  }
}
function dumpLeiningRun(r: LeiningRun | null) {
  if (!r) return r
  return {
    id: r.id,
    type: r.type,
    scroll: r.scroll,
    aliyot: r.aliyot.map(
      (a) =>
        `${a.index}: ${bookName(a)} ${dumpRef(a.start)} - ${dumpRef(a.end)}`
    ),
  }
}

function bookName(a: LeiningAliyah) {
  return Locale.gettext(getBookName(a.start), 'he-x-nonikud')
}

function dumpRef(ref: Ref) {
  return `${hebrewNumeralFromInteger(ref.c)}:${hebrewNumeralFromInteger(ref.v)}`
}

test('generates the full LeiningDate object for יום כיפור', () => {
  expect(stripDate(generator.createLeiningDate(new HDate(10, months.TISHREI, 5784))), 'This test verified the full structure of the LeiningDate interface').toMatchSnapshot()
})

/**
 * Removes the `date` property, which is time-zone dependent.
 * This makes the recorded snapshot consistent across timezones.
 * You can see the date from the `id` property.
 */
function stripDate(
  o: (Omit<LeiningDate, 'date'> & { date?: Date }) | null
): unknown {
  if (!o) return o
  delete o.date
  return o
}
