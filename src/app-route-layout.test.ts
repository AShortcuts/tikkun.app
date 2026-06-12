import { readFileSync } from 'node:fs'
import test from 'ava'

const indexSource = readFileSync(new URL('./index.ts', import.meta.url), 'utf8')

test('updates visibility for every matching layout target', (t) => {
  t.true(indexSource.includes('document.querySelectorAll<HTMLElement>(selector)'))
  t.false(indexSource.includes('document.querySelector<HTMLElement>(selector)'))
})

test('canonicalizes the hashless initial reader route before syncing chrome', (t) => {
  t.regex(
    indexSource,
    /parseCurrentRoute\(\)\s*\?\?\s*{[\s\S]*?view:\s*'reader' as const,[\s\S]*?canonicalHash:\s*'#\/next'/
  )
})
