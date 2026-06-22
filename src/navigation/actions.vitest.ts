import { expect, test } from 'vitest'
import {
  createAliyahNavigationActions,
  createNavigationAction,
  createPageNavigationActions,
  filterNavigationActions,
  normalizeActionQuery,
} from './actions.ts'
import {
  LeiningInstanceId,
  LeiningRunType,
  type LeiningDate,
  type LeiningInstance,
  type LeiningRun,
} from '../calendar-model/model-types.ts'

test('normalizes action queries for fuzzy command matching', () => {
  expect(normalizeActionQuery('  Bereshit   Page 12  ')).toBe('bereshit page 12')
})

test('filters and ranks exact label matches ahead of keyword matches', () => {
  const actions = [
    createNavigationAction({
      id: 'tools.analytics',
      group: 'tools',
      label: 'Cue Analytics',
      keywords: ['playback timing'],
      run: () => undefined,
    }),
    createNavigationAction({
      id: 'reading.noach-3',
      group: 'reading',
      label: 'Noach Aliyah 3',
      keywords: ['cue analytics'],
      run: () => undefined,
    }),
  ]

  const [first, second] = filterNavigationActions(actions, 'cue analytics')

  expect(first?.id).toBe('tools.analytics')
  expect(second?.id).toBe('reading.noach-3')
})

test('ignores unavailable command palette actions', () => {
  const actions = [
    createNavigationAction({
      id: 'admin.issue',
      group: 'admin',
      label: 'Mark Issue',
      keywords: ['mistake'],
      available: false,
      run: () => undefined,
    }),
  ]

  expect(filterNavigationActions(actions, 'issue')).toEqual([])
})

test('hides search-only command palette actions until a query is typed', () => {
  const actions = [
    createNavigationAction({
      id: 'reading.noach.catalog',
      group: 'reading',
      label: 'Noach Aliyah 3',
      keywords: ['Noah 3'],
      showWhenEmpty: false,
      run: () => undefined,
    }),
  ]

  expect(filterNavigationActions(actions, '')).toEqual([])
  expect(filterNavigationActions(actions, 'Noah 3')[0]?.id).toBe(
    'reading.noach.catalog'
  )
})

test('deduplicates visible command palette labels after ranking', () => {
  const actions = [
    createNavigationAction({
      id: 'reading.noach.active',
      group: 'reading',
      label: 'Noach Aliyah 7',
      dedupeKey: 'reading.noach.7',
      keywords: ['Noach 7'],
      run: () => undefined,
    }),
    createNavigationAction({
      id: 'reading.noach.recording',
      group: 'reading',
      label: 'Noach Aliyah 7',
      dedupeKey: 'reading.noach.7',
      keywords: ['Noah 7'],
      run: () => undefined,
    }),
  ]

  expect(filterNavigationActions(actions, 'Noach 7').map((action) => action.id)).toEqual([
    'reading.noach.active',
  ])
})

test('deduplicates equivalent command palette targets with different labels', () => {
  const actions = [
    createNavigationAction({
      id: 'reading.noach.catalog',
      group: 'reading',
      label: 'פרשת נח Aliyah 3',
      dedupeKey: 'reading.2026-10-17:shacharis,main.3',
      keywords: ['Noah 3'],
      run: () => undefined,
    }),
    createNavigationAction({
      id: 'reading.noach.recording',
      group: 'reading',
      label: 'Noach Aliyah 3',
      dedupeKey: 'reading.2026-10-17:shacharis,main.3',
      keywords: ['Noach 3'],
      run: () => undefined,
    }),
  ]

  expect(filterNavigationActions(actions, 'Noah 3').map((action) => action.id)).toEqual([
    'reading.noach.catalog',
  ])
})

test('creates exact aliyah navigation actions for seventh aliyah and Maftir', () => {
  const navigated: string[] = []
  const run = createRunFixture()
  const actions = createAliyahNavigationActions({
    run,
    displayTitle: 'Noach',
    navigate: (hash) => navigated.push(hash),
  })

  const seventh = filterNavigationActions(actions, 'Noach 7')[0]
  const seventhByAlias = filterNavigationActions(actions, 'Noah 7')[0]
  const maftirByLetter = filterNavigationActions(actions, 'Noach M')[0]
  const maftirByName = filterNavigationActions(actions, 'Noach Maftir')[0]

  expect(seventh?.label).toBe('Noach Aliyah 7')
  expect(seventhByAlias?.id).toBe(seventh?.id)
  expect(maftirByLetter?.label).toBe('Noach Maftir')
  expect(maftirByName?.id).toBe(maftirByLetter?.id)

  seventh?.run()
  maftirByLetter?.run()

  expect(navigated).toEqual([
    '#/torah/parsha/noach/1-5-1',
    '#/torah/parsha/noach/1-6-1',
  ])
})

test('creates holiday aliyah navigation actions with holiday aliases', () => {
  const navigated: string[] = []
  const run = createTishahBavRunFixture()
  const actions = createAliyahNavigationActions({
    run,
    displayTitle: 'תשעה באב',
    navigate: (hash) => navigated.push(hash),
  })

  const third = filterNavigationActions(actions, 'Tishah B’Av 3')[0]

  expect(third?.label).toBe('תשעה באב Aliyah 3')

  third?.run()

  expect(navigated).toEqual(['#/run/2026-07-23:shacharis,main/1-4-1'])
})

test('creates searchable Torah page command actions', () => {
  const navigated: string[] = []
  const actions = createPageNavigationActions({
    navigateToPage: (scroll, page) => navigated.push(`${scroll}:${page}`),
  })

  expect(filterNavigationActions(actions, '')).toEqual([])
  expect(filterNavigationActions(actions, 'page 12')[0]?.id).toBe('page.torah.12')
  expect(filterNavigationActions(actions, 'torah page 12')[0]?.id).toBe(
    'page.torah.12'
  )
  expect(filterNavigationActions(actions, 'bereshit page 12')).toEqual([])

  filterNavigationActions(actions, 'page 12')[0]?.run()

  expect(navigated).toEqual(['torah:12'])
})

test('creates searchable Esther page command actions', () => {
  const navigated: string[] = []
  const actions = createPageNavigationActions({
    navigateToPage: (scroll, page) => navigated.push(`${scroll}:${page}`),
  })

  expect(filterNavigationActions(actions, 'esther page 3')[0]?.id).toBe(
    'page.esther.3'
  )
  expect(filterNavigationActions(actions, 'megillah page 3')[0]?.id).toBe(
    'page.esther.3'
  )

  filterNavigationActions(actions, 'esther page 3')[0]?.run()

  expect(navigated).toEqual(['esther:3'])
})

test('does not create out-of-range page command actions', () => {
  const actions = createPageNavigationActions({
    navigateToPage: () => undefined,
  })

  expect(filterNavigationActions(actions, 'torah page 246')).toEqual([])
  expect(filterNavigationActions(actions, 'esther page 18')).toEqual([])
})

function createRunFixture(): LeiningRun {
  const date: LeiningDate = {
    date: new Date(2026, 9, 17),
    id: '2026-10-17',
    title: { en: 'Parshat Noach', he: 'פרשת נח' },
    leinings: [],
  }
  const leining: LeiningInstance = {
    date,
    id: LeiningInstanceId.Shacharis,
    isParsha: true,
    runs: [],
  }
  const run: LeiningRun = {
    leining,
    type: LeiningRunType.Main,
    id: '2026-10-17:shacharis,main',
    scroll: 'torah',
    aliyot: [
      { index: 7, start: ref(5), end: ref(6) },
      { index: 'Maftir', start: ref(6), end: ref(7) },
    ],
  }
  date.leinings = [leining]
  leining.runs = [run]
  return run
}

function createTishahBavRunFixture(): LeiningRun {
  const date: LeiningDate = {
    date: new Date(2026, 6, 23),
    id: '2026-07-23',
    title: { en: "Tish'a B'Av", he: 'תשעה באב' },
    leinings: [],
  }
  const leining: LeiningInstance = {
    date,
    id: LeiningInstanceId.Shacharis,
    isParsha: false,
    runs: [],
  }
  const run: LeiningRun = {
    leining,
    type: LeiningRunType.Main,
    id: '2026-07-23:shacharis,main',
    scroll: 'torah',
    aliyot: [
      { index: 1, start: ref(2), end: ref(3) },
      { index: 2, start: ref(3), end: ref(4) },
      { index: 3, start: ref(4), end: ref(5) },
    ],
  }
  date.leinings = [leining]
  leining.runs = [run]
  return run
}

function ref(chapter: number) {
  return { scroll: 'torah' as const, b: 1, c: chapter, v: 1 }
}
