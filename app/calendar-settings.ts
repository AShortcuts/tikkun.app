import type { UserSettings } from './calendar-model/user-settings.ts'
import {
  getBrowserStorage,
  readPersistedJson,
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

function isCalendarSettingsPayload(
  value: unknown
): value is Partial<CalendarSettings> {
  return Boolean(
    value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      (!('israel' in value) || typeof value.israel === 'boolean')
  )
}

export function loadCalendarSettings(
  storage?: Storage | null
): CalendarSettings {
  const target = storage === undefined ? getBrowserStorage('local') : storage
  const result = readPersistedJson({
    storage: target,
    key: CALENDAR_SETTINGS_STORAGE_KEY,
    validate: isCalendarSettingsPayload,
  })
  if (result.status === 'ready') {
    return { israel: result.value.israel === true }
  }
  if (result.status === 'unavailable') {
    console.error('Failed to load calendar settings', result.error)
  } else if (result.status === 'invalid' && result.reason === 'invalid-json') {
    console.error('Failed to load calendar settings', result.error)
  }
  return DEFAULT_CALENDAR_SETTINGS
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
