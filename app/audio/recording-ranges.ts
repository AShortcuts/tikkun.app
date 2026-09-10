import { LeiningGenerator } from '../calendar-model/generator.ts'
import { resolveParshaRun } from '../view-model/navigation/parsha-routes.ts'
import { isParshaAudioRecording, type AudioRecording, type RecordingRange } from './types.ts'

// Source divisions belong to the recording, independently of the selected date.
export function createRecordingRangeResolver() {
  const generator = new LeiningGenerator({ ashkenazi: true, israel: false, includeModernHolidays: false })
  const runs = new Map<string, ReturnType<typeof resolveParshaRun>>()
  return (recording: AudioRecording): RecordingRange | null => {
    if (!isParshaAudioRecording(recording)) return recording.range
    if (!runs.has(recording.parshaSlug)) {
      runs.set(recording.parshaSlug, resolveParshaRun(generator, recording.parshaSlug, new Date()))
    }
    const aliyah = runs.get(recording.parshaSlug)?.run.aliyot.find(entry => entry.index === recording.aliyah)
    return aliyah ? { start: aliyah.start, end: aliyah.end } : null
  }
}
