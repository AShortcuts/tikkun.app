import type {
  NavigationAction,
  NavigationActionGroup,
} from '../navigation/actions.ts'
import {
  mapNormalizedRangesToOriginal,
  normalizeSearchTextWithMap,
  searchRankBandOrder,
  type SearchRange,
  type SearchRankBand,
} from './index.ts'
import { createActionSearch } from './action-search.ts'
import { createReadingSearch } from './reading-search.ts'
import type { LeiningInstance } from '../calendar-model/model-types.ts'

export type ReaderSearchResult = {
  id: string
  destinationId: string
  source: 'reading' | 'action'
  group: NavigationActionGroup
  label: string
  secondaryLabel: string | null
  labelRanges: readonly SearchRange[]
  secondaryRanges: readonly SearchRange[]
  matchedAlias: string | null
  matchedAliasRanges: readonly SearchRange[]
  href: string | null
  action: NavigationAction | null
  badgeLabel: string | null
  band: SearchRankBand
  score: number
  matchedField: 'primary' | 'alias' | 'keyword' | null
}

type RankedReaderResult = ReaderSearchResult & {
  providerOrder: number
}

function rangesWithinLabel(
  label: string,
  value: string,
  ranges: readonly SearchRange[]
) {
  const normalizedLabel = normalizeSearchTextWithMap(label)
  const normalizedValue = normalizeSearchTextWithMap(value)
  const offset = normalizedLabel.value.indexOf(normalizedValue.value)
  if (offset < 0 || !normalizedValue.value) return null

  const normalizedRanges = ranges.flatMap(([start, end]) => {
    const matchingIndexes = normalizedValue.originalIndices.flatMap(
      (originalIndex, normalizedIndex) =>
        originalIndex >= start && originalIndex <= end ? [normalizedIndex] : []
    )
    const first = matchingIndexes[0]
    const last = matchingIndexes.at(-1)
    return first === undefined || last === undefined
      ? []
      : [[first + offset, last + offset] as const]
  })
  return mapNormalizedRangesToOriginal(normalizedLabel, normalizedRanges)
}

function readingResult(
  result: ReturnType<ReturnType<typeof createReadingSearch>['search']>[number],
  providerOrder: number
): RankedReaderResult {
  const field = result.match?.matchedField ?? null
  const englishRanges = field
    ? rangesWithinLabel(result.englishLabel, field.value, field.ranges)
    : null
  const detailRanges = field
    ? rangesWithinLabel(result.detailLabel, field.value, field.ranges)
    : null
  const isDisplayedMatch = Boolean(englishRanges || detailRanges)

  return {
    id: `reading:${result.id}`,
    destinationId: result.destinationId,
    source: 'reading',
    group: 'reading',
    label: result.englishLabel,
    secondaryLabel: result.detailLabel,
    labelRanges: englishRanges ?? [],
    secondaryRanges: detailRanges ?? [],
    matchedAlias: isDisplayedMatch ? null : result.matchedAlias,
    matchedAliasRanges:
      isDisplayedMatch || !result.matchedAlias ? [] : (field?.ranges ?? []),
    href: result.href,
    action: null,
    badgeLabel: null,
    band: result.match?.band ?? 'intent',
    score: result.match?.score ?? 0,
    matchedField: field?.kind ?? null,
    providerOrder,
  }
}

function actionResult(
  result: ReturnType<ReturnType<typeof createActionSearch>['search']>[number],
  providerOrder: number
): RankedReaderResult {
  const { action, match } = result
  const field = match.matchedField
  const labelRanges = field
    ? rangesWithinLabel(action.label, field.value, field.ranges)
    : null
  const matchedAlias = field && !labelRanges ? field.value : null

  return {
    id: `action:${action.id}`,
    destinationId: action.destinationId,
    source: 'action',
    group: action.group,
    label: action.label,
    secondaryLabel: null,
    labelRanges: labelRanges ?? [],
    secondaryRanges: [],
    matchedAlias,
    matchedAliasRanges: matchedAlias ? field?.ranges ?? [] : [],
    href: action.href ?? null,
    action,
    badgeLabel: action.badgeLabel ?? null,
    band: match.band,
    score: match.score,
    matchedField: field?.kind ?? null,
    providerOrder,
  }
}

export class ReaderSearch {
  readonly #readingSearch
  readonly #actionSearch

  constructor(
    leinings: readonly LeiningInstance[],
    actions: readonly NavigationAction[]
  ) {
    this.#readingSearch = createReadingSearch(leinings)
    this.#actionSearch = createActionSearch(actions)
  }

  get size() {
    return this.#readingSearch.size + this.#actionSearch.size
  }

  search(query: string, limit = 12): ReaderSearchResult[] {
    const candidateLimit = Math.max(limit * 3, 36)
    const readings = this.#readingSearch
      .search(query, candidateLimit)
      .map(readingResult)
    const actions = this.#actionSearch
      .search(query, {
        limit: candidateLimit,
        contextBoost: (action) => action.emptyPriority ?? 0,
      })
      .map(actionResult)
    const seenDestinations = new Set<string>()
    const results: ReaderSearchResult[] = []

    for (const result of [...readings, ...actions].sort(
      (left, right) =>
        searchRankBandOrder[left.band] - searchRankBandOrder[right.band] ||
        (left.source === right.source ? 0 : left.source === 'reading' ? -1 : 1) ||
        left.score - right.score ||
        left.providerOrder - right.providerOrder ||
        left.id.localeCompare(right.id)
    )) {
      if (seenDestinations.has(result.destinationId)) continue
      seenDestinations.add(result.destinationId)
      const { providerOrder, ...publicResult } = result
      void providerOrder
      results.push(publicResult)
      if (results.length >= Math.max(0, limit)) break
    }

    return results
  }
}

export function createReaderSearch(
  leinings: readonly LeiningInstance[],
  actions: readonly NavigationAction[]
) {
  return new ReaderSearch(leinings, actions)
}
