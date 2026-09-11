import { holdSharedLocks } from './shared-locks.ts'

export type ProtectPlayback = (sources: readonly string[], signal: AbortSignal) => Promise<() => void>

// Physical URLs include the deployment path and recording digest. The worker
// takes the exclusive form of these locks before explicit removal.
export const playbackLockName = (url: string) => `tikkun-recording-playback:${url}`

export function createPlaybackProtection(locks: LockManager | null, baseUrl: string): ProtectPlayback {
  return async (sources, signal) => {
    signal.throwIfAborted()
    const urls = [...new Set(sources.map((source) => new URL(source, baseUrl))
      .filter((url) => url.protocol === 'https:' || url.protocol === 'http:')
      .map((url) => url.href))]
    if (!locks || urls.length === 0) return () => {}
    return holdSharedLocks(locks, urls.map(playbackLockName), signal)
  }
}
