export interface ReaderThemeColors {
  background: string
  text: string
}

export interface SavedReaderTheme extends ReaderThemeColors {
  id: string
}

export const maxSavedReaderThemes = 5
export const blankReaderThemeColors: ReaderThemeColors = {
  background: '#e5e5e5',
  text: '#191c22',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isThemeColors(value: unknown): value is ReaderThemeColors {
  return isRecord(value)
    && typeof value.background === 'string' && /^#[0-9a-f]{6}$/i.test(value.background)
    && typeof value.text === 'string' && /^#[0-9a-f]{6}$/i.test(value.text)
}

export function normalizeSavedReaderThemes(
  value: unknown,
  fallback: readonly SavedReaderTheme[]
): SavedReaderTheme[] {
  if (!Array.isArray(value)) return fallback.map((theme) => ({ ...theme }))
  const themes: SavedReaderTheme[] = []
  for (const candidate of value) {
    if (!isRecord(candidate) || !isThemeColors(candidate)
      || typeof candidate.id !== 'string' || !candidate.id.trim()
      || themes.some((theme) => theme.id === candidate.id)) continue
    themes.push({ id: candidate.id, background: candidate.background, text: candidate.text })
    if (themes.length === maxSavedReaderThemes) break
  }
  return themes
}

export function serializeReaderTheme(colors: ReaderThemeColors): string {
  return JSON.stringify({
    type: 'tikkun-reader-theme',
    version: 1,
    background: colors.background,
    text: colors.text,
  }, null, 2)
}

export function parseReaderTheme(config: string): ReaderThemeColors {
  let value: unknown
  try {
    value = JSON.parse(config)
  } catch {
    throw new Error('This is not a theme config. Copy a theme, then paste it here.')
  }
  if (!isRecord(value) || value.type !== 'tikkun-reader-theme' || value.version !== 1) {
    throw new Error('This theme format is not supported. Copy a theme from Tikkun Reader.')
  }
  if (!isThemeColors(value)) {
    throw new Error('The theme needs valid background and text colors, such as #123456.')
  }
  return { background: value.background, text: value.text }
}
