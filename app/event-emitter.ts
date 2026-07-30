type Listener<T> = (payload: T) => void

export class EventEmitter<T> {
  private listeners: { [Name in keyof T]?: Listener<T[Name]>[] } = {}

  emit<Name extends keyof T>(name: Name, payload: T[Name]): void {
    const listeners = this.listeners[name]
    if (!listeners) return

    for (const listener of [...listeners]) listener(payload)
  }

  on<Name extends keyof T>(name: Name, callback: Listener<T[Name]>): () => void {
    const listeners = this.listeners[name] ?? []

    listeners.push(callback)
    this.listeners[name] = listeners

    return () => {
      const currentListeners = this.listeners[name]
      if (!currentListeners) return
      const index = currentListeners.indexOf(callback)
      if (index >= 0) currentListeners.splice(index, 1)
      if (!currentListeners.length) delete this.listeners[name]
    }
  }
}

export default {
  new: <T>(): EventEmitter<T> => {
    return new EventEmitter<T>()
  },
}
