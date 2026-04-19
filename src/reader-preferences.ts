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
  radius: 4,
  glow: 3.5,
  autoScrollWithPlayback: true,
  disableShiftNekudotHide: false,
  themeMode: 'automatic',
}

export const defaultHighlightPreferences = {
  highlightFill: defaultReaderPreferences.highlightFill,
  highlightOpacity: defaultReaderPreferences.highlightOpacity,
  outlineColor: defaultReaderPreferences.outlineColor,
  outlineWidth: defaultReaderPreferences.outlineWidth,
  radius: defaultReaderPreferences.radius,
  glow: defaultReaderPreferences.glow,
} as const

export function isThemeMode(value: unknown): value is ThemeMode {
  return (
    typeof value === 'string' &&
    themeModes.some((themeMode) => themeMode === value)
  )
}

export function loadReaderPreferences(): ReaderPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...defaultReaderPreferences }
    const parsed = JSON.parse(raw) as Partial<ReaderPreferences>
    return {
      ...defaultReaderPreferences,
      ...parsed,
      themeMode: isThemeMode(parsed.themeMode)
        ? parsed.themeMode
        : defaultReaderPreferences.themeMode,
    }
  } catch {
    return { ...defaultReaderPreferences }
  }
}

export function saveReaderPreferences(preferences: ReaderPreferences) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences))
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

  root.dataset.readerTheme = preferences.themeMode

  root.style.setProperty('--reader-highlight-fill', preferences.highlightFill)
  root.style.setProperty('--reader-highlight-fill-tint', fillTint)
  root.style.setProperty(
    '--reader-highlight-fill-alpha',
    `${preferences.highlightOpacity}`
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
    `${preferences.glow}px`
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
