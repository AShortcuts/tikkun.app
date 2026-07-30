import { expect, test } from 'vitest'
import { ReaderRuntimeLifecycle } from './reader-runtime-lifecycle.ts'

test('starting a reader lifetime invalidates and aborts the previous one', () => {
  const lifecycle = new ReaderRuntimeLifecycle()
  const first = lifecycle.begin()
  const second = lifecycle.begin()

  expect(first.isCurrent()).toBe(false)
  expect(first.signal.aborted).toBe(true)
  expect(second.isCurrent()).toBe(true)
  expect(second.generation).toBeGreaterThan(first.generation)
})

test('cancelling invalidates the active reader lifetime', () => {
  const lifecycle = new ReaderRuntimeLifecycle()
  const lifetime = lifecycle.begin()

  lifecycle.cancel()

  expect(lifetime.isCurrent()).toBe(false)
  expect(lifetime.signal.aborted).toBe(true)
})
