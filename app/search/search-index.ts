import Fuse from 'fuse.js'
import {
  mapNormalizedRangesToOriginal,
  mergeSearchRanges,
  normalizeSearchText,
  normalizeSearchTextWithMap,
  type NormalizedSearchText,
  type SearchRange,
} from './normalize.ts'
import {
  parseStructuredSearchQuery,
  type StructuredSearchIntent,
} from './query-parser.ts'

export const MIN_FUZZY_TOKEN_LENGTH = 3
const MAX_FUZZY_RESULT_SCORE = 0.5

export type SearchDocument<T> = {
  id: string
  destinationId: string
  primary: string
  aliases?: readonly string[]
  keywords?: readonly string[]
  available?: boolean
  emptyPriority?: number
  item: T
}

export type SearchRankBand =
  | 'intent'
  | 'exact-primary'
  | 'exact-alias'
  | 'all-token-prefix'
  | 'all-token-fuzzy'
  | 'partial'
  | 'empty'

export type SearchMatchedField = {
  kind: 'primary' | 'alias' | 'keyword'
  index: number
  value: string
  ranges: readonly SearchRange[]
}

export type SearchMatch<T> = {
  document: SearchDocument<T>
  band: SearchRankBand
  score: number
  intent: StructuredSearchIntent | null
  matchedField: SearchMatchedField | null
}

export type SearchRequest<T> = {
  limit?: number
  intent?: StructuredSearchIntent | null
  intentMatches?: (
    document: SearchDocument<T>,
    intent: StructuredSearchIntent
  ) => boolean
  filter?: (document: SearchDocument<T>) => boolean
  contextBoost?: (document: SearchDocument<T>) => number
}

type IndexedField = {
  kind: SearchMatchedField['kind']
  index: number
  text: NormalizedSearchText
  words: readonly string[]
}

type IndexedDocument<T> = {
  document: SearchDocument<T>
  order: number
  primary: string
  aliases: string[]
  keywords: string[]
  fields: IndexedField[]
}

type FuseTokenHit = {
  score: number
  field: IndexedField | null
  ranges: readonly SearchRange[]
}

type TokenHit = FuseTokenHit & {
  type: 'prefix' | 'substring' | 'fuzzy'
}

type RankedDocument<T> = SearchMatch<T> & {
  order: number
  contextBoost: number
}

export const searchRankBandOrder: Readonly<Record<SearchRankBand, number>> = {
  intent: 0,
  'exact-primary': 1,
  'exact-alias': 2,
  'all-token-prefix': 3,
  'all-token-fuzzy': 4,
  partial: 5,
  empty: 6,
}

function indexField(
  kind: IndexedField['kind'],
  index: number,
  value: string
): IndexedField {
  const text = normalizeSearchTextWithMap(value)
  return {
    kind,
    index,
    text,
    words: text.value ? text.value.split(' ') : [],
  }
}

function toIndexedDocument<T>(
  document: SearchDocument<T>,
  order: number
): IndexedDocument<T> {
  const primary = indexField('primary', 0, document.primary)
  const aliases = (document.aliases ?? []).map((value, index) =>
    indexField('alias', index, value)
  )
  const keywords = (document.keywords ?? []).map((value, index) =>
    indexField('keyword', index, value)
  )

  return {
    document,
    order,
    primary: primary.text.value,
    aliases: aliases.map(({ text }) => text.value),
    keywords: keywords.map(({ text }) => text.value),
    fields: [primary, ...aliases, ...keywords],
  }
}

function fieldPriority(field: IndexedField | null) {
  if (!field) return 3
  if (field.kind === 'primary') return 0
  if (field.kind === 'alias') return 1
  return 2
}

function fieldForFuseMatch<T>(
  document: IndexedDocument<T>,
  key: string | undefined,
  refIndex: number | undefined
) {
  const kind =
    key === 'primary'
      ? 'primary'
      : key === 'aliases'
        ? 'alias'
        : key === 'keywords'
          ? 'keyword'
          : null
  if (!kind) return null
  return (
    document.fields.find(
      (field) => field.kind === kind && field.index === (refIndex ?? 0)
    ) ?? null
  )
}

function deterministicTokenHit(
  field: IndexedField,
  token: string
): TokenHit | null {
  const prefixWordIndex = field.words.findIndex((word) => word.startsWith(token))
  if (prefixWordIndex >= 0) {
    const start = field.words
      .slice(0, prefixWordIndex)
      .reduce((length, word) => length + word.length + 1, 0)
    return {
      type: 'prefix',
      field,
      ranges: [[start, start + token.length - 1]],
      score: prefixWordIndex / Math.max(field.words.length, 1),
    }
  }

  if (token.length < MIN_FUZZY_TOKEN_LENGTH) return null
  const start = field.text.value.indexOf(token)
  return start >= 0
    ? {
        type: 'substring',
        field,
        ranges: [[start, start + token.length - 1]],
        score: 0.25 + start / Math.max(field.text.value.length, 1),
      }
    : null
}

function betterTokenHit(left: TokenHit | null, right: TokenHit | null) {
  if (!left) return right
  if (!right) return left
  const typeOrder = { prefix: 0, substring: 1, fuzzy: 2 } as const
  return typeOrder[right.type] < typeOrder[left.type] ||
    (typeOrder[right.type] === typeOrder[left.type] &&
      (fieldPriority(right.field) < fieldPriority(left.field) ||
        (fieldPriority(right.field) === fieldPriority(left.field) &&
          right.score < left.score)))
    ? right
    : left
}

function bestMatchedField(
  tokenHits: readonly TokenHit[],
  exactField?: IndexedField
): SearchMatchedField | null {
  if (exactField) {
    return {
      kind: exactField.kind,
      index: exactField.index,
      value: exactField.text.original,
      ranges: exactField.text.value
        ? mapNormalizedRangesToOriginal(exactField.text, [
            [0, exactField.text.value.length - 1],
          ])
        : [],
    }
  }

  const grouped = new Map<
    IndexedField,
    { count: number; score: number; ranges: SearchRange[] }
  >()
  for (const hit of tokenHits) {
    if (!hit.field) continue
    const current = grouped.get(hit.field) ?? {
      count: 0,
      score: 0,
      ranges: [],
    }
    current.count += 1
    current.score += hit.score
    current.ranges.push(...hit.ranges)
    grouped.set(hit.field, current)
  }

  const selected = [...grouped.entries()].sort(
    ([leftField, left], [rightField, right]) =>
      right.count - left.count ||
      fieldPriority(leftField) - fieldPriority(rightField) ||
      left.score - right.score ||
      leftField.index - rightField.index
  )[0]
  if (!selected) return null

  const [field, detail] = selected
  return {
    kind: field.kind,
    index: field.index,
    value: field.text.original,
    ranges: mapNormalizedRangesToOriginal(
      field.text,
      mergeSearchRanges(detail.ranges)
    ),
  }
}

function matchScore(hits: readonly TokenHit[], totalTokenCount: number) {
  const matchedTokenPenalty = totalTokenCount - hits.length
  const average = hits.reduce((total, hit) => total + hit.score, 0) /
    Math.max(hits.length, 1)
  return matchedTokenPenalty + average
}

export class SearchIndex<T> {
  readonly #documents: IndexedDocument<T>[]
  readonly #fuse: Fuse<IndexedDocument<T>>

  constructor(documents: readonly SearchDocument<T>[]) {
    this.#documents = documents.map(toIndexedDocument)
    this.#fuse = new Fuse(this.#documents, {
      keys: [
        { name: 'primary', weight: 0.6 },
        { name: 'aliases', weight: 0.3 },
        { name: 'keywords', weight: 0.1 },
      ],
      includeMatches: true,
      includeScore: true,
      ignoreFieldNorm: true,
      ignoreLocation: true,
      minMatchCharLength: 2,
      shouldSort: true,
      threshold: 0.42,
    })
  }

  get size() {
    return this.#documents.length
  }

  search(rawQuery: string, request: SearchRequest<T> = {}): SearchMatch<T>[] {
    const normalizedQuery = normalizeSearchText(rawQuery)
    const intent =
      request.intent === undefined
        ? parseStructuredSearchQuery(rawQuery)
        : request.intent
    const eligible = this.#documents.filter(
      ({ document }) =>
        document.available !== false &&
        (request.filter?.(document) ?? true)
    )

    if (!normalizedQuery) {
      if (rawQuery.trim()) return []
      return this.#finalize(
        eligible
          .filter(({ document }) => document.emptyPriority !== undefined)
          .map(({ document, order }) => ({
            document,
            band: 'empty' as const,
            score: -(document.emptyPriority ?? 0),
            intent: null,
            matchedField: null,
            order,
            contextBoost: this.#contextBoost(document, request),
          })),
        request.limit
      )
    }

    const tokens = normalizedQuery.split(' ')
    const fuzzyHits = this.#fuzzyHits(tokens)
    const ranked = eligible.flatMap((indexedDocument) => {
      const { document, fields, order } = indexedDocument
      const exactPrimary = fields[0]?.text.value === normalizedQuery
        ? fields[0]
        : undefined
      const exactAlias = fields.find(
        (field) =>
          field.kind === 'alias' && field.text.value === normalizedQuery
      )
      const tokenHits = tokens.flatMap((token) => {
        let best: TokenHit | null = null
        for (const field of fields) {
          best = betterTokenHit(best, deterministicTokenHit(field, token))
        }
        const fuzzy = fuzzyHits.get(indexedDocument)?.get(token)
        if (fuzzy) {
          best = betterTokenHit(best, { ...fuzzy, type: 'fuzzy' })
        }
        return best ? [best] : []
      })
      const intentMatched = Boolean(
        intent && request.intentMatches?.(document, intent)
      )
      const minimumPartialTokenCount =
        tokens.length <= 2 ? 1 : tokens.length - 1

      let band: SearchRankBand | null = null
      let exactField: IndexedField | undefined
      if (intentMatched) band = 'intent'
      else if (exactPrimary) {
        band = 'exact-primary'
        exactField = exactPrimary
      } else if (exactAlias) {
        band = 'exact-alias'
        exactField = exactAlias
      } else if (
        tokenHits.length === tokens.length &&
        tokenHits.every((hit) => hit.type === 'prefix')
      ) {
        band = 'all-token-prefix'
      } else if (tokenHits.length === tokens.length) {
        band = 'all-token-fuzzy'
      } else if (tokenHits.length >= minimumPartialTokenCount) {
        band = 'partial'
      }
      if (!band) return []

      return [
        {
          document,
          band,
          score: matchScore(tokenHits, tokens.length),
          intent,
          matchedField: bestMatchedField(tokenHits, exactField),
          order,
          contextBoost: this.#contextBoost(document, request),
        },
      ]
    })

    return this.#finalize(ranked, request.limit)
  }

  #fuzzyHits(tokens: readonly string[]) {
    const hits = new Map<
      IndexedDocument<T>,
      Map<string, FuseTokenHit>
    >()

    for (const token of tokens) {
      if (token.length < MIN_FUZZY_TOKEN_LENGTH) continue
      for (const result of this.#fuse.search(token)) {
        const score = result.score ?? 1
        if (score > MAX_FUZZY_RESULT_SCORE) continue
        const matches = result.matches ?? []
        const bestMatch = [...matches].sort((left, right) => {
          const leftField = fieldForFuseMatch(
            result.item,
            left.key,
            left.refIndex
          )
          const rightField = fieldForFuseMatch(
            result.item,
            right.key,
            right.refIndex
          )
          return fieldPriority(leftField) - fieldPriority(rightField)
        })[0]
        const field = bestMatch
          ? fieldForFuseMatch(result.item, bestMatch.key, bestMatch.refIndex)
          : null
        const ranges = (bestMatch?.indices ?? []).map(
          ([start, end]) => [start, end] as const
        )
        const documentHits = hits.get(result.item) ?? new Map()
        documentHits.set(token, { score, field, ranges })
        hits.set(result.item, documentHits)
      }
    }

    return hits
  }

  #contextBoost(document: SearchDocument<T>, request: SearchRequest<T>) {
    const boost = request.contextBoost?.(document) ?? 0
    return Number.isFinite(boost) ? boost : 0
  }

  #finalize(
    matches: readonly RankedDocument<T>[],
    requestedLimit: number | undefined
  ) {
    const limit = Math.max(0, requestedLimit ?? 12)
    const seenDestinations = new Set<string>()
    const results: SearchMatch<T>[] = []

    for (const match of [...matches].sort(
      (left, right) =>
        searchRankBandOrder[left.band] - searchRankBandOrder[right.band] ||
        right.contextBoost - left.contextBoost ||
        left.score - right.score ||
        left.order - right.order ||
        left.document.id.localeCompare(right.document.id)
    )) {
      if (seenDestinations.has(match.document.destinationId)) continue
      seenDestinations.add(match.document.destinationId)
      results.push({
        document: match.document,
        band: match.band,
        score: match.score,
        intent: match.intent,
        matchedField: match.matchedField,
      })
      if (results.length >= limit) break
    }

    return results
  }
}

export function createSearchIndex<T>(documents: readonly SearchDocument<T>[]) {
  return new SearchIndex(documents)
}
