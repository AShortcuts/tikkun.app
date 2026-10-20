import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import {
  applyReaderPreferences,
  colorContrastRatio,
  customThemeColorUpdates,
  customThemeInterfaceColors,
  defaultReaderPreferences,
  getDefaultHighlightPreferences,
  getCustomThemeColors,
  loadReaderPreferences,
  loadReaderPreferencesState,
  mergeReaderPreferences,
  recommendedThemeTextColor,
  saveReaderPreferences,
} from './reader-preferences.ts'

let styleProperties: Map<string, string>

beforeEach(() => {
  const store = new Map<string, string>()
  ;(globalThis as typeof globalThis & { localStorage: Storage }).localStorage = {
    getItem(key: string) {
      return store.get(key) ?? null
    },
    setItem(key: string, value: string) {
      store.set(key, value)
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
    removeItem(key: string) {
      store.delete(key)
    },
  } as Storage

  styleProperties = new Map<string, string>()
  ;(globalThis as typeof globalThis & { document: Document }).document = {
    documentElement: {
      dataset: {},
      style: {
        setProperty(name: string, value: string) {
          styleProperties.set(name, value)
        },
      } as CSSStyleDeclaration,
    },
  } as Document
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

test('migrates a legacy custom theme without changing its colors and keeps deleted slots empty', () => {
  localStorage.setItem('tikkun.reader-preferences', JSON.stringify({
    themeMode: 'custom', customBackgroundColor: '#112233', customTextColor: '#abcdef',
  }))
  const preferences = loadReaderPreferences()
  expect(getCustomThemeColors(preferences)).toEqual({ background: '#112233', text: '#abcdef' })
  expect(preferences.savedThemes).toHaveLength(1)
  expect(preferences.activeSavedThemeId).toBeNull()
  saveReaderPreferences({ ...preferences, savedThemes: [] })
  expect(loadReaderPreferences().savedThemes).toEqual([])
})

test('saved themes edit independently, restore their selection, and apply the selected colors', () => {
  const preferences = mergeReaderPreferences(defaultReaderPreferences, {
    themeMode: 'custom', activeSavedThemeId: 'one',
    savedThemes: [
      { id: 'one', background: '#eeeeee', text: '#000000' },
      { id: 'two', background: '#ffffff', text: '#112233' },
    ],
  })
  const updated = mergeReaderPreferences(preferences, customThemeColorUpdates(preferences, {
    background: '#112233', text: '#f4f1e8',
  }))
  expect(updated.customBackgroundColor).toBe(defaultReaderPreferences.customBackgroundColor)
  expect(updated.savedThemes[1]).toEqual(preferences.savedThemes[1])
  expect(preferences.savedThemes[0].background).toBe('#eeeeee')
  saveReaderPreferences(updated)
  const restored = loadReaderPreferences()
  expect(restored.activeSavedThemeId).toBe('one')
  applyReaderPreferences(restored)
  expect(styleProperties.get('--reader-custom-background-color')).toBe('#112233')
  expect(styleProperties.get('--reader-custom-text-color')).toBe('#f4f1e8')
  expect(document.documentElement.style.colorScheme).toBe('dark')
  const deleted = mergeReaderPreferences(restored, { savedThemes: restored.savedThemes.slice(1) })
  expect(deleted.activeSavedThemeId).toBeNull()
  expect(getCustomThemeColors(deleted).background).toBe(defaultReaderPreferences.customBackgroundColor)
})

test('restores at most five valid unique themes and rejects stale selection', () => {
  localStorage.setItem('tikkun.reader-preferences', JSON.stringify({
    activeSavedThemeId: 'invalid',
    savedThemes: [
      null, { id: 'invalid', background: 'red', text: '#000000' },
      { id: 'one', background: '#eeeeee', text: '#000000' },
      { id: 'one', background: '#eeeeee', text: '#000000' },
      ...Array.from({ length: 6 }, (_, index) => ({ id: `theme-${index}`, background: '#ffffff', text: '#000000' })),
    ],
  }))
  const preferences = loadReaderPreferences()
  expect(preferences.savedThemes).toHaveLength(5)
  expect(new Set(preferences.savedThemes.map((theme) => theme.id)).size).toBe(5)
  expect(preferences.activeSavedThemeId).toBeNull()
})

test('normalizes and persists Reading font size for existing and new preferences', () => {
  expect(loadReaderPreferences().readingFontScale).toBe(1)
  for (const [value, expected] of [[0.2, 0.8], [4, 1.5], [NaN, 1], [Infinity, 1], [1.25, 1.25]]) {
    const preferences = mergeReaderPreferences(defaultReaderPreferences, { readingFontScale: value })
    expect(preferences.readingFontScale).toBe(expected)
  }
  saveReaderPreferences({ ...defaultReaderPreferences, readingFontScale: 1.25 })
  const restored = loadReaderPreferences()
  expect(restored.readingFontScale).toBe(1.25)
  applyReaderPreferences(restored)
  expect(styleProperties.get('--reading-font-scale')).toBe('1.25')
})

test('shows Reading pasuk numbers by default, including for preferences saved before the option', () => {
  localStorage.setItem('tikkun.reader-preferences', JSON.stringify({ readerTextLayout: 'reading' }))
  expect(loadReaderPreferences().verseNumbers).toBe(true)
  saveReaderPreferences({ ...defaultReaderPreferences, verseNumbers: false })
  const restored = loadReaderPreferences()
  expect(restored.verseNumbers).toBe(false)
  applyReaderPreferences(restored)
  expect(document.documentElement.dataset.verseNumbers).toBe('off')
})

test('defaults a new compact reader to Reading without changing the desktop default', () => {
  vi.stubGlobal('window', {
    matchMedia: () => ({ matches: true }),
  })

  expect(loadReaderPreferences().readerTextLayout).toBe('reading')
  expect(defaultReaderPreferences.readerTextLayout).toBe('match')
})

test('persists and applies the independent reader presentation choices', () => {
  saveReaderPreferences({
    ...defaultReaderPreferences,
    readerTextLayout: 'reading',
    readerSideMode: 'two',
    readerSideOrder: 'torah-right',
  })

  const preferences = loadReaderPreferences()
  applyReaderPreferences(preferences)

  expect(preferences).toMatchObject({
    readerTextLayout: 'reading',
    readerSideMode: 'two',
    readerSideOrder: 'torah-right',
  })
  expect(document.documentElement.dataset.readerTextLayout).toBe('reading')
  expect(document.documentElement.dataset.readerSideMode).toBe('two')
  expect(document.documentElement.dataset.readerSideOrder).toBe('torah-right')
})

test('loads sepia as a saved theme mode', () => {
  localStorage.setItem(
    'tikkun.reader-preferences',
    JSON.stringify({ themeMode: 'sepia' })
  )

  const preferences = loadReaderPreferences()

  expect(preferences.themeMode).toBe('sepia')
  expect(JSON.parse(
    localStorage.getItem('tikkun.reader-preferences') ?? '{}'
  )).toEqual({ themeMode: 'sepia' })
})

test('falls back to the default theme for an invalid saved theme mode', () => {
  localStorage.setItem(
    'tikkun.reader-preferences',
    JSON.stringify({ themeMode: 'chartreuse' })
  )

  const preferences = loadReaderPreferences()

  expect(preferences.themeMode).toBe(defaultReaderPreferences.themeMode)
})

test('loads reader focal point mode', () => {
  localStorage.setItem(
    'tikkun.reader-preferences',
    JSON.stringify({ focalPointMode: 'browser' })
  )

  const preferences = loadReaderPreferences()

  expect(preferences.focalPointMode).toBe('browser')
})

test('falls back to the default focal point for an invalid saved mode', () => {
  localStorage.setItem(
    'tikkun.reader-preferences',
    JSON.stringify({ focalPointMode: 'middle-ish' })
  )

  const preferences = loadReaderPreferences()

  expect(preferences.focalPointMode).toBe(defaultReaderPreferences.focalPointMode)
})

test('does not restore a saved playback rate', () => {
  localStorage.setItem(
    'tikkun.reader-preferences',
    JSON.stringify({ playbackRate: 1.75 })
  )

  const preferences = loadReaderPreferences()

  expect(preferences.playbackRate).toBe(defaultReaderPreferences.playbackRate)
})

test('does not persist a non-default playback rate', () => {
  saveReaderPreferences({
    ...defaultReaderPreferences,
    playbackRate: 1.75,
  })

  const raw = localStorage.getItem('tikkun.reader-preferences')
  const stored = raw
    ? JSON.parse(raw) as Partial<typeof defaultReaderPreferences>
    : null

  expect(stored?.playbackRate).toBe(defaultReaderPreferences.playbackRate)
})

test('applies sepia to the root theme dataset', () => {
  applyReaderPreferences({
    ...defaultReaderPreferences,
    themeMode: 'sepia',
  })

  expect(document.documentElement.dataset.readerTheme).toBe('sepia')
})

test('loads and applies a custom page and text color', () => {
  localStorage.setItem(
    'tikkun.reader-preferences',
    JSON.stringify({
      themeMode: 'custom',
      customBackgroundColor: '#112233',
      customTextColor: '#f4f1e8',
    })
  )

  const preferences = loadReaderPreferences()
  applyReaderPreferences(preferences)

  expect(preferences).toMatchObject({
    themeMode: 'custom',
    customBackgroundColor: '#112233',
    customTextColor: '#f4f1e8',
  })
  expect(styleProperties.get('--reader-custom-background-color')).toBe(
    '#112233'
  )
  expect(styleProperties.get('--reader-custom-text-color')).toBe('#f4f1e8')
  expect(document.documentElement.style.colorScheme).toBe('dark')
  expect(document.documentElement.dataset.readerCustomScheme).toBe('dark')
  applyReaderPreferences({ ...preferences, themeMode: 'light' })
  expect(document.documentElement.dataset.readerCustomScheme).toBe('')
})

test.each(['#eee6d6', '#112233', '#000000', '#ffffff', '#757575', '#777777', '#999999', '#cc2244', '#00ff00', '#6600cc'])(
  'keeps interface labels legible on custom background %s', (background) => {
    const colors = customThemeInterfaceColors(background)
    expect(colorContrastRatio(background, colors.text)).toBeGreaterThanOrEqual(4.5)
    expect(colorContrastRatio(background, colors.secondary)).toBeGreaterThanOrEqual(4.5)
    applyReaderPreferences({ ...defaultReaderPreferences, themeMode: 'custom', customBackgroundColor: background })
    expect(styleProperties.get('--reader-custom-ui-text-color')).toBe(colors.text)
    expect(styleProperties.get('--reader-custom-ui-secondary-color')).toBe(colors.secondary)
    expect(document.documentElement.style.colorScheme).toBe(colors.scheme)
  }
)

test('keeps custom contrast advisory and recommends the clearer text color', () => {
  expect(colorContrastRatio('#777777', '#888888')).toBeLessThan(4.5)
  expect(recommendedThemeTextColor('#101217')).toBe('#f8f7f3')
  expect(recommendedThemeTextColor('#f8f7f3')).toBe('#191c22')
})

test('highlight reset defaults are not read from changed inline styles', () => {
  applyReaderPreferences({
    ...defaultReaderPreferences,
    outlineOffset: 8,
    radius: 16,
    glow: 7,
  })

  const defaults = getDefaultHighlightPreferences()

  expect(defaults.outlineOffset).toBe(defaultReaderPreferences.outlineOffset)
  expect(defaults.radius).toBe(defaultReaderPreferences.radius)
  expect(defaults.glow).toBe(defaultReaderPreferences.glow)
})

test('normalizes malformed saved fields before they reach CSS or behavior', () => {
  localStorage.setItem(
    'tikkun.reader-preferences',
    JSON.stringify({
      narratorId: 42,
      highlightFill: 42,
      highlightOpacity: 'opaque',
      outlineColor: null,
      customBackgroundColor: 'blue',
      customTextColor: '#123',
      autoScrollWithPlayback: 'false',
      disableShiftNekudotHide: 1,
    })
  )

  const preferences = loadReaderPreferences()

  expect(preferences).toMatchObject({
    narratorId: defaultReaderPreferences.narratorId,
    highlightFill: defaultReaderPreferences.highlightFill,
    highlightOpacity: defaultReaderPreferences.highlightOpacity,
    outlineColor: defaultReaderPreferences.outlineColor,
    customBackgroundColor: defaultReaderPreferences.customBackgroundColor,
    customTextColor: defaultReaderPreferences.customTextColor,
    autoScrollWithPlayback: defaultReaderPreferences.autoScrollWithPlayback,
    disableShiftNekudotHide: defaultReaderPreferences.disableShiftNekudotHide,
  })
  expect(() => applyReaderPreferences(preferences)).not.toThrow()
})

test('clamps saved numeric preferences to the ranges exposed by settings', () => {
  localStorage.setItem(
    'tikkun.reader-preferences',
    JSON.stringify({
      highlightOpacity: 9,
      outlineWidth: -4,
      outlineOffset: 20,
      radius: -1,
      glow: 99,
    })
  )

  expect(loadReaderPreferences()).toMatchObject({
    highlightOpacity: 0.45,
    outlineWidth: 1,
    outlineOffset: 10,
    radius: 0,
    glow: 8,
  })
})

test('normalizes programmatic preference updates at the same seam', () => {
  const preferences = mergeReaderPreferences(defaultReaderPreferences, {
    highlightOpacity: 2,
    outlineWidth: Number.NaN,
    autoScrollWithPlayback: undefined,
  })

  expect(preferences.highlightOpacity).toBe(0.45)
  expect(preferences.outlineWidth).toBe(defaultReaderPreferences.outlineWidth)
  expect(preferences.autoScrollWithPlayback).toBe(
    defaultReaderPreferences.autoScrollWithPlayback
  )
})

test('uses defaults for malformed JSON and replaces it on the next save', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  localStorage.setItem('tikkun.reader-preferences', '{not json')

  const loaded = loadReaderPreferencesState()
  expect(loaded.preferences).toEqual(expect.objectContaining(
    defaultReaderPreferences
  ))
  expect(localStorage.getItem('tikkun.reader-preferences')).toBe('{not json')
  saveReaderPreferences(
    { ...loaded.preferences, themeMode: 'sepia' },
    loaded.revision
  )
  expect(loadReaderPreferences().themeMode).toBe('sepia')
  expect(console.error).toHaveBeenCalledWith(
    'Failed to parse reader preferences',
    expect.any(SyntaxError)
  )
})

test('rejects a stale preference snapshot instead of losing another tab update', () => {
  const firstClient = loadReaderPreferencesState()
  const secondClient = loadReaderPreferencesState()
  saveReaderPreferences(
    { ...firstClient.preferences, themeMode: 'sepia' },
    firstClient.revision
  )

  expect(() =>
    saveReaderPreferences(
      { ...secondClient.preferences, themeMode: 'dark' },
      secondClient.revision
    )
  ).toThrow('Failed to save reader preferences')
  expect(loadReaderPreferences().themeMode).toBe('sepia')
})
