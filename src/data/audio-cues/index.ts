/// <reference types="vite/client" />

import type { CueExportPayload } from '../../audio/types.ts'

const cuePayloadLoaders = import.meta.glob<CueExportPayload>('./**/*.json', {
  import: 'default',
})

const aliyahFileLabels = new Map<number, string>([
  [1, 'א'],
  [2, 'ב'],
  [3, 'ג'],
  [4, 'ד'],
  [5, 'ה'],
  [6, 'ו'],
  [7, 'ז'],
])

const narratorFileSuffixes = new Map<string, string>([
  ['yoni-davidov', 'yd'],
])

const cuePayloadPromisesByPath = new Map<string, Promise<CueExportPayload>>()
const cuePayloadsByAudioId = new Map<string, CueExportPayload>()

export function cuePayloadPathForRecording({
  narratorId,
  parshaSlug,
  aliyah,
}: {
  narratorId: string
  parshaSlug: string
  aliyah: number
}) {
  const aliyahLabel = aliyahFileLabels.get(aliyah)
  const narratorSuffix = narratorFileSuffixes.get(narratorId)
  if (!aliyahLabel || !narratorSuffix) return null

  return `./${parshaSlug}/${parshaSlug}-${aliyahLabel}-${narratorSuffix}.json`
}

export async function loadCuePayloadByPath(path: string) {
  const loader = cuePayloadLoaders[path]
  if (!loader) return null

  let promise = cuePayloadPromisesByPath.get(path)
  if (!promise) {
    promise = loader().then((payload) => {
      cuePayloadsByAudioId.set(payload.audioId, payload)
      return payload
    })
    cuePayloadPromisesByPath.set(path, promise)
  }

  return promise
}

export async function loadCuePayloadForRecording(recording: {
  id: string
  narratorId: string
  parshaSlug: string
  aliyah: number
}) {
  const cached = cuePayloadsByAudioId.get(recording.id)
  if (cached) return cached

  const path = cuePayloadPathForRecording(recording)
  if (!path) return null

  const payload = await loadCuePayloadByPath(path)
  return payload?.audioId === recording.id ? payload : null
}
