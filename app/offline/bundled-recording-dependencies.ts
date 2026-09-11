import { publishedCueSourceForRecording, retryCueDataForRecording, type CueDataResolution } from '../audio/cue-data.ts'
import { TOKENIZATION_VERSION } from '../audio/cue-schema.ts'
import type { AudioRecording } from '../audio/types.ts'
import { descriptorForRecording, type RecordingDescriptor } from './recording-download.ts'
import type { RecordingDependencies } from './recording-dependencies.ts'
import { recordingAssetKey, resolveRecordingAsset } from './recording-storage.ts'

// Only for immutable native bundles. Web module loads alone do not prove that
// a service worker has durably saved the modules for the next cold launch.
export function createBundledRecordingDependencies({ recordings, baseUrl, resolve = retryCueDataForRecording }: {
  recordings: readonly AudioRecording[]
  baseUrl: string
  resolve?: (recording: AudioRecording) => Promise<CueDataResolution>
}): RecordingDependencies & { sources(asset: RecordingDescriptor): readonly string[] } {
  const byAsset = new Map<string, AudioRecording[]>()
  for (const recording of recordings) {
    const descriptor = descriptorForRecording(recording)
    if (!descriptor) continue
    const key = recordingAssetKey(resolveRecordingAsset(descriptor, baseUrl))
    const aliases = byAsset.get(key) ?? []
    aliases.push(recording)
    byAsset.set(key, aliases)
  }
  const inspect = async (asset: RecordingDescriptor, signal?: AbortSignal) => {
    const aliases = byAsset.get(recordingAssetKey(asset))
    if (!aliases) throw new Error('This saved recording is not in the installed content catalog.')
    let audioOnly = false
    for (const recording of aliases) {
      signal?.throwIfAborted()
      const resolution = await resolve(recording)
      signal?.throwIfAborted()
      if (resolution.status !== 'ready') {
        if (resolution.status === 'missing') { audioOnly = true; continue }
        throw new Error(`${recording.title}: ${resolution.problem.message}`)
      }
      if (resolution.payload.tokenizationVersion !== TOKENIZATION_VERSION) {
        throw new Error(`${recording.title}: published timings use an incompatible text version.`)
      }
      if (resolution.payload.cues.length === 0) audioOnly = true
    }
    return audioOnly ? 'audio-only' as const : 'ready' as const
  }
  return {
    check: (asset) => inspect(asset), prepare: inspect,
    sources(asset) {
      const aliases = byAsset.get(recordingAssetKey(asset))
      if (!aliases) throw new Error('This saved recording is not in the installed content catalog.')
      return [...new Set(aliases.flatMap((recording) => {
        const source = publishedCueSourceForRecording(recording)
        return source ? [source] : []
      }))].sort()
    },
  }
}
