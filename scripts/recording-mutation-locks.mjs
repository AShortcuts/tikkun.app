export function renderRecordingMutationLocks(namespace) {
  return `
const RECORDING_MUTATION_LOCK = ${JSON.stringify(`tikkun-recording-mutation-${namespace}`)}
const RECORDING_ASSET_LOCK_PREFIX = RECORDING_MUTATION_LOCK + ':'

function recordingMutationBusy() {
  return new Error('Another tab is saving or removing recordings. Wait for it to finish and try again.')
}

async function withRecordingSave(url, signal, task) {
  signal?.throwIfAborted()
  const locks = self.navigator?.locks
  // Download support retains the existing bounded per-worker fallback. Removal
  // refuses that weaker capability rather than risking another worker's write.
  if (!locks) return task()
  return locks.request(RECORDING_MUTATION_LOCK, { mode: 'shared', ifAvailable: true }, (lock) => {
    if (!lock) throw recordingMutationBusy()
    signal?.throwIfAborted()
    return locks.request(RECORDING_ASSET_LOCK_PREFIX + url, { signal }, () => {
      signal?.throwIfAborted()
      return task()
    })
  })
}

async function withRecordingRemoval(url, task) {
  const locks = self.navigator?.locks
  if (!locks) throw new Error('Safe recording removal is unavailable in this browser. Saved files were kept.')
  const RECORDING_QUEUE_LOCK = 'tikkun-recording-queue:' + self.registration.scope
  const unavailable = () => new Error('Another tab has queued or active downloads for these recordings. Cancel them in that tab and try again.')
  return locks.request(RECORDING_QUEUE_LOCK,
    { mode: url === null ? 'exclusive' : 'shared', ifAvailable: true }, (lock) => {
      if (!lock) throw unavailable()
      if (url === null) return withRecordingRemovalLock(url, task)
      return locks.request(RECORDING_QUEUE_LOCK + ':' + url, { ifAvailable: true }, (assetLock) => {
        if (!assetLock) throw unavailable()
        return withRecordingRemovalLock(url, task)
      })
    })
}

async function withRecordingRemovalLock(url, task) {
  const locks = self.navigator.locks
  return locks.request(RECORDING_MUTATION_LOCK,
    { mode: url === null ? 'exclusive' : 'shared', ifAvailable: true }, (lock) => {
      if (!lock) throw recordingMutationBusy()
      if (url === null) return task()
      return locks.request(RECORDING_ASSET_LOCK_PREFIX + url, { ifAvailable: true }, (assetLock) => {
        if (!assetLock) throw recordingMutationBusy()
        return task()
      })
    })
}

async function withUnusedRecordings(urls, task) {
  const locks = self.navigator?.locks
  if (!locks) throw new Error('Safe recording removal is unavailable in this browser. Saved files were kept.')
  const unique = [...new Set(urls)].sort()
  // Acquire every playback lock before deleting anything in a bulk selection.
  const acquire = (index) => index === unique.length ? task() : locks.request(
    'tikkun-recording-playback:' + unique[index], { ifAvailable: true }, (lock) => {
      if (!lock) throw new Error('This recording is open for playback in another tab. Close that reading and try again.')
      return acquire(index + 1)
    })
  return acquire(0)
}
`
}
