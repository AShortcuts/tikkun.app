import { HDate } from '@hebcal/hdate'
import { LeiningGenerator } from '../../calendar-model/generator.ts'
import {
  LeiningInstanceId,
  LeiningRunType,
  type LeiningDate,
  type LeiningInstance,
  type LeiningRun,
} from '../../calendar-model/model-types.ts'
import type { RefWithScroll } from '../../ref.ts'
import { fromISODateString, toISODateString } from '../../calendar-model/utils.ts'
import slugify from '../../slugify.ts'

const SEARCH_WINDOW_HEBREW_YEARS = 10
const PURIM_TITLE_SLUG = 'purim'

type WeeklyParshaRoute = {
  kind: 'weekly'
  canonicalSlug: string
  titleSlugs: string[]
  aliases?: string[]
}

type MegillahRoute = {
  kind: 'megillah'
  canonicalSlug: 'megillah-esther'
  aliases: string[]
  displayTitle: 'מגילת אסתר'
}

type VezosHaberachaRoute = {
  kind: 'vezos-haberacha'
  canonicalSlug: 'vezos-haberacha'
  aliases: string[]
  displayTitle: 'וזאת הברכה'
}

type ParshaRouteSpec = WeeklyParshaRoute | MegillahRoute | VezosHaberachaRoute

const weeklyParshaRoutes: WeeklyParshaRoute[] = [
  {
    kind: 'weekly',
    canonicalSlug: 'beresheet',
    titleSlugs: ['bereshit'],
    aliases: ['bereshit'],
  },
  { kind: 'weekly', canonicalSlug: 'noach', titleSlugs: ['noach'],  aliases: ['noah']  },
  { kind: 'weekly', canonicalSlug: 'lech-lecha', titleSlugs: ['lechlecha'] },
  { kind: 'weekly', canonicalSlug: 'vayera', titleSlugs: ['vayera'] },
  { kind: 'weekly', canonicalSlug: 'chayei-sara', titleSlugs: ['chayei-sara'] },
  { kind: 'weekly', canonicalSlug: 'toldot', titleSlugs: ['toldot'] },
  {
    kind: 'weekly',
    canonicalSlug: 'vayetzei',
    titleSlugs: ['vayetzei'],
    aliases: ['vayetze'],
  },
  { kind: 'weekly', canonicalSlug: 'vayishlach', titleSlugs: ['vayishlach'] },
  { kind: 'weekly', canonicalSlug: 'vayeshev', titleSlugs: ['vayeshev'] },
  { kind: 'weekly', canonicalSlug: 'miketz', titleSlugs: ['miketz'] },
  { kind: 'weekly', canonicalSlug: 'vayigash', titleSlugs: ['vayigash'] },
  { kind: 'weekly', canonicalSlug: 'vayechi', titleSlugs: ['vayechi'] },
  { kind: 'weekly', canonicalSlug: 'shemot', titleSlugs: ['shemot'] },
  { kind: 'weekly', canonicalSlug: 'vaera', titleSlugs: ['vaera'] },
  { kind: 'weekly', canonicalSlug: 'bo', titleSlugs: ['bo'] },
  { kind: 'weekly', canonicalSlug: 'beshalach', titleSlugs: ['beshalach'] },
  { kind: 'weekly', canonicalSlug: 'yitro', titleSlugs: ['yitro'] },
  { kind: 'weekly', canonicalSlug: 'mishpatim', titleSlugs: ['mishpatim'] },
  { kind: 'weekly', canonicalSlug: 'terumah', titleSlugs: ['terumah'] },
  { kind: 'weekly', canonicalSlug: 'tetzaveh', titleSlugs: ['tetzaveh'] },
  { kind: 'weekly', canonicalSlug: 'ki-tisa', titleSlugs: ['ki-tisa'] },
  { kind: 'weekly', canonicalSlug: 'vayakhel', titleSlugs: ['vayakhel'] },
  { kind: 'weekly', canonicalSlug: 'pekudei', titleSlugs: ['pekudei'] },
  { kind: 'weekly', canonicalSlug: 'vayikra', titleSlugs: ['vayikra'] },
  { kind: 'weekly', canonicalSlug: 'tzav', titleSlugs: ['tzav'] },
  { kind: 'weekly', canonicalSlug: 'shmini', titleSlugs: ['shmini'], aliases: ['shemini'] },
  { kind: 'weekly', canonicalSlug: 'tazria', titleSlugs: ['tazria'] },
  { kind: 'weekly', canonicalSlug: 'metzora', titleSlugs: ['metzora'] },
  { kind: 'weekly', canonicalSlug: 'achrei-mot', titleSlugs: ['achrei-mot'] },
  { kind: 'weekly', canonicalSlug: 'kedoshim', titleSlugs: ['kedoshim'] },
  { kind: 'weekly', canonicalSlug: 'emor', titleSlugs: ['emor'] },
  { kind: 'weekly', canonicalSlug: 'behar', titleSlugs: ['behar'] },
  { kind: 'weekly', canonicalSlug: 'bechukotai', titleSlugs: ['bechukotai'] },
  { kind: 'weekly', canonicalSlug: 'bamidbar', titleSlugs: ['bamidbar'] },
  { kind: 'weekly', canonicalSlug: 'nasso', titleSlugs: ['nasso'] },
  { kind: 'weekly', canonicalSlug: 'behalotecha', titleSlugs: ['behaalotcha'] },
  { kind: 'weekly', canonicalSlug: 'shlach', titleSlugs: ['shlach'] },
  { kind: 'weekly', canonicalSlug: 'korach', titleSlugs: ['korach'] },
  { kind: 'weekly', canonicalSlug: 'chukat', titleSlugs: ['chukat'] },
  { kind: 'weekly', canonicalSlug: 'balak', titleSlugs: ['balak'] },
  { kind: 'weekly', canonicalSlug: 'pinchas', titleSlugs: ['pinchas'] },
  { kind: 'weekly', canonicalSlug: 'matot', titleSlugs: ['matot'] },
  { kind: 'weekly', canonicalSlug: 'masei', titleSlugs: ['masei'] },
  { kind: 'weekly', canonicalSlug: 'devarim', titleSlugs: ['devarim'] },
  { kind: 'weekly', canonicalSlug: 'vaetchanan', titleSlugs: ['vaetchanan'] },
  { kind: 'weekly', canonicalSlug: 'eikev', titleSlugs: ['eikev'] },
  { kind: 'weekly', canonicalSlug: 'reeh', titleSlugs: ['reeh'] },
  { kind: 'weekly', canonicalSlug: 'shoftim', titleSlugs: ['shoftim'] },
  { kind: 'weekly', canonicalSlug: 'ki-teitzei', titleSlugs: ['ki-teitzei'] },
  { kind: 'weekly', canonicalSlug: 'ki-tavo', titleSlugs: ['ki-tavo'] },
  { kind: 'weekly', canonicalSlug: 'nitzavim', titleSlugs: ['nitzavim'] },
  {
    kind: 'weekly',
    canonicalSlug: 'vayelech',
    titleSlugs: ['vayeilech'],
    aliases: ['vayeilech'],
  },
  { kind: 'weekly', canonicalSlug: 'haazinu', titleSlugs: ['haazinu'] },
]

const parshaRouteSpecs: ParshaRouteSpec[] = [
  ...weeklyParshaRoutes,
  {
    kind: 'megillah',
    canonicalSlug: 'megillah-esther',
    aliases: ['esther', 'megillat-esther', 'ester', 'megillah-ester'],
    displayTitle: 'מגילת אסתר',
  },
  // Hebcal emits וזאת הברכה as the Simchat Torah holiday leining, but the TOC
  // treats it as its own parsha. Keep a separate slug and display title so
  // direct Simchat Torah navigation remains holiday-labeled while this parsha
  // route labels the reader as וזאת הברכה.
  {
    kind: 'vezos-haberacha',
    canonicalSlug: 'vezos-haberacha',
    aliases: [
      'vezos-haberacha',
      'vezot-haberacha',
      'vezos-habracha',
      'vezot-habracha',
      'vzot-haberacha',
      'vzot-habracha',
    ],
    displayTitle: 'וזאת הברכה',
  },
]

const routeSpecByCanonicalSlug = new Map(
  parshaRouteSpecs.map((spec) => [spec.canonicalSlug, spec])
)

const aliasToCanonicalSlug = new Map<string, string>()

for (const spec of parshaRouteSpecs) {
  const aliases = [
    spec.canonicalSlug,
    spec.canonicalSlug.replace(/-/g, ''),
    ...('titleSlugs' in spec ? spec.titleSlugs : []),
    ...(spec.aliases ?? []),
  ]

  for (const alias of aliases) {
    aliasToCanonicalSlug.set(normalizeParshaSlug(alias), spec.canonicalSlug)
  }
}

function normalizeParshaSlug(slug: string) {
  return slugify(slug.replace(/-/g, ' '))
}

function titleSlug(title: string) {
  return slugify(title.replace(/^Parshat\s+/i, ''))
}

function uniqueTerms(terms: Array<string | null | undefined>) {
  const seen = new Set<string>()
  const result: string[] = []

  for (const term of terms) {
    const trimmed = term?.trim()
    if (!trimmed) continue
    const key = normalizeParshaSlug(trimmed)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(trimmed)
  }

  return result
}

function searchTermsForRouteSpec(spec: ParshaRouteSpec) {
  return uniqueTerms([
    spec.canonicalSlug,
    spec.canonicalSlug.replace(/-/g, ''),
    ...('titleSlugs' in spec ? spec.titleSlugs : []),
    ...(spec.aliases ?? []),
    spec.kind === 'megillah' ? spec.displayTitle : null,
    spec.kind === 'vezos-haberacha' ? spec.displayTitle : null,
  ])
}

function routeSpecForLeining(leining: LeiningInstance) {
  if (
    leining.id === LeiningInstanceId.Megillah &&
    leining.runs.some((run) => run.type === LeiningRunType.Megillah) &&
    titleSlug(leining.date.title.en) === PURIM_TITLE_SLUG
  ) {
    return routeSpecByCanonicalSlug.get('megillah-esther') ?? null
  }

  if (
    leining.id === LeiningInstanceId.Shacharis &&
    leining.runs.some((run) => run.aliyot[0]?.start.b === 5 && run.aliyot[0]?.start.c === 33)
  ) {
    return routeSpecByCanonicalSlug.get('vezos-haberacha') ?? null
  }

  if (!leining.isParsha || leining.id !== LeiningInstanceId.Shacharis) return null

  const slug = titleSlug(leining.date.title.en)
  return (
    parshaRouteSpecs.find(
      (spec) => spec.kind === 'weekly' && spec.titleSlugs.includes(slug)
    ) ?? null
  )
}

function* futureLeiningDates(generator: LeiningGenerator, now: Date) {
  const minDate = fromISODateString(toISODateString(now))
  const startYear = new HDate(minDate).getFullYear()

  for (let year = startYear; year < startYear + SEARCH_WINDOW_HEBREW_YEARS; year++) {
    for (const leiningDate of generator.forHebrewYear(year)) {
      if (leiningDate.date < minDate) continue
      yield leiningDate
    }
  }
}

function mainParshaRun(leiningDate: LeiningDate, expectedSlugs: string[]) {
  const match = leiningDate.leinings.find((leining) => {
    if (!leining.isParsha || leining.id !== LeiningInstanceId.Shacharis) return false
    return expectedSlugs.includes(titleSlug(leiningDate.title.en))
  })

  return match?.runs.find((run) => run.type === LeiningRunType.Main) ?? null
}

function estherRun(leiningDate: LeiningDate) {
  if (titleSlug(leiningDate.title.en) !== PURIM_TITLE_SLUG) return null

  const match = leiningDate.leinings.find(
    (leining) => leining.id === LeiningInstanceId.Megillah
  )

  return match?.runs.find((run) => run.type === LeiningRunType.Megillah) ?? null
}

function vezosHaberachaRun(leiningDate: LeiningDate) {
  if (leiningDate.title.he !== 'שמחת תורה') return null

  const match = leiningDate.leinings.find(
    (leining) => leining.id === LeiningInstanceId.Shacharis
  )

  return (
    match?.runs.find(
      (run) =>
        run.type === LeiningRunType.Main &&
        run.aliyot[0]?.start.b === 5 &&
        run.aliyot[0]?.start.c === 33
    ) ?? null
  )
}

export function canonicalizeParshaSlug(slug: string): string | null {
  return aliasToCanonicalSlug.get(normalizeParshaSlug(slug)) ?? null
}

export function getParshaSearchTermsForSlug(slug: string) {
  const canonicalSlug = canonicalizeParshaSlug(slug)
  if (!canonicalSlug) return []

  const spec = routeSpecByCanonicalSlug.get(canonicalSlug)
  return spec ? searchTermsForRouteSpec(spec) : []
}

export function getParshaSearchTermsForLeining(leining: LeiningInstance) {
  const spec = routeSpecForLeining(leining)
  return spec ? searchTermsForRouteSpec(spec) : []
}

export function scrollForParshaSlug(slug: string): RefWithScroll['scroll'] | null {
  const canonicalSlug = canonicalizeParshaSlug(slug)
  if (!canonicalSlug) return null

  const spec = routeSpecByCanonicalSlug.get(canonicalSlug)
  if (!spec) return null
  return spec.kind === 'megillah' ? 'esther' : 'torah'
}

export function generateParshaUrl(slug: string, initialRef?: RefWithScroll) {
  const canonicalSlug = canonicalizeParshaSlug(slug) ?? slug
  const scroll = scrollForParshaSlug(canonicalSlug) ?? initialRef?.scroll ?? 'torah'
  const routePrefix = scroll === 'esther'
    ? `#/${scroll}/${canonicalSlug}`
    : `#/${scroll}/parsha/${canonicalSlug}`
  if (!initialRef) return routePrefix

  return `${routePrefix}/${initialRef.b}-${initialRef.c}-${initialRef.v}`
}

export function semanticParshaUrlForLeining(
  leining: LeiningInstance,
  initialRef?: RefWithScroll
): string | null {
  const routeSpec = routeSpecForLeining(leining)
  return routeSpec ? generateParshaUrl(routeSpec.canonicalSlug, initialRef) : null
}

export function resolveParshaRun(
  generator: LeiningGenerator,
  slug: string,
  now: Date = new Date()
): { canonicalSlug: string; run: LeiningRun; displayTitle?: string } | null {
  const canonicalSlug = canonicalizeParshaSlug(slug)
  if (!canonicalSlug) return null

  const spec = routeSpecByCanonicalSlug.get(canonicalSlug)
  if (!spec) return null

  for (const leiningDate of futureLeiningDates(generator, now)) {
    const run = (() => {
      if (spec.kind === 'weekly') return mainParshaRun(leiningDate, spec.titleSlugs)
      if (spec.kind === 'megillah') return estherRun(leiningDate)
      return vezosHaberachaRun(leiningDate)
    })()

    if (run) {
      return {
        canonicalSlug,
        run,
        displayTitle:
          spec.kind === 'megillah' || spec.kind === 'vezos-haberacha'
            ? spec.displayTitle
            : undefined,
      }
    }
  }

  return null
}
