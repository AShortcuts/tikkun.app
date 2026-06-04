const STORAGE_KEY = 'tikkun.reader-preferences.v3'

export const TOKENIZATION_VERSION = 'v2'

export const themeModes = ['automatic', 'light', 'sepia', 'dark'] as const

export type ThemeMode = (typeof themeModes)[number]

export interface ReaderPreferences {
  narratorId: string
  playbackRate: number
  highlightFill: string
  highlightOpacity: number
  outlineColor: string
  outlineWidth: number
  outlineOffset: number
  radius: number
  glow: number
  autoScrollWithPlayback: boolean
  disableShiftNekudotHide: boolean
  themeMode: ThemeMode
}

export const defaultReaderPreferences: ReaderPreferences = {
  narratorId: 'yoni-davidov',
  playbackRate: 1,
  highlightFill: '#ffd700',
  highlightOpacity: 0.15,
  outlineColor: '#ffd700',
  outlineWidth: 2,
  outlineOffset: 3.5,
  radius: 10,
  glow: 3.5,
  autoScrollWithPlayback: true,
  disableShiftNekudotHide: false,
  themeMode: 'automatic',
}

function rootCssValue(name: string) {
  if (typeof document === 'undefined' || typeof getComputedStyle === 'undefined') {
    return ''
  }
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

function rootCssNumber(name: string, fallback: number) {
  const value = Number.parseFloat(rootCssValue(name))
  return Number.isFinite(value) ? value : fallback
}

function rootCssColor(name: string, fallback: string) {
  return rootCssValue(name) || fallback
}

export function getDefaultReaderPreferences(): ReaderPreferences {
  return {
    ...defaultReaderPreferences,
    highlightFill: rootCssColor(
      '--reader-highlight-fill',
      defaultReaderPreferences.highlightFill
    ),
    outlineColor: rootCssColor(
      '--reader-highlight-outline-color',
      defaultReaderPreferences.outlineColor
    ),
    outlineWidth: rootCssNumber(
      '--reader-highlight-outline-width',
      defaultReaderPreferences.outlineWidth
    ),
    outlineOffset: rootCssNumber(
      '--reader-highlight-outline-offset',
      defaultReaderPreferences.outlineOffset
    ),
    radius: rootCssNumber(
      '--reader-highlight-border-radius',
      rootCssNumber('--reader-highlight-radius', defaultReaderPreferences.radius)
    ),
    glow: rootCssNumber(
      '--reader-highlight-glow',
      defaultReaderPreferences.glow
    ),
  }
}

export function getDefaultHighlightPreferences() {
  const defaults = getDefaultReaderPreferences()
  return {
    highlightFill: defaults.highlightFill,
    highlightOpacity: defaults.highlightOpacity,
    outlineColor: defaults.outlineColor,
    outlineWidth: defaults.outlineWidth,
    outlineOffset: defaults.outlineOffset,
    radius: defaults.radius,
    glow: defaults.glow,
  }
}

export function isThemeMode(value: unknown): value is ThemeMode {
  return (
    typeof value === 'string' &&
    themeModes.some((themeMode) => themeMode === value)
  )
}

export function loadReaderPreferences(): ReaderPreferences {
  const defaults = getDefaultReaderPreferences()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...defaults }
    const parsed = JSON.parse(raw) as Partial<ReaderPreferences>
    return {
      ...defaults,
      ...parsed,
      playbackRate: defaults.playbackRate,
      themeMode: isThemeMode(parsed.themeMode)
        ? parsed.themeMode
        : defaults.themeMode,
    }
  } catch {
    return { ...defaults }
  }
}

export function saveReaderPreferences(preferences: ReaderPreferences) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      ...preferences,
      playbackRate: defaultReaderPreferences.playbackRate,
    })
  )
}

export function mergeReaderPreferences(
  previous: ReaderPreferences,
  updates: Partial<ReaderPreferences>
) {
  return {
    ...previous,
    ...updates,
  }
}

export function applyReaderPreferences(preferences: ReaderPreferences) {
  const root = document.documentElement
  const fillTint = toRgba(preferences.highlightFill, preferences.highlightOpacity)
  const fillAlphaPercent = `${preferences.highlightOpacity * 100}%`
  const fillAlphaInversePercent = `${(1 - preferences.highlightOpacity) * 100}%`

  root.dataset.readerTheme = preferences.themeMode

  root.style.setProperty('--reader-highlight-fill', preferences.highlightFill)
  root.style.setProperty('--reader-highlight-fill-tint', fillTint)
  root.style.setProperty(
    '--reader-highlight-fill-alpha',
    `${preferences.highlightOpacity}`
  )
  root.style.setProperty(
    '--reader-highlight-fill-alpha-percent',
    fillAlphaPercent
  )
  root.style.setProperty(
    '--reader-highlight-fill-alpha-inverse-percent',
    fillAlphaInversePercent
  )
  root.style.setProperty(
    '--reader-highlight-outline-color',
    preferences.outlineColor
  )
  root.style.setProperty(
    '--reader-highlight-outline-width',
    `${preferences.outlineWidth}px`
  )
  root.style.setProperty('--reader-highlight-border-radius', `${preferences.radius}px`)
  root.style.setProperty('--reader-highlight-glow', `${preferences.glow}px`)
  root.style.setProperty(
    '--reader-highlight-outline-offset',
    `${preferences.outlineOffset}px`
  )
}

function toRgba(color: string, alpha: number) {
  const normalized = color.trim()
  if (!normalized.startsWith('#')) return normalized
  const hex = normalized.slice(1)
  if (hex.length !== 6 && hex.length !== 3) return normalized

  const chars = hex.length === 3 ? hex.split('').map((char) => char + char) : [
    hex.slice(0, 2),
    hex.slice(2, 4),
    hex.slice(4, 6),
  ]

  const [red, green, blue] = chars.map((value) => Number.parseInt(value, 16))
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}
