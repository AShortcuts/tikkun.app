import slugify from '../../slugify.ts'

export const PURIM_TITLE_SLUG = 'purim'

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

export type ParshaRouteSpec =
  | WeeklyParshaRoute
  | MegillahRoute
  | VezosHaberachaRoute

const weeklyParshaRoutes: WeeklyParshaRoute[] = [
  {
    kind: 'weekly',
    canonicalSlug: 'beresheet',
    titleSlugs: ['bereshit'],
    aliases: ['bereshit'],
  },
  {
    kind: 'weekly',
    canonicalSlug: 'noach',
    titleSlugs: ['noach'],
    aliases: ['noah'],
  },
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
  {
    kind: 'weekly',
    canonicalSlug: 'shmini',
    titleSlugs: ['shmini'],
    aliases: ['shemini'],
  },
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

const combinedWeeklyParshaRoutes: WeeklyParshaRoute[] = [
  {
    kind: 'weekly',
    canonicalSlug: 'vayakhel-pekudei',
    titleSlugs: ['vayakhelpekudei'],
  },
  {
    kind: 'weekly',
    canonicalSlug: 'tazria-metzora',
    titleSlugs: ['tazriametzora'],
  },
  {
    kind: 'weekly',
    canonicalSlug: 'achrei-mot-kedoshim',
    titleSlugs: ['achrei-motkedoshim'],
  },
  {
    kind: 'weekly',
    canonicalSlug: 'behar-bechukotai',
    titleSlugs: ['beharbechukotai'],
  },
  {
    kind: 'weekly',
    canonicalSlug: 'chukat-balak',
    titleSlugs: ['chukatbalak'],
  },
  {
    kind: 'weekly',
    canonicalSlug: 'matot-masei',
    titleSlugs: ['matotmasei'],
  },
  {
    kind: 'weekly',
    canonicalSlug: 'nitzavim-vayelech',
    titleSlugs: ['nitzavimvayeilech'],
    aliases: ['nitzavim-vayeilech'],
  },
]

export const parshaRouteSpecs: ParshaRouteSpec[] = [
  ...weeklyParshaRoutes,
  ...combinedWeeklyParshaRoutes,
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

export const routeSpecByCanonicalSlug = new Map(
  parshaRouteSpecs.map((spec) => [spec.canonicalSlug, spec])
)

export const singleParshaRouteSpecs = [
  ...weeklyParshaRoutes,
  ...parshaRouteSpecs.filter((spec) => spec.kind === 'vezos-haberacha'),
]

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

export function titleSlug(title: string) {
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

export function searchTermsForRouteSpec(spec: ParshaRouteSpec) {
  return uniqueTerms([
    spec.canonicalSlug,
    spec.canonicalSlug.replace(/-/g, ''),
    ...('titleSlugs' in spec ? spec.titleSlugs : []),
    ...(spec.aliases ?? []),
    spec.kind === 'megillah' ? spec.displayTitle : null,
    spec.kind === 'vezos-haberacha' ? spec.displayTitle : null,
  ])
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
