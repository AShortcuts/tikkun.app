import type { UserSettings } from './calendar-model/user-settings.ts'
import {
  getBrowserStorage,
  quarantineStorageItem,
  readStorageItem,
  writeStorageItem,
} from './persistence/persisted-state.ts'

export type CalendarSettings = {
  israel: boolean
}

export const CALENDAR_SETTINGS_STORAGE_KEY = 'tikkun.calendar-settings.v1'

export const DEFAULT_CALENDAR_SETTINGS: CalendarSettings = {
  israel: false,
}

export function userSettingsFromCalendarSettings(
  settings: CalendarSettings
): UserSettings {
  return {
    ashkenazi: true,
    includeModernHolidays: false,
    israel: settings.israel,
  }
}

export function loadCalendarSettings(
  storage?: Storage | null
): CalendarSettings {
  const target = storage === undefined ? getBrowserStorage('local') : storage
  let raw: string | null = null
  try {
    raw = readStorageItem(target, CALENDAR_SETTINGS_STORAGE_KEY)
    if (!raw) return DEFAULT_CALENDAR_SETTINGS

    const parsed = JSON.parse(raw) as unknown
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed) ||
      ('israel' in parsed && typeof parsed.israel !== 'boolean')
    ) {
      quarantineStorageItem({
        storage: target,
        key: CALENDAR_SETTINGS_STORAGE_KEY,
        rawValue: raw,
        reason: 'calendar settings have an invalid shape',
      })
      return DEFAULT_CALENDAR_SETTINGS
    }
    return {
      israel: 'israel' in parsed && parsed.israel === true,
    }
  } catch (error) {
    console.error('Failed to load calendar settings', error)
    if (raw) {
      quarantineStorageItem({
        storage: target,
        key: CALENDAR_SETTINGS_STORAGE_KEY,
        rawValue: raw,
        reason: 'calendar settings are not valid JSON',
      })
    }
    return DEFAULT_CALENDAR_SETTINGS
  }
}

export function saveCalendarSettings(
  settings: CalendarSettings,
  storage?: Storage | null
) {
  try {
    const target = storage === undefined ? getBrowserStorage('local') : storage
    writeStorageItem(target, CALENDAR_SETTINGS_STORAGE_KEY, JSON.stringify(settings))
  } catch (error) {
    if (error instanceof CalendarSettingsStorageError) throw error
    throw new CalendarSettingsStorageError(error)
  }
}

export class CalendarSettingsStorageError extends Error {
  readonly cause: unknown

  constructor(cause?: unknown) {
    super('Failed to save calendar settings')
    this.name = 'CalendarSettingsStorageError'
    this.cause = cause
  }
}
