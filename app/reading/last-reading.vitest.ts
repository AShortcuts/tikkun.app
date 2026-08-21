import { expect, test, vi } from 'vitest'

import {
  LAST_READING_MAX_AGE_MS,
  createLastReadingHash,
  loadEligibleLastReading,
  saveLastReading,
} from './last-reading.ts'
import { LeiningGenerator } from '../calendar-model/generator.ts'
import type { UserSettings } from '../calendar-model/user-settings.ts'

const testSettings: UserSettings = {
  ashkenazi: true,
  includeModernHolidays: false,
  israel: false,
}

function createStorage() {
  const store = new Map<string, string>()
  return {
    getItem(key: string) {
      return store.get(key) ?? null
    },
    setItem(key: string, value: string) {
      store.set(key, value)
    },
    removeItem(key: string) {
      store.delete(key)
    },
    clear() {
      store.clear()
    },
    key(index: number) {
      return [...store.keys()][index] ?? null
    },
    get length() {
      return store.size
    },
  } as Storage
}

const now = new Date('2026-06-12T12:00:00Z').getTime()

test('loads a recent last reading with display labels', () => {
  const storage = createStorage()
  saveLastReading(
    storage,
    {
      hash: '#/torah/parsha/beresheet/1-1-1',
      parshaName: 'בראשית',
      aliyahLabel: 'ראשון',
    },
    now
  )

  const lastReading = loadEligibleLastReading(storage, now + 60_000)

  expect(lastReading).toMatchObject({
    hash: '#/torah/parsha/beresheet/1-1-1',
    parshaName: 'בראשית',
    aliyahLabel: 'ראשון',
    savedAt: now,
  })
})

test('reads the current checkpoint JSON without rewriting it', () => {
  const storage = createStorage()
  const checkpoint = {
    hash: '#/torah/parsha/noach',
    parshaName: 'Noach',
    savedAt: now,
  }
  storage.setItem('tikkun.last-reading', JSON.stringify(checkpoint))

  expect(loadEligibleLastReading(storage, now)).toEqual(checkpoint)
  expect(JSON.parse(storage.getItem('tikkun.last-reading') ?? '{}')).toEqual(
    checkpoint
  )
})

test('hides and clears a last reading older than forty eight hours', () => {
  const storage = createStorage()
  saveLastReading(
    storage,
    {
      hash: '#/torah/parsha/noach',
      parshaName: 'נח',
    },
    now - LAST_READING_MAX_AGE_MS - 1
  )

  expect(loadEligibleLastReading(storage, now)).toBeNull()
  expect(storage.length).toBe(0)
})

test('does not remove a newer checkpoint that arrives during expired cleanup', () => {
  const storage = createStorage()
  saveLastReading(
    storage,
    { hash: '#/torah/parsha/noach', parshaName: 'Old' },
    now - LAST_READING_MAX_AGE_MS - 1
  )
  const getItem = storage.getItem.bind(storage)
  let reads = 0
  storage.getItem = (key) => {
    reads += 1
    if (reads === 2) {
      storage.setItem(
        key,
        JSON.stringify({
          hash: '#/torah/parsha/beresheet',
          parshaName: 'New',
          savedAt: now,
        })
      )
    }
    return getItem(key)
  }

  expect(loadEligibleLastReading(storage, now)).toBeNull()
  expect(JSON.parse(getItem('tikkun.last-reading') ?? '{}')).toMatchObject({
    parshaName: 'New',
    savedAt: now,
  })
})

test('ignores invalid stored routes', () => {
  const storage = createStorage()
  storage.setItem(
    'tikkun.last-reading',
    JSON.stringify({
      hash: '#/about',
      parshaName: 'About',
      savedAt: now,
    })
  )

  expect(loadEligibleLastReading(storage, now)).toBeNull()
  expect(storage.getItem('tikkun.last-reading')).not.toBeNull()
})

test('uses no checkpoint for malformed JSON and replaces it on save', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const rawValue = '{bad json'
  const storage = createStorage()
  storage.setItem('tikkun.last-reading', rawValue)

  expect(loadEligibleLastReading(storage, now)).toBeNull()
  expect(storage.getItem('tikkun.last-reading')).toBe(rawValue)

  saveLastReading(
    storage,
    { hash: '#/torah/parsha/noach', parshaName: 'Recovered' },
    now
  )
  expect(loadEligibleLastReading(storage, now)?.parshaName).toBe('Recovered')
})

test('ignores a grammar-valid checkpoint that is not routable', () => {
  const storage = createStorage()
  saveLastReading(
    storage,
    {
      hash: '#/torah/parsha/noach/1-1-1',
      parshaName: 'Noach',
    },
    now
  )

  expect(loadEligibleLastReading(storage, now, () => false)).toBeNull()
  expect(storage.getItem('tikkun.last-reading')).not.toBeNull()
})

test('ignores an invalid saved timestamp', () => {
  const storage = createStorage()
  storage.setItem(
    'tikkun.last-reading',
    JSON.stringify({
      hash: '#/torah/parsha/noach',
      parshaName: 'Noach',
      savedAt: -1,
    })
  )

  expect(loadEligibleLastReading(storage, now)).toBeNull()
  expect(storage.getItem('tikkun.last-reading')).not.toBeNull()
})

test('ignores an impossible future timestamp', () => {
  const storage = createStorage()
  storage.setItem(
    'tikkun.last-reading',
    JSON.stringify({
      hash: '#/torah/parsha/noach',
      parshaName: 'Noach',
      savedAt: now + 10 * 60 * 1000,
    })
  )

  expect(loadEligibleLastReading(storage, now)).toBeNull()
  expect(storage.getItem('tikkun.last-reading')).not.toBeNull()
})

test('ignores the moving calendar default route', () => {
  const storage = createStorage()
  saveLastReading(
    storage,
    {
      hash: '#/next',
      parshaName: 'Calendar default',
    },
    now
  )

  expect(loadEligibleLastReading(storage, now)).toBeNull()
})

test('prefers semantic parsha urls with verse refs for last reading links', () => {
  const generator = new LeiningGenerator(testSettings)
  const beresheet = generator
    .forHebrewYear(5785)
    .find((candidate) => candidate.id === '2024-10-26')
    ?.leinings.find((leining) => leining.date.title.en === 'Parshat Bereshit')
  const run = beresheet?.runs[0]

  if (!run) throw new Error('Missing Beresheet run')

  expect(createLastReadingHash(run, run.aliyot[0].start)).toBe(
    '#/torah/parsha/beresheet/1-1-1'
  )
})

test('uses a semantic combined-parsha URL for scroll checkpoints', () => {
  const generator = new LeiningGenerator(testSettings)
  const combined = generator
    .forHebrewYear(5786)
    .find((candidate) => candidate.id === '2026-09-05')
    ?.leinings.find(
      (leining) => leining.date.title.en === 'Parshat Nitzavim-Vayeilech'
    )
  const run = combined?.runs[0]

  if (!run) throw new Error('Missing Nitzavim-Vayeilech run')

  expect(createLastReadingHash(run, run.aliyot[0].start)).toBe(
    '#/torah/parsha/nitzavim-vayelech/5-29-9'
  )
})

test('contains denied checkpoint reads and surfaces denied writes', () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  const storage = {
    ...createStorage(),
    getItem: () => {
      throw new DOMException('denied', 'SecurityError')
    },
    setItem: () => {
      throw new DOMException('denied', 'SecurityError')
    },
  } as Storage

  expect(loadEligibleLastReading(storage, now)).toBeNull()
  expect(() => saveLastReading(storage, {
    hash: '#/torah/parsha/noach',
    parshaName: 'Noach',
  }, now)).toThrow('Failed to save the last-reading checkpoint')
  log.mockRestore()
})
