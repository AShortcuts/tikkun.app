import { afterEach, expect, test } from 'vitest'
import { commands } from 'vitest/browser'
import appTemplate from './app.html?raw'
import readerStyles from '../css/master.css?inline'
import readerTheme from '../css/reader-theme.css?raw'
import { customThemeInterfaceColors } from '../app/reader-preferences.ts'

let frame: HTMLIFrameElement | null = null
let savedPreferences: string | null = null
const storageKey = 'tikkun.reader-preferences'

declare module 'vitest/internal/browser' {
  interface BrowserCommands {
    emulateColorScheme(scheme: 'light' | 'dark' | null): Promise<void>
  }
}

afterEach(async () => {
  frame?.remove()
  frame = null
  if (savedPreferences === null) localStorage.removeItem(storageKey)
  else localStorage.setItem(storageKey, savedPreferences)
  await commands.emulateColorScheme(null)
})

const light = { background: 'oklch(98.5% 0 0)', text: 'oklch(0% 0 0 / 0.7)', scheme: 'light' } as const
const dark = { background: 'oklch(25% 0 0)', text: 'oklch(100% 0 0 / 0.7)', scheme: 'dark' } as const
const custom = { background: '#112233', text: '#f4f1e8', scheme: 'dark' } as const
const customPreferences = { themeMode: 'custom', customBackgroundColor: custom.background, customTextColor: custom.text }

interface ThemeCase {
  name: string
  system: 'light' | 'dark'
  preferences: object | string | null
  background: string
  text: string
  scheme: 'light' | 'dark'
}

const cases: ThemeCase[] = [
  { name: 'light on a dark system', system: 'dark', preferences: { themeMode: 'light' }, ...light },
  { name: 'dark on a light system', system: 'light', preferences: { themeMode: 'dark' }, ...dark },
  { name: 'sepia', system: 'dark', preferences: { themeMode: 'sepia' }, ...light, background: 'oklch(90% 17% 90deg)' },
  { name: 'system light', system: 'light', preferences: { themeMode: 'automatic' }, ...light },
  { name: 'system dark', system: 'dark', preferences: { themeMode: 'automatic' }, ...dark },
  { name: 'new user on a dark system', system: 'dark', preferences: null, ...dark },
  { name: 'corrupt storage on a dark system', system: 'dark', preferences: '{invalid json', ...dark },
  { name: 'original custom theme', system: 'light', preferences: customPreferences, ...custom },
  { name: 'light custom theme', system: 'dark', preferences: { themeMode: 'custom', customBackgroundColor: '#edf4e6', customTextColor: '#264221' }, background: '#edf4e6', text: '#264221', scheme: 'light' },
  { name: 'mid-tone custom theme with faint reader text', system: 'dark', preferences: { themeMode: 'custom', customBackgroundColor: '#777777', customTextColor: '#999999' }, background: '#777777', text: '#999999', scheme: 'light' },
  { name: 'saved custom circle', system: 'light', preferences: { ...customPreferences, activeSavedThemeId: 'saved', savedThemes: [{ id: 'saved', background: '#243622', text: '#effae5' }] }, background: '#243622', text: '#effae5', scheme: 'dark' },
  { name: 'deleted custom circle', system: 'dark', preferences: { ...customPreferences, activeSavedThemeId: 'deleted', savedThemes: [] }, ...custom },
  { name: 'invalid saved colors', system: 'light', preferences: { ...customPreferences, activeSavedThemeId: 'saved', savedThemes: [{ id: 'saved', background: 'invalid', text: '#ffffff' }] }, ...custom },
  { name: 'valid circle after invalid entries', system: 'light', preferences: { ...customPreferences, activeSavedThemeId: 'saved', savedThemes: [null, {}, {}, {}, {}, { id: 'saved', background: '#243622', text: '#effae5' }] }, background: '#243622', text: '#effae5', scheme: 'dark' },
  { name: 'default circle in older preferences', system: 'dark', preferences: { ...customPreferences, activeSavedThemeId: 'custom-theme-1' }, background: '#e5e5e5', text: '#191c22', scheme: 'light' },
]

test.each(cases)('paints $name before any reader styles or app code load', async ({ system, preferences, background, text, scheme }) => {
  savedPreferences = localStorage.getItem(storageKey)
  await commands.emulateColorScheme(system)
  if (preferences === null) localStorage.removeItem(storageKey)
  else localStorage.setItem(storageKey, typeof preferences === 'string' ? preferences : JSON.stringify(preferences))
  frame = document.createElement('iframe')
  frame.srcdoc = appTemplate
    .replace('%sveltekit.head%', `<style data-reader-theme-critical>${readerTheme}</style><meta id="reader-theme-color" name="theme-color" content="">`)
    .replace('%sveltekit.body%', '<main data-target-id="app-root">Opening Reader...<article class="tikkun-page"><span class="word">Reader text</span></article></main>')
    .replaceAll('%sveltekit.assets%', '')
  const loaded = new Promise<void>((resolve) => frame?.addEventListener('load', () => resolve(), { once: true }))
  document.body.append(frame)
  await loaded
  const view = frame.contentWindow!
  const doc = frame.contentDocument!
  await new Promise<void>((resolve) => view.requestAnimationFrame(() => view.requestAnimationFrame(() => resolve())))
  const probe = doc.createElement('span')
  const isCustom = doc.documentElement.dataset.readerTheme === 'custom'
  probe.style.backgroundColor = background
  probe.style.color = isCustom ? customThemeInterfaceColors(background).text : text
  doc.body.append(probe)
  const expectedBackground = view.getComputedStyle(probe).backgroundColor
  const expectedText = view.getComputedStyle(probe).color
  probe.style.backgroundColor = ''
  probe.style.backgroundColor = doc.querySelector<HTMLMetaElement>('#reader-theme-color')!.content
  expect(view.getComputedStyle(probe).backgroundColor, 'browser theme color before hydration').toBe(expectedBackground)
  const assertTheme = () => {
    expect(view.getComputedStyle(doc.documentElement).backgroundColor, 'canvas color').toBe(expectedBackground)
    expect(view.getComputedStyle(doc.body).backgroundColor, 'body color').toBe(expectedBackground)
    expect(view.getComputedStyle(doc.body).color, 'text color').toBe(expectedText)
    expect(view.getComputedStyle(doc.documentElement).colorScheme).toBe(scheme)
  }
  assertTheme()
  const styles = doc.createElement('style')
  styles.textContent = readerStyles
  doc.head.append(styles)
  assertTheme()
  if (isCustom) {
    probe.style.color = text
    expect(view.getComputedStyle(doc.querySelector('.word')!).color, 'exact chosen reader text').toBe(view.getComputedStyle(probe).color)
    const secondary = doc.documentElement.style.getPropertyValue('--reader-custom-ui-secondary-color')
    expect(secondary, 'early palette matches runtime').toBe(customThemeInterfaceColors(background).secondary)
  }
})
