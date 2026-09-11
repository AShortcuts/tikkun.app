import { registerPlugin, type PluginListenerHandle } from '@capacitor/core'

export interface NativePlaybackState {
  revision: number
  sessionID: string | null
  segmentIndex: number
  currentTime: number
  duration: number | null
  paused: boolean
  ended: boolean
  rate: number
  phase: 'idle' | 'loading' | 'ready' | 'error'
  error: string | null
}

export interface NativePlaybackPlugin {
  setSession(options: {
    sessionID: string
    title: string
    segments: { url: string; start: number; end: number | null }[]
  }): Promise<NativePlaybackState>
  getState(): Promise<NativePlaybackState>
  play(options: { sessionID: string }): Promise<NativePlaybackState>
  pause(options: { sessionID: string }): Promise<NativePlaybackState>
  seek(options: { sessionID: string; time: number }): Promise<NativePlaybackState>
  setRate(options: { sessionID: string; rate: number }): Promise<NativePlaybackState>
  clear(options: { sessionID: string }): Promise<NativePlaybackState>
  addListener(event: 'stateChanged' | 'commandError', callback: (event: unknown) => void): Promise<PluginListenerHandle>
}

let nativePlayback: NativePlaybackPlugin | undefined
export function getNativePlayback() {
  return nativePlayback ??= registerPlugin<NativePlaybackPlugin>('TikkunPlayback')
}

export function parseNativePlaybackState(value: unknown): NativePlaybackState {
  if (!value || typeof value !== 'object') throw new Error('Invalid native playback state')
  const state = value as Partial<NativePlaybackState>
  if (!Number.isSafeInteger(state.revision) || Number(state.revision) < 0 ||
      (state.sessionID !== null && (typeof state.sessionID !== 'string' || !state.sessionID)) ||
      !Number.isSafeInteger(state.segmentIndex) || Number(state.segmentIndex) < 0 ||
      typeof state.currentTime !== 'number' || !Number.isFinite(state.currentTime) || state.currentTime < 0 ||
      (state.duration !== null && (typeof state.duration !== 'number' || !Number.isFinite(state.duration) || state.duration < 0)) ||
      typeof state.paused !== 'boolean' || typeof state.ended !== 'boolean' ||
      typeof state.rate !== 'number' || !Number.isFinite(state.rate) || state.rate < 0.25 || state.rate > 3 ||
      !['idle', 'loading', 'ready', 'error'].includes(state.phase ?? '') ||
      (state.error !== null && typeof state.error !== 'string')) {
    throw new Error('Invalid native playback state')
  }
  return state as NativePlaybackState
}
