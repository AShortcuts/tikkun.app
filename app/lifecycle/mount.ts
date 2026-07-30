export type Destroy = () => void

export interface MountScope {
  /** Aborted before owned resources are released. */
  readonly signal: AbortSignal

  /**
   * Transfers teardown ownership to this mount.
   * The returned release function is idempotent and may be called early.
   */
  own(destroy: Destroy): Destroy
}

export type Mount = (setup: (scope: MountScope) => void) => Destroy

export class MountCleanupError extends Error {
  readonly errors: readonly unknown[]

  constructor(message: string, errors: readonly unknown[]) {
    super(message)
    this.name = 'MountCleanupError'
    this.errors = errors
  }
}

type MountRecord = {
  readonly controller: AbortController
  readonly teardowns: Destroy[]
  destroyed: boolean
}

function cleanupErrors(error: unknown): readonly unknown[] {
  return error instanceof MountCleanupError ? error.errors : [error]
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  if (
    (typeof value !== 'object' && typeof value !== 'function') ||
    value === null
  ) {
    return false
  }
  return typeof (value as { then?: unknown }).then === 'function'
}

/**
 * Creates one replaceable mount slot. Mounting a replacement destroys the
 * previous implementation first, while stale destroy functions remain harmless.
 */
export function createMount(): Mount {
  let active: MountRecord | null = null
  let transitioning = false

  const destroyRecord = (record: MountRecord) => {
    if (record.destroyed) return

    record.destroyed = true
    if (active === record) active = null

    const errors: unknown[] = []
    try {
      record.controller.abort()
    } catch (error) {
      errors.push(error)
    }

    const teardowns = record.teardowns.splice(0)
    for (let index = teardowns.length - 1; index >= 0; index -= 1) {
      try {
        teardowns[index]()
      } catch (error) {
        errors.push(error)
      }
    }

    if (errors.length) {
      throw new MountCleanupError('Mount teardown failed', errors)
    }
  }

  return (setup) => {
    if (transitioning) {
      throw new Error('Mount transitions cannot be nested')
    }

    transitioning = true
    try {
      if (active) destroyRecord(active)

      const record: MountRecord = {
        controller: new AbortController(),
        teardowns: [],
        destroyed: false,
      }
      active = record

      const own = (destroy: Destroy): Destroy => {
        if (typeof destroy !== 'function') {
          throw new TypeError('Owned teardown must be a function')
        }

        let owned = true
        const release = () => {
          if (!owned) return
          owned = false

          const index = record.teardowns.indexOf(release)
          if (index >= 0) record.teardowns.splice(index, 1)
          destroy()
        }

        if (record.destroyed) release()
        else record.teardowns.push(release)
        return release
      }

      try {
        const result: unknown = setup({
          signal: record.controller.signal,
          own,
        })
        if (isPromiseLike(result)) {
          throw new TypeError('Mount setup must be synchronous')
        }
      } catch (setupError) {
        try {
          destroyRecord(record)
        } catch (teardownError) {
          throw new MountCleanupError('Mount setup and rollback failed', [
            setupError,
            ...cleanupErrors(teardownError),
          ])
        }
        throw setupError
      }

      return () => {
        if (record.destroyed) return
        if (transitioning) {
          throw new Error('Mount transitions cannot be nested')
        }

        transitioning = true
        try {
          destroyRecord(record)
        } finally {
          transitioning = false
        }
      }
    } finally {
      transitioning = false
    }
  }
}
