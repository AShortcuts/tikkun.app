import { expect, test } from 'vitest'
import { renderOfflineTransferQueue } from './offline-transfer-queue.mjs'

type Run = <T>(signal: AbortSignal, task: () => Promise<T>) => Promise<T>

test('independent worker queues share two real browser locks and cancel waiting work', async () => {
  const namespace = crypto.randomUUID()
  const create = (): Run => new Function('self', `${renderOfflineTransferQueue(namespace)}; return withOfflineTransferSlot`)(globalThis)
  const queues = [create(), create()]
  const controllers = Array.from({ length: 4 }, () => new AbortController())
  const releases: (() => void)[] = []
  const gates = controllers.map(() => new Promise<void>((resolve) => releases.push(resolve)))
  const started: number[] = []
  let active = 0
  let peak = 0
  const work = controllers.map((controller, index) => queues[index % 2](controller.signal, async () => {
    started.push(index)
    active += 1
    peak = Math.max(peak, active)
    try { await gates[index]; return index }
    finally { active -= 1 }
  }))
  const settled = Promise.allSettled(work)
  try {
    await expect.poll(() => started.length).toBe(2)
    const waiting = controllers.findIndex((_, index) => !started.includes(index))
    const cancelled = expect(work[waiting]).rejects.toMatchObject({ name: 'AbortError' })
    controllers[waiting].abort()
    await cancelled
    expect(started).toHaveLength(2)
    releases[started[0]]()
    await expect.poll(() => started.length).toBe(3)
    expect(started).not.toContain(waiting)
    expect(peak).toBe(2)
  } finally {
    releases.forEach((release) => release())
    await settled
  }
  const locks = await navigator.locks.query()
  expect(locks.held?.filter((lock) => lock.name?.includes(namespace))).toEqual([])
  expect(locks.pending?.filter((lock) => lock.name?.includes(namespace))).toEqual([])
})
