import type { AudioRecording } from '../audio/types.ts'
import type { LeiningGenerator } from '../calendar-model/generator.ts'
import { recordingWorkRows } from '../data/about-progress.ts'
import { singleParshaRouteSpecs } from '../view-model/navigation/parsha-route-catalog.ts'
import { resolveParshaRun } from '../view-model/navigation/parsha-routes.ts'
import type { MediaReading } from './media-catalog.ts'

export function listMediaReadings(generator: LeiningGenerator, recordings: readonly AudioRecording[]): MediaReading[] {
  // Work rows supply names only; editorial status never determines availability.
  const books = ['Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy']
  const result: MediaReading[] = singleParshaRouteSpecs.map((spec, index) => {
    const resolved = resolveParshaRun(generator, spec.canonicalSlug)
    const name = recordingWorkRows.find((row) => row.number === index + 1)
    if (!resolved || !name) throw new Error(`Missing canonical reading ${spec.canonicalSlug}.`)
    return { id: spec.canonicalSlug, name: name.parshaEnglish, hebrew: name.parshaHebrew,
      group: books[resolved.run.aliyot[0].start.b - 1],
      aliyot: [...new Set(resolved.run.aliyot.flatMap((aliyah) => typeof aliyah.index === 'number' ? [aliyah.index] : []))] }
  })
  const known = new Set(result.map((reading) => reading.id))
  for (const recording of recordings) {
    if (known.has(recording.reading.id)) continue
    known.add(recording.reading.id)
    result.push({ id: recording.reading.id, name: recording.reading.name, hebrew: '', group: 'Other Readings',
      aliyot: [...new Set(recordings.filter((item) => item.reading.id === recording.reading.id).map((item) => item.aliyah))].sort((a, b) => a - b) })
  }
  return result
}
