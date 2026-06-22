/** @fileoverview This file tests both Aliyah labelling and run calculation in HolidayViewModel. */

import { expect, test } from 'vitest'
import { LeiningGenerator } from '../calendar-model/generator.ts'
import type { UserSettings } from '../calendar-model/user-settings.ts'
import { type RenderedEntry, ScrollViewModel } from './scroll-view-model.ts'
import { renderLine } from './test-utils.ts'

const testSettings: UserSettings = {
  ashkenazi: true,
  includeModernHolidays: false,
  israel: false,
}

const generator = new LeiningGenerator(testSettings)

test(`יום כיפור on שבת`, async () => {
  expect(await dumpAliyot('2024-10-12:shacharis,main')).toMatchSnapshot()
})

test(`חול המוד סוכות`, async () => {
  expect(await dumpAliyot('2024-10-20:shacharis,main')).toMatchSnapshot()
})

test(`שמחת תורה`, async () => {
  expect(await dumpAliyot('2024-10-25:shacharis,main')).toMatchSnapshot()
})

test(`תענית ציבור`, async () => {
  expect(await dumpAliyot('2025-03-13:mincha,main')).toMatchSnapshot()
})

test(`פרשת האזינו`, async () => {
  expect(await dumpAliyot('2024-10-05:shacharis,main')).toMatchSnapshot()
})

test(`חנוכה`, async () => {
  expect(await dumpAliyot('2024-12-26:shacharis,main')).toMatchSnapshot()
})

test(`ראש חודש חנוכה`, async () => {
  expect(await dumpAliyot('2024-12-31:shacharis,main')).toMatchSnapshot()
})

test(`שקלים / ראש חודש as פרשה`, async () => {
  // Fetch the main run so that we get a FullScrollViewModel
  expect(await dumpAliyot('2025-03-01:shacharis,main')).toMatchSnapshot()
})

test(`Weekday ראש חודש`, async () => {
  expect(await dumpAliyot('2025-02-28:shacharis,main')).toMatchSnapshot()
})

test(`אסתר`, async () => {
  // There are no labels to apply for a מגילה.
  // However, we should verify that it renders and scrolls correctly.
  // This test catchs #134.
  expect(await dumpAliyot('2025-03-14:megillah,megillah')).toEqual([])
})

test(`שקלים / ראש חודש as מפטיר`, async () => {
  // Fetch a non-main run so that we get a HolidayViewModel
  expect(await dumpAliyot('2025-03-01:shacharis,maftir')).toMatchSnapshot()
})

/** Formats the עלייה-labelled lines from a ScrollViewModel to read in the snapshot. */
async function dumpAliyot(runId: string) {
  const model = ScrollViewModel.forId(generator, runId)
  if (!model) throw new Error(`ID ${runId} not found`)

  const pages: RenderedEntry[] = [(await model.startingLocation).page]
  const targetDate = generator.parseId(runId)!.leining.date

  // If this is a HolidayViewModel, fetch the previous runs as well.
  if (model.relevantRuns.length < 10) {
    while (true) {
      const previousPage = await model.fetchPreviousPage()
      if (!previousPage) break
      pages.unshift(previousPage)
    }
  }

  while (true) {
    const nextPage = await model.fetchNextPage()
    if (!nextPage) break

    if (nextPage.type === 'page') {
      // If a page does not have a run, keep going
      // (pass over the skipped page for תענית ציבור).
      const nextPageRun =
        nextPage.lines.find((o) => o.run)?.run?.leining.date ?? targetDate
      if (nextPageRun.date > targetDate.date) break
    }
    pages.push(nextPage)
  }

  return pages.flatMap((e) => {
    if (e.type === 'message') return [e.text]
    return e.lines.filter((line) => line.labels.length).map(renderLine)
  })
}
