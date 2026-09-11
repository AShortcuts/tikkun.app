import type { RecordingDescriptor } from './recording-download.ts'

export type RecordingReadiness = 'unchecked' | 'ready' | 'audio-only' | 'missing' | 'error'

export interface RecordingDependencies {
  // Web packages share quota with their audio; inspect the combined batch before preparation.
  preflight?(assets: readonly RecordingDescriptor[], signal: AbortSignal): Promise<void>
  reserve?(assets: readonly RecordingDescriptor[], signal: AbortSignal): Promise<() => Promise<void>>
  check(asset: RecordingDescriptor): Promise<'ready' | 'audio-only' | 'missing'>
  prepare(asset: RecordingDescriptor, signal: AbortSignal): Promise<'ready' | 'audio-only'>
  destroy?(): void
}

export function recordingDependenciesReady(readiness: RecordingReadiness) {
  return readiness === 'ready' || readiness === 'audio-only'
}
