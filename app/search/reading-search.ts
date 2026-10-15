import { readingTitle, type LeiningAliyah, type ReadingInstance, type LeiningRun } from '../calendar-model/model-types.ts'
import renderLeiningTitle from '../components/render-leining-title.ts'
import { aliyahLabel } from '../calendar-model/aliyah-label.ts'
import {
  generateTorahReferenceHash,
  listTorahBooks,
  listTorahChapters,
  listTorahVerses,
} from '../components/torah-reference.ts'
import { holidayLeiningKeywords } from '../navigation/holiday-actions.ts'
import { generateUrl } from '../view-model/navigation/url-parser.ts'
import {
  getParshaSearchTermsForLeining,
  canonicalParshaReadings,
  parshaReadingForLeining,
  semanticParshaUrlForLeining,
} from '../view-model/navigation/parsha-routes.ts'
import {
  createSearchIndex,
  normalizeSearchText,
  parseStructuredSearchQuery,
  type SearchDocument,
  type SearchMatch,
  type StructuredSearchIntent,
} from './index.ts'

export type ReadingSearchEntry = {
  id: string
  destinationId: string
  href: string
  hebrewLabel: string
  englishLabel: string
  aliases: readonly string[]
  leining: ReadingInstance
}

export type ReadingSearchResult = {
  id: string
  destinationId: string
  href: string
  hebrewLabel: string
  englishLabel: string
  detailLabel: string
  matchedAlias: string | null
  match: SearchMatch<ReadingSearchEntry> | null
}

function firstRunOf(leining: ReadingInstance) {
  const run = leining.runs[0]
  if (!run) {
    throw new Error(
      `Leining ${readingTitle(leining).en || leining.id} has no reading runs`
    )
  }
  return run
}

function leiningKey(leining: ReadingInstance) {
  return firstRunOf(leining).id
}

function navigationHrefForLeining(leining: ReadingInstance) {
  if (firstRunOf(leining).scroll === 'esther') {
    return semanticParshaUrlForLeining(leining) ?? generateUrl(firstRunOf(leining))
  }
  return generateUrl(firstRunOf(leining))
}

function uniqueValues(values: readonly string[]) {
  const seen = new Set<string>()
  return values.filter((value) => {
    const normalized = normalizeSearchText(value)
    if (!normalized || seen.has(normalized)) return false
    seen.add(normalized)
    return true
  })
}

function entryForLeining(leining: ReadingInstance): ReadingSearchEntry {
  const aliases = uniqueValues([
    readingTitle(leining).he,
    renderLeiningTitle(leining),
    ...getParshaSearchTermsForLeining(leining),
  ])
  const href = navigationHrefForLeining(leining)
  return {
    id: leiningKey(leining),
    destinationId: href,
    href,
    hebrewLabel: renderLeiningTitle(leining),
    englishLabel: readingTitle(leining).en,
    aliases,
    leining,
  }
}

function aliyahDetailLabel(
  aliyah: number | 'Maftir',
  entry: ReadingSearchEntry
) {
  const target = findReadingAliyah(entry.leining, aliyah)
  return `${aliyahLabel(aliyah, target?.run, 'en')} · ${entry.hebrewLabel}`
}

function aliyahHref(
  leining: ReadingInstance,
  aliyahIndex: number | 'Maftir'
) {
  const target = findReadingAliyah(leining, aliyahIndex)
  return target
    ? generateUrl(target.run, target.aliyah.start)
    : null
}

function readingNames(document: SearchDocument<ReadingSearchEntry>) {
  return [document.primary, ...(document.aliases ?? [])].map(normalizeSearchText)
}

function matchesReadingIntent(
  document: SearchDocument<ReadingSearchEntry>,
  intent: StructuredSearchIntent
) {
  if (intent.kind !== 'aliyah') return false
  if (!aliyahHref(document.item.leining, intent.aliyah)) return false
  if (!intent.reading) return true
  const reading = normalizeSearchText(intent.reading)
  return readingNames(document).includes(reading)
}

const bookNumberByCanonicalName = new Map([
  ['Genesis', 1],
  ['Exodus', 2],
  ['Leviticus', 3],
  ['Numbers', 4],
  ['Deuteronomy', 5],
])

function referenceResult(
  intent: Extract<StructuredSearchIntent, { kind: 'reference' }>
): ReadingSearchResult | null {
  const book = bookNumberByCanonicalName.get(intent.book)
  if (!book || !listTorahChapters(book).includes(intent.chapter)) return null
  if (!listTorahVerses(book, intent.chapter).includes(intent.verse)) return null

  const bookLabel = listTorahBooks().find(({ number }) => number === book)
  if (!bookLabel) return null
  const href = generateTorahReferenceHash({
    book,
    chapter: intent.chapter,
    verse: intent.verse,
  })
  return {
    id: `reference.${book}.${intent.chapter}.${intent.verse}`,
    destinationId: href,
    href,
    hebrewLabel: `${bookLabel.hebrew} ${intent.chapter}:${intent.verse}`,
    englishLabel: `${intent.book} ${intent.chapter}:${intent.verse}`,
    detailLabel: `${bookLabel.hebrew} ${intent.chapter}:${intent.verse}`,
    matchedAlias: null,
    match: null,
  }
}

export class ReadingSearch {
  readonly #index

  constructor(leinings: readonly ReadingInstance[]) {
    const readings = leinings.flatMap((leining): ReadingInstance[] => {
      const parsha = parshaReadingForLeining(leining)
      return parsha ? leining.isParsha ? [parsha] : [parsha, leining] : [leining]
    })
    const unique = new Map([
      ...canonicalParshaReadings({ includeCombined: true }),
      ...readings,
    ].map(reading => [leiningKey(reading), reading]))
    const entries = [...unique.values()].map(entryForLeining)
    this.#index = createSearchIndex(
      entries.map((entry) => ({
        id: entry.id,
        destinationId: entry.destinationId,
        primary: entry.englishLabel,
        aliases: entry.aliases,
        keywords: entry.leining.isParsha
          ? ['parsha', 'weekly reading']
          : holidayLeiningKeywords(
              readingTitle(entry.leining),
              `${entry.leining.id}`
            ),
        item: entry,
      }))
    )
  }

  get size() {
    return this.#index.size
  }

  search(query: string, limit = 5): ReadingSearchResult[] {
    const intent = parseStructuredSearchQuery(query)
    if (intent?.kind === 'reference') {
      const result = referenceResult(intent)
      return result ? [result] : []
    }
    if (intent?.kind === 'page') return []

    return this.#index
      .search(query, {
        intent,
        intentMatches: matchesReadingIntent,
        limit,
      })
      .map((match) => {
        const entry = match.document.item
        const targetAliyah =
          intent?.kind === 'aliyah'
            ? aliyahHref(entry.leining, intent.aliyah)
            : null
        const href = targetAliyah ?? entry.href
        return {
          id: targetAliyah ? `${entry.id}:${String(intent?.aliyah)}` : entry.id,
          destinationId: href,
          href,
          hebrewLabel: entry.hebrewLabel,
          englishLabel: entry.englishLabel,
          detailLabel:
            targetAliyah && intent?.kind === 'aliyah'
              ? aliyahDetailLabel(intent.aliyah, entry)
              : entry.hebrewLabel,
          matchedAlias:
            match.matchedField?.kind === 'alias' ||
            match.matchedField?.kind === 'keyword'
              ? match.matchedField.value
              : null,
          match,
        }
      })
  }
}

export function createReadingSearch(leinings: readonly ReadingInstance[]) {
  return new ReadingSearch(leinings)
}

export function findReadingAliyah(
  leining: ReadingInstance,
  index: LeiningAliyah['index']
): { run: LeiningRun; aliyah: LeiningAliyah } | null {
  for (const run of leining.runs) {
    const aliyah = run.aliyot.find((candidate) => candidate.index === index)
    if (aliyah) return { run, aliyah }
  }
  return null
}
