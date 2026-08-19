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
const readingsPage = readFileSync(
  new URL('./(site)/readings/+page.svelte', import.meta.url),
  'utf8'
)
const readingCoverageSearch = readFileSync(
  new URL(
    './(site)/readings/reading-coverage-search.ts',
    import.meta.url
  ),
  'utf8'
)
const parshaRouteCatalog = readFileSync(
  new URL(
    '../../app/view-model/navigation/parsha-route-catalog.ts',
    import.meta.url
  ),
  'utf8'
)
const readingsModel = readFileSync(
  new URL('../lib/readings.ts', import.meta.url),
  'utf8'
)
const aboutPage = readFileSync(
  new URL('./(site)/about/+page.svelte', import.meta.url),
  'utf8'
)
const readingCard = readFileSync(
  new URL('../lib/components/ReadingCard.svelte', import.meta.url),
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

test('keeps the mobile navigation dismissible and restores focus', () => {
  expect(siteLayout).toContain('handleDocumentPointerDown')
  expect(siteLayout).toContain("event.key !== 'Escape'")
  expect(siteLayout).toContain("querySelector<HTMLElement>('summary')?.focus")
})

test('makes the coverage catalog searchable and filterable', () => {
  expect(readingsPage).toContain('createReadingCoverageSearch(readingCoverage)')
  expect(readingsPage).toContain('bind:value={coverageQuery}')
  expect(readingsPage).toContain('aria-pressed={coverageFilter === option.value}')
  expect(readingsPage).toContain('aria-live="polite"')
  expect(readingsPage).toContain('Showing {filteredCoverage.length} of {readingCoverage.length} readings')
  expect(readingCoverageSearch).toContain('matchesCoverageFilter(item, filter)')
})

test('keeps the public search engine out of the shared homepage model', () => {
  expect(readingCoverageSearch).toContain("from '../../../../app/search/index.ts'")
  expect(readingCoverageSearch).toContain('parsha-route-catalog.ts')
  expect(readingCoverageSearch).not.toContain('parsha-routes.ts')
  expect(parshaRouteCatalog).not.toMatch(/@hebcal|calendar-model\/generator/)
  expect(readingsModel).not.toMatch(/fuse\.js|app\/search|reading-coverage-search/)
})

test('restores cue-state aliyah actions without nesting links', () => {
  expect(readingsPage).toContain('aliyah-status-legend')
  expect(readingCard).toContain('interactive')
  expect(readingCard).toContain('aria-label={`${reading.parshaName} aliyot`}')
  expect(readingCard).toContain('<article class="home-reading-card">')
  expect(readingCard).not.toContain('<a\n  class="home-reading-card"')
})

test('keeps cue analytics and the project taskboard discoverable', () => {
  expect(aboutPage).toContain("resolve('/reader/#/about/playback-analytics')")
  expect(aboutPage).toContain('projectStatusRows')
  expect(aboutPage).toContain('id="taskboard-title"')
})
