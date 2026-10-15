import { HDate } from '@hebcal/hdate'
import type { LeiningGenerator } from '../calendar-model/generator.ts'
import renderLeiningTitle from '../components/render-leining-title.ts'
import { createPrintContext, type PrintContext } from './print-context.ts'
import { normalizeRanges, passageTitle } from './print-model.ts'

export type UpcomingPrintReading = {
  id: string
  date: Date
  context: PrintContext
  rangeLabel: string
}

export function upcomingPrintReadings(generator: LeiningGenerator, today = new Date()): UpcomingPrintReading[] {
  const readings: UpcomingPrintReading[] = []
  const start = new HDate(today)
  // Include today's reading, and cross calendar years without truncating the list.
  for (let offset = 0; offset < 366; offset++) {
    const date = generator.createLeiningDate(start.add(offset, 'day'))
    for (const leining of date?.leinings ?? []) {
      const run = leining.runs.find(run => run.scroll === 'torah' && run.aliyot.some(aliyah => aliyah.index))
      const first = run?.aliyot.find(aliyah => aliyah.index)
      if (!run || !first?.index) continue
      const context = createPrintContext(run, first.index, renderLeiningTitle(leining, { forCalendar: true }))
      readings.push({ id: `${leining.date.id}:${leining.id}`, date: leining.date.date, context, rangeLabel: passageTitle(normalizeRanges(context.aliyot)) })
      if (readings.length === 10) return readings
    }
  }
  throw new Error('The next ten Torah readings could not be loaded. Try opening Print again.')
}
