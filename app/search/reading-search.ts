import type { LeiningAliyah, LeiningInstance, LeiningRun } from '../calendar-model/model-types.ts'
import renderLeiningTitle from '../components/render-leining-title.ts'
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
  leining: LeiningInstance
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

function firstRunOf(leining: LeiningInstance) {
  const run = leining.runs[0]
  if (!run) {
    throw new Error(
      `Leining ${leining.date.title.en || leining.id} has no reading runs`
    )
  }
  return run
}

function leiningKey(leining: LeiningInstance) {
  return [
    leining.date.date.getTime(),
    leining.id,
    firstRunOf(leining).id,
  ].join(':')
}

function navigationHrefForLeining(leining: LeiningInstance) {
  return semanticParshaUrlForLeining(leining) ?? generateUrl(firstRunOf(leining))
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

function entryForLeining(leining: LeiningInstance): ReadingSearchEntry {
  const aliases = uniqueValues([
    leining.date.title.he,
    renderLeiningTitle(leining),
    ...getParshaSearchTermsForLeining(leining),
  ])
  const href = navigationHrefForLeining(leining)
  return {
    id: leiningKey(leining),
    destinationId: href,
    href,
    hebrewLabel: renderLeiningTitle(leining),
    englishLabel: leining.date.title.en,
    aliases,
    leining,
  }
}

function aliyahDetailLabel(
  aliyah: number | 'Maftir',
  hebrewLabel: string
) {
  const destination = aliyah === 'Maftir' ? 'Maftir' : `Aliyah ${aliyah}`
  return `${destination} · ${hebrewLabel}`
}

function aliyahHref(
  leining: LeiningInstance,
  aliyahIndex: number | 'Maftir'
) {
  const target = findReadingAliyah(leining, aliyahIndex)
  return target
    ? semanticParshaUrlForLeining(leining, target.aliyah.start) ??
        generateUrl(target.run, target.aliyah.start)
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

  constructor(leinings: readonly LeiningInstance[]) {
    const entries = leinings.map(entryForLeining)
    this.#index = createSearchIndex(
      entries.map((entry) => ({
        id: entry.id,
        destinationId: entry.destinationId,
        primary: entry.englishLabel,
        aliases: entry.aliases,
        keywords: entry.leining.isParsha
          ? ['parsha', 'weekly reading']
          : holidayLeiningKeywords(
              entry.leining.date.title,
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
              ? aliyahDetailLabel(intent.aliyah, entry.hebrewLabel)
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

export function createReadingSearch(leinings: readonly LeiningInstance[]) {
  return new ReadingSearch(leinings)
}

export function findReadingAliyah(
  leining: LeiningInstance,
  index: LeiningAliyah['index']
): { run: LeiningRun; aliyah: LeiningAliyah } | null {
  for (const run of leining.runs) {
    const aliyah = run.aliyot.find((candidate) => candidate.index === index)
    if (aliyah) return { run, aliyah }
  }
  return null
}
