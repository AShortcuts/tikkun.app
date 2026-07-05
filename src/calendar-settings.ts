import type { UserSettings } from './calendar-model/user-settings.ts'
import type { CalendarSettings } from './components/ParshaPicker.ts'

export type { CalendarSettings }

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
  storage: Storage = window.localStorage
): CalendarSettings {
  try {
    const raw = storage.getItem(CALENDAR_SETTINGS_STORAGE_KEY)
    if (!raw) return DEFAULT_CALENDAR_SETTINGS

    const parsed = JSON.parse(raw) as Partial<CalendarSettings>
    return {
      israel: parsed.israel === true,
    }
  } catch {
    return DEFAULT_CALENDAR_SETTINGS
  }
}

export function saveCalendarSettings(
  settings: CalendarSettings,
  storage: Storage = window.localStorage
) {
  storage.setItem(CALENDAR_SETTINGS_STORAGE_KEY, JSON.stringify(settings))
}
