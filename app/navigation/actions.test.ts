import { expect, test } from 'vitest'
import {
  createAliyahNavigationActions,
  createNavigationAction,
  createPageNavigationActions,
  type NavigationAction,
} from './actions.ts'
import { createActionSearch } from '../search/action-search.ts'
import {
  LeiningInstanceId,
  LeiningRunType,
  type LeiningDate,
  type LeiningInstance,
  type LeiningRun,
} from '../calendar-model/model-types.ts'

function searchActions(
  actions: readonly NavigationAction[],
  query: string,
  limit = 12
) {
  return createActionSearch(actions)
    .search(query, { limit })
    .map(({ action }) => action)
}

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

  const [first, second] = searchActions(actions, 'cue analytics')

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

  expect(searchActions(actions, 'issue')).toEqual([])
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

  expect(searchActions(actions, 'Noah 3').map((action) => action.id)).toEqual([
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

  const seventh = searchActions(actions, 'Noach 7')[0]
  const seventhByAlias = searchActions(actions, 'Noah 7')[0]
  const maftirByLetter = searchActions(actions, 'Noach M')[0]
  const maftirByName = searchActions(actions, 'Noach Maftir')[0]

  expect(seventh?.label).toBe('Noach Aliyah 7')
  expect(seventhByAlias?.id).toBe(seventh?.id)
  expect(maftirByLetter?.label).toBe('Noach Maftir')
  expect(maftirByName?.id).toBe(maftirByLetter?.id)

  seventh?.run()
  maftirByLetter?.run()

  expect(navigated).toEqual([
    '#/run/2026-10-17:shacharis,main/1-5-1',
    '#/run/2026-10-17:shacharis,main/1-6-1',
  ])
})

test('does not create out-of-range page command actions', () => {
  const actions = createPageNavigationActions({
    navigateToPage: () => undefined,
  })

  expect(searchActions(actions, 'torah page 246')).toEqual([])
  expect(searchActions(actions, 'esther page 18')).toEqual([])
})

function createRunFixture(): LeiningRun {
  const date: LeiningDate = {
    date: new Date(2026, 9, 17),
    id: '2026-10-17',
    title: { en: 'Parshat Noach', he: 'פרשת נח' },
    leinings: [],
  }
  const leining: LeiningInstance = {
    kind: 'service',
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

function ref(chapter: number) {
  return { scroll: 'torah' as const, b: 1, c: chapter, v: 1 }
}
