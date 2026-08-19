import type { CoverageFilter, PublicReading } from '$lib/readings'
import { matchesCoverageFilter } from '$lib/readings'
import { getParshaSearchTermsForSlug } from '../../../../app/view-model/navigation/parsha-route-catalog.ts'
import {
  createSearchIndex,
  type SearchMatch,
} from '../../../../app/search/index.ts'

export type ReadingCoverageSearchResult = SearchMatch<PublicReading>

export class ReadingCoverageSearch {
  readonly #readings: readonly PublicReading[]
  readonly #index

  constructor(readings: readonly PublicReading[]) {
    this.#readings = readings
    this.#index = createSearchIndex(
      readings.map((reading) => ({
        id: reading.parshaSlug ?? `coverage.${reading.number ?? reading.parshaName}`,
        destinationId:
          reading.parshaSlug ?? `coverage.${reading.number ?? reading.parshaName}`,
        primary: reading.parshaName,
        aliases: [
          reading.parshaHebrew,
          ...(reading.parshaSlug
            ? getParshaSearchTermsForSlug(reading.parshaSlug)
            : []),
        ],
        keywords: [],
        emptyPriority: 0,
        item: reading,
      }))
    )
  }

  get size() {
    return this.#index.size
  }

  search(query: string, filter: CoverageFilter): ReadingCoverageSearchResult[] {
    return this.#index.search(query, {
      intent: null,
      limit: this.#readings.length,
      filter: ({ item }) => matchesCoverageFilter(item, filter),
    })
  }
}

export function createReadingCoverageSearch(
  readings: readonly PublicReading[]
) {
  return new ReadingCoverageSearch(readings)
}
