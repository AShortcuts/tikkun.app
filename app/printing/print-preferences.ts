import { createPersistedJsonStore, getBrowserStorage } from '../persistence/persisted-state.ts'

export const PRINT_PREFERENCES_STORAGE_KEY = 'tikkun.print-preferences'

export type PrintPreferences = { replaceDivineNames: boolean, verseNumbers: boolean }

const DEFAULT_PRINT_PREFERENCES: PrintPreferences = { replaceDivineNames: true, verseNumbers: true }

function isPrintPreferencesPayload(value: unknown): value is Partial<PrintPreferences> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) &&
    (!('replaceDivineNames' in value) || typeof value.replaceDivineNames === 'boolean') &&
    (!('verseNumbers' in value) || typeof value.verseNumbers === 'boolean'))
}

const printPreferencesStore = (storage: Storage | null) =>
  createPersistedJsonStore({ storage, key: PRINT_PREFERENCES_STORAGE_KEY, validate: isPrintPreferencesPayload })

export function loadPrintPreferences(storage: Storage | null = getBrowserStorage('local')): PrintPreferences {
  const result = printPreferencesStore(storage).read()
  if (result.status === 'ready') return { ...DEFAULT_PRINT_PREFERENCES, ...result.value }
  if (result.status === 'unavailable') console.error('Failed to load print preferences', result.error)
  else if (result.status === 'invalid') console.error('Invalid print preferences', result.error ?? result.reason)
  return DEFAULT_PRINT_PREFERENCES
}

/** Saving is best effort: printing still works with the setting in memory if storage fails. */
export function savePrintPreferences(preferences: PrintPreferences, storage: Storage | null = getBrowserStorage('local')) {
  const store = printPreferencesStore(storage)
  const current = store.read()
  if (current.status === 'unavailable') {
    console.error('Failed to save print preferences', current.error)
    return
  }
  const result = store.write(preferences, current.revision)
  if (result.status === 'unavailable') console.error('Failed to save print preferences', result.error)
  else if (result.status === 'conflict') console.error('Print preferences changed in another tab; this change was not saved')
}
