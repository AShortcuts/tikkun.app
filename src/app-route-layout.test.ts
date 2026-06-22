import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'

const indexSource = readFileSync(new URL('./index.ts', import.meta.url), 'utf8')

test('updates visibility for every matching layout target', () => {
  const [, setVisibilityBody] =
    indexSource.match(/(const setVisibility = [\s\S]*?\n}\n)\nconst getAdminPanel/) ?? []

  expect(setVisibilityBody).toContain('document.querySelectorAll<HTMLElement>(selector)')
  expect(setVisibilityBody).not.toContain('document.querySelector<HTMLElement>(selector)')
})

test('canonicalizes the hashless initial reader route before syncing chrome', () => {
  expect(indexSource).toMatch(/parseCurrentRoute\(\)\s*\?\?\s*{[\s\S]*?view:\s*'reader' as const,[\s\S]*?canonicalHash:\s*'#\/next'/)
})

test('briefly reveals absolute page numbers for page routes only', () => {
  expect(indexSource).toMatch(/void rendered\.then\(\(\) => revealPageNumberForRoute\(nextReaderHash\)\)/)
  expect(indexSource).toMatch(/function pageNumberFromPageRouteHash\(hash: string \| null\)[\s\S]*\^#\\\/\(\?:torah\|esther\)\\\/page\\\/\(\\d\+\)\$/)
  expect(indexSource).toMatch(/marker\.classList\.add\('mod-route-reveal'\)/)
  expect(indexSource).toMatch(/marker\.classList\.remove\('mod-route-reveal'\)/)
})
