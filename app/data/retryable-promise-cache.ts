export class RetryablePromiseCache<Key, Value> {
  private readonly entries = new Map<Key, Promise<Value>>()

  get(key: Key, load: () => Promise<Value>) {
    const cached = this.entries.get(key)
    if (cached) return cached

    const pending = Promise.resolve().then(load)
    this.entries.set(key, pending)
    void pending.catch(() => {
      if (this.entries.get(key) === pending) this.entries.delete(key)
    })
    return pending
  }

  delete(key: Key, expected?: Promise<Value>) {
    if (expected && this.entries.get(key) !== expected) return false
    return this.entries.delete(key)
  }
}
