import { expect, test, vi } from 'vitest'

import {
  DEFAULT_CALENDAR_SETTINGS,
  CALENDAR_SETTINGS_STORAGE_KEY,
  loadCalendarSettings,
  loadCalendarSettingsState,
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

test('uses defaults for malformed JSON and replaces it on the next save', () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  const storage = createMemoryStorage()
  storage.setItem(CALENDAR_SETTINGS_STORAGE_KEY, '{')

  const loaded = loadCalendarSettingsState(storage)
  expect(loaded.settings).toEqual(DEFAULT_CALENDAR_SETTINGS)
  expect(storage.getItem(CALENDAR_SETTINGS_STORAGE_KEY)).toBe('{')
  saveCalendarSettings({ israel: true }, storage, loaded.revision)
  expect(loadCalendarSettings(storage)).toEqual({ israel: true })
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

test('rejects a stale calendar snapshot instead of silently replacing it', () => {
  const storage = createMemoryStorage()
  const firstClient = loadCalendarSettingsState(storage)
  const secondClient = loadCalendarSettingsState(storage)

  saveCalendarSettings({ israel: true }, storage, firstClient.revision)
  expect(() =>
    saveCalendarSettings({ israel: false }, storage, secondClient.revision)
  ).toThrow('Failed to save calendar settings')
  expect(loadCalendarSettings(storage)).toEqual({ israel: true })
})
