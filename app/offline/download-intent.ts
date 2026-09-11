import { createPersistedJsonStore, requirePersistedJsonMutation } from '../persistence/persisted-state.ts'

export interface DownloadIntentStore {
  read(): Promise<readonly string[]>
  update(add: readonly string[], remove: readonly string[]): Promise<void>
}

export const DOWNLOAD_INTENT_KEY = 'tikkun.download-intent'

export function createDownloadIntentStore(storage: Storage | null, locks: LockManager | null): DownloadIntentStore {
  const store = createPersistedJsonStore<string[]>({
    storage, key: DOWNLOAD_INTENT_KEY,
    validate: (value): value is string[] => Array.isArray(value) &&
      value.every((key) => typeof key === 'string' && key.length > 0) && new Set(value).size === value.length,
  })
  const read = () => {
    const result = store.read()
    if (result.status === 'unavailable') throw result.error
    if (result.status === 'invalid') throw new Error('Saved download queue is invalid; existing data was not overwritten.')
    return { keys: result.status === 'ready' ? result.value : [], revision: result.revision }
  }
  return {
    read: async () => read().keys,
    async update(add, remove) {
      if (!locks) throw new Error('Persistent download queue coordination is unavailable in this browser.')
      await locks.request(DOWNLOAD_INTENT_KEY, () => {
        const current = read()
        const next = new Set(current.keys)
        remove.forEach((key) => next.delete(key))
        add.forEach((key) => next.add(key))
        requirePersistedJsonMutation(store.write([...next], current.revision))
      })
    },
  }
}
