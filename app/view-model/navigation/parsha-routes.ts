import { HDate } from '@hebcal/hdate'
import { LeiningGenerator } from '../../calendar-model/generator.ts'
import { parshiot } from '@hebcal/core/dist/esm/sedra'
import { createParshaReading } from '../../calendar-model/parsha-reading.ts'
import {
  LeiningInstanceId,
  LeiningRunType,
  type LeiningDate,
  type ReadingInstance,
  type LeiningRun,
} from '../../calendar-model/model-types.ts'
import type { RefWithScroll } from '../../ref.ts'
import { fromISODateString, toISODateString } from '../../calendar-model/utils.ts'
import {
  PURIM_TITLE_SLUG,
  canonicalizeParshaSlug,
  parshaRouteSpecs,
  singleParshaRouteSpecs,
  routeSpecByCanonicalSlug,
  searchTermsForRouteSpec,
  titleSlug,
} from './parsha-route-catalog.ts'

export {
  canonicalizeParshaSlug,
  getParshaSearchTermsForSlug,
} from './parsha-route-catalog.ts'

const SEARCH_WINDOW_HEBREW_YEARS = 10

function routeSpecForLeining(leining: ReadingInstance) {
  if (leining.kind === 'parsha') return routeSpecByCanonicalSlug.get(leining.slug) ?? null
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
    return routeSpecByCanonicalSlug.get('vezot-haberacha') ?? null
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

function estherRun(leiningDate: LeiningDate) {
  if (titleSlug(leiningDate.title.en) !== PURIM_TITLE_SLUG) return null

  const match = leiningDate.leinings.find(
    (leining) => leining.id === LeiningInstanceId.Megillah
  )

  return match?.runs.find((run) => run.type === LeiningRunType.Megillah) ?? null
}

export function getParshaSearchTermsForLeining(leining: ReadingInstance) {
  if (leining.kind !== 'parsha' && !leining.isParsha && leining.id !== LeiningInstanceId.Megillah) return []
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
  leining: ReadingInstance,
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

  if (spec.kind !== 'megillah') {
    const names = hebcalNamesBySlug.get(canonicalSlug)
    if (!names) throw new Error(`Missing Hebcal parsha mapping for ${canonicalSlug}`)
    return { canonicalSlug, run: createParshaReading(canonicalSlug, names).runs[0] }
  }

  for (const leiningDate of futureLeiningDates(generator, now)) {
    const run = estherRun(leiningDate)

    if (run) {
      return {
        canonicalSlug,
        run,
        displayTitle: spec.displayTitle,
      }
    }
  }

  return null
}

const hebcalNamesBySlug = new Map<string, string | string[]>()
const hebcalNames = [...parshiot, 'Vezot Haberakhah']
for (const [index, name] of hebcalNames.entries()) {
  const slug = canonicalizeParshaSlug(name)
  if (slug) hebcalNamesBySlug.set(slug, name)
  const next = hebcalNames[index + 1]
  const combined = next && canonicalizeParshaSlug(`${name}-${next}`)
  if (combined) hebcalNamesBySlug.set(combined, [name, next])
}
hebcalNamesBySlug.set('vezot-haberacha', 'Vezot Haberakhah')

export function canonicalParshaReadings({ includeCombined = false } = {}) {
  const specs = includeCombined
    ? parshaRouteSpecs.filter(spec => spec.kind !== 'megillah')
    : singleParshaRouteSpecs
  return specs.map(spec => {
    const names = hebcalNamesBySlug.get(spec.canonicalSlug)
    if (!names) throw new Error(`Missing Hebcal parsha mapping for ${spec.canonicalSlug}`)
    return createParshaReading(spec.canonicalSlug, names)
  })
}

export function parshaReadingForLeining(leining: ReadingInstance) {
  if (leining.kind === 'parsha') return leining
  const spec = routeSpecForLeining(leining)
  if (!spec || spec.kind === 'megillah') return null
  const names = hebcalNamesBySlug.get(spec.canonicalSlug)
  if (!names) throw new Error(`Missing Hebcal parsha mapping for ${spec.canonicalSlug}`)
  return createParshaReading(spec.canonicalSlug, names)
}

/** Resolves internal reading identities without interpreting a parsha as a date. */
export function resolveReadingRun(generator: LeiningGenerator, id: string): LeiningRun | null {
  const match = /^parsha:([a-z0-9-]+),main$/.exec(id)
  return match ? resolveParshaRun(generator, match[1])?.run ?? null : generator.parseId(id)
}
