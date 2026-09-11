import { holdSharedLocks } from './shared-locks.ts'

export const queueLockName = (scope: string) => `tikkun-recording-queue:${scope}`

export function protectQueuedRecording(locks: LockManager | null, scope: string, url: string, signal: AbortSignal) {
  if (!locks) throw new Error('Safe download queue coordination is unavailable in this browser.')
  const name = queueLockName(scope)
  return holdSharedLocks(locks, [name, `${name}:${url}`], signal,
    'Another tab is removing these recordings. Wait for it to finish and try again.')
}
