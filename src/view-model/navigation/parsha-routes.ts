import { HDate } from '@hebcal/hdate'
import { LeiningGenerator } from '../../calendar-model/generator.ts'
import {
  LeiningInstanceId,
  LeiningRunType,
  type LeiningDate,
  type LeiningInstance,
  type LeiningRun,
} from '../../calendar-model/model-types.ts'
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
}

type ParshaRouteSpec = WeeklyParshaRoute | MegillahRoute

const weeklyParshaRoutes: WeeklyParshaRoute[] = [
  { kind: 'weekly', canonicalSlug: 'beresheet', titleSlugs: ['bereshit'], aliases: ['bereshit'] },
  { kind: 'weekly', canonicalSlug: 'noach', titleSlugs: ['noach'],  aliases: ['noah']  },
  { kind: 'weekly', canonicalSlug: 'lech-lecha', titleSlugs: ['lechlecha'] },
  { kind: 'weekly', canonicalSlug: 'vayera', titleSlugs: ['vayera'] },
  { kind: 'weekly', canonicalSlug: 'chayei-sara', titleSlugs: ['chayei-sara'] },
  { kind: 'weekly', canonicalSlug: 'toldot', titleSlugs: ['toldot'] },
  { kind: 'weekly', canonicalSlug: 'vayetzei', titleSlugs: ['vayetzei'] },
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

export function canonicalizeParshaSlug(slug: string): string | null {
  return aliasToCanonicalSlug.get(normalizeParshaSlug(slug)) ?? null
}

export function generateParshaUrl(slug: string) {
  return `#/parsha/${slug}`
}

export function semanticParshaUrlForLeining(leining: LeiningInstance): string | null {
  if (
    leining.id === LeiningInstanceId.Megillah &&
    leining.runs.some((run) => run.type === LeiningRunType.Megillah) &&
    titleSlug(leining.date.title.en) === PURIM_TITLE_SLUG
  ) {
    return generateParshaUrl('megillah-esther')
  }

  if (!leining.isParsha || leining.id !== LeiningInstanceId.Shacharis) return null

  const slug = titleSlug(leining.date.title.en)
  const routeSpec = parshaRouteSpecs.find(
    (spec) => spec.kind === 'weekly' && spec.titleSlugs.includes(slug)
  )

  return routeSpec ? generateParshaUrl(routeSpec.canonicalSlug) : null
}

export function resolveParshaRun(
  generator: LeiningGenerator,
  slug: string,
  now: Date = new Date()
): { canonicalSlug: string; run: LeiningRun } | null {
  const canonicalSlug = canonicalizeParshaSlug(slug)
  if (!canonicalSlug) return null

  const spec = routeSpecByCanonicalSlug.get(canonicalSlug)
  if (!spec) return null

  for (const leiningDate of futureLeiningDates(generator, now)) {
    const run =
      spec.kind === 'weekly'
        ? mainParshaRun(leiningDate, spec.titleSlugs)
        : estherRun(leiningDate)

    if (run) return { canonicalSlug, run }
  }

  return null
}
