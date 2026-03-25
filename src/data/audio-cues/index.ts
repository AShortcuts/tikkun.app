/// <reference types="vite/client" />

import type { CueExportPayload } from '../../audio/types.ts'

const cuePayloadModules = import.meta.glob<CueExportPayload>('./**/*.json', {
  eager: true,
  import: 'default',
})

export const audioCuePayloads = Object.values(cuePayloadModules)

export const audioCuePayloadsByAudioId: Record<string, CueExportPayload> =
  Object.fromEntries(
    audioCuePayloads.map((payload) => [payload.audioId, payload])
  )
