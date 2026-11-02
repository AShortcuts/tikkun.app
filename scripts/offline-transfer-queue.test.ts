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

test('failed Web Locks acquisition is an error, not an uncoordinated download', async () => {
  const task = vi.fn(async () => {})
  const run = queue({ request: vi.fn(async () => { throw new Error('Locks unavailable') }) })
  await expect(run(undefined, task)).rejects.toThrow('Locks unavailable')
  expect(task).not.toHaveBeenCalled()
})
