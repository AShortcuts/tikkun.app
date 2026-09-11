import vm from 'node:vm'
import { expect, test, vi } from 'vitest'
import { renderOfflineTransferQueue } from './offline-transfer-queue.mjs'

type Run = <T>(signal: AbortSignal | undefined, task: () => Promise<T>) => Promise<T>
function queue(locks?: Pick<LockManager, 'request'>): Run {
  return vm.runInNewContext(`${renderOfflineTransferQueue('test')}; withOfflineTransferSlot`, {
    AbortController, self: { navigator: { locks } },
  })
}
function gate() {
  let release!: () => void
  const promise = new Promise<void>((resolve) => { release = resolve })
  return { promise, release }
}

test('runs two tasks and keeps each slot through completion, with FIFO waiting', async () => {
  const run = queue()
  const gates = [gate(), gate(), gate(), gate()]
  const started: number[] = []
  const work = gates.map((entry, index) => run(undefined, async () => {
    started.push(index)
    await entry.promise
    return index
  }))
  await vi.waitFor(() => expect(started).toEqual([0, 1]))
  gates[1].release()
  await vi.waitFor(() => expect(started).toEqual([0, 1, 2]))
  gates[2].release()
  await vi.waitFor(() => expect(started).toEqual([0, 1, 2, 3]))
  gates[0].release(); gates[3].release()
  await expect(Promise.all(work)).resolves.toEqual([0, 1, 2, 3])
})

test('cancelling a waiting task never starts it or occupies the next free slot', async () => {
  const run = queue()
  const blocked = gate()
  const first = run(undefined, () => blocked.promise)
  const second = run(undefined, () => blocked.promise)
  const controller = new AbortController()
  const task = vi.fn(async () => {})
  const waiting = run(controller.signal, task)
  const cancelled = expect(waiting).rejects.toMatchObject({ name: 'AbortError' })
  controller.abort()
  await cancelled
  blocked.release()
  await Promise.all([first, second])
  await expect(run(undefined, async () => 'next')).resolves.toBe('next')
  expect(task).not.toHaveBeenCalled()
})

test('a cancellation before the task microtask and a failed task both release their slots', async () => {
  const run = queue()
  const controller = new AbortController()
  const task = vi.fn(async () => {})
  const cancelled = run(controller.signal, task)
  controller.abort()
  await expect(cancelled).rejects.toMatchObject({ name: 'AbortError' })
  await expect(run(undefined, async () => { throw new Error('Write failed') })).rejects.toThrow('Write failed')
  await expect(run(undefined, async () => 42)).resolves.toBe(42)
  expect(task).not.toHaveBeenCalled()
})

test('failed Web Locks acquisition is an error, not an uncoordinated download', async () => {
  const task = vi.fn(async () => {})
  const run = queue({ request: vi.fn(async () => { throw new Error('Locks unavailable') }) })
  await expect(run(undefined, task)).rejects.toThrow('Locks unavailable')
  expect(task).not.toHaveBeenCalled()
})
