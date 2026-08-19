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
import {
  PURIM_TITLE_SLUG,
  canonicalizeParshaSlug,
  parshaRouteSpecs,
  routeSpecByCanonicalSlug,
  searchTermsForRouteSpec,
  titleSlug,
} from './parsha-route-catalog.ts'

export {
  canonicalizeParshaSlug,
  getParshaSearchTermsForSlug,
} from './parsha-route-catalog.ts'

const SEARCH_WINDOW_HEBREW_YEARS = 10

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
