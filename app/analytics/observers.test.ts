import { afterEach, expect, test, vi } from 'vitest'
import { installAnalytics } from './client.ts'
import { createDownloadAnalytics, createPlaybackAnalytics } from './observers.ts'

let stop: (() => void) | undefined
afterEach(() => { stop?.(); stop = undefined })
function sink() {
  const track = vi.fn()
  let collecting = true
  stop = installAnalytics({ isCollecting: () => collecting, track, page() {}, destroy() {} })
  return { track, allow: (value: boolean) => { collecting = value } }
}
const snapshot = (currentTime: number, playing = true, ended = false) => ({
  sessionRevision: 1, session: { cueCount: 12 }, currentTime, playing, ended,
})
test('playback counts actual state changes, excludes seeking, and emits one completion', () => {
  const { track } = sink(); let clock = 0
  const observer = createPlaybackAnalytics(() => clock)
  const update = (time: number, playing = true, ended = false) => { clock += 1000; observer.update({ type: 'reader-chrome' }, snapshot(time, playing, ended)) }
  update(0); update(1); update(2); update(100); update(101); update(101, false); update(101, false)
  update(101); update(102); update(103, false, true); update(103, false, true)
  expect(track.mock.calls.filter(([name]) => name === 'playback_start')).toHaveLength(1)
  expect(track.mock.calls.filter(([name]) => name === 'playback_pause')).toHaveLength(1)
  expect(track.mock.calls.filter(([name]) => name === 'playback_complete')).toHaveLength(1)
  expect(track.mock.calls.filter(([name]) => name === 'playback_listened').map(([, p]) => p.seconds)).toEqual([3, 1])
})
test('playback while opted out is discarded instead of accumulated', () => {
  const { track, allow } = sink(); let clock = 0
  const observer = createPlaybackAnalytics(() => clock)
  allow(false)
  for (let time = 0; time <= 20; time++) { clock += 1000; observer.update({ type: 'reader-chrome' }, snapshot(time)) }
  allow(true)
  observer.update({ type: 'reader-chrome' }, snapshot(20))
  clock += 1000; observer.update({ type: 'reader-chrome' }, snapshot(21))
  observer.flush()
  expect(track.mock.calls).toEqual([['playback_start', { timed: true }], ['playback_listened', { seconds: 1 }]])
})
test('downloads count terminal outcomes only for newly queued operations, not restored inventory or progress ticks', () => {
  const { track } = sink()
  const observe = createDownloadAnalytics()
  const update = (phase: 'idle' | 'queued' | 'downloading' | 'stored' | 'error' | 'paused') => observe({ entries: [{ key: 'local-only-identity', phase }] })
  update('stored'); update('stored'); update('idle'); update('queued'); update('downloading'); update('downloading'); update('stored'); update('stored')
  update('queued'); update('error'); update('queued'); update('paused')
  expect(track.mock.calls.map(([name]) => name)).toEqual(['download_start', 'download_complete', 'download_start', 'download_error', 'download_start', 'download_pause'])
  expect(JSON.stringify(track.mock.calls)).not.toContain('local-only-identity')
})
