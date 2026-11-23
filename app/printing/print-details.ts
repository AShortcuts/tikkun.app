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

type Bilingual = { he: string; en: string }
/** A printed reading's name and the aliyot it covers, kept apart so the masthead can set them separately. */
export type PrintReadingTitle = { name: Bilingual; aliyot: Bilingual }
type ContextAliyah = PrintContext['aliyot'][number]

/** "Noach, Aliyah 3" and "נח, שלישי": the one-line form used by later pages' running head. */
export function joinReadingTitle({ name, aliyot }: PrintReadingTitle): Bilingual {
  return {
    he: [name.he, aliyot.he].filter(Boolean).join(', '),
    en: [name.en, aliyot.en].filter(Boolean).join(', '),
  }
}

const overlaps = (aliyah: PassageRange, ranges: PassageRange[]) =>
  ranges.some(range => compareRefs(range.start, aliyah.end) <= 0 && compareRefs(range.end, aliyah.start) >= 0)
const within = (inner: PassageRange, outer: PassageRange) =>
  compareRefs(outer.start, inner.start) <= 0 && compareRefs(inner.end, outer.end) <= 0

// Consecutive aliyot read as one span: "Aliyot 1–3" and "ראשון–שלישי".
function aliyahSpans(aliyot: readonly ContextAliyah[], order: readonly ContextAliyah[]): Bilingual {
  const spans: ContextAliyah[][] = []
  for (const aliyah of [...aliyot].sort((a, b) => order.indexOf(a) - order.indexOf(b))) {
    const span = spans.at(-1)
    if (span && order.indexOf(aliyah) === order.indexOf(span.at(-1)!) + 1) span.push(aliyah)
    else spans.push([aliyah])
  }
  const join = (label: (aliyah: ContextAliyah) => string) =>
    spans.map(span => span.length === 1 ? label(span[0]) : `${label(span[0])}–${label(span.at(-1)!)}`).join(', ')
  const numbered = aliyot.every(aliyah => /^Aliyah \d+$/.test(aliyah.label))
  const en = numbered && aliyot.length
    ? `${aliyot.length === 1 ? 'Aliyah' : 'Aliyot'} ${join(aliyah => aliyah.label.replace(/^Aliyah /, ''))}`
    : join(aliyah => aliyah.label)
  return { he: join(aliyah => aliyah.hebrewLabel), en }
}

/**
 * The title of a Torah printout chosen by reading: its reading name and
 * aliyot, such as Chayei Sara and Aliyah 1. Pass the chosen aliyah keys, or
 * none for a passage selected on the page. Returns nothing for Esther, which
 * is named from its passage instead.
 */
export function printReadingHeading(ranges: PassageRange[], context: PrintContext, selectedKeys?: string[]): PrintReadingTitle | undefined {
  if (ranges[0]?.start.scroll !== 'torah') return undefined
  const named = (name: Bilingual, aliyot: Bilingual) => ({ name, aliyot })
  const title = { he: context.title, en: context.englishTitle }
  // No chosen aliyot means the complete reading, which the masthead names in the aliyah's place.
  if (selectedKeys?.length === 0) {
    return named(title, context.isParsha ? { he: 'כל הפרשה', en: 'Whole parsha' } : { he: 'כל הקריאה', en: 'Whole reading' })
  }
  if (selectedKeys) {
    return named(title, aliyahSpans(context.aliyot.filter(aliyah => selectedKeys.includes(aliyah.key)), context.aliyot))
  }
  const touched = context.aliyot.filter(aliyah => overlaps(aliyah, ranges))
  if (!touched.length) {
    // A selection from a neighboring reading in the continuous Reader.
    const titles = printDetailsTitles(ranges)
    const aliyot = printDetailsAliyot(ranges, context)
    return named(
      { he: titles.map(title => title.he).join(' · '), en: titles.map(title => title.en).join(' · ') },
      { he: aliyot.map(aliyah => aliyah.he).join(', '), en: aliyot.map(aliyah => aliyah.en).join(', ') },
    )
  }
  const range = ranges.length === 1 ? ranges[0] : undefined
  const containing = range ? touched.filter(aliyah => within(range, aliyah)) : []
  // Inside one aliyah, prefer its exact match, then the reader's current one.
  const single = containing.find(aliyah => range && within(aliyah, range))
    ?? containing.find(aliyah => aliyah.key === context.currentKey) ?? containing[0]
  // A Maftir that repeats the end of the seventh aliyah adds nothing to a span.
  const aliyot = single ? [single] : touched.filter(aliyah =>
    !touched.some(other => other !== aliyah && within(aliyah, other) && !within(other, aliyah)))
  return named(title, aliyahSpans(aliyot, context.aliyot))
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
