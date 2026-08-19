import { setReaderFocalPointMode, type ReaderFocalPointMode } from './reader-scroll.ts'
import {
  getBrowserStorage,
  readPersistedJson,
  writeStorageItem,
} from './persistence/persisted-state.ts'

const STORAGE_KEY = 'tikkun.reader-preferences.v3'

export const themeModes = ['automatic', 'light', 'sepia', 'dark'] as const
export const readerFocalPointModes = ['browser', 'reader'] as const

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
  focalPointMode: 'reader',
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
  return {
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
  }
}

export function loadReaderPreferences(): ReaderPreferences {
  const defaults = getDefaultReaderPreferences()
  const result = readPersistedJson({
    storage: getBrowserStorage('local'),
    key: STORAGE_KEY,
    validate: isRecord,
  })
  if (result.status === 'unavailable') {
    console.error('Failed to read reader preferences', result.error)
    return { ...defaults }
  }
  if (result.status === 'invalid') {
    if (result.reason === 'invalid-json') {
      console.error('Failed to parse reader preferences', result.error)
    }
    return { ...defaults }
  }
  if (result.status === 'missing') return { ...defaults }

  return {
    ...normalizeReaderPreferences(result.value, defaults),
    playbackRate: defaults.playbackRate,
  }
}

export function saveReaderPreferences(preferences: ReaderPreferences) {
  const normalized = normalizeReaderPreferences(
    preferences,
    getDefaultReaderPreferences()
  )
  try {
    writeStorageItem(
      getBrowserStorage('local'),
      STORAGE_KEY,
      JSON.stringify({
        ...normalized,
        playbackRate: defaultReaderPreferences.playbackRate,
      })
    )
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
  const fillTint = toRgba(preferences.highlightFill, preferences.highlightOpacity)
  const fillAlphaPercent = `${preferences.highlightOpacity * 100}%`
  const fillAlphaInversePercent = `${(1 - preferences.highlightOpacity) * 100}%`

  root.dataset.readerTheme = preferences.themeMode
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
