import { HDate } from '@hebcal/hdate'
import type { LeiningGenerator } from '../calendar-model/generator.ts'
import { getBookName } from '../calendar-model/hebcal-conversions.ts'
import {
  LeiningInstanceId,
  LeiningRunType,
  type LeiningAliyah,
  type LeiningInstance,
  type LeiningRun,
} from '../calendar-model/model-types.ts'
import { listReadingSearchLeinings } from '../search/reading-catalog.ts'
import { createReadingSearch } from '../search/reading-search.ts'
import { isVezosHabracha } from '../view-model/scroll-view-model.ts'
import { generateUrl } from '../view-model/navigation/url-parser.ts'
import {
  semanticParshaUrlForLeining,
} from '../view-model/navigation/parsha-routes.ts'
import renderLeiningTitle from './render-leining-title.ts'
import { listTorahBooks } from './torah-reference.ts'

export const ALIYAH_HOVER_FLYOUT_QUERY =
  '(hover: hover) and (pointer: fine) and (min-width: 716px)'
export const POPUP_VIEWPORT_MARGIN = 12

const POPUP_ANCHOR_GAP = 6
const PARSHA_CHOICE_SOURCE_LOOKBACK_YEARS = 3
const PARSHA_CHOICE_SOURCE_WINDOW_YEARS = 20
const ordinalDayByRoman = new Map([
  ['I', '1st day'],
  ['II', '2nd day'],
  ['VII', '7th day'],
  ['VIII', '8th day'],
])

const aliyahLabels = new Map<LeiningAliyah['index'], string>([
  [1, '1st - ראשון'],
  [2, '2nd - שני'],
  [3, '3rd - שלישי'],
  [4, '4th - רביעי'],
  [5, '5th - חמישי'],
  [6, '6th - ששי'],
  [7, '7th - שביעי'],
  ['Maftir', 'Maftir - מפטיר'],
])

const doubleParshaPartsByTitle = new Map<string, [string, string]>([
  ['ויקהל־פקודי', ['ויקהל', 'פקודי']],
  ['תזריע־מצרע', ['תזריע', 'מצרע']],
  ['אחרי מות־קדשים', ['אחרי מות', 'קדשים']],
  ['בהר־בחקתי', ['בהר', 'בחקתי']],
  ['חקת־בלק', ['חקת', 'בלק']],
  ['מטות־מסעי', ['מטות', 'מסעי']],
  ['נצבים־וילך', ['נצבים', 'וילך']],
])

const holidayColumnOrder = [
  'rosh-hashanah',
  'sukkot',
  'pesach',
  'chanukah',
] as const

type PopupRect = {
  width: number
  height: number
}

type AnchorRect = {
  left: number
  top: number
  right: number
  bottom: number
}

type ViewportRect = {
  width: number
  height: number
}

export type ParshaAliyahChoice = {
  label: string
  href: string
}

export type ParshaAliyahChoiceGroup = {
  label: string
  choices: ParshaAliyahChoice[]
}

export type ParshaPickerEntry = {
  id: string
  label: string
  englishLabel: string
  href: string
  aliyahGroups: ParshaAliyahChoiceGroup[]
}

export type ParshaPickerComingUpEntry = {
  id: string
  label: string
  href: string
  date: Date
}

export type ParshaPickerSearchResult = {
  id: string
  href: string
  hebrewLabel: string
  englishLabel: string
  matchedField: 0 | 1 | null
  matchedIndexes: number[]
  matchedAlias: string | null
}

function indexesForRanges(ranges: readonly (readonly [number, number])[]) {
  return ranges.flatMap(([start, end]) =>
    Array.from({ length: end - start + 1 }, (_, index) => start + index)
  )
}

function displayedSearchMatch({
  hebrewLabel,
  englishLabel,
  matchedAlias,
  match,
}: ReturnType<ReturnType<typeof createReadingSearch>['search']>[number]) {
  const matchedField = match?.matchedField
  if (!matchedField) {
    return { matchedField: null, matchedIndexes: [], matchedAlias }
  }
  if (matchedField.value === englishLabel) {
    return {
      matchedField: 1 as const,
      matchedIndexes: indexesForRanges(matchedField.ranges),
      matchedAlias: null,
    }
  }

  const hebrewOffset = hebrewLabel.indexOf(matchedField.value)
  if (hebrewOffset >= 0) {
    return {
      matchedField: 0 as const,
      matchedIndexes: indexesForRanges(matchedField.ranges).map(
        (index) => index + hebrewOffset
      ),
      matchedAlias: null,
    }
  }

  return {
    matchedField: null,
    matchedIndexes: [],
    matchedAlias,
  }
}

export type ParshaPickerModel = {
  parshaBooks: ParshaPickerEntry[][]
  holidayColumns: ParshaPickerEntry[][]
  megillot: ParshaPickerEntry[]
  comingUp: ParshaPickerComingUpEntry[]
  searchLeinings: LeiningInstance[]
  search(query: string): ParshaPickerSearchResult[]
}

function firstRunOf(leining: LeiningInstance): LeiningRun {
  const run = leining.runs[0]
  if (!run) {
    throw new Error(
      `Leining ${leining.date.title.en || leining.id} has no reading runs`
    )
  }
  return run
}

const torahBookLabelByNumber = new Map(
  listTorahBooks().map(({ number, label }) => [number, label])
)

function englishBookLabel(ref: LeiningAliyah['start']) {
  if (ref.scroll === 'torah') {
    return torahBookLabelByNumber.get(ref.b) ?? getBookName(ref)
  }
  return getBookName(ref)
}

function englishLeiningTitle(leining: LeiningInstance) {
  let title = leining.date.title.en
    .replace(/\b(VIII|VII|II|I)\b/, (day) => ordinalDayByRoman.get(day) ?? day)
    .replace(/\s+\((on [^)]+)\)$/i, ' $1')

  if (leining.id === LeiningInstanceId.Mincha) title += ' Mincha'
  if (leining.id === LeiningInstanceId.Maariv) title += ' Maariv'
  return title
}

function englishReadingLabel(leining: LeiningInstance) {
  const run = firstRunOf(leining)
  const firstAliyah = run.aliyot[0]
  const lastAliyah = run.aliyot.at(-1)
  if (!firstAliyah || !lastAliyah) {
    throw new Error(
      `Leining ${leining.date.title.en || leining.id} has no reading range`
    )
  }

  const start = firstAliyah.start
  const end = lastAliyah.end
  const startBook = englishBookLabel(start)
  const endBook = englishBookLabel(end)
  const startRef = `${start.c}:${start.v}`
  const sameBook = start.scroll === end.scroll && start.b === end.b
  const endRef =
    sameBook && start.c === end.c ? String(end.v) : `${end.c}:${end.v}`
  let range = `${startBook} ${startRef}`

  if (!sameBook) range += `-${endBook} ${endRef}`
  else if (start.c !== end.c || start.v !== end.v) range += `-${endRef}`

  return `${englishLeiningTitle(leining)} (${range})`
}

function parshaTitle(leining: LeiningInstance) {
  return renderLeiningTitle(leining)
}

function leiningKey(leining: LeiningInstance) {
  return [
    leining.date.date.getTime(),
    leining.id,
    firstRunOf(leining).id,
  ].join(':')
}

const navigationHrefForLeining = (leining: LeiningInstance) =>
  semanticParshaUrlForLeining(leining) ?? generateUrl(firstRunOf(leining))

export function calculateAnchoredPopupMaxHeight(
  triggerRect: AnchorRect,
  viewport: ViewportRect
) {
  const availableAbove =
    triggerRect.top - POPUP_VIEWPORT_MARGIN - POPUP_ANCHOR_GAP
  const availableBelow =
    viewport.height -
    triggerRect.bottom -
    POPUP_VIEWPORT_MARGIN -
    POPUP_ANCHOR_GAP
  return Math.max(0, availableAbove, availableBelow)
}

export function calculateAnchoredPopupPosition({
  triggerRect,
  popupRect,
  viewport,
}: {
  triggerRect: AnchorRect
  popupRect: PopupRect
  viewport: ViewportRect
}) {
  const margin = POPUP_VIEWPORT_MARGIN
  const gap = POPUP_ANCHOR_GAP
  const fitsBelow =
    triggerRect.bottom + gap + popupRect.height <= viewport.height - margin
  const preferredTop = fitsBelow
    ? triggerRect.bottom + gap
    : triggerRect.top - popupRect.height - gap
  const centeredLeft =
    triggerRect.left +
    (triggerRect.right - triggerRect.left - popupRect.width) / 2

  return {
    left: Math.min(
      Math.max(centeredLeft, margin),
      viewport.width - popupRect.width - margin
    ),
    top: Math.min(
      Math.max(preferredTop, margin),
      viewport.height - popupRect.height - margin
    ),
  }
}

export function calculateFlyoutPopupPosition({
  anchorRect,
  verticalAnchorRect = anchorRect,
  popupRect,
  viewport,
}: {
  anchorRect: AnchorRect
  verticalAnchorRect?: AnchorRect
  popupRect: PopupRect
  viewport: ViewportRect
}) {
  const margin = POPUP_VIEWPORT_MARGIN
  const gap = 4
  const fitsRight =
    anchorRect.right + gap + popupRect.width <= viewport.width - margin
  const fitsLeft = anchorRect.left - gap - popupRect.width >= margin
  const side = fitsRight || !fitsLeft ? 'right' : 'left'
  const preferredLeft =
    side === 'right'
      ? anchorRect.right + gap
      : anchorRect.left - popupRect.width - gap

  return {
    left: Math.min(
      Math.max(preferredLeft, margin),
      viewport.width - popupRect.width - margin
    ),
    top: Math.min(
      Math.max(verticalAnchorRect.top, margin),
      viewport.height - popupRect.height - margin
    ),
    side,
  }
}

export function parshaListTitleForLeining(leining: LeiningInstance) {
  if (isVezosHabracha(firstRunOf(leining))) return 'וזאת הברכה'
  return renderLeiningTitle(leining)
}

export function buildParshaAliyahChoices(
  leining: LeiningInstance
): ParshaAliyahChoice[] {
  return leining.runs
    .filter(
      (run) =>
        run.scroll === 'torah' &&
        (run.type === LeiningRunType.Main ||
          run.type === LeiningRunType.Maftir)
    )
    .flatMap((run) =>
      run.aliyot
        .filter((aliyah) => aliyah.index)
        .map((aliyah) => ({
          label: aliyahLabels.get(aliyah.index) ?? String(aliyah.index),
          href:
            semanticParshaUrlForLeining(leining, aliyah.start) ??
            generateUrl(run, aliyah.start),
        }))
    )
}

export function buildParshaAliyahChoiceGroups(
  leining: LeiningInstance,
  sourceLeinings: LeiningInstance[]
): ParshaAliyahChoiceGroup[] {
  const label = parshaTitle(leining)
  const choices = buildParshaAliyahChoices(leining)
  const doubleParts = doubleParshaPartsByTitle.get(label)

  if (!doubleParts) return [{ label, choices }]

  const singleParshaGroups = doubleParts.flatMap((part) => {
    const match = sourceLeinings.find(
      (candidate) => candidate !== leining && parshaTitle(candidate) === part
    )
    if (!match) return []

    return [{ label: part, choices: buildParshaAliyahChoices(match) }]
  })

  return [{ label, choices }, ...singleParshaGroups]
}

export function collectParshaChoiceSourceLeinings(
  generator: LeiningGenerator,
  baseLeinings: LeiningInstance[],
  currentYear = new HDate().getFullYear()
) {
  const firstYear = currentYear - PARSHA_CHOICE_SOURCE_LOOKBACK_YEARS
  const lastYearExclusive = firstYear + PARSHA_CHOICE_SOURCE_WINDOW_YEARS
  const extraLeinings = []

  for (let year = firstYear; year < lastYearExclusive; year += 1) {
    extraLeinings.push(
      ...generator
        .forHebrewYear(year)
        .flatMap((date) => date.leinings)
        .filter((leining) => leining.isParsha)
    )
  }

  return [...baseLeinings, ...extraLeinings]
}

function holidayColumnFor(leining: LeiningInstance) {
  const title = leining.date.title.he

  if (
    title.startsWith('סוכות') ||
    title.startsWith('הושענא רבה') ||
    title.startsWith('שמיני עצרת') ||
    title.startsWith('שמחת תורה')
  ) {
    return 'sukkot'
  }

  if (
    title.startsWith('פסח') ||
    title.startsWith('שביעי של פסח') ||
    title.startsWith('פורים') ||
    title.startsWith('שושן פורים') ||
    title.startsWith('שבועות') ||
    title.startsWith('עשרה בטבת') ||
    title.startsWith('שבעה עשר בתמוז') ||
    title.startsWith('צום תמוז') ||
    title.startsWith('תשעה באב')
  ) {
    return 'pesach'
  }

  if (title.startsWith('חנוכה') || title.startsWith('ראש חודש')) {
    return 'chanukah'
  }

  return 'rosh-hashanah'
}

function groupHolidays(leinings: LeiningInstance[]) {
  const groups = Object.fromEntries(
    holidayColumnOrder.map((key) => [key, [] as LeiningInstance[]])
  ) as Record<(typeof holidayColumnOrder)[number], LeiningInstance[]>

  for (const leining of leinings) {
    if (leining.isParsha) continue
    if (leining.id === LeiningInstanceId.Megillah) continue
    if (firstRunOf(leining).scroll !== 'torah') continue
    if (
      leining.date.title.he.startsWith('ראש חודש') &&
      groups.chanukah.some((existing) =>
        existing.date.title.he.startsWith('ראש חודש')
      )
    ) {
      continue
    }
    if (leining.date.title.he.startsWith('תענית אסתר')) continue

    groups[holidayColumnFor(leining)].push(leining)
  }

  return holidayColumnOrder
    .map((column) => groups[column])
    .filter((group) => group.length)
}

export function buildParshaPickerModel(
  generator: LeiningGenerator,
  now = new HDate(),
  today = new Date()
): ParshaPickerModel {
  const leinings = listReadingSearchLeinings(generator, now)
  const readingSearch = createReadingSearch(leinings)
  const choiceSources = collectParshaChoiceSourceLeinings(
    generator,
    leinings,
    now.getFullYear()
  )
  let choiceId = 0

  const entryFor = (
    leining: LeiningInstance,
    {
      label = renderLeiningTitle(leining),
      includeAliyot = false,
    }: { label?: string; includeAliyot?: boolean } = {}
  ): ParshaPickerEntry => {
    const aliyahGroups = includeAliyot
      ? buildParshaAliyahChoiceGroups(leining, choiceSources).filter(
          (group) => group.choices.length
        )
      : []
    return {
      id: aliyahGroups.length
        ? `parsha-aliyot-${choiceId++}`
        : leiningKey(leining),
      label,
      englishLabel: englishReadingLabel(leining),
      href: navigationHrefForLeining(leining),
      aliyahGroups,
    }
  }

  const parshaBooks: ParshaPickerEntry[][] = []
  for (const leining of leinings.filter(
    (candidate) =>
      candidate.isParsha || isVezosHabracha(firstRunOf(candidate))
  )) {
    const firstAliyah = firstRunOf(leining).aliyot[0]
    if (!firstAliyah) {
      throw new Error(
        `Leining ${leining.date.title.en || leining.id} has no aliyot`
      )
    }
    const book = firstAliyah.start.b
    const entries = parshaBooks[book] ?? []
    entries.push(
      entryFor(leining, {
        label: parshaListTitleForLeining(leining),
        includeAliyot: true,
      })
    )
    parshaBooks[book] = entries
  }

  const comingUp = leinings
    .filter((leining) => leining.date.date > today)
    .slice(0, 3)
    .map((leining, index) => ({
      id: leiningKey(leining),
      label: renderLeiningTitle(leining, { forCalendar: true }),
      href: index === 0 ? '#/next' : navigationHrefForLeining(leining),
      date: leining.date.date,
    }))
    .reverse()

  return {
    searchLeinings: leinings,
    parshaBooks: parshaBooks.filter(Boolean),
    holidayColumns: groupHolidays(leinings).map((group) =>
      group.map((leining) => entryFor(leining))
    ),
    megillot: leinings
      .filter((leining) => leining.id === LeiningInstanceId.Megillah)
      .map((leining) => entryFor(leining)),
    comingUp,
    search(query) {
      return readingSearch.search(query, 5).map((result) => ({
        id: result.id,
        href: result.href,
        hebrewLabel: result.hebrewLabel,
        englishLabel: result.englishLabel,
        ...displayedSearchMatch(result),
      }))
    },
  }
}
