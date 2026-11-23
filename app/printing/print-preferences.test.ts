import { expect, test, vi } from 'vitest'
import { loadPrintPreferences, PRINT_PREFERENCES_STORAGE_KEY, savePrintPreferences } from './print-preferences.ts'

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const values = new Map(Object.entries(initial))
  return {
    get length() { return values.size },
    clear: () => values.clear(),
    getItem: key => values.get(key) ?? null,
    key: index => [...values.keys()][index] ?? null,
    removeItem: key => { values.delete(key) },
    setItem: (key, value) => { values.set(key, value) },
  }
}

test('substitute spellings and pasuk numbers default to on and remember the last choice', () => {
  const storage = memoryStorage()
  expect(loadPrintPreferences(storage)).toEqual({ replaceDivineNames: true, verseNumbers: true })
  savePrintPreferences({ replaceDivineNames: false, verseNumbers: true }, storage)
  expect(loadPrintPreferences(storage)).toEqual({ replaceDivineNames: false, verseNumbers: true })
  savePrintPreferences({ replaceDivineNames: true, verseNumbers: false }, storage)
  expect(loadPrintPreferences(storage)).toEqual({ replaceDivineNames: true, verseNumbers: false })
})

test('a choice saved before pasuk numbers existed keeps pasuk numbers on', () => {
  expect(loadPrintPreferences(memoryStorage({ [PRINT_PREFERENCES_STORAGE_KEY]: '{"replaceDivineNames":false}' }))).toEqual({ replaceDivineNames: false, verseNumbers: true })
})

test('falls back to the defaults when the saved value is unreadable', () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  expect(loadPrintPreferences(memoryStorage({ [PRINT_PREFERENCES_STORAGE_KEY]: '{"replaceDivineNames":"no"}' }))).toEqual({ replaceDivineNames: true, verseNumbers: true })
  expect(loadPrintPreferences(null)).toEqual({ replaceDivineNames: true, verseNumbers: true })
  expect(error).toHaveBeenCalledTimes(2)
  error.mockRestore()
})
