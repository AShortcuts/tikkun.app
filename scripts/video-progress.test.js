import process from 'node:process'
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
