/// <reference types="vite/client" />

import { cueFileNameForRecording } from '../../audio/cue-file.ts'
import {
  cuePayloadMatchesRecording,
  parseCueExportPayload,
} from '../../audio/cue-validation.ts'
import type { AudioRecording, CueExportPayload } from '../../audio/types.ts'
import { RetryablePromiseCache } from '../retryable-promise-cache.ts'

const cuePayloadLoaders = import.meta.glob<unknown>('./**/*.json', {
  import: 'default',
})

const cuePayloadPromisesByPath = new RetryablePromiseCache<
  string,
  CueExportPayload
>()
const cuePayloadsByAudioId = new Map<string, CueExportPayload>()

export function cuePayloadPathForRecording({
  narratorId,
  reading,
  aliyah,
}: Pick<AudioRecording, 'narratorId' | 'reading' | 'aliyah'>) {
  const fileName = cueFileNameForRecording({ narratorId, reading, aliyah })
  return fileName ? `./${reading.id}/${fileName}` : null
}

export async function loadCuePayloadByPath(path: string) {
  const loader = cuePayloadLoaders[path]
  if (!loader) return null

  return cuePayloadPromisesByPath.get(path, async () => {
    const payload = parseCueExportPayload(await loader())
    if (!payload) throw new Error(`Invalid cue payload at ${path}`)
    return payload
  })
}

export async function loadCuePayloadForRecording(recording: AudioRecording) {
  const cached = cuePayloadsByAudioId.get(recording.id)
  if (cached && cuePayloadMatchesRecording(cached, recording)) return cached
  if (cached) cuePayloadsByAudioId.delete(recording.id)

  const path = cuePayloadPathForRecording(recording)
  if (!path) return null

  const payload = await loadCuePayloadByPath(path)
  if (!payload || !cuePayloadMatchesRecording(payload, recording)) return null
  cuePayloadsByAudioId.set(recording.id, payload)
  return payload
}
