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
const dark = { background: 'oklch(25% 0 0)', text: 'oklch(100% 0 0 / 0.7)', scheme: 'dark' } as const

interface ThemeCase {
  name: string
  system: 'light' | 'dark'
  preferences: object | string | null
  background: string
  text: string
  scheme: 'light' | 'dark'
}

const cases: ThemeCase[] = [
  { name: 'dark on a light system', system: 'light', preferences: { themeMode: 'dark' }, ...dark },
  { name: 'corrupt storage on a dark system', system: 'dark', preferences: '{invalid json', ...dark },
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
