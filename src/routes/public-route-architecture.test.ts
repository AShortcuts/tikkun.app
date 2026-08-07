import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'

const siteLayout = readFileSync(
  new URL('./(site)/+layout.svelte', import.meta.url),
  'utf8'
)
const readerPage = readFileSync(
  new URL('./reader/+page.svelte', import.meta.url),
  'utf8'
)
const readerApp = readFileSync(
  new URL('../lib/components/ReaderApp.svelte', import.meta.url),
  'utf8'
)
const tidbitsPage = readFileSync(
  new URL('./(site)/tidbits/+page.svelte', import.meta.url),
  'utf8'
)
const homeCss = readFileSync(
  new URL('../../css/home.css', import.meta.url),
  'utf8'
)

test('keeps public paths clean while preserving the Reader hash boundary', () => {
  expect(siteLayout).toContain("resolve('/readings/')")
  expect(siteLayout).toContain("resolve('/tidbits/')")
  expect(siteLayout).toContain("resolve('/about/')")
  expect(siteLayout).toContain("resolve('/reader/#/next')")
  expect(siteLayout).toContain("hashPath === '#/about'")
  expect(siteLayout).not.toContain("hashPath.startsWith('#/about/')")
  expect(readerPage).toContain("import ReaderApp from '$lib/components/ReaderApp.svelte'")
  expect(readerApp).toContain("import('../../../app/index.ts')")
  expect(readerApp).toContain('data-target-id="reader-shell-anchor"')
})

test('uses an explicit empty state instead of fabricated Tidbit content', () => {
  expect(tidbitsPage).toContain('No tidbits published yet.')
  expect(tidbitsPage).not.toMatch(/lorem|placeholder|coming soon/i)
})

test('styles the public ready status emitted by the coverage model', () => {
  expect(homeCss).toContain('.home-reading-status.mod-ready')
  expect(homeCss).not.toContain('.home-reading-status.mod-complete')
})
