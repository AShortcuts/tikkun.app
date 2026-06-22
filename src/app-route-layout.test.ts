import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'

const indexSource = readFileSync(new URL('./index.ts', import.meta.url), 'utf8')

test('updates visibility for every matching layout target', () => {
  expect(indexSource.includes('document.querySelectorAll<HTMLElement>(selector)')).toBe(true)
  expect(indexSource.includes('document.querySelector<HTMLElement>(selector)')).toBe(false)
})

test('canonicalizes the hashless initial reader route before syncing chrome', () => {
  expect(indexSource).toMatch(/parseCurrentRoute\(\)\s*\?\?\s*{[\s\S]*?view:\s*'reader' as const,[\s\S]*?canonicalHash:\s*'#\/next'/)
})
