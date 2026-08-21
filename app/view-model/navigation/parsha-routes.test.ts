import { expect, test } from 'vitest'
import { LeiningGenerator } from '../../calendar-model/generator.ts'
import type { UserSettings } from '../../calendar-model/user-settings.ts'
import {
  canonicalizeParshaSlug,
  generateParshaUrl,
  getParshaSearchTermsForLeining,
  getParshaSearchTermsForSlug,
  semanticParshaUrlForLeining,
} from './parsha-routes.ts'

const testSettings: UserSettings = {
  ashkenazi: true,
  includeModernHolidays: false,
  israel: false,
}

const generator = new LeiningGenerator(testSettings)

function findLeining(date: string, predicate: (title: string) => boolean) {
  const leiningDate = generator
    .aroundDate(new Date(`${date}T12:00:00`))
    .find((candidate) => candidate.id === date)

  if (!leiningDate) throw new Error(`Missing leining date ${date}`)

  const leining = leiningDate.leinings.find((candidate) =>
    predicate(candidate.date.title.en)
  )

  if (!leining) throw new Error(`Missing leining on ${date}`)
  return leining
}

test('weekly parsha links use semantic parsha routes', () => {
  const beresheet = findLeining(
    '2024-10-26',
    (title) => title === 'Parshat Bereshit'
  )

  expect(semanticParshaUrlForLeining(beresheet)).toBe('#/torah/parsha/beresheet')
})

test('parsha route aliases canonicalize title and alternate spellings', () => {
  expect(canonicalizeParshaSlug('Bereshit')).toBe('beresheet')
  expect(canonicalizeParshaSlug('Noah')).toBe('noach')
  expect(canonicalizeParshaSlug('Behaalotcha')).toBe('behalotecha')
  expect(canonicalizeParshaSlug('Vayeilech')).toBe('vayelech')
  expect(canonicalizeParshaSlug('Nitzavim-Vayeilech')).toBe(
    'nitzavim-vayelech'
  )
  expect(canonicalizeParshaSlug('Vayetze')).toBe('vayetzei')
})

test('parsha URL generation emits canonical route slugs for aliases', () => {
  expect(generateParshaUrl('vayetze')).toBe('#/torah/parsha/vayetzei')
})

test('parsha search terms come from canonical route aliases', () => {
  expect(getParshaSearchTermsForSlug('noach')).toEqual(
    expect.arrayContaining(['noach', 'noah'])
  )
  expect(getParshaSearchTermsForSlug('bereshit')).toEqual(
    expect.arrayContaining(['beresheet', 'bereshit'])
  )
})

test('leining search terms reuse canonical route aliases', () => {
  const noach = findLeining('2024-11-02', (title) => title === 'Parshat Noach')

  expect(getParshaSearchTermsForLeining(noach)).toEqual(
    expect.arrayContaining(['noach', 'noah'])
  )
})

test('esther links use semantic parsha routes', () => {
  const esther = findLeining('2025-03-14', (title) => title === 'Purim')

  expect(semanticParshaUrlForLeining(esther)).toBe('#/esther/megillah-esther')
})

test('holiday links keep dated run routes', () => {
  const holiday = findLeining(
    '2024-10-03',
    (title) => title === 'Rosh Hashana I'
  )

  expect(semanticParshaUrlForLeining(holiday)).toBe(null)
})

test.each([
  ['2026-03-14', 'Parshat Vayakhel-Pekudei', 'vayakhel-pekudei'],
  ['2026-04-18', 'Parshat Tazria-Metzora', 'tazria-metzora'],
  ['2026-04-25', 'Parshat Achrei Mot-Kedoshim', 'achrei-mot-kedoshim'],
  ['2026-05-09', 'Parshat Behar-Bechukotai', 'behar-bechukotai'],
  ['2026-06-27', 'Parshat Chukat-Balak', 'chukat-balak'],
  ['2026-07-11', 'Parshat Matot-Masei', 'matot-masei'],
  ['2026-09-05', 'Parshat Nitzavim-Vayeilech', 'nitzavim-vayelech'],
])('combined parsha %s gets its own semantic route', (date, title, slug) => {
  const combined = findLeining(date, (candidate) => candidate === title)

  expect(semanticParshaUrlForLeining(combined)).toBe(
    `#/torah/parsha/${slug}`
  )
})
