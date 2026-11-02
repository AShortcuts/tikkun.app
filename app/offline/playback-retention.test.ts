import { expect, test, vi } from 'vitest'
import { createPlaybackRetention } from './playback-retention.ts'

const deferred = () => {
  let resolve!: () => void
  let reject!: (reason: Error) => void
  const promise = new Promise<void>((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}

function harness() {
  let current: readonly string[] = ['first', 'later']
  let released = Promise.resolve()
  const onReleased = vi.fn(async () => {})
  const retention = createPlaybackRetention({ currentSources: () => current, whenReleased: () => released, onReleased })
  return { retention, onReleased, change(sources: readonly string[], clearing = Promise.resolve()) { current = sources; released = clearing } }
}

test('route reset retains every source until native clear succeeds', async () => {
  const { retention, onReleased, change } = harness()
  await retention.sync()
  onReleased.mockClear()
  const clearing = deferred()
  change([], clearing.promise)
  const pending = retention.sync()
  expect(retention.sources()).toEqual(['first', 'later'])
  expect(onReleased).not.toHaveBeenCalled()
  clearing.resolve()
  await pending
  expect(retention.sources()).toEqual([])
  expect(onReleased).toHaveBeenCalledOnce()
})

test('older acknowledgment cannot release a newer replacement or its old files', async () => {
  const { retention, change } = harness()
  await retention.sync()
  const first = deferred(), second = deferred()
  change(['replacement'], first.promise)
  const one = retention.sync()
  change(['newest'], second.promise)
  const two = retention.sync()
  first.resolve()
  await one
  expect(retention.sources()).toEqual(['first', 'later', 'replacement', 'newest'])
  second.resolve()
  await two
  expect(retention.sources()).toEqual(['newest'])
})
