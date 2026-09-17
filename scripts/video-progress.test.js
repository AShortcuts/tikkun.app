import process from 'node:process'
import { stripVTControlCharacters } from 'node:util'
import { afterEach, expect, test, vi } from 'vitest'
import { createVideoProgress } from './video-progress.mjs'

const displays = []
afterEach(() => {
  displays.splice(0).forEach(display => display.close())
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

function setup(isTTY = false, ids = ['beresheet-3'], options = {}) {
  vi.useFakeTimers()
  vi.setSystemTime(0)
  vi.stubEnv('TERM', 'xterm')
  const chunks = []
  const stream = { isTTY, columns: 100, rows: 24, write: chunk => chunks.push(chunk) }
  const display = createVideoProgress(ids.map(id => ({ id })), { stream, ...options })
  displays.push(display)
  return { display, stream, chunks, output: () => chunks.join('') }
}

test('percentage follows output frames, including reused frames; validation stays separate', () => {
  const run = setup()
  run.display.update('beresheet-3', { stage: 'capturing', fps: 60, frameCount: 360 })
  run.display.update('beresheet-3', { framesCompleted: 180 })
  vi.advanceTimersByTime(10000)
  expect(run.output()).toContain('50.0% frames | 0:03/0:06 video')
  expect(run.output()).toContain('render ETA ~0:10')
  run.display.update('beresheet-3', { framesCompleted: 360, stage: 'encoding' })
  run.display.update('beresheet-3', { stage: 'validating' })
  expect(run.output()).toContain('100.0% frames')
  expect(run.output()).toContain('beresheet-3 | validating')
  expect(run.output()).not.toContain('1/1 validated')
  run.display.complete({ ok: true, report: { audioId: 'beresheet-3', outputPath: '/tmp/result.mp4' } })
  expect(run.output()).toContain('1/1 validated')
  expect(run.output()).toContain('Validated beresheet-3: /tmp/result.mp4')
})

test('initial display respects the selected workload and configured maximum', () => {
  const single = setup()
  expect(single.output()).toContain('ceiling 1')
  const multiple = setup(false, ['a', 'b', 'c', 'd', 'e', 'f'])
  expect(multiple.output()).toContain('ceiling 5')
  const lower = setup(false, ['a', 'b', 'c'], { limit: 2 })
  expect(lower.output()).toContain('ceiling 2')
})

test('redirected logs have no terminal escapes and throttle frame updates', () => {
  const run = setup()
  run.display.update('beresheet-3', { stage: 'capturing', frameCount: 3600, fps: 60 })
  const initial = run.chunks.length
  for (let frame = 1; frame <= 54; frame++) {
    run.display.update('beresheet-3', { framesCompleted: frame })
    vi.advanceTimersByTime(1000 / 60)
  }
  expect(run.chunks).toHaveLength(initial)
  vi.advanceTimersByTime(110)
  expect(run.chunks.length).toBeGreaterThan(initial)
  expect(run.output()).toBe(stripVTControlCharacters(run.output()))
})

test.each([true, false])('progress refreshes within each second without new frames (TTY=%s)', isTTY => {
  const run = setup(isTTY)
  vi.advanceTimersByTime(50)
  run.display.update('beresheet-3', { stage: 'validating', frameCount: 360, framesCompleted: 360 })
  // An off-cycle stage update must not defer the heartbeat past one second.
  const initial = run.chunks.length
  vi.advanceTimersByTime(950)
  expect(run.chunks.length).toBeGreaterThan(initial)
  expect(run.chunks.at(-1)).toContain('elapsed 0:01')
  const next = run.chunks.length
  vi.advanceTimersByTime(1000)
  expect(run.chunks.length).toBeGreaterThan(next)
  expect(run.chunks.at(-1)).toContain('elapsed 0:02')
})

test('TTY refreshes in place, keeps simultaneous aliyot separate, and fits terminal width', () => {
  const run = setup(true, ['beresheet-2', 'beresheet-3'])
  run.display.scheduler({ active: 2, queued: 0, target: 2, ceiling: 2 })
  for (const [id, framesCompleted] of [['beresheet-2', 90], ['beresheet-3', 180]]) {
    run.display.update(id, { stage: 'capturing', fps: 60, frameCount: 360, framesCompleted })
  }
  vi.advanceTimersByTime(1000)
  expect(run.output()).toContain('\x1b[')
  const last = run.chunks.at(-1)
  expect(last).toContain('2 active | target 2 | ceiling 2')
  expect(last).toContain('beresheet-2 | capturing')
  expect(last).toContain('25.0% frames')
  expect(last).toContain('beresheet-3 | capturing')
  expect(last).toContain('50.0% frames')
  run.stream.columns = 50
  vi.advanceTimersByTime(1000)
  expect(run.chunks.at(-1).trimEnd().split('\n').every(line => line.length < 50)).toBe(true)
})

test('failed and interrupted jobs are not presented as validated; close releases timers and exit handler', () => {
  const exitListeners = process.listenerCount('exit')
  const run = setup(true, ['beresheet-2', 'beresheet-3'])
  run.display.update('beresheet-2', { stage: 'validating', frameCount: 360, framesCompleted: 360 })
  run.display.update('beresheet-3', { stage: 'preparing' })
  run.display.complete({ ok: false, report: { audioId: 'beresheet-2', error: 'decode failed' } })
  run.display.close()
  expect(run.output()).toContain('FAILED beresheet-2: decode failed')
  expect(run.output()).toContain('beresheet-3: stopped before validation')
  expect(run.output()).not.toContain('1/2 validated')
  expect(process.listenerCount('exit')).toBe(exitListeners)
  const size = run.chunks.length
  vi.advanceTimersByTime(10000)
  run.display.close()
  expect(run.chunks).toHaveLength(size)
})
