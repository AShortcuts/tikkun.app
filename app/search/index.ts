export {
  MIN_FUZZY_TOKEN_LENGTH,
  searchRankBandOrder,
  SearchIndex,
  createSearchIndex,
  type SearchDocument,
  type SearchMatch,
  type SearchMatchedField,
  type SearchRankBand,
  type SearchRequest,
} from './search-index.ts'
export {
  mapNormalizedRangesToOriginal,
  mergeSearchRanges,
  normalizeSearchText,
  normalizeSearchTextWithMap,
  tokenizeSearchText,
  type NormalizedSearchText,
  type SearchRange,
} from './normalize.ts'
export {
  parseStructuredSearchQuery,
  type StructuredSearchIntent,
} from './query-parser.ts'
