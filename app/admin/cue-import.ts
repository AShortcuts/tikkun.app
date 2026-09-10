import { TOKENIZATION_VERSION } from '../audio/cue-schema.ts'
import { parseCueExportPayload, cuePayloadMatchesRecording } from '../audio/cue-validation.ts'
import type { AudioRecording } from '../audio/types.ts'
import { formatTokenKey } from '../reader/token-position.ts'

export function parseCueImport(value: unknown, recording: AudioRecording, tokenKeys: readonly string[]) {
  const payload = parseCueExportPayload(value)
  if (!payload) throw new Error('This file is not valid cue JSON. Download the cue file again and retry.')
  if (!payload.mediaIdentity || !cuePayloadMatchesRecording(payload, recording)) {
    throw new Error('These cues belong to different audio. Open the matching recording before importing.')
  }
  if (payload.tokenizationVersion !== TOKENIZATION_VERSION || payload.tokenCount !== tokenKeys.length ||
      !payload.cues.length || payload.cues.some((cue, index) => formatTokenKey(cue) !== tokenKeys[index])) {
    throw new Error('These cues do not match the loaded aliyah text. Open the complete matching aliyah and retry.')
  }
  return payload.cues
}
