import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import {
  applyReaderPreferences,
  defaultReaderPreferences,
  getDefaultHighlightPreferences,
  loadReaderPreferences,
  mergeReaderPreferences,
  saveReaderPreferences,
} from './reader-preferences.ts'

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

  const styleProperties = new Map<string, string>()
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

afterEach(() => vi.restoreAllMocks())

test('loads sepia as a saved theme mode', () => {
  localStorage.setItem(
    'tikkun.reader-preferences.v3',
    JSON.stringify({ themeMode: 'sepia' })
  )

  const preferences = loadReaderPreferences()

  expect(preferences.themeMode).toBe('sepia')
})

test('falls back to the default theme for an invalid saved theme mode', () => {
  localStorage.setItem(
    'tikkun.reader-preferences.v3',
    JSON.stringify({ themeMode: 'chartreuse' })
  )

  const preferences = loadReaderPreferences()

  expect(preferences.themeMode).toBe(defaultReaderPreferences.themeMode)
})

test('loads reader focal point mode', () => {
  localStorage.setItem(
    'tikkun.reader-preferences.v3',
    JSON.stringify({ focalPointMode: 'browser' })
  )

  const preferences = loadReaderPreferences()

  expect(preferences.focalPointMode).toBe('browser')
})

test('falls back to the default focal point for an invalid saved mode', () => {
  localStorage.setItem(
    'tikkun.reader-preferences.v3',
    JSON.stringify({ focalPointMode: 'middle-ish' })
  )

  const preferences = loadReaderPreferences()

  expect(preferences.focalPointMode).toBe(defaultReaderPreferences.focalPointMode)
})

test('does not restore a saved playback rate', () => {
  localStorage.setItem(
    'tikkun.reader-preferences.v3',
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

  const raw = localStorage.getItem('tikkun.reader-preferences.v3')
  const stored = raw ? JSON.parse(raw) as Partial<typeof defaultReaderPreferences> : null

  expect(stored?.playbackRate).toBe(defaultReaderPreferences.playbackRate)
})

test('applies sepia to the root theme dataset', () => {
  applyReaderPreferences({
    ...defaultReaderPreferences,
    themeMode: 'sepia',
  })

  expect(document.documentElement.dataset.readerTheme).toBe('sepia')
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

test('repairs malformed saved fields before they reach CSS or behavior', () => {
  localStorage.setItem(
    'tikkun.reader-preferences.v3',
    JSON.stringify({
      narratorId: 42,
      highlightFill: 42,
      highlightOpacity: 'opaque',
      outlineColor: null,
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
    autoScrollWithPlayback: defaultReaderPreferences.autoScrollWithPlayback,
    disableShiftNekudotHide: defaultReaderPreferences.disableShiftNekudotHide,
  })
  expect(() => applyReaderPreferences(preferences)).not.toThrow()
})

test('clamps saved numeric preferences to the ranges exposed by settings', () => {
  localStorage.setItem(
    'tikkun.reader-preferences.v3',
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

test('removes malformed preference JSON after reporting it', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  localStorage.setItem('tikkun.reader-preferences.v3', '{not json')

  expect(loadReaderPreferences()).toEqual(expect.objectContaining(
    defaultReaderPreferences
  ))
  expect(localStorage.getItem('tikkun.reader-preferences.v3')).toBeNull()
  expect(
    localStorage.getItem('tikkun.reader-preferences.v3:quarantine')
  ).not.toBeNull()
  expect(console.error).toHaveBeenCalledWith(
    'Failed to parse reader preferences',
    expect.any(SyntaxError)
  )
})
