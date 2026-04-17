import test from 'ava'
import { LeiningGenerator } from '../../calendar-model/generator.ts'
import type { UserSettings } from '../../calendar-model/user-settings.ts'
import { semanticParshaUrlForLeining } from './parsha-routes.ts'

const testSettings: UserSettings = {
  ashkenazi: true,
  includeModernHolidays: false,
  israel: false,
}

const generator = new LeiningGenerator(testSettings)

function findLeining(date: string, predicate: (title: string) => boolean) {
  const leiningDate = generator
    .forHebrewYear(5785)
    .find((candidate) => candidate.id === date)

  if (!leiningDate) throw new Error(`Missing leining date ${date}`)

  const leining = leiningDate.leinings.find((candidate) =>
    predicate(candidate.date.title.en)
  )

  if (!leining) throw new Error(`Missing leining on ${date}`)
  return leining
}

test('weekly parsha links use semantic parsha routes', (t) => {
  const beresheet = findLeining(
    '2024-10-26',
    (title) => title === 'Parshat Bereshit'
  )

  t.is(semanticParshaUrlForLeining(beresheet), '#/parsha/beresheet')
})

test('esther links use semantic parsha routes', (t) => {
  const esther = findLeining('2025-03-14', (title) => title === 'Purim')

  t.is(semanticParshaUrlForLeining(esther), '#/parsha/megillah-esther')
})

test('holiday links keep dated run routes', (t) => {
  const holiday = findLeining(
    '2024-10-03',
    (title) => title === 'Rosh Hashana I'
  )

  t.is(semanticParshaUrlForLeining(holiday), null)
})

test('combined parshiyot do not get semantic single-parsha routes', (t) => {
  const combined = generator
    .forHebrewYear(5786)
    .find((candidate) => candidate.title.en === 'Parshat Nitzavim-Vayeilech')
    ?.leinings[0]

  if (!combined) throw new Error('Missing combined parsha')

  t.is(semanticParshaUrlForLeining(combined), null)
})
