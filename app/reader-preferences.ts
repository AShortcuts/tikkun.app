import { setReaderFocalPointMode, type ReaderFocalPointMode } from './reader-scroll.ts'
import {
  blankReaderThemeColors,
  normalizeSavedReaderThemes,
  type ReaderThemeColors,
  type SavedReaderTheme,
} from './reader-themes.ts'
import {
  createPersistedJsonStore,
  getBrowserStorage,
  requirePersistedJsonMutation,
  type PersistedJsonRevision,
} from './persistence/persisted-state.ts'
import {
  isReaderSideMode,
  isReaderSideOrder,
  isReaderTextLayout,
  type ReaderSideMode,
  type ReaderSideOrder,
  type ReaderTextLayout,
} from './reader-presentation.ts'

const STORAGE_KEY = 'tikkun.reader-preferences'
export const readingFontScaleRange = { min: 0.8, max: 1.5, step: 0.05 } as const

export const themeModes = [
  'automatic',
  'light',
  'sepia',
  'dark',
  'custom',
] as const
export const readerFocalPointModes = ['browser', 'reader'] as const
export const defaultCustomThemeColors = {
  background: '#eee6d6',
  text: '#3b3026',
} as const

const preferenceRanges = {
  playbackRate: { min: 0.5, max: 3 },
  highlightOpacity: { min: 0.05, max: 0.45 },
  outlineWidth: { min: 1, max: 6 },
  outlineOffset: { min: 0, max: 10 },
  radius: { min: 0, max: 16 },
  glow: { min: 0, max: 8 },
} as const

export type ThemeMode = (typeof themeModes)[number]

export interface ReaderPreferences {
  reducedMotion: 'automatic' | 'on' | 'off'
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
  focalPointMode: ReaderFocalPointMode
  disableShiftNekudotHide: boolean
  themeMode: ThemeMode
  customBackgroundColor: string
  customTextColor: string
  savedThemes: SavedReaderTheme[]
  activeSavedThemeId: string | null
  readerTextLayout: ReaderTextLayout
  readingFontScale: number
  /** Shows pasuk numbers beside the text in both Reading and Match. */
  verseNumbers: boolean
  readerSideMode: ReaderSideMode
  readerSideOrder: ReaderSideOrder
}

export interface LoadedReaderPreferences {
  preferences: ReaderPreferences
  revision: PersistedJsonRevision | null
}

export const defaultReaderPreferences: ReaderPreferences = {
  reducedMotion: 'automatic',
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
  focalPointMode: 'reader',
  disableShiftNekudotHide: false,
  themeMode: 'automatic',
  customBackgroundColor: defaultCustomThemeColors.background,
  customTextColor: defaultCustomThemeColors.text,
  savedThemes: [{ id: 'custom-theme-1', ...blankReaderThemeColors }],
  activeSavedThemeId: null,
  readerTextLayout: 'match',
  readingFontScale: 1,
  verseNumbers: true,
  readerSideMode: 'one',
  readerSideOrder: 'tikkun-right',
}

function defaultReaderTextLayout(): ReaderTextLayout {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return defaultReaderPreferences.readerTextLayout
  }
  return window.matchMedia('(max-width: 550px)').matches ? 'reading' : 'match'
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
    savedThemes: defaultReaderPreferences.savedThemes.map((theme) => ({ ...theme })),
    readerTextLayout: defaultReaderTextLayout(),
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
  return {
    highlightFill: defaultReaderPreferences.highlightFill,
    highlightOpacity: defaultReaderPreferences.highlightOpacity,
    outlineColor: defaultReaderPreferences.outlineColor,
    outlineWidth: defaultReaderPreferences.outlineWidth,
    outlineOffset: defaultReaderPreferences.outlineOffset,
    radius: defaultReaderPreferences.radius,
    glow: defaultReaderPreferences.glow,
  }
}

export function isThemeMode(value: unknown): value is ThemeMode {
  return (
    typeof value === 'string' &&
    themeModes.some((themeMode) => themeMode === value)
  )
}

export function isReaderFocalPointMode(
  value: unknown
): value is ReaderFocalPointMode {
  return (
    typeof value === 'string' &&
    readerFocalPointModes.some((mode) => mode === value)
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizedNumber(
  value: unknown,
  fallback: number,
  { min, max }: { min: number; max: number }
) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(min, Math.min(max, value))
    : fallback
}

function normalizedColor(value: unknown, fallback: string) {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
    ? value
    : fallback
}

function normalizeReaderPreferences(
  value: unknown,
  defaults: ReaderPreferences
): ReaderPreferences {
  const candidate = isRecord(value) ? value : {}
  const savedThemes = normalizeSavedReaderThemes(candidate.savedThemes, defaults.savedThemes)
  return {
    reducedMotion: candidate.reducedMotion === 'on' || candidate.reducedMotion === 'off'
      || candidate.reducedMotion === 'automatic' ? candidate.reducedMotion : defaults.reducedMotion,
    narratorId:
      typeof candidate.narratorId === 'string' && candidate.narratorId.trim()
        ? candidate.narratorId.trim()
        : defaults.narratorId,
    playbackRate: normalizedNumber(
      candidate.playbackRate,
      defaults.playbackRate,
      preferenceRanges.playbackRate
    ),
    highlightFill: normalizedColor(candidate.highlightFill, defaults.highlightFill),
    highlightOpacity: normalizedNumber(
      candidate.highlightOpacity,
      defaults.highlightOpacity,
      preferenceRanges.highlightOpacity
    ),
    outlineColor: normalizedColor(candidate.outlineColor, defaults.outlineColor),
    outlineWidth: normalizedNumber(
      candidate.outlineWidth,
      defaults.outlineWidth,
      preferenceRanges.outlineWidth
    ),
    outlineOffset: normalizedNumber(
      candidate.outlineOffset,
      defaults.outlineOffset,
      preferenceRanges.outlineOffset
    ),
    radius: normalizedNumber(candidate.radius, defaults.radius, preferenceRanges.radius),
    glow: normalizedNumber(candidate.glow, defaults.glow, preferenceRanges.glow),
    autoScrollWithPlayback:
      typeof candidate.autoScrollWithPlayback === 'boolean'
        ? candidate.autoScrollWithPlayback
        : defaults.autoScrollWithPlayback,
    focalPointMode: isReaderFocalPointMode(candidate.focalPointMode)
      ? candidate.focalPointMode
      : defaults.focalPointMode,
    disableShiftNekudotHide:
      typeof candidate.disableShiftNekudotHide === 'boolean'
        ? candidate.disableShiftNekudotHide
        : defaults.disableShiftNekudotHide,
    themeMode: isThemeMode(candidate.themeMode)
      ? candidate.themeMode
      : defaults.themeMode,
    customBackgroundColor: normalizedColor(
      candidate.customBackgroundColor,
      defaults.customBackgroundColor
    ),
    customTextColor: normalizedColor(
      candidate.customTextColor,
      defaults.customTextColor
    ),
    savedThemes,
    activeSavedThemeId: savedThemes.find((theme) => theme.id === candidate.activeSavedThemeId)?.id ?? null,
    readerTextLayout: isReaderTextLayout(candidate.readerTextLayout)
      ? candidate.readerTextLayout
      : defaults.readerTextLayout,
    readingFontScale: normalizedNumber(
      candidate.readingFontScale,
      defaults.readingFontScale,
      readingFontScaleRange
    ),
    verseNumbers:
      typeof candidate.verseNumbers === 'boolean'
        ? candidate.verseNumbers
        : defaults.verseNumbers,
    readerSideMode: isReaderSideMode(candidate.readerSideMode)
      ? candidate.readerSideMode
      : defaults.readerSideMode,
    readerSideOrder: isReaderSideOrder(candidate.readerSideOrder)
      ? candidate.readerSideOrder
      : defaults.readerSideOrder,
  }
}

function createReaderPreferencesStore() {
  return createPersistedJsonStore({
    storage: getBrowserStorage('local'),
    key: STORAGE_KEY,
    validate: isRecord,
  })
}

export function loadReaderPreferences(): ReaderPreferences {
  return loadReaderPreferencesState().preferences
}

export function loadReaderPreferencesState(): LoadedReaderPreferences {
  const defaults = getDefaultReaderPreferences()
  const store = createReaderPreferencesStore()
  const result = store.read()
  if (result.status === 'unavailable') {
    console.error('Failed to read reader preferences', result.error)
    return { preferences: { ...defaults }, revision: null }
  }
  if (result.status === 'invalid') {
    if (result.reason === 'invalid-json') {
      console.error('Failed to parse reader preferences', result.error)
    } else {
      console.error('Invalid reader preferences')
    }
    return { preferences: { ...defaults }, revision: result.revision }
  }
  if (result.status === 'missing') {
    return { preferences: { ...defaults }, revision: result.revision }
  }
  const preferences = {
    ...normalizeReaderPreferences(result.value, defaults),
    playbackRate: defaults.playbackRate,
  }
  return { preferences, revision: result.revision }
}

export function saveReaderPreferences(
  preferences: ReaderPreferences,
  expectedRevision?: PersistedJsonRevision | null
) {
  const normalized = normalizeReaderPreferences(
    preferences,
    getDefaultReaderPreferences()
  )
  try {
    const store = createReaderPreferencesStore()
    const payload = {
      ...normalized,
      playbackRate: defaultReaderPreferences.playbackRate,
    }
    let revision = expectedRevision
    if (!revision) {
      const current = store.read()
      if (current.status === 'unavailable') throw current.error
      revision = current.revision
    }
    return requirePersistedJsonMutation(store.write(payload, revision))
  } catch (error) {
    throw new ReaderPreferencesStorageError(error)
  }
}

export class ReaderPreferencesStorageError extends Error {
  readonly cause: unknown

  constructor(cause: unknown) {
    super('Failed to save reader preferences')
    this.name = 'ReaderPreferencesStorageError'
    this.cause = cause
  }
}

export function mergeReaderPreferences(
  previous: ReaderPreferences,
  updates: Partial<ReaderPreferences>
) {
  return normalizeReaderPreferences({
    ...previous,
    ...updates,
  }, previous)
}

export function applyReaderPreferences(preferences: ReaderPreferences) {
  const root = document.documentElement
  const colors = getCustomThemeColors(preferences)
  const interfaceColors = customThemeInterfaceColors(colors.background)
  root.dataset.readerReducedMotion = preferences.reducedMotion
  const fillTint = toRgba(preferences.highlightFill, preferences.highlightOpacity)
  const fillAlphaPercent = `${preferences.highlightOpacity * 100}%`
  const fillAlphaInversePercent = `${(1 - preferences.highlightOpacity) * 100}%`

  root.dataset.readerTheme = preferences.themeMode
  root.dataset.readerTextLayout = preferences.readerTextLayout
  root.style.setProperty('--reading-font-scale', String(preferences.readingFontScale))
  root.dataset.verseNumbers = preferences.verseNumbers ? 'on' : 'off'
  root.dataset.readerSideMode = preferences.readerSideMode
  root.dataset.readerSideOrder = preferences.readerSideOrder
  root.style.setProperty(
    '--reader-custom-background-color',
    colors.background
  )
  root.style.setProperty(
    '--reader-custom-text-color',
    colors.text
  )
  root.style.setProperty('--reader-custom-ui-text-color', interfaceColors.text)
  root.style.setProperty('--reader-custom-ui-secondary-color', interfaceColors.secondary)
  root.style.colorScheme = preferences.themeMode === 'custom' ? interfaceColors.scheme : ''
  root.dataset.readerCustomScheme = root.style.colorScheme
  setReaderFocalPointMode(preferences.focalPointMode)

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

export function getCustomThemeColors(preferences: ReaderPreferences): ReaderThemeColors {
  return preferences.savedThemes.find((theme) => theme.id === preferences.activeSavedThemeId)
    ?? { background: preferences.customBackgroundColor, text: preferences.customTextColor }
}

export function customThemeColorUpdates(
  preferences: ReaderPreferences,
  colors: Partial<ReaderThemeColors>
): Partial<ReaderPreferences> {
  if (preferences.activeSavedThemeId) {
    return {
      themeMode: 'custom',
      savedThemes: preferences.savedThemes.map((theme) => theme.id === preferences.activeSavedThemeId
        ? { ...theme, ...colors }
        : theme),
    }
  }
  return {
    themeMode: 'custom',
    customBackgroundColor: colors.background ?? preferences.customBackgroundColor,
    customTextColor: colors.text ?? preferences.customTextColor,
  }
}

export function colorContrastRatio(background: string, text: string) {
  const lighter = Math.max(
    relativeLuminance(background),
    relativeLuminance(text)
  )
  const darker = Math.min(
    relativeLuminance(background),
    relativeLuminance(text)
  )
  return (lighter + 0.05) / (darker + 0.05)
}

export function recommendedThemeTextColor(background: string) {
  const dark = '#191c22'
  const light = '#f8f7f3'
  return colorContrastRatio(background, dark) >=
    colorContrastRatio(background, light)
    ? dark
    : light
}

export function customThemeInterfaceColors(background: string) {
  const darkInk = colorContrastRatio(background, '#000000') >= colorContrastRatio(background, '#ffffff')
  const ink = darkInk ? '#000000' : '#ffffff'
  const tintedInk = (weight: number) => {
    const color = '#' + hexChannels(background).map((channel) =>
      Math.round(channel * (1 - weight) + (darkInk ? 0 : 255) * weight)
        .toString(16).padStart(2, '0')
    ).join('')
    return colorContrastRatio(background, color) >= 4.5 ? color : ink
  }
  return {
    scheme: darkInk ? 'light' : 'dark',
    text: tintedInk(0.9),
    secondary: tintedInk(0.72),
  }
}

function relativeLuminance(color: string) {
  const [red, green, blue] = hexChannels(color).map((channel) => {
    const value = channel / 255
    return value <= 0.04045
      ? value / 12.92
      : ((value + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

function hexChannels(color: string) {
  const match = /^#([0-9a-f]{6})$/i.exec(color.trim())
  if (!match) return [0, 0, 0]
  return [0, 2, 4].map((offset) =>
    Number.parseInt(match[1].slice(offset, offset + 2), 16)
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
