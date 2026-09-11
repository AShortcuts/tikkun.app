import type { UserSettings } from './calendar-model/user-settings.ts'
import { publishNativePractice } from './platform/native-practice.ts'
import {
  createPersistedJsonStore,
  getBrowserStorage,
  requirePersistedJsonMutation,
  type PersistedJsonRevision,
} from './persistence/persisted-state.ts'

export type CalendarSettings = {
  israel: boolean
}

export const CALENDAR_SETTINGS_STORAGE_KEY = 'tikkun.calendar-settings'

export const DEFAULT_CALENDAR_SETTINGS: CalendarSettings = {
  israel: false,
}

export interface LoadedCalendarSettings {
  settings: CalendarSettings
  revision: PersistedJsonRevision | null
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

function createCalendarSettingsStore(storage: Storage | null) {
  return createPersistedJsonStore({
    storage,
    key: CALENDAR_SETTINGS_STORAGE_KEY,
    validate: isCalendarSettingsPayload,
  })
}

export function loadCalendarSettings(
  storage?: Storage | null
): CalendarSettings {
  return loadCalendarSettingsState(storage).settings
}

export function loadCalendarSettingsState(
  storage?: Storage | null
): LoadedCalendarSettings {
  const target = storage === undefined ? getBrowserStorage('local') : storage
  const store = createCalendarSettingsStore(target)
  const result = store.read()
  if (result.status === 'ready') {
    const settings = { israel: result.value.israel === true }
    return { settings, revision: result.revision }
  }
  if (result.status === 'unavailable') {
    console.error('Failed to load calendar settings', result.error)
    return { settings: DEFAULT_CALENDAR_SETTINGS, revision: null }
  }
  if (result.status === 'missing') {
    return { settings: DEFAULT_CALENDAR_SETTINGS, revision: result.revision }
  }
  if (result.reason === 'invalid-json') {
    console.error('Failed to load calendar settings', result.error)
  } else {
    console.error('Invalid calendar settings')
  }
  return { settings: DEFAULT_CALENDAR_SETTINGS, revision: result.revision }
}

export function saveCalendarSettings(
  settings: CalendarSettings,
  storage?: Storage | null,
  expectedRevision?: PersistedJsonRevision | null
) {
  try {
    const target = storage === undefined ? getBrowserStorage('local') : storage
    const store = createCalendarSettingsStore(target)
    let revision = expectedRevision
    if (!revision) {
      const current = store.read()
      if (current.status === 'unavailable') throw current.error
      revision = current.revision
    }
    const saved = requirePersistedJsonMutation(store.write(settings, revision))
    publishNativePractice({ israel: settings.israel })
    return saved
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
