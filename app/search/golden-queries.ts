export type GoldenSearchDocument = {
  id: string
  destinationId: string
  primary: string
  aliases: readonly string[]
  keywords: readonly string[]
}

export type GoldenRankingQuery = {
  category:
    | 'exact-english'
    | 'exact-hebrew'
    | 'hebrew-nikkud'
    | 'separator-variant'
    | 'transliteration-alias'
    | 'abbreviation'
    | 'single-character-typo'
    | 'structured-aliyah'
    | 'structured-page'
  query: string
  expectedId: string
  maxRank: 1 | 3
}

export type GoldenStructuredQuery = {
  query: string
  expected:
    | { kind: 'aliyah'; reading: string | null; aliyah: number | 'Maftir' }
    | { kind: 'page'; scroll: 'torah' | 'esther'; page: number }
    | { kind: 'reference'; book: string; chapter: number; verse: number }
}

export type GoldenBehaviorCase = {
  category:
    | 'empty-query-order'
    | 'duplicate-destination'
    | 'coverage-filter-composition'
    | 'hostile-input'
  query: string
  expected: 'catalog-order' | 'unique-destinations' | 'filtered-results' | 'no-throw'
  filter?: 'audio'
}

export const goldenSearchDocuments: readonly GoldenSearchDocument[] = [
  {
    id: 'reading.beresheet',
    destinationId: 'reading.beresheet',
    primary: 'Beresheet',
    aliases: ['Bereshit', 'בראשית', 'בְּרֵאשִׁית'],
    keywords: ['parsha'],
  },
  {
    id: 'reading.noach',
    destinationId: 'reading.noach',
    primary: 'Noach',
    aliases: ['Noah', 'נח'],
    keywords: ['parsha'],
  },
  {
    id: 'reading.noach.3',
    destinationId: 'reading.noach.3',
    primary: 'Noach Aliyah 3',
    aliases: ['Noah 3', 'Noach third', 'נח ג'],
    keywords: ['aliyah 3', 'third aliyah'],
  },
  {
    id: 'reading.noach.3.future',
    destinationId: 'reading.noach.3',
    primary: 'Upcoming Noach Aliyah 3',
    aliases: ['Future Noah 3'],
    keywords: ['aliyah 3', 'third aliyah'],
  },
  {
    id: 'reading.noach.maftir',
    destinationId: 'reading.noach.maftir',
    primary: 'Noach Maftir',
    aliases: ['Noah M', 'Noah Maftir', 'נח מפטיר'],
    keywords: ['maftir'],
  },
  {
    id: 'reading.lech-lecha',
    destinationId: 'reading.lech-lecha',
    primary: 'Lech-Lecha',
    aliases: ['Lech Lecha', 'Lech–Lecha', 'לך־לך', 'לך לך'],
    keywords: ['parsha'],
  },
  {
    id: 'reading.chayei-sara',
    destinationId: 'reading.chayei-sara',
    primary: 'Chayei Sara',
    aliases: ['Chayei S.', 'חיי שרה'],
    keywords: ['parsha'],
  },
  {
    id: 'holiday.tisha-bav.3',
    destinationId: 'holiday.tisha-bav.3',
    primary: "Tish'a B'Av Aliyah 3",
    aliases: ['Tishah B’Av 3', 'Tisha BAv 3', 'תשעה באב ג'],
    keywords: ['fast day', 'third aliyah'],
  },
  {
    id: 'page.torah.12',
    destinationId: 'page.torah.12',
    primary: 'Torah page 12',
    aliases: ['page 12', 'chumash page 12'],
    keywords: ['torah 12'],
  },
  {
    id: 'page.esther.3',
    destinationId: 'page.esther.3',
    primary: 'Esther page 3',
    aliases: ['Megillah page 3', 'Megillat Esther 3'],
    keywords: ['esther 3'],
  },
]

export const goldenRankingQueries: readonly GoldenRankingQuery[] = [
  {
    category: 'exact-english',
    query: 'Beresheet',
    expectedId: 'reading.beresheet',
    maxRank: 1,
  },
  {
    category: 'exact-hebrew',
    query: 'בראשית',
    expectedId: 'reading.beresheet',
    maxRank: 1,
  },
  {
    category: 'hebrew-nikkud',
    query: 'בְּרֵאשִׁית',
    expectedId: 'reading.beresheet',
    maxRank: 1,
  },
  {
    category: 'separator-variant',
    query: 'Lech־Lecha',
    expectedId: 'reading.lech-lecha',
    maxRank: 1,
  },
  {
    category: 'separator-variant',
    query: 'Tishah B’Av 3',
    expectedId: 'holiday.tisha-bav.3',
    maxRank: 1,
  },
  {
    category: 'transliteration-alias',
    query: 'Noah',
    expectedId: 'reading.noach',
    maxRank: 1,
  },
  {
    category: 'abbreviation',
    query: 'Chayei S.',
    expectedId: 'reading.chayei-sara',
    maxRank: 1,
  },
  {
    category: 'single-character-typo',
    query: 'Bereshhet',
    expectedId: 'reading.beresheet',
    maxRank: 3,
  },
  {
    category: 'structured-aliyah',
    query: 'Noach 3',
    expectedId: 'reading.noach.3',
    maxRank: 1,
  },
  {
    category: 'structured-aliyah',
    query: 'Noah Maftir',
    expectedId: 'reading.noach.maftir',
    maxRank: 1,
  },
  {
    category: 'structured-page',
    query: 'page 12',
    expectedId: 'page.torah.12',
    maxRank: 1,
  },
  {
    category: 'structured-page',
    query: 'Megillah page 3',
    expectedId: 'page.esther.3',
    maxRank: 1,
  },
]

export const goldenStructuredQueries: readonly GoldenStructuredQuery[] = [
  {
    query: 'Noach 3',
    expected: { kind: 'aliyah', reading: 'noach', aliyah: 3 },
  },
  {
    query: 'Maftir',
    expected: { kind: 'aliyah', reading: null, aliyah: 'Maftir' },
  },
  {
    query: 'Torah page 12',
    expected: { kind: 'page', scroll: 'torah', page: 12 },
  },
  {
    query: 'Megillah page 3',
    expected: { kind: 'page', scroll: 'esther', page: 3 },
  },
  {
    query: 'Genesis 6:9',
    expected: { kind: 'reference', book: 'Genesis', chapter: 6, verse: 9 },
  },
]

export const goldenBehaviorCases: readonly GoldenBehaviorCase[] = [
  {
    category: 'empty-query-order',
    query: '',
    expected: 'catalog-order',
  },
  {
    category: 'duplicate-destination',
    query: 'Noach 3',
    expected: 'unique-destinations',
  },
  {
    category: 'coverage-filter-composition',
    query: 'Noach',
    filter: 'audio',
    expected: 'filtered-results',
  },
  {
    category: 'hostile-input',
    query: '[',
    expected: 'no-throw',
  },
]

export const goldenSafetyQueries = ['', ' ', '[', '(', '\\', '.*', '־', '’'] as const
