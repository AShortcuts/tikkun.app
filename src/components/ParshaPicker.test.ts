import test from 'ava'
import { HDate } from '@hebcal/hdate'
import { LeiningGenerator } from '../calendar-model/generator.ts'
import type { UserSettings } from '../calendar-model/user-settings.ts'
import {
  buildParshaAliyahChoiceGroups,
  buildParshaAliyahChoices,
  calculateAnchoredPopupPosition,
  parshaListTitleForLeining,
  renderAliyahPopupContent,
} from './ParshaPicker.ts'

const testSettings: UserSettings = {
  ashkenazi: true,
  includeModernHolidays: false,
  israel: false,
}

const generator = new LeiningGenerator(testSettings)

test('builds aliyah choices for a regular parsha', (t) => {
  const bereshit = findParsha('Bereshit')

  t.deepEqual(
    buildParshaAliyahChoices(bereshit).map(({ label, href }) => ({
      label,
      href,
    })),
    [
      {
        label: '1st - ראשון',
        href: '#/parsha/beresheet/1-1-1',
      },
      {
        label: '2nd - שני',
        href: '#/parsha/beresheet/1-2-4',
      },
      {
        label: '3rd - שלישי',
        href: '#/parsha/beresheet/1-2-20',
      },
      {
        label: '4th - רביעי',
        href: '#/parsha/beresheet/1-3-22',
      },
      {
        label: '5th - חמישי',
        href: '#/parsha/beresheet/1-4-19',
      },
      {
        label: '6th - ששי',
        href: '#/parsha/beresheet/1-4-23',
      },
      {
        label: '7th - שביעי',
        href: '#/parsha/beresheet/1-5-25',
      },
      {
        label: 'Maftir - מפטיר',
        href: '#/parsha/beresheet/1-6-5',
      },
    ]
  )
})

test('uses the separate maftir run when a parsha has one', (t) => {
  const pinchas = findParsha('Pinchas')
  const choices = buildParshaAliyahChoices(pinchas)
  const lastChoice = choices[choices.length - 1]

  t.is(lastChoice?.label, 'Maftir - מפטיר')
  t.is(lastChoice?.href, '#/parsha/pinchas/4-29-35')
})

test('builds submenu choices for a double parsha', (t) => {
  const allParshiyot = parshiyotForYears(5784, 5786)
  const tazriaMetzora = findParsha('Tazria-Metzora', allParshiyot)

  t.deepEqual(
    buildParshaAliyahChoiceGroups(tazriaMetzora, allParshiyot).map(
      ({ label, choices }) => ({
        label,
        firstHref: choices[0]?.href,
      })
    ),
    [
      {
        label: 'תזריע־מצרע',
        firstHref: '#/run/2025-05-03:shacharis,main/3-12-1',
      },
      {
        label: 'תזריע',
        firstHref: '#/parsha/tazria/3-12-1',
      },
      {
        label: 'מצרע',
        firstHref: '#/parsha/metzora/3-14-1',
      },
    ]
  )
})

test('renders a parsha header above aliyah choices', (t) => {
  const bereshit = findParsha('Bereshit')
  const [group] = buildParshaAliyahChoiceGroups(bereshit, [bereshit])

  t.regex(
    renderAliyahPopupContent([group]),
    /<div class="aliyah-selection-heading">בראשית<\/div>/
  )
})

test('does not treat single parshiyot with a maqaf as double parshiyot', (t) => {
  const lechLecha = findParsha('Lech-Lecha')

  t.deepEqual(buildParshaAliyahChoiceGroups(lechLecha, [lechLecha]), [
    { label: 'לך־לך', choices: buildParshaAliyahChoices(lechLecha) },
  ])
})

test('labels Vezos Haberacha as a parsha in the parsha list', (t) => {
  const simchatTorah = generator
    .forHebrewYear(5786)
    .find((date) => date.title.he === 'שמחת תורה')
    ?.leinings[0]

  if (!simchatTorah) throw new Error('Missing Simchat Torah')

  t.is(parshaListTitleForLeining(simchatTorah), 'וזאת הברכה')
})

test('positions bottom-edge aliyah popup directly above the selected parsha', (t) => {
  t.deepEqual(
    calculateAnchoredPopupPosition({
      anchorX: 950,
      triggerRect: { left: 900, top: 650, right: 1100, bottom: 690 },
      popupRect: { width: 220, height: 320 },
      viewport: { width: 1280, height: 720 },
    }),
    { left: 950, top: 322 }
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
  leinings = generator
    .forEntireChumash(new HDate())
    .flatMap((date) => date.leinings)
) {
  const match = leinings.find(
    (leining) =>
      leining.isParsha && leining.date.title.en.includes(englishName)
  )

  if (!match) throw new Error(`Could not find parsha ${englishName}`)
  return match
}
