export async function holdSharedLocks(locks: LockManager, names: readonly string[], signal: AbortSignal,
  unavailableMessage?: string): Promise<() => Promise<void>> {
  signal.throwIfAborted()
  const pending = new AbortController()
  let release!: () => void
  const held = new Promise<void>((resolve) => { release = resolve })
  const abort = () => { pending.abort(signal.reason); release() }
  signal.addEventListener('abort', abort, { once: true })
  if (signal.aborted) abort()
  const work: Promise<unknown>[] = []
  try {
    await Promise.all([...new Set(names)].map((name) => new Promise<void>((resolve, reject) => {
      const options: LockOptions = unavailableMessage
        ? { mode: 'shared', ifAvailable: true }
        : { mode: 'shared', signal: pending.signal }
      const request = locks.request(name, options, (lock) => {
        if (!lock) throw new Error(unavailableMessage)
        pending.signal.throwIfAborted()
        resolve()
        return held
      })
      work.push(request)
      void request.catch(reject)
    })))
    signal.throwIfAborted()
    return async () => { release(); await Promise.all(work) }
  } catch (error) {
    pending.abort()
    release()
    await Promise.allSettled(work)
    throw error
  } finally {
    signal.removeEventListener('abort', abort)
  }
}
