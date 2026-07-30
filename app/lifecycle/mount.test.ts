import { expect, test, vi } from 'vitest'
import { EventEmitter } from '../event-emitter.ts'
import {
  createMount,
  MountCleanupError,
  type MountScope,
} from './mount.ts'

test('replacing a mount aborts and tears down the previous implementation', () => {
  const target = new EventTarget()
  const mount = createMount()
  const calls: string[] = []
  let firstSignal: AbortSignal | null = null
  let secondSignal: AbortSignal | null = null

  const destroyFirst = mount((scope) => {
    firstSignal = scope.signal
    target.addEventListener('change', () => calls.push('first'), {
      signal: scope.signal,
    })
    scope.own(() => calls.push('destroy first'))
  })
  target.dispatchEvent(new Event('change'))

  const destroySecond = mount((scope) => {
    secondSignal = scope.signal
    target.addEventListener('change', () => calls.push('second'), {
      signal: scope.signal,
    })
    scope.own(() => calls.push('destroy second'))
  })

  expect(firstSignal!.aborted).toBe(true)
  expect(secondSignal!.aborted).toBe(false)
  expect(calls).toEqual(['first', 'destroy first'])

  destroyFirst()
  target.dispatchEvent(new Event('change'))
  expect(calls).toEqual(['first', 'destroy first', 'second'])
  expect(secondSignal!.aborted).toBe(false)

  destroySecond()
  destroySecond()
  expect(calls).toEqual(['first', 'destroy first', 'second', 'destroy second'])
})

test('owned resources release once in reverse registration order', () => {
  const mount = createMount()
  const calls: string[] = []

  const destroy = mount((scope) => {
    scope.own(() => calls.push('first'))
    const releaseSecond = scope.own(() => calls.push('second'))
    scope.own(() => calls.push('third'))
    releaseSecond()
    releaseSecond()
  })

  expect(calls).toEqual(['second'])
  destroy()
  expect(calls).toEqual(['second', 'third', 'first'])
})

test('subscriptions do not duplicate across remounts', () => {
  type Events = { update: number }
  const emitter = new EventEmitter<Events>()
  const mount = createMount()
  const listener = vi.fn()

  const attach = () =>
    mount((scope) => {
      scope.own(emitter.on('update', listener))
    })

  const destroyFirst = attach()
  emitter.emit('update', 1)
  const destroySecond = attach()
  emitter.emit('update', 2)
  destroyFirst()
  emitter.emit('update', 3)
  destroySecond()
  emitter.emit('update', 4)

  expect(listener.mock.calls).toEqual([[1], [2], [3]])
})

test('setup failure rolls back resources and aborts the scope', () => {
  const mount = createMount()
  const cleanup = vi.fn()
  let scope: MountScope | null = null

  expect(() =>
    mount((currentScope) => {
      scope = currentScope
      currentScope.own(cleanup)
      throw new Error('setup failed')
    })
  ).toThrow('setup failed')

  expect(scope!.signal.aborted).toBe(true)
  expect(cleanup).toHaveBeenCalledOnce()
})

test('async setup is rejected and rolled back', () => {
  const mount = createMount()
  const cleanup = vi.fn()
  let signal: AbortSignal | null = null

  expect(() =>
    mount(async (scope) => {
      signal = scope.signal
      scope.own(cleanup)
    })
  ).toThrow('Mount setup must be synchronous')

  expect(signal!.aborted).toBe(true)
  expect(cleanup).toHaveBeenCalledOnce()
})

test('teardown attempts every cleanup and reports all failures', () => {
  const mount = createMount()
  const completedCleanup = vi.fn()
  const firstError = new Error('first cleanup failed')
  const secondError = new Error('second cleanup failed')

  const destroy = mount((scope) => {
    scope.own(() => {
      throw firstError
    })
    scope.own(completedCleanup)
    scope.own(() => {
      throw secondError
    })
  })

  let thrown: unknown
  try {
    destroy()
  } catch (error) {
    thrown = error
  }

  expect(completedCleanup).toHaveBeenCalledOnce()
  expect(thrown).toBeInstanceOf(MountCleanupError)
  expect((thrown as MountCleanupError).errors).toEqual([secondError, firstError])
})

test('resources acquired after destruction are released immediately', () => {
  const mount = createMount()
  let scope: MountScope | null = null
  const cleanup = vi.fn()

  const destroy = mount((currentScope) => {
    scope = currentScope
  })
  destroy()
  scope!.own(cleanup)

  expect(cleanup).toHaveBeenCalledOnce()
})
