import { expect, test } from 'vitest'
import {
  cuePayloadMatchesRecording,
  parseCueExportPayload,
} from './cue-validation.ts'
import { audioRecordings } from '../data/audio-catalog.ts'
import { TOKENIZATION_VERSION } from './cue-schema.ts'
import { cuePayloadPathForRecording } from './cue-data.ts'

const publishedCuePayloads = import.meta.glob<unknown>('../../audio-cues/**/*.json', {
  eager: true,
  import: 'default',
})

test('every published cue file satisfies the runtime cue-data contract', () => {
  expect(Object.keys(publishedCuePayloads).length).toBeGreaterThan(0)
  const recordingsById = new Map(
    audioRecordings.map((recording) => [recording.id, recording])
  )
  const seenAudioIds = new Set<string>()
  for (const [path, value] of Object.entries(publishedCuePayloads)) {
    const payload = parseCueExportPayload(value)
    expect(payload, path).not.toBeNull()
    if (!payload) continue

    if (payload.cues.length > 0) {
      expect(payload.tokenizationVersion, path).toBe(TOKENIZATION_VERSION)
    }
    expect(seenAudioIds.has(payload.audioId), path).toBe(false)
    seenAudioIds.add(payload.audioId)

    const recording = recordingsById.get(payload.audioId)
    expect(recording, path).toBeDefined()
    if (!recording) continue
    expect(cuePayloadMatchesRecording(payload, recording), path).toBe(true)
    expect(cuePayloadPathForRecording(recording), path).toBe(path)
  }
})
