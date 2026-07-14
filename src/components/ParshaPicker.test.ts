import { expect, test } from 'vitest'
import { HDate } from '@hebcal/hdate'
import { LeiningGenerator } from '../calendar-model/generator.ts'
import type { UserSettings } from '../calendar-model/user-settings.ts'
import {
  buildParshaAliyahChoiceGroups,
  buildParshaAliyahChoices,
  calculateAnchoredPopupMaxHeight,
  calculateAnchoredPopupPosition,
  calculateFlyoutPopupPosition,
  collectParshaChoiceSourceLeinings,
  parshaListTitleForLeining,
  renderAliyahPopupContent,
  renderCalendarSettings,
} from './ParshaPicker.ts'

const testSettings: UserSettings = {
  ashkenazi: true,
  includeModernHolidays: false,
  israel: false,
}

const generator = new LeiningGenerator(testSettings)

test('builds aliyah choices for a regular parsha', () => {
  const bereshit = findParsha('Bereshit')

  expect(buildParshaAliyahChoices(bereshit).map(({ label, href }) => ({
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
        firstHref: '#/run/2025-05-03:shacharis,main/3-12-1',
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

test('finds standalone Matot and Masei within the 20-year source window', () => {
  const baseLeinings = generator
    .forEntireChumash(new HDate())
    .flatMap((date) => date.leinings)
  const sourceLeinings = collectParshaChoiceSourceLeinings(
    generator,
    baseLeinings,
    5786
  )
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

test('renders a parsha header above aliyah choices', () => {
  const bereshit = findParsha('Bereshit')
  const [group] = buildParshaAliyahChoiceGroups(bereshit, [bereshit])

  expect(renderAliyahPopupContent([group])).toMatch(/<div class="aliyah-selection-heading">בראשית<\/div>/)
})

test('does not treat single parshiyot with a maqaf as double parshiyot', () => {
  const lechLecha = findParsha('Lech-Lecha')

  expect(buildParshaAliyahChoiceGroups(lechLecha, [lechLecha])).toEqual([
    { label: 'לך־לך', choices: buildParshaAliyahChoices(lechLecha) },
  ])
})

test('labels Vezos Haberacha as a parsha in the parsha list', () => {
  const simchatTorah = generator
    .forHebrewYear(5786)
    .find((date) => date.title.he === 'שמחת תורה')
    ?.leinings[0]

  if (!simchatTorah) throw new Error('Missing Simchat Torah')

  expect(parshaListTitleForLeining(simchatTorah)).toBe('וזאת הברכה')
})

test('positions bottom-edge aliyah popup directly above the selected parsha', () => {
  expect(calculateAnchoredPopupPosition({
      triggerRect: { left: 900, top: 650, right: 1100, bottom: 690 },
      popupRect: { width: 220, height: 320 },
      viewport: { width: 1280, height: 720 },
    })).toEqual({ left: 890, top: 324 })
})

test('limits an aliyah popup to the larger side of its trigger', () => {
  expect(calculateAnchoredPopupMaxHeight(
      { left: 900, top: 350, right: 1100, bottom: 415 },
      { width: 1280, height: 720 }
    )).toBe(332)
})

test('positions a desktop aliyah menu to the right of its parsha', () => {
  expect(calculateFlyoutPopupPosition({
      anchorRect: { left: 900, top: 350, right: 1100, bottom: 415 },
      popupRect: { width: 156, height: 320 },
      viewport: { width: 1280, height: 720 },
    })).toEqual({ left: 1104, top: 350, side: 'right' })
})

test('positions an aliyah submenu beside its parent without overflowing', () => {
  expect(calculateFlyoutPopupPosition({
      anchorRect: { left: 1030, top: 360, right: 1270, bottom: 600 },
      verticalAnchorRect: { left: 1040, top: 400, right: 1260, bottom: 440 },
      popupRect: { width: 220, height: 320 },
      viewport: { width: 1280, height: 720 },
    })).toEqual({ left: 806, top: 388, side: 'left' })
})

test('renders the Israel calendar toggle unchecked by default', () => {
  expect(renderCalendarSettings({ israel: false })).toMatch(/<input[^>]+data-target-id="calendar-israel-toggle"[^>]+type="checkbox"/)
  expect(renderCalendarSettings({ israel: false })).not.toMatch(/checked/)
})

test('renders the Israel calendar toggle checked when enabled', () => {
  expect(renderCalendarSettings({ israel: true })).toMatch(/checked/)
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
