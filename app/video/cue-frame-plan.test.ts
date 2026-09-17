import { expect, test } from 'vitest'
import { nextCaptureFrame, validateRecordingCues, createCueConcatEntries, renderCueConcatFile } from './cue-frame-plan.ts'
import type { WordCue } from '../audio/types.ts'

const cue = (timeStart: number): WordCue => ({ timeStart, pageNumber: 1, lineIndex: 0, fragmentIndex: 0, wordIndex: 0 })

test.each([30, 60])('captures every moving frame at %s fps', fps => {
  for (let frameIndex = 0; frameIndex < fps; frameIndex++) {
    expect(nextCaptureFrame({ frameIndex, frameCount: fps, fps, stableUntil: null })).toBe(frameIndex + 1)
  }
})

test('holds only until the first frame at or after a real cue start', () => {
  expect(nextCaptureFrame({ frameIndex: 4, frameCount: 60, fps: 30, stableUntil: 0.517 })).toBe(16)
  expect(nextCaptureFrame({ frameIndex: 4, frameCount: 60, fps: 30, stableUntil: 0.5 })).toBe(15)
  expect(nextCaptureFrame({ frameIndex: 16, frameCount: 60, fps: 30, stableUntil: 0.552 })).toBe(17)
})

test('clamps a final held image to the exact output frame count', () => {
  expect(nextCaptureFrame({ frameIndex: 4, frameCount: 10, fps: 30, stableUntil: 0.3331 })).toBe(10)
  expect(nextCaptureFrame({ frameIndex: 9, frameCount: 10, fps: 30, stableUntil: null })).toBe(10)
})

test('rejects missing, invalid, or stale motion state', () => {
  for (const stableUntil of [undefined, NaN, Infinity, -1, 0]) {
    expect(() => nextCaptureFrame({ frameIndex: 4, frameCount: 60, fps: 30, stableUntil: stableUntil! })).toThrow()
  }
})

test('rejects invalid frame ranges and frame rates', () => {
  for (const frameIndex of [-1, 0.5, 60, NaN]) {
    expect(() => nextCaptureFrame({ frameIndex, frameCount: 60, fps: 30, stableUntil: null })).toThrow()
  }
  expect(() => nextCaptureFrame({ frameIndex: 0, frameCount: 60, fps: 0, stableUntil: null })).toThrow()
})

test('validates cues without moving tightly spaced cues to later frames', () => {
  const cues = [cue(0.501), cue(0.502), cue(0.503)]
  expect(() => validateRecordingCues(cues, 1)).not.toThrow()
  expect(cues.map(cue => cue.timeStart)).toEqual([0.501, 0.502, 0.503])
  for (const invalid of [[cue(-1)], [cue(2)], [cue(0.5), cue(0.5)], [cue(0.5), cue(0.4)], [{ ...cue(0.5), timeEnd: 0.4 }]]) {
    expect(() => validateRecordingCues(invalid, 1)).toThrow()
  }
})

test('concat durations cover all held frames and escape paths', () => {
  const entries = createCueConcatEntries({
    plan: { frameCount: 60, entries: [{ frameIndex: 0, seconds: 0 }, { frameIndex: 16, seconds: 16 / 30 }, { frameIndex: 17, seconds: 17 / 30 }] },
    fps: 30, frameName: index => "/tmp/reader's frame-" + index + '.png',
  })
  expect(entries.map(entry => entry.durationSeconds)).toEqual([0.533333, 0.033333, 1.433333])
  expect(entries.reduce((total, entry) => total + entry.durationSeconds, 0)).toBeCloseTo(2, 5)
  expect(renderCueConcatFile(entries, 30)).toContain("duration 1.433333")
  expect(renderCueConcatFile(entries, 30).split('\n').filter(line => line.startsWith('file '))).toHaveLength(4)
  expect(renderCueConcatFile(entries, 30).split('\n').filter(line => line === 'option framerate 30')).toHaveLength(4)
})

test('rejects malformed concat coverage', () => {
  expect(() => createCueConcatEntries({ plan: { frameCount: 4, entries: [{ frameIndex: 1, seconds: 1 / 30 }] }, fps: 30, frameName: () => 'frame.png' })).toThrow(/frame zero/)
  expect(() => createCueConcatEntries({ plan: { frameCount: 4, entries: [] }, fps: 30, frameName: () => 'frame.png' })).toThrow()
  expect(() => createCueConcatEntries({ plan: { frameCount: 4, entries: [{ frameIndex: 0, seconds: 0 }, { frameIndex: 0, seconds: 0 }] }, fps: 30, frameName: () => 'frame.png' })).toThrow()
})
