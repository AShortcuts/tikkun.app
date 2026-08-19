export const PUBLIC_THEME_CONTEXT = Symbol('apple-sentient-prototype-theme')

export const PUBLIC_THEME_STORAGE_KEY = 'tikkun-apple-sentient-prototype-theme'

export const publicThemes = ['automatic', 'light', 'sepia', 'dark'] as const

export type PublicTheme = (typeof publicThemes)[number]
export type ResolvedPublicTheme = Exclude<PublicTheme, 'automatic'>

export type PublicThemeContext = {
  readonly theme: PublicTheme
  readonly resolvedTheme: ResolvedPublicTheme
  setTheme: (theme: PublicTheme) => void
}

export function isPublicTheme(value: unknown): value is PublicTheme {
  return typeof value === 'string' && publicThemes.includes(value as PublicTheme)
}
