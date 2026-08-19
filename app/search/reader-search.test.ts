import { HDate } from '@hebcal/hdate'
import { describe, expect, test, vi } from 'vitest'
import { LeiningGenerator } from '../calendar-model/generator.ts'
import type { UserSettings } from '../calendar-model/user-settings.ts'
import {
  createNavigationAction,
  createPageNavigationActions,
} from '../navigation/actions.ts'
import { listReadingSearchLeinings } from './reading-catalog.ts'
import { createReaderSearch } from './reader-search.ts'

const settings: UserSettings = {
  ashkenazi: true,
  includeModernHolidays: false,
  israel: false,
}
const generator = new LeiningGenerator(settings)
const readings = listReadingSearchLeinings(
  generator,
  new HDate(new Date(2026, 7, 10))
)

describe('unified reader search', () => {
  test('mixes navigation and commands under one deterministic ranking model', () => {
    const search = createReaderSearch(readings, [
      createNavigationAction({
        id: 'tools.settings',
        group: 'tools',
        label: 'Reader Settings',
        aliases: ['Preferences'],
        run: vi.fn(),
      }),
      ...createPageNavigationActions({ navigateToPage: vi.fn() }),
    ])

    expect(search.search('Noach')[0]).toMatchObject({
      source: 'reading',
      href: '#/torah/parsha/noach',
    })
    expect(search.search('settings')[0]).toMatchObject({
      source: 'action',
      action: { id: 'tools.settings' },
    })
    expect(search.search('page 12')[0]).toMatchObject({
      source: 'action',
      action: { id: 'page.torah.12' },
      band: 'intent',
    })
    expect(search.search('Genesis 6:9')[0]).toMatchObject({
      source: 'reading',
      href: '#/r/1-6-9',
      band: 'intent',
    })
    expect(search.search('Torah page 246')).toEqual([])
  })

  test('deduplicates the same aliyah across reading and action providers', () => {
    const destinationId = '#/torah/parsha/noach/1-7-17'
    const search = createReaderSearch(readings, [
      createNavigationAction({
        id: 'reading.noach.3',
        group: 'reading',
        label: 'Noach Aliyah 3',
        aliases: ['Noah 3'],
        destinationId,
        href: destinationId,
        run: vi.fn(),
      }),
    ])
    const results = search.search('Noach 3')

    expect(results[0]).toMatchObject({
      source: 'reading',
      destinationId,
      band: 'intent',
      label: 'Parshat Noach',
      secondaryLabel: 'Aliyah 3 · נח',
    })
    expect(`${results[0]?.label} ${results[0]?.secondaryLabel}`).not.toMatch(
      /shacharit|שחרית/i
    )
    expect(
      results.filter((result) => result.destinationId === destinationId)
    ).toHaveLength(1)
  })

  test('preserves bold ranges for labels and off-label aliases', () => {
    const search = createReaderSearch(readings, [
      createNavigationAction({
        id: 'tools.analytics',
        group: 'tools',
        label: 'Cue Analytics',
        aliases: ['Playback Analytics'],
        run: vi.fn(),
      }),
    ])

    const alias = search.search('Playback Analytics')[0]
    expect(alias).toMatchObject({
      matchedAlias: 'Playback Analytics',
      matchedField: 'alias',
      band: 'exact-alias',
    })
    expect(alias?.matchedAliasRanges.length).toBeGreaterThan(0)

    const reading = search.search('Bereshit')[0]
    expect(reading?.labelRanges.length).toBeGreaterThan(0)
  })

  test('does not flood a plain reading query with every aliyah', () => {
    const search = createReaderSearch(
      readings,
      [1, 2, 3].map((aliyah) =>
        createNavigationAction({
          id: `reading.beresheet.${aliyah}`,
          group: 'reading',
          label: `Beresheet Aliyah ${aliyah}`,
          aliases: [`Beresheet ${aliyah}`],
          destinationId: `#/test/beresheet/${aliyah}`,
          searchConstraint: { kind: 'aliyah', aliyah },
          run: vi.fn(),
        })
      )
    )

    expect(search.search('Beresheet').every(({ source }) => source === 'reading')).toBe(true)
    expect(
      search
        .search('Beresheet 3')
        .filter(({ source }) => source === 'action')
        .map(({ action }) => action?.id)
    ).toEqual(['reading.beresheet.3'])
  })

  test('shows only explicitly prioritized quick actions on an empty query', () => {
    const search = createReaderSearch(readings, [
      createNavigationAction({
        id: 'today',
        group: 'reading',
        label: 'Today',
        emptyPriority: 100,
        run: vi.fn(),
      }),
      createNavigationAction({
        id: 'hidden',
        group: 'reading',
        label: 'Search only',
        showWhenEmpty: false,
        run: vi.fn(),
      }),
    ])

    expect(search.search('').map((result) => result.action?.id)).toEqual([
      'today',
    ])
  })
})
