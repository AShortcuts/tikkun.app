import { afterEach, expect, test, vi } from 'vitest'
import { resourceDecision, runResourceAware } from './video-resource-scheduler.mjs'

const GiB = 1024 ** 3
const healthy = { cpuCount: 8, cpuUsage: 0.2, totalMemory: 32 * GiB, freeMemory: 20 * GiB, freeDisk: 100 * GiB }
const limits = { target: 4, limit: 99, memoryPerJob: 2 * GiB }
afterEach(() => vi.useRealTimers())

test('critical memory and disk levels stop rather than risk partial output', () => {
  expect(resourceDecision({ ...healthy, freeMemory: 0.4 * GiB }, limits).fatal).toMatch(/memory/)
  expect(resourceDecision({ ...healthy, freeDisk: GiB }, limits).fatal).toMatch(/disk/)
})

function setup(overrides = {}, ids = ['a', 'b', 'c', 'd']) {
  vi.useFakeTimers()
  vi.setSystemTime(0)
  const starts = []
  const messages = []
  const saved = []
  const onFatal = vi.fn(async () => {})
  const options = {
    limit: 3,
    memoryPerJob: 2 * GiB,
    sample: async () => healthy,
    worker: async (item, checkpoint) => {
      starts.push({ id: item.id, time: Date.now() })
      for (let i = 0; i < 10; i++) {
        await new Promise((resolve) => setTimeout(resolve, 10))
        checkpoint()
      }
      return { ok: true, report: { audioId: item.id } }
    },
    onResult: async (result) => { saved.push(result) },
    onFatal,
    log: (message) => { messages.push(message) },
    tickMs: 10,
    rampMs: 30,
    idleTimeoutMs: 50,
    ...overrides,
  }
  const promise = runResourceAware(ids.map((id) => ({ id })), options)
  return { promise, starts, messages, saved, onFatal }
}

test('starts one, ramps gradually, saves each result and respects the ceiling', async () => {
  const run = setup()
  await vi.advanceTimersByTimeAsync(20)
  expect(run.starts).toEqual([{ id: 'a', time: 0 }])
  await vi.advanceTimersByTimeAsync(500)
  const result = await run.promise
  expect(result.peakConcurrency).toBe(3)
  expect(result.failure).toBeNull()
  expect(result.results).toHaveLength(4)
  expect(run.saved).toHaveLength(4)
})

test('critical pressure aborts in-flight work, stops admission, and reports unfinished IDs', async () => {
  const run = setup({ sample: async () => ({ ...healthy, freeDisk: Date.now() >= 20 ? GiB : healthy.freeDisk }) })
  await vi.advanceTimersByTimeAsync(200)
  const result = await run.promise
  expect(result.failure.message).toMatch(/Resource safety stop/)
  expect(run.onFatal).toHaveBeenCalledOnce()
  expect(result.unstarted).toEqual(['b', 'c', 'd'])
  expect(result.results[0].ok).toBe(false)
  expect(run.saved).toHaveLength(1)
})
