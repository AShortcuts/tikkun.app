import { expect, test } from 'vitest'
import { LeiningGenerator } from '../calendar-model/generator.ts'
import type { UserSettings } from '../calendar-model/user-settings.ts'
import {
  type RenderedEntry,
  type RenderedLineInfo,
  type ScrollContentSource,
  ScrollViewModel,
} from './scroll-view-model.ts'
import { last } from '../calendar-model/utils.ts'
import { fetchPages, renderLine } from './test-utils.ts'
import { containsRef } from '../calendar-model/ref-utils.ts'
import type { LineType } from '../components/Page.ts'
import type { LeiningRun } from '../calendar-model/model-types.ts'

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

test('keeps the focal verse through a line that begins before the next verse', async () => {
  const model = ScrollViewModel.forId(
    generator,
    '2026-07-15:shacharis,main',
    { scroll: 'torah', b: 4, c: 28, v: 1 }
  )
  if (!model) throw new Error('Rosh Chodesh model not found')

  const { page } = await model.startingLocation
  if (page.type !== 'page') throw new Error('Rosh Chodesh page not found')

  expect(page.lines[4].focalRef).toEqual({
    b: 4,
    c: 28,
    v: 3,
  })
  expect(page.lines[5].focalRef).toEqual({
    b: 4,
    c: 28,
    v: 4,
  })
})

test('retries the same adjacent entry after a transient failure and latches EOF', async () => {
  const run = generator.parseId('2024-10-26:shacharis,main')
  if (!run) throw new Error('Beresheet run not found')
  const model = new RetryableScrollViewModel(run)
  await model.startingLocation

  await expect(model.fetchPreviousPage()).rejects.toThrow('page 1 failed')
  await expect(model.fetchPreviousPage()).resolves.toMatchObject({
    type: 'page',
    contentIndex: 0,
    pageNumber: 1,
  })
  await expect(model.fetchNextPage()).rejects.toThrow('page 3 failed')
  await expect(model.fetchNextPage()).resolves.toMatchObject({
    type: 'page',
    contentIndex: 2,
    pageNumber: 3,
  })

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await expect(model.fetchPreviousPage()).resolves.toBeNull()
    await expect(model.fetchNextPage()).resolves.toBeNull()
  }
  expect(model.sourceCalls.get(-1)).toBe(1)
  expect(model.sourceCalls.get(3)).toBe(1)
})

test('keeps non-linear Holiday entries in run order with exact skip counts', async () => {
  const model = ScrollViewModel.forId(
    generator,
    '2024-10-25:shacharis,main'
  )
  if (!model) throw new Error('Simchat Torah model not found')

  const entries = await fetchEveryEntry(model)
  expect(entries.map((entry) => entry.contentIndex)).toEqual([
    0, 1, 2, 3, 4, 5, 6,
  ])
  expect(
    entries.flatMap((entry) =>
      entry.type === 'page' ? [entry.pageNumber] : []
    )
  ).toEqual([244, 245, 1, 2, 191])
  expect(
    entries.flatMap((entry) =>
      entry.type === 'message' ? [entry.text] : []
    )
  ).toEqual(['✃ 243 עמודים ✁', '✃ 188 עמודים ✁'])

  const maftirModel = ScrollViewModel.forId(
    generator,
    '2024-10-25:shacharis,maftir'
  )
  if (!maftirModel) throw new Error('Simchat Torah maftir model not found')
  expect((await maftirModel.startingLocation).page).toMatchObject({
    type: 'page',
    contentIndex: 6,
    pageNumber: 191,
  })
})

test('keeps an overlapping Maftir page tied to its owning run', async () => {
  const mainRunId = '2024-01-06:shacharis,main'
  const maftirRunId = '2024-01-06:shacharis,maftir'
  const model = ScrollViewModel.forId(generator, maftirRunId)
  if (!model) throw new Error('Maftir model not found')

  const maftirPage = (await model.startingLocation).page
  expect(maftirPage).toMatchObject({
    type: 'page',
    contentIndex: 6,
    pageNumber: 66,
    runId: maftirRunId,
  })
  if (maftirPage.type !== 'page') throw new Error('Maftir page not found')
  expect(
    maftirPage.lines.find((line) =>
      line.aliyahStarts.some((aliyah) => aliyah.index === 'Maftir')
    )?.run?.id
  ).toBe(maftirRunId)

  const mainPage = await model.fetchPageByPageNumber(66, { runId: mainRunId })
  expect(mainPage).toMatchObject({
    type: 'page',
    contentIndex: 5,
    pageNumber: 66,
    runId: mainRunId,
  })
  if (!mainPage || mainPage.type !== 'page') throw new Error('Main page not found')
  expect(
    mainPage.lines.some((line) =>
      line.aliyahStarts.some((aliyah) => aliyah.index === 'Maftir')
    )
  ).toBe(false)
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
      const message = assertionMessage(line)
      expect(line.run, message).toBeTruthy()
      expect(line.aliyot, message).not.toEqual([])
      expect(line.aliyot.every((a) => containsRef(a, line.verses)), `Aliyot ${dumpAliyot(line)} don't match line ${message}`).toBeTruthy()
      expect(line.aliyot.every((a) => line.run?.aliyot.includes(a))).toBeTruthy()
    }
  }
})

test('includes context in בראשית', async () => {
  const runId = '2024-10-26:shacharis,main'
  const model = ScrollViewModel.forId(generator, runId)
  // This is rendering text/pages/torah/1.json.
  const pages = await fetchPages(model, { fetchPreviousPages: false, count: 6 })
  if (pages?.[0].type !== 'page') throw new Error('First page should be a page')

  // First line begins a פסוק and עלייה.
  expect(dumpContext(pages[0].lines[0])).toEqual(runId)
  expect(dumpAliyot(pages[0].lines[0])).toEqual([1])
  // Second line begins a פסוק but not an עלייה.
  expect(dumpContext(pages[0].lines[1])).toEqual(runId)
  expect(dumpAliyot(pages[0].lines[1])).toEqual([1])

  // This line is entirely within a פסוק.
  expect(pages[0].lines[5].verses).toEqual([])
  expect(dumpContext(pages[0].lines[5])).toEqual(runId)
  expect(dumpAliyot(pages[0].lines[5])).toEqual([1])

  // This is rendering text/pages/torah/6.json.
  const maftir = pages[5]
  for (const line of getLinesInRange(maftir, { first: '5:25', until: '6:5' })) {
    expect(dumpContext(line), assertionMessage(line)).toEqual(runId)
    expect(dumpAliyot(line), assertionMessage(line)).toEqual([7])
  }
  for (const line of getLinesInRange(maftir, { first: '6:5', until: '6:9' })) {
    expect(dumpContext(line), assertionMessage(line)).toEqual(runId)
    expect(dumpAliyot(line), assertionMessage(line)).toEqual([7, 'Maftir'])
  }
})

test('includes context in ראש השנה', async () => {
  let runId = '2024-10-03:shacharis,main'
  const model = ScrollViewModel.forId(generator, runId)

  // This is rendering text/pages/torah/20.json.
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
    expect(dumpContext(line), assertionMessage(line)).toEqual(runId)
  }
  function assertNoRun(line: RenderedLineInfo) {
    expect(line.run, assertionMessage(line)).toBeFalsy()
  }
})

test('includes context in תענית ציבור', async () => {
  const runId = '2024-10-06:shacharis,main'
  const model = ScrollViewModel.forId(generator, runId)

  // This is rendering text/pages/torah/99.json.
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
    expect(dumpContext(line), assertionMessage(line)).toEqual(runId)
  }
  function assertNoRun(line: RenderedLineInfo) {
    expect(line.run, assertionMessage(line)).toBeFalsy()
  }
})

function dumpAliyot(line: RenderedLineInfo) {
  return line.aliyot.map((a) => a.index)
}

function assertionMessage(line: RenderedLineInfo) {
  return renderLine(line) ?? undefined
}

function dumpContext(line: RenderedLineInfo) {
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

async function fetchEveryEntry(model: ScrollViewModel) {
  const startingEntry = (await model.startingLocation).page
  const previousEntries: RenderedEntry[] = []
  const nextEntries: RenderedEntry[] = []

  for (;;) {
    const entry = await model.fetchPreviousPage()
    if (!entry) break
    previousEntries.unshift(entry)
  }
  for (;;) {
    const entry = await model.fetchNextPage()
    if (!entry) break
    nextEntries.push(entry)
  }
  return [...previousEntries, startingEntry, ...nextEntries]
}

const syntheticPageLines: LineType[] = [
  {
    text: [['בראשית']],
    verses: [{ book: 1, chapter: 1, verse: 1 }],
    aliyot: [],
    isPetucha: false,
  },
]

class RetryableScrollViewModel extends ScrollViewModel {
  readonly sourceCalls = new Map<number, number>()
  private readonly pagesThatShouldFail = new Set([1, 3])

  constructor(run: LeiningRun) {
    super(generator, [run], { scroll: 'torah', pageNumber: 2 })
  }

  protected override async contentSourceFromIndex(
    contentIndex: number
  ): Promise<ScrollContentSource | null> {
    this.sourceCalls.set(
      contentIndex,
      (this.sourceCalls.get(contentIndex) ?? 0) + 1
    )
    if (contentIndex < 0 || contentIndex > 2) return null
    return { type: 'page', pageNumber: contentIndex + 1 }
  }

  protected override async contentIndexFromPageNumber(pageNumber: number) {
    return pageNumber - 1
  }

  protected override async loadPageLines(pageNumber: number) {
    if (this.pagesThatShouldFail.delete(pageNumber)) {
      throw new Error(`page ${pageNumber} failed`)
    }
    return syntheticPageLines
  }
}
