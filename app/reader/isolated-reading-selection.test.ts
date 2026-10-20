import { expect, test } from 'vitest'
import { LeiningGenerator } from '../calendar-model/generator.ts'
import { resolveParshaRun } from '../view-model/navigation/parsha-routes.ts'
import { ScrollViewModel } from '../view-model/scroll-view-model.ts'
import { loadPassageTokens } from '../audio/passage-tokens.ts'
import { entryAtReference, initialIsolatedEntry, isolatedEntryForToken } from './isolated-reading-selection.ts'

const generator = new LeiningGenerator({ ashkenazi: true, israel: false, includeModernHolidays: false })

function reading(slug = 'beresheet') {
  const resolved = resolveParshaRun(generator, slug)
  if (!resolved) throw new Error(`Missing test reading ${slug}`)
  return resolved.run
}

test('legacy references prefer an exact start, then the last containing division', () => {
  const run = reading()
  const maftir = run.aliyot.find(aliyah => aliyah.index === 'Maftir')!
  expect(entryAtReference(run, maftir.start)?.aliyah.index).toBe('Maftir')
  expect(entryAtReference(run, maftir.end)?.aliyah.index).toBe('Maftir')
  expect(entryAtReference(run, maftir.start, { runId: run.id, aliyahIndex: 7 })?.aliyah.index).toBe(7)
})

test('initial selection preserves explicit overlap identity and excludes physical-page routes', async () => {
  const run = reading()
  const model = ScrollViewModel.forRun(generator, run)!
  const page = ScrollViewModel.forRun(generator, run, { scroll: 'torah', pageNumber: 1 })!
  await Promise.all([model.startingLocation, page.startingLocation])
  expect(initialIsolatedEntry(model)?.aliyah.index).toBe(1)
  expect(initialIsolatedEntry(model, { runId: run.id, aliyahIndex: 'Maftir' })?.aliyah.index).toBe('Maftir')
  expect(initialIsolatedEntry(page)).toBeNull()
})

test('a saved token selects its actual aliyah despite an earlier hash reference', async () => {
  const run = reading('beshalach')
  const model = ScrollViewModel.forRun(generator, run)!
  await model.startingLocation
  const first = initialIsolatedEntry(model)!
  const fourth = run.aliyot.find(aliyah => aliyah.index === 4)!
  const tokens = await loadPassageTokens(fourth)
  const result = await isolatedEntryForToken(model, tokens[1], first, () => true)
  expect(result?.aliyah.index).toBe(4)
  expect(result?.run.id).toBe(run.id)
})

test('superseded bookmark resolution does not choose a passage', async () => {
  const run = reading()
  const model = ScrollViewModel.forRun(generator, run)!
  await model.startingLocation
  const first = initialIsolatedEntry(model)!
  expect(await isolatedEntryForToken(model, '1:0:0:0', first, () => false)).toBeNull()
})
