import test from 'ava'

import {
  applyReaderPreferences,
  defaultReaderPreferences,
  loadReaderPreferences,
  saveReaderPreferences,
} from './reader-preferences.ts'

test.beforeEach(() => {
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

test('loads sepia as a saved theme mode', (t) => {
  localStorage.setItem(
    'tikkun.reader-preferences.v3',
    JSON.stringify({ themeMode: 'sepia' })
  )

  const preferences = loadReaderPreferences()

  t.is(preferences.themeMode, 'sepia')
})

test('falls back to the default theme for an invalid saved theme mode', (t) => {
  localStorage.setItem(
    'tikkun.reader-preferences.v3',
    JSON.stringify({ themeMode: 'chartreuse' })
  )

  const preferences = loadReaderPreferences()

  t.is(preferences.themeMode, defaultReaderPreferences.themeMode)
})

test('does not restore a saved playback rate', (t) => {
  localStorage.setItem(
    'tikkun.reader-preferences.v3',
    JSON.stringify({ playbackRate: 1.75 })
  )

  const preferences = loadReaderPreferences()

  t.is(preferences.playbackRate, defaultReaderPreferences.playbackRate)
})

test('does not persist a non-default playback rate', (t) => {
  saveReaderPreferences({
    ...defaultReaderPreferences,
    playbackRate: 1.75,
  })

  const raw = localStorage.getItem('tikkun.reader-preferences.v3')
  const stored = raw ? JSON.parse(raw) as Partial<typeof defaultReaderPreferences> : null

  t.is(stored?.playbackRate, defaultReaderPreferences.playbackRate)
})

test('applies sepia to the root theme dataset', (t) => {
  applyReaderPreferences({
    ...defaultReaderPreferences,
    themeMode: 'sepia',
  })

  t.is(document.documentElement.dataset.readerTheme, 'sepia')
})
