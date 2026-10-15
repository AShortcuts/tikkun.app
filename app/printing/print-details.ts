import { compareRefs } from '../calendar-model/ref-utils.ts'
import { aliyahLabel } from '../calendar-model/aliyah-label.ts'
import renderLeiningTitle from '../components/render-leining-title.ts'
import { canonicalParshaReadings } from '../view-model/navigation/parsha-routes.ts'
import type { PassageRange } from './print-model.ts'
import type { PrintContext } from './print-context.ts'

export function printDetailsAliyot(ranges: PassageRange[], context: PrintContext, selectedKeys?: string[]) {
  if (ranges[0]?.start.scroll !== 'torah') return []
  const label = (aliyah: PrintContext['aliyot'][number]) => ({ he: aliyah.hebrewLabel, en: aliyah.label })
  if (selectedKeys) return context.aliyot.filter(aliyah => selectedKeys.includes(aliyah.key)).map(label)
  if (ranges.length !== 1) return []
  const range = ranges[0]
  const contains = (aliyah: PassageRange) => compareRefs(aliyah.start, range.start) <= 0 && compareRefs(aliyah.end, range.end) >= 0
  const exact = (aliyah: PassageRange) => compareRefs(aliyah.start, range.start) === 0 && compareRefs(aliyah.end, range.end) === 0
  const contextual = context.aliyot.filter(contains)
  // The selected service owns overlapping aliyot and special honor names.
  const match = contextual.find(exact) ?? contextual.find(aliyah => aliyah.key === context.currentKey) ?? contextual[0]
  if (match) return [label(match)]
  const canonical = canonicalParshaReadings().flatMap(reading => reading.runs.flatMap(run =>
    run.aliyot.filter(contains).map(aliyah => ({ ...aliyah, run }))
  ))
  const inferred = canonical.find(exact) ?? canonical[0]
  return inferred ? [{ he: aliyahLabel(inferred.index, inferred.run, 'he'), en: aliyahLabel(inferred.index, inferred.run, 'en') }] : []
}

export function printDetailsTitles(ranges: PassageRange[]) {
  if (ranges[0].start.scroll === 'esther') return [{ he: 'אסתר', en: 'Esther' }]
  return canonicalParshaReadings().filter(reading => reading.runs.some(run => run.aliyot.some(aliyah =>
    ranges.some(range => compareRefs(range.start, aliyah.end) <= 0 && compareRefs(range.end, aliyah.start) >= 0)
  ))).map(reading => ({ he: renderLeiningTitle(reading), en: reading.title.en.replace(/^Parshat\s+/, '') }))
}

export function printColumnNumbers(numbers: number[]) {
  const sorted = [...new Set(numbers)].sort((a, b) => a - b)
  const ranges: string[] = []
  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i]
    while (sorted[i + 1] === sorted[i] + 1) i++
    ranges.push(start === sorted[i] ? `${start}` : `${start}–${sorted[i]}`)
  }
  return ranges.join(', ')
}
