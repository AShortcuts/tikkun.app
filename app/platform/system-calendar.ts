import { HDate } from '@hebcal/hdate'
import { LeiningGenerator } from '../calendar-model/generator.ts'
import { getBookName } from '../calendar-model/hebcal-conversions.ts'
import { LeiningRunType } from '../calendar-model/model-types.ts'
import type { RefWithScroll } from '../ref.ts'
import { isReaderHash } from '../view-model/navigation/reader-hash.ts'

export interface SystemReading {
  id: string
  day: string
  name: string
  hebrewName: string
  service: string
  references: string[]
  hash: string
  shabbat: boolean
}

function reference(start: RefWithScroll, end: RefWithScroll) {
  return `${getBookName(start)} ${start.c}:${start.v}-${end.c}:${end.v}`
}

// Called by the bundled JavaScriptCore engine, without a WebView or network.
export function scheduleJSON(day: string, israel: boolean): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('Invalid calendar date')
  const [year, month, date] = day.split('-').map(Number)
  const start = new HDate(new Date(year, month - 1, date, 12))
  const generator = new LeiningGenerator({ israel, ashkenazi: true, includeModernHolidays: false })
  const result: SystemReading[] = []
  for (let offset = 0; offset < 70; offset++) {
    const entry = generator.createLeiningDate(start.add(offset, 'day'))
    if (!entry) continue
    for (const leining of entry.leinings) {
      const main = leining.runs.find(run => run.type === LeiningRunType.Main && run.scroll === 'torah')
      if (!main) continue
      const references = leining.runs.filter(run => run.scroll === 'torah').flatMap(run => {
        // Keep noncontiguous/overlapping holiday aliyot exact; do not fill gaps.
        const ranges: { start: RefWithScroll; end: RefWithScroll }[] = []
        for (const aliyah of run.aliyot) {
          const previous = ranges.at(-1)
          if (previous && previous.end.b === aliyah.start.b && previous.end.c === aliyah.start.c && previous.end.v + 1 === aliyah.start.v) {
            previous.end = aliyah.end
          } else ranges.push({ start: aliyah.start, end: aliyah.end })
        }
        return ranges.map(range => reference(range.start, range.end))
      })
      result.push({
        id: main.id, day: entry.id, name: entry.title.en, hebrewName: entry.title.he,
        service: leining.id, references, hash: `#/run/${main.id}`,
        shabbat: entry.date.getDay() === 6,
      })
    }
  }
  return JSON.stringify(result)
}

export { isReaderHash }
