import { expect, test, vi } from 'vitest'

import {
  DEFAULT_CALENDAR_SETTINGS,
  CALENDAR_SETTINGS_STORAGE_KEY,
  loadCalendarSettings,
  saveCalendarSettings,
  userSettingsFromCalendarSettings,
} from './calendar-settings.ts'

function createMemoryStorage(): Storage {
  const items = new Map<string, string>()
  return {
    get length() {
      return items.size
    },
    clear() {
      items.clear()
    },
    getItem(key: string) {
      return items.get(key) ?? null
    },
    key(index: number) {
      return [...items.keys()][index] ?? null
    },
    removeItem(key: string) {
      items.delete(key)
    },
    setItem(key: string, value: string) {
      items.set(key, value)
    },
  }
}

test('loads default calendar settings when storage is empty', () => {
  const storage = createMemoryStorage()

  expect(loadCalendarSettings(storage)).toEqual(DEFAULT_CALENDAR_SETTINGS)
})

test('loads persisted calendar settings', () => {
  const storage = createMemoryStorage()
  storage.setItem(CALENDAR_SETTINGS_STORAGE_KEY, JSON.stringify({ israel: true }))

  expect(loadCalendarSettings(storage)).toEqual({ israel: true })
})

test('falls back to default calendar settings when storage is invalid', () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  const storage = createMemoryStorage()
  storage.setItem(CALENDAR_SETTINGS_STORAGE_KEY, '{')

  expect(loadCalendarSettings(storage)).toEqual(DEFAULT_CALENDAR_SETTINGS)
  expect(storage.getItem(CALENDAR_SETTINGS_STORAGE_KEY)).toBeNull()
  expect(
    storage.getItem(`${CALENDAR_SETTINGS_STORAGE_KEY}:quarantine`)
  ).not.toBeNull()
  log.mockRestore()
})

test('contains denied reads and surfaces denied writes', () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  const storage = {
    ...createMemoryStorage(),
    getItem: () => {
      throw new DOMException('denied', 'SecurityError')
    },
    setItem: () => {
      throw new DOMException('denied', 'SecurityError')
    },
  } as Storage

  expect(loadCalendarSettings(storage)).toEqual(DEFAULT_CALENDAR_SETTINGS)
  expect(() => saveCalendarSettings({ israel: true }, storage)).toThrow(
    'Failed to save calendar settings'
  )
  log.mockRestore()
})

test('saves calendar settings and adapts them to user settings', () => {
  const storage = createMemoryStorage()

  saveCalendarSettings({ israel: true }, storage)

  expect(loadCalendarSettings(storage)).toEqual({ israel: true })
  expect(userSettingsFromCalendarSettings({ israel: true })).toMatchObject({
    ashkenazi: true,
    includeModernHolidays: false,
    israel: true,
  })
})
