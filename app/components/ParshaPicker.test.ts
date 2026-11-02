import { expect, test } from 'vitest'
import { HDate } from '@hebcal/hdate'
import { readingTitle, type ReadingInstance } from '../calendar-model/model-types.ts'
import { LeiningGenerator } from '../calendar-model/generator.ts'
import type { UserSettings } from '../calendar-model/user-settings.ts'
import { buildParshaAliyahChoiceGroups, buildParshaAliyahChoices, buildParshaPickerModel, collectParshaChoiceSourceLeinings, parshaListTitleForLeining } from './parsha-picker-model.ts'

const testSettings: UserSettings = {
  ashkenazi: true,
  includeModernHolidays: false,
  israel: false,
}

const generator = new LeiningGenerator(testSettings)

test('builds aliyah choices for a regular parsha', () => {
  const beresheet = findParsha('Bereshit')

  expect(buildParshaAliyahChoices(beresheet).map(({ label, href }) => ({
      label,
      href,
    }))).toEqual([
      {
        label: '1st - ראשון',
        href: '#/torah/parsha/beresheet/1-1-1',
      },
      {
        label: '2nd - שני',
        href: '#/torah/parsha/beresheet/1-2-4',
      },
      {
        label: '3rd - שלישי',
        href: '#/torah/parsha/beresheet/1-2-20',
      },
      {
        label: '4th - רביעי',
        href: '#/torah/parsha/beresheet/1-3-22',
      },
      {
        label: '5th - חמישי',
        href: '#/torah/parsha/beresheet/1-4-19',
      },
      {
        label: '6th - ששי',
        href: '#/torah/parsha/beresheet/1-4-23',
      },
      {
        label: '7th - שביעי',
        href: '#/torah/parsha/beresheet/1-5-25',
      },
      {
        label: 'Maftir - מפטיר',
        href: '#/torah/parsha/beresheet/1-6-5',
      },
    ])
})

test('uses the separate maftir run when a parsha has one', () => {
  const pinchas = findParsha('Pinchas')
  const choices = buildParshaAliyahChoices(pinchas)
  const lastChoice = choices[choices.length - 1]

  expect(lastChoice?.label).toBe('Maftir - מפטיר')
  expect(lastChoice?.href).toBe('#/torah/parsha/pinchas/4-29-35')
})

test('builds submenu choices for a double parsha', () => {
  const allParshiyot = parshiyotForYears(5784, 5786)
  const tazriaMetzora = findParsha('Tazria-Metzora', allParshiyot)

  expect(buildParshaAliyahChoiceGroups(tazriaMetzora, allParshiyot).map(
      ({ label, choices }) => ({
        label,
        firstHref: choices[0]?.href,
      })
    )).toEqual([
      {
        label: 'תזריע־מצרע',
        firstHref: '#/torah/parsha/tazria-metzora/3-12-1',
      },
      {
        label: 'תזריע',
        firstHref: '#/torah/parsha/tazria/3-12-1',
      },
      {
        label: 'מצרע',
        firstHref: '#/torah/parsha/metzora/3-14-1',
      },
    ])
})

test('finds standalone Matot and Masei without searching future calendar years', () => {
  const baseLeinings = generator
    .forEntireChumash(new HDate())
    .flatMap((date) => date.leinings)
  const sourceLeinings = collectParshaChoiceSourceLeinings(baseLeinings)
  const matotMasei = findParsha('Matot-Masei', sourceLeinings)

  expect(
    buildParshaAliyahChoiceGroups(matotMasei, sourceLeinings).map(
      ({ label, choices }) => ({ label, choiceCount: choices.length })
    )
  ).toEqual([
    { label: 'מטות־מסעי', choiceCount: 8 },
    { label: 'מטות', choiceCount: 8 },
    { label: 'מסעי', choiceCount: 8 },
  ])
})

test('does not treat single parshiyot with a maqaf as double parshiyot', () => {
  const lechLecha = findParsha('Lech-Lecha')

  expect(buildParshaAliyahChoiceGroups(lechLecha, [lechLecha])).toEqual([
    { label: 'לך־לך', choices: buildParshaAliyahChoices(lechLecha) },
  ])
})

test('labels Vezot Haberacha as a parsha and exposes the seventh recording division', () => {
  const simchatTorah = generator
    .forHebrewYear(5786)
    .find((date) => date.title.he === 'שמחת תורה')
    ?.leinings[0]

  if (!simchatTorah) throw new Error('Missing Simchat Torah')

  expect(parshaListTitleForLeining(simchatTorah)).toBe('וזאת הברכה')
  expect(buildParshaAliyahChoices(simchatTorah).some(choice =>
    choice.href === '#/torah/parsha/vezot-haberacha/5-34-1')).toBe(true)
  expect(simchatTorah.runs[0].aliyot).toHaveLength(6)
})

test('describes holiday and Megillah destinations with their English ranges', () => {
  const model = buildParshaPickerModel(generator)
  const holidayLabels = model.holidayColumns
    .flat()
    .map(({ englishLabel }) => englishLabel)

  expect(holidayLabels).toContain('Purim (Shemot 17:8-16)')
  expect(holidayLabels).toContain(
    "Asara B'Tevet Mincha (Shemot 32:11-34:10)"
  )
  expect(
    holidayLabels.some((label) => label.startsWith('Sukkot 1st day'))
  ).toBe(true)
  expect(model.megillot.map(({ englishLabel }) => englishLabel)).toContain(
    'Purim (Esther 1:1-10:3)'
  )
})

function parshiyotForYears(startYear: number, endYear: number) {
  const leinings = []
  for (let year = startYear; year <= endYear; year += 1) {
    leinings.push(
      ...generator
        .forHebrewYear(year)
        .flatMap((date) => date.leinings)
        .filter((leining) => leining.isParsha)
    )
  }
  return leinings
}

function findParsha(
  englishName: string,
  leinings: ReadingInstance[] = generator
    .forEntireChumash(new HDate())
    .flatMap((date) => date.leinings)
) {
  const match = leinings.find(
    (leining) =>
      leining.isParsha && readingTitle(leining).en.includes(englishName)
  )

  if (!match) throw new Error(`Could not find parsha ${englishName}`)
  return match
}
