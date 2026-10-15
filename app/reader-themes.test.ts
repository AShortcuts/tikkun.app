import { expect, test } from 'vitest'
import { parseReaderTheme, serializeReaderTheme } from './reader-themes.ts'

test('theme configs round-trip only page and text colors', () => {
  const config = serializeReaderTheme({ background: '#ABCDEF', text: '#123456' })
  expect(parseReaderTheme(config)).toEqual({ background: '#ABCDEF', text: '#123456' })
  const extra = { ...JSON.parse(config), narratorId: 'other-reader', savedThemes: [], activeSavedThemeId: 'other' }
  expect(parseReaderTheme(JSON.stringify(extra))).toEqual({ background: '#ABCDEF', text: '#123456' })
})

test.each([
  '', 'not json', 'null', '[]', '{}',
  JSON.stringify({ type: 'tikkun-reader-theme', version: 2, background: '#ffffff', text: '#000000' }),
  JSON.stringify({ type: 'tikkun-reader-theme', version: 1, background: 'red', text: '#000000' }),
  JSON.stringify({ type: 'tikkun-reader-theme', version: 1, background: '#ffffff' }),
])('rejects invalid or unsupported theme config %s', (config) => {
  expect(() => parseReaderTheme(config)).toThrow()
})
