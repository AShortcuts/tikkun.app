import { afterEach, expect, test, vi } from 'vitest'
import { createResourceSampler, macAvailableMemory, resourceDecision, runResourceAware } from './video-resource-scheduler.mjs'
import os from 'node:os'

const GiB = 1024 ** 3
const healthy = { cpuCount: 8, cpuUsage: 0.2, totalMemory: 32 * GiB, freeMemory: 20 * GiB, freeDisk: 100 * GiB }
const limits = { target: 4, limit: 99, memoryPerJob: 2 * GiB }
afterEach(() => vi.useRealTimers())

test('macOS uses available-memory percentage instead of almost-empty free pages', () => {
  const freeMemory = macAvailableMemory('The system has 25769803776 bytes.\nSystem-wide memory free percentage: 29%\n', 24 * GiB)
  expect(freeMemory / GiB).toBeCloseTo(6.96)
  expect(resourceDecision({ ...healthy, totalMemory: 24 * GiB, freeMemory }, limits).canStart).toBe(true)
})

test.each(['', 'System-wide memory free percentage: 101%', 'System-wide memory free percentage: NaN%'])('invalid macOS memory query fails closed: %s', (output) => {
  expect(() => macAvailableMemory(output, 24 * GiB)).toThrow(/macOS memory pressure query/)
})

test('huge requested concurrency is capped by CPU capacity', () => {
  expect(resourceDecision(healthy, limits)).toMatchObject({ ceiling: 4, canStart: true })
})

test('CPU pressure reduces admission without changing render quality', () => {
  expect(resourceDecision({ ...healthy, cpuUsage: 0.95 }, limits)).toMatchObject({ target: 2, canStart: false })
})

test('memory reserve includes the estimated cost of the next recording', () => {
  expect(resourceDecision({ ...healthy, freeMemory: 6 * GiB }, limits).canStart).toBe(false)
  expect(resourceDecision({ ...healthy, freeMemory: 8 * GiB }, limits).canStart).toBe(true)
})

test('critical memory and disk levels stop rather than risk partial output', () => {
  expect(resourceDecision({ ...healthy, freeMemory: 0.4 * GiB }, limits).fatal).toMatch(/memory/)
  expect(resourceDecision({ ...healthy, freeDisk: GiB }, limits).fatal).toMatch(/disk/)
})

test('missing resource readings cannot authorize a new job', () => {
  expect(() => resourceDecision({ ...healthy, freeMemory: NaN }, limits)).toThrow(/invalid/)
  expect(() => resourceDecision({ ...healthy, cpuUsage: NaN }, limits)).toThrow(/invalid/)
})

test('real read-only resource sampler returns usable CPU, memory and disk readings', async () => {
  const sample = createResourceSampler(os.tmpdir(), os.tmpdir())
  const snapshot = await sample()
  expect(snapshot.cpuCount).toBeGreaterThan(0)
  expect(snapshot.freeDisk).toBeGreaterThan(0)
  expect(snapshot.freeMemory).toBeGreaterThan(0)
  expect(() => resourceDecision(snapshot, limits)).not.toThrow()
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

test('one selected aliyah never increases the concurrency target or its log', async () => {
  const states = []
  const run = setup({ limit: 5, onState: state => states.push(state) }, ['beresheet-3'])
  await vi.advanceTimersByTimeAsync(500)
  expect((await run.promise).peakConcurrency).toBe(1)
  expect(run.messages.filter(message => message.includes('Increasing concurrency'))).toEqual([])
  expect(states.some(state => state.active === 1 && state.queued === 0 && state.ceiling === 1)).toBe(true)
  expect(states.every(state => state.target <= 1)).toBe(true)
})

test('concurrency stops ramping after the last queued aliyah starts', async () => {
  const states = []
  const run = setup({ limit: 5, onState: state => states.push(state) }, ['a', 'b'])
  await vi.advanceTimersByTimeAsync(500)
  expect((await run.promise).peakConcurrency).toBe(2)
  expect(run.messages.filter(message => message.includes('Increasing concurrency'))).toHaveLength(1)
  expect(states.every(state => state.target <= state.active + state.queued)).toBe(true)
  expect(states.at(-1)).toMatchObject({ active: 0, queued: 0, target: 0 })
})

test('busy CPU holds queued recordings, then resumes as pressure clears', async () => {
  const run = setup({ sample: async () => ({ ...healthy, cpuUsage: Date.now() < 30 ? 0.95 : 0.2 }) })
  await vi.advanceTimersByTimeAsync(20)
  expect(run.starts).toHaveLength(0)
  await vi.advanceTimersByTimeAsync(500)
  expect((await run.promise).failure).toBeNull()
  expect(run.starts[0].time).toBe(30)
})

test('CPU pressure after ramp stops admission until active jobs finish', async () => {
  const run = setup({ sample: async () => ({ ...healthy, cpuUsage: Date.now() >= 40 && Date.now() < 120 ? 0.95 : 0.2 }) })
  await vi.advanceTimersByTimeAsync(110)
  expect(run.starts).toHaveLength(2)
  expect(run.messages.some((message) => message.includes('Reducing concurrency 2 -> 1'))).toBe(true)
  await vi.advanceTimersByTimeAsync(500)
  expect((await run.promise).results).toHaveLength(4)
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

test('unavailable resource headroom times out with an actionable failure', async () => {
  const run = setup({ sample: async () => ({ ...healthy, cpuUsage: 0.99 }) })
  await vi.advanceTimersByTimeAsync(100)
  const result = await run.promise
  expect(result.failure.message).toMatch(/headroom unavailable/)
  expect(run.starts).toHaveLength(0)
  expect(result.unstarted).toHaveLength(4)
})

test('failed recording stops the queue and is saved immediately', async () => {
  const run = setup({ worker: async (item) => ({ ok: false, report: { audioId: item.id, error: 'missing frame' } }) })
  await vi.advanceTimersByTimeAsync(100)
  const result = await run.promise
  expect(result.failure.message).toMatch(/Recording failed/)
  expect(result.unstarted).toHaveLength(3)
  expect(run.saved[0].report.error).toBe('missing frame')
})

test('resource inspection errors abort rather than assuming spare capacity', async () => {
  const run = setup({ sample: async () => { throw new Error('statfs failed') } })
  await vi.advanceTimersByTimeAsync(100)
  expect((await run.promise).failure.message).toBe('statfs failed')
  expect(run.onFatal).toHaveBeenCalledOnce()
  expect(run.starts).toHaveLength(0)
})

test('a numeric ceiling of one stays serial even with abundant resources', async () => {
  const run = setup({ limit: 1 })
  await vi.advanceTimersByTimeAsync(500)
  expect((await run.promise).peakConcurrency).toBe(1)
  expect(run.saved).toHaveLength(4)
})

test('persistence failures stop owned work and prevent new jobs', async () => {
  const run = setup({ onResult: async () => { throw new Error('metadata disk write failed') } })
  await vi.advanceTimersByTimeAsync(500)
  const result = await run.promise
  expect(result.failure.message).toMatch(/Could not save recording result/)
  expect(run.onFatal).toHaveBeenCalledOnce()
  expect(result.unstarted).toEqual(['d'])
})
