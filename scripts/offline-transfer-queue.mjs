export function renderOfflineTransferQueue(namespace) {
  return `
const OFFLINE_TRANSFER_LIMIT = 2
const OFFLINE_TRANSFER_LOCK_PREFIX = ${JSON.stringify(`tikkun-offline-transfer-${namespace}-`)}
const pendingOfflineTransfers = []
let runningOfflineTransfers = 0

// Locks coordinate even when old and new worker versions overlap. The local
// queue also bounds work in browsers without worker-side Web Locks.
async function withOfflineTransferLock(signal, task) {
  const locks = self.navigator?.locks
  if (!locks) return task()
  const selection = new AbortController()
  const abort = () => selection.abort(signal.reason)
  signal?.addEventListener('abort', abort, { once: true })
  if (signal?.aborted) abort()
  let claimed = false
  let work
  try {
    const attempts = Array.from({ length: OFFLINE_TRANSFER_LIMIT }, (_, slot) =>
      Promise.resolve().then(() => locks.request(OFFLINE_TRANSFER_LOCK_PREFIX + slot,
        { signal: selection.signal }, () => {
          if (claimed) return
          claimed = true
          selection.abort()
          work = Promise.resolve().then(() => { signal?.throwIfAborted(); return task() })
          return work
        }))
    )
    const results = await Promise.allSettled(attempts)
    if (claimed) return work
    throw results.find((result) => result.status === 'rejected').reason
  } finally {
    signal?.removeEventListener('abort', abort)
  }
}

function pumpOfflineTransfers() {
  while (runningOfflineTransfers < OFFLINE_TRANSFER_LIMIT && pendingOfflineTransfers.length) {
    const entry = pendingOfflineTransfers.shift()
    entry.signal?.removeEventListener('abort', entry.abort)
    if (entry.signal?.aborted) { entry.reject(entry.signal.reason); continue }
    runningOfflineTransfers += 1
    Promise.resolve().then(() => {
      entry.signal?.throwIfAborted()
      return withOfflineTransferLock(entry.signal, entry.task)
    }).then(entry.resolve, entry.reject).finally(() => {
      runningOfflineTransfers -= 1
      pumpOfflineTransfers()
    })
  }
}

function withOfflineTransferSlot(signal, task) {
  signal?.throwIfAborted()
  return new Promise((resolve, reject) => {
    const entry = { signal, task, resolve, reject, abort: null }
    entry.abort = () => {
      const index = pendingOfflineTransfers.indexOf(entry)
      if (index < 0) return
      pendingOfflineTransfers.splice(index, 1)
      signal.removeEventListener('abort', entry.abort)
      reject(signal.reason)
    }
    pendingOfflineTransfers.push(entry)
    signal?.addEventListener('abort', entry.abort, { once: true })
    pumpOfflineTransfers()
  })
}
`
}
