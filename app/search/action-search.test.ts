import { describe, expect, test, vi } from 'vitest'
import {
  createNavigationAction,
  createPageNavigationActions,
} from '../navigation/actions.ts'
import { createActionSearch } from './action-search.ts'

describe('action search adapter', () => {
  test('keeps runnable callbacks outside retrieval and returns the original action', () => {
    const run = vi.fn()
    const action = createNavigationAction({
      id: 'tools.analytics',
      group: 'tools',
      label: 'Cue Analytics',
      aliases: ['Timing Analytics'],
      keywords: ['playback timing'],
      run,
    })
    const result = createActionSearch([action]).search('Timing Analytics')[0]

    expect(result?.action).toBe(action)
    result?.action.run()
    expect(run).toHaveBeenCalledOnce()
    expect(result?.match.matchedField?.kind).toBe('alias')
  })

  test('ranks parsed aliyah and page destinations first', () => {
    const noach = createNavigationAction({
      id: 'reading.noach.catalog',
      group: 'reading',
      label: 'פרשת נח Aliyah 3',
      aliases: ['Noach 3', 'Noah 3'],
      dedupeKey: 'reading.parsha.noach.3',
      run: () => undefined,
    })
    const pages = createPageNavigationActions({
      navigateToPage: () => undefined,
    })
    const search = createActionSearch([noach, ...pages])

    expect(search.search('Noah 3')[0]?.action.id).toBe(noach.id)
    expect(search.search('page 12')[0]?.action.id).toBe('page.torah.12')
    expect(search.search('Megillah page 3')[0]?.action.id).toBe(
      'page.esther.3'
    )
    expect(search.search('Torah page 246')).toEqual([])
    expect(search.search('Genesis 6:9')).toEqual([])
  })

  test('uses explicit empty priorities and availability', () => {
    const actions = [
      createNavigationAction({
        id: 'later',
        group: 'tools',
        label: 'Later',
        emptyPriority: 10,
        run: () => undefined,
      }),
      createNavigationAction({
        id: 'first',
        group: 'reading',
        label: 'First',
        emptyPriority: 20,
        run: () => undefined,
      }),
      createNavigationAction({
        id: 'hidden',
        group: 'admin',
        label: 'Hidden',
        emptyPriority: 30,
        available: false,
        run: () => undefined,
      }),
      createNavigationAction({
        id: 'search-only',
        group: 'page',
        label: 'Search only',
        showWhenEmpty: false,
        run: () => undefined,
      }),
    ]

    expect(
      createActionSearch(actions)
        .search('')
        .map(({ action }) => action.id)
    ).toEqual(['first', 'later'])
  })

  test('deduplicates equivalent destinations before the limit', () => {
    const actions = [
      createNavigationAction({
        id: 'current',
        group: 'reading',
        label: 'Noach Aliyah 3',
        dedupeKey: 'reading.parsha.noach.3',
        run: () => undefined,
      }),
      createNavigationAction({
        id: 'recording',
        group: 'reading',
        label: 'Noah 3',
        dedupeKey: 'reading.parsha.noach.3',
        run: () => undefined,
      }),
      createNavigationAction({
        id: 'notes',
        group: 'tools',
        label: 'Noach 3 notes',
        run: () => undefined,
      }),
    ]

    expect(
      createActionSearch(actions)
        .search('Noach 3', { limit: 2 })
        .map(({ action }) => action.id)
    ).toEqual(['current', 'notes'])
  })

  test('finds future readings, recordings, bookmarks, resume points, and holidays', () => {
    const actions = [
      createNavigationAction({
        id: 'reading.future.noach',
        group: 'reading',
        label: 'Upcoming Noach Aliyah 3',
        aliases: ['Noah 3'],
        dedupeKey: 'reading.parsha.noach.3',
        showWhenEmpty: false,
        run: () => undefined,
      }),
      createNavigationAction({
        id: 'reading.recording.beresheet',
        group: 'reading',
        label: 'Beresheet Aliyah 1',
        aliases: ['Bereshit 1'],
        keywords: ['recording', 'audio'],
        run: () => undefined,
      }),
      createNavigationAction({
        id: 'resume.last-reading',
        group: 'resume',
        label: 'Resume Noach, Aliyah 2',
        aliases: ['Last Reading'],
        run: () => undefined,
      }),
      createNavigationAction({
        id: 'checkpoint.bookmark-1',
        group: 'resume',
        label: 'My practice place',
        keywords: ['bookmark', 'checkpoint'],
        run: () => undefined,
      }),
      createNavigationAction({
        id: 'reading.holiday.tisha-bav',
        group: 'reading',
        label: "Tish'a B'Av / תשעה באב",
        aliases: ['Tishah B’Av'],
        keywords: ['fast day', 'holiday'],
        run: () => undefined,
      }),
    ]
    const search = createActionSearch(actions)

    expect(search.search('Noah 3')[0]?.action.id).toBe('reading.future.noach')
    expect(search.search('Bereshit 1')[0]?.action.id).toBe(
      'reading.recording.beresheet'
    )
    expect(search.search('last reading')[0]?.action.id).toBe(
      'resume.last-reading'
    )
    expect(search.search('bookmark')[0]?.action.id).toBe(
      'checkpoint.bookmark-1'
    )
    expect(search.search('Tishah B’Av')[0]?.action.id).toBe(
      'reading.holiday.tisha-bav'
    )
  })

  test('shows granular aliyah actions only for aliyah or recording intent', () => {
    const actions = [
      createNavigationAction({
        id: 'reading.noach.1',
        group: 'reading',
        label: 'Noach Aliyah 1',
        aliases: ['Noach 1'],
        searchConstraint: { kind: 'aliyah', aliyah: 1 },
        run: () => undefined,
      }),
      createNavigationAction({
        id: 'reading.noach.3',
        group: 'reading',
        label: 'Noach Aliyah 3',
        aliases: ['Noach 3'],
        searchConstraint: { kind: 'aliyah', aliyah: 3 },
        run: () => undefined,
      }),
      createNavigationAction({
        id: 'recording.noach.1',
        group: 'reading',
        label: 'Noach Aliyah 1',
        keywords: ['recording', 'audio'],
        searchConstraint: {
          kind: 'aliyah',
          aliyah: 1,
          allowTerms: ['recording', 'audio'],
        },
        run: () => undefined,
      }),
    ]
    const search = createActionSearch(actions)

    expect(search.search('Noach')).toEqual([])
    expect(search.search('Noach 3').map(({ action }) => action.id)).toEqual([
      'reading.noach.3',
    ])
    expect(search.search('Noach audio')[0]?.action.id).toBe(
      'recording.noach.1'
    )
  })

  test('enforces the palette limit after ranking', () => {
    const actions = Array.from({ length: 20 }, (_, index) =>
      createNavigationAction({
        id: `action.${index}`,
        group: 'tools',
        label: `Search action ${index}`,
        run: () => undefined,
      })
    )

    expect(createActionSearch(actions).search('search', { limit: 12 })).toHaveLength(12)
  })
})
