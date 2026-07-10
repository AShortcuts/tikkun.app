import { expect, test, type TestContext } from 'vitest'
import { LeiningGenerator } from '../calendar-model/generator.ts'
import type { UserSettings } from '../calendar-model/user-settings.ts'
import {
  type RenderedEntry,
  type RenderedLineInfo,
  ScrollViewModel,
} from './scroll-view-model.ts'
import { last } from '../calendar-model/utils.ts'
import { fetchPages, renderLine } from './test-utils.ts'
import { containsRef } from '../calendar-model/ref-utils.ts'

const testSettings: UserSettings = {
  ashkenazi: true,
  includeModernHolidays: false,
  israel: false,
}

const generator = new LeiningGenerator(testSettings)

test('deduplicates concurrent page-data fetches', async () => {
  const model = ScrollViewModel.forId(generator, '2026-10-17:shacharis,main', {
    scroll: 'torah',
    b: 1,
    c: 9,
    v: 18,
  })
  if (!model) throw new Error('Noach model not found')
  const resolver = await model.resolver
  const target = resolver.physicalLocationFromRef({
    scroll: 'torah',
    b: 1,
    c: 8,
    v: 15,
  })

  const [first, second] = await Promise.all([
    model.fetchPageByPageNumber(target.pageNumber),
    model.fetchPageByPageNumber(target.pageNumber),
  ])

  expect(first).toBe(second)
})

// Note: We cover the runs included in HolidayViewModel in aliyah-labeller.test.ts
// This also includes fetchPreviousPage() and fetchNextPage()

test('selects first line of ראש השנה', async () => {
  expect(await renderFirstLine('2024-10-04:shacharis,main')).toMatchSnapshot()
})
test('selects first line of פרשת האזינו', async () => {
  expect(await renderFirstLine('2024-10-05:shacharis,main')).toMatchSnapshot()
})
test('selects first line of פרשת בראשית', async () => {
  expect(await renderFirstLine('2024-10-26:shacharis,main')).toMatchSnapshot()
})
test('selects first line of פרשת ויחי', async () => {
  expect(await renderFirstLine('2025-01-11:shacharis,main')).toMatchSnapshot()
})

test(`ignores פרשת פרה when labelling פרשת חקת`, async () => {
  // Make sure we don't label this as מפטיר from פרה, which appears first in the array of runs.
  expect(await renderFirstLine('2025-07-05:shacharis,main')).toMatch(/חקת/)
})

test('forDate on שבת', async () => {
  expect(await renderScroll(
      ScrollViewModel.forId(generator, '2025-01-11:shacharis,main')
    )).toEqual(await renderScroll(
      ScrollViewModel.forDate(generator, new Date(2025, 0, 11))
    ))
})
test('forDate before שבת', async () => {
  expect(await renderScroll(
      ScrollViewModel.forId(generator, '2025-01-18:shacharis,main')
    )).toEqual(await renderScroll(
      ScrollViewModel.forDate(generator, new Date(2025, 0, 14))
    ))
})

test('forDate on צום גדליה', async () => {
  expect(await renderScroll(
      ScrollViewModel.forId(generator, '2024-10-06:shacharis,main')
    )).toEqual(await renderScroll(ScrollViewModel.forDate(generator, new Date(2024, 9, 6))))
})

// TODO(haftara): Enable after this can read איכה.
test.skip('forDate before תשעה באב', async () => {
  expect(await renderScroll(
      ScrollViewModel.forId(generator, '2024-8-13:shacharis,main')
    )).toEqual(await renderScroll(
      ScrollViewModel.forDate(generator, new Date(2024, 7, 11))
    ))
})

test('forDate on סוכות', async () => {
  expect(await renderScroll(
      ScrollViewModel.forId(generator, '2024-10-17:shacharis,main')
    )).toEqual(await renderScroll(
      ScrollViewModel.forDate(generator, new Date(2024, 9, 17))
    ))
})
test('forDate before סוכות', async () => {
  expect(await renderScroll(
      ScrollViewModel.forId(generator, '2024-10-17:shacharis,main')
    )).toEqual(await renderScroll(
      ScrollViewModel.forDate(generator, new Date(2024, 9, 13))
    ))
})

test('assigns a run and aliyah to every verse in full torah', async () => {
  // Start from a random regular פרשה, in a Hebrew calendar year that does
  // not contain וילך.
  const model = ScrollViewModel.forId(generator, '2025-05-24:shacharis,main')

  const pages = await fetchPages(model, {
    fetchPreviousPages: false,
    count: 500,
  })

  for (const page of pages) {
    if (page.type !== 'page')
      throw new Error(`Unexpected message "${page.text}" in plain חומש`)
    for (const line of page.lines) {
      // Lines that continue the previous page's פסוק are unlabelled.
      // This is fine.
      if (!line.verses.length) continue
      const message = renderLine(line)
      expect(line.run, message).toBeTruthy()
      expect(line.aliyot, message).not.toEqual([])
      expect(line.aliyot.every((a) => containsRef(a, line.verses)), `Aliyot ${dumpAliyot(line)} don't match line ${message}`).toBeTruthy()
      expect(line.aliyot.every((a) => line.run?.aliyot.includes(a))).toBeTruthy()
    }
  }
})

test('includes context in בראשית', async (t) => {
  const runId = '2024-10-26:shacharis,main'
  const model = ScrollViewModel.forId(generator, runId)
  // This is rendering src/data/pages/torah/1.json.
  const pages = await fetchPages(model, { fetchPreviousPages: false, count: 6 })
  if (pages?.[0].type !== 'page') throw new Error('First page should be a page')

  // First line begins a פסוק and עלייה.
  expect(dumpContext(t, pages[0].lines[0])).toEqual(runId)
  expect(dumpAliyot(pages[0].lines[0])).toEqual([1])
  // Second line begins a פסוק but not an עלייה.
  expect(dumpContext(t, pages[0].lines[1])).toEqual(runId)
  expect(dumpAliyot(pages[0].lines[1])).toEqual([1])

  // This line is entirely within a פסוק.
  expect(pages[0].lines[5].verses).toEqual([])
  expect(dumpContext(t, pages[0].lines[5])).toEqual(runId)
  expect(dumpAliyot(pages[0].lines[5])).toEqual([1])

  // This is rendering src/data/pages/torah/6.json.
  const maftir = pages[5]
  for (const line of getLinesInRange(maftir, { first: '5:25', until: '6:5' })) {
    expect(dumpContext(t, line), renderLine(line)).toEqual(runId)
    expect(dumpAliyot(line), renderLine(line)).toEqual([7])
  }
  for (const line of getLinesInRange(maftir, { first: '6:5', until: '6:9' })) {
    expect(dumpContext(t, line), renderLine(line)).toEqual(runId)
    expect(dumpAliyot(line), renderLine(line)).toEqual([7, 'Maftir'])
  }
})

test('includes context in ראש השנה', async (t) => {
  let runId = '2024-10-03:shacharis,main'
  const model = ScrollViewModel.forId(generator, runId)

  // This is rendering src/data/pages/torah/20.json.
  const pages = await fetchPages(model, { fetchPreviousPages: false, count: 9 })

  getLinesInRange(pages[0], {
    first: null,
    until: '21:1',
  }).forEach(assertNoRun)
  getLinesInRange(pages[0], {
    first: '21:1',
    until: null,
  }).forEach(assertLineInRun)

  if (pages[1].type !== 'page') throw new Error('Second page should be a page')
  pages[1].lines.forEach(assertLineInRun)

  getLinesInRange(pages[2], {
    first: null,
    until: '22:1',
  }).forEach(assertLineInRun)
  getLinesInRange(pages[2], {
    first: '22:1',
    until: null,
  }).forEach(assertNoRun)

  // Set the variable used by assertLineInRun().
  runId = '2024-10-03:shacharis,maftir'
  const maftirPage = last(pages)

  getLinesInRange(maftirPage, {
    first: null,
    until: '29:1',
  }).forEach(assertNoRun)
  getLinesInRange(maftirPage, {
    first: '29:1',
    until: '29:7',
  }).forEach(assertLineInRun)
  getLinesInRange(maftirPage, {
    first: '29:7',
    until: null,
  }).forEach(assertNoRun)

  function assertLineInRun(line: RenderedLineInfo) {
    expect(dumpContext(t, line), renderLine(line)).toEqual(runId)
  }
  function assertNoRun(line: RenderedLineInfo) {
    expect(line.run, renderLine(line)).toBeFalsy()
  }
})

test('includes context in תענית ציבור', async (t) => {
  const runId = '2024-10-06:shacharis,main'
  const model = ScrollViewModel.forId(generator, runId)

  // This is rendering src/data/pages/torah/99.json.
  const pages = await fetchPages(model, { fetchPreviousPages: false, count: 9 })
  expect(pages.length).toBe(3)

  getLinesInRange(pages[0], {
    first: null,
    until: '32:11',
  }).forEach(assertNoRun)
  getLinesInRange(pages[0], {
    first: '32:11',
    until: '32:15',
  }).forEach(assertLineInRun)
  getLinesInRange(pages[0], {
    first: '32:15',
    until: null,
  }).forEach(assertNoRun)

  if (pages[1].type !== 'page') throw new Error('Second page should be a page')
  pages[1].lines.forEach(assertNoRun)

  getLinesInRange(pages[2], {
    first: null,
    until: '34:1',
  }).forEach(assertNoRun)
  getLinesInRange(pages[2], {
    first: '34:1',
    until: null, // The last עלייה ends at the end of the page.
  }).forEach(assertLineInRun)

  function assertLineInRun(line: RenderedLineInfo) {
    expect(dumpContext(t, line), renderLine(line)).toEqual(runId)
  }
  function assertNoRun(line: RenderedLineInfo) {
    expect(line.run, renderLine(line)).toBeFalsy()
  }
})

function dumpAliyot(line: RenderedLineInfo) {
  return line.aliyot.map((a) => a.index)
}

function dumpContext(t: TestContext, line: RenderedLineInfo) {
  if (!line.run) return null
  if (line.verses.length) {
    expect(line.verses.some((v) => containsRef(line.run!, v)), `Line "${renderLine(line)} is not in run "${line.run!.id}"`).toBe(true)
    expect(line.aliyot).not.toEqual([])
    expect(line.aliyot.every((a) => containsRef(a, line.verses))).toBe(true)
  }

  return line.run.id
}

/**
 * Gets all lines between the line at which the first פסוק begins
 * and the line at which the last פסוק begins.  This includes the
 * line that begins the first פסוק, and will NOT include the line
 * that begins the `until` פסוק.
 *
 * Pass null to include all lines from/until the top/bottom of the
 * page.
 */
function getLinesInRange(
  page: RenderedEntry,
  range: { first: string | null; until: string | null }
): RenderedLineInfo[] {
  if (page.type !== 'page')
    throw new Error(`Cannot get lines from message ${page.text}`)
  const first = range.first?.split(':').map(Number)
  const until = range.until?.split(':').map(Number)
  if (!first && !until) throw new Error('Please pass a range')

  const results: RenderedLineInfo[] = []
  let foundFirst = !first
  for (const line of page.lines) {
    if (!foundFirst && lineContains(line, first)) foundFirst = true

    if (!foundFirst) continue

    if (lineContains(line, until)) break
    results.push(line)
  }
  if (!results.length) throw new Error('Found no lines')
  return results
}

function lineContains(line: RenderedLineInfo, range: number[] | undefined) {
  if (!range) return false
  return line.verses.some(({ c, v }) => c === range[0] && v === range[1])
}

/** Renders enough properties of a scroll to make `deepEqual()` work with useful failures. */
async function renderScroll(model: ScrollViewModel | null) {
  return (
    await fetchPages(model, { count: 10, fetchPreviousPages: true })
  )?.map((e) => {
    if (e.type === 'message') return e.text
    return renderLine(e.lines[0])
  })
}

async function renderFirstLine(runId: string) {
  const model = ScrollViewModel.forId(generator, runId)
  if (!model) throw new Error(`ID ${runId} not found`)

  const { page, lineNumber } = await model.startingLocation
  if (page.type !== 'page') throw new Error('First page should be a page')
  return renderLine(page.lines[lineNumber - 1])
}
