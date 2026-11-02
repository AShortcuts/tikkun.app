import { TOKENIZATION_VERSION } from '../audio/cue-schema.ts'
import { parseCueExportPayload, cuePayloadMatchesRecording } from '../audio/cue-validation.ts'
import type { AudioRecording, WordCue } from '../audio/types.ts'
import { formatTokenKey } from '../reader/token-position.ts'

export type CueImportCheck =
  | { status: 'ok'; cues: WordCue[]; audioIdentityMissing: boolean }
  | { status: 'invalid' | 'other-audio' | 'other-text' }

/** Checks cue JSON against the recording and aliyah text it would be loaded into. */
export function checkCueImport(value: unknown, recording: AudioRecording, tokenKeys: readonly string[]): CueImportCheck {
  const payload = parseCueExportPayload(value)
  if (!payload) return { status: 'invalid' }
  if (!cuePayloadMatchesRecording(payload, recording)) return { status: 'other-audio' }
  if (payload.tokenizationVersion !== TOKENIZATION_VERSION || payload.tokenCount !== tokenKeys.length ||
      !payload.cues.length || payload.cues.some((cue, index) => formatTokenKey(cue) !== tokenKeys[index])) {
    return { status: 'other-text' }
  }
  // Cues timed while recording new audio carry no fingerprint; the caller must
  // confirm that the loaded recording is that new audio.
  return { status: 'ok', cues: payload.cues, audioIdentityMissing: !payload.mediaIdentity }
}

export function parseCueImport(value: unknown, recording: AudioRecording, tokenKeys: readonly string[]) {
  const check = checkCueImport(value, recording, tokenKeys)
  switch (check.status) {
    case 'invalid':
      throw new Error('This file is not valid cue JSON. Download the cue file again and retry.')
    case 'other-audio':
      throw new Error('These cues belong to different audio. Open the matching recording before importing.')
    case 'other-text':
      throw new Error('These cues do not match the loaded aliyah text. Open the complete matching aliyah and retry.')
    default:
      return { cues: check.cues, audioIdentityMissing: check.audioIdentityMissing }
  }
}
