import { expect, test } from 'vitest'
import { nextCaptureFrame, validateRecordingCues } from './cue-frame-plan.ts'
import type { WordCue } from '../audio/types.ts'

const cue = (timeStart: number): WordCue => ({ timeStart, pageNumber: 1, lineIndex: 0, fragmentIndex: 0, wordIndex: 0 })

test.each([30])('captures every moving frame at %s fps', fps => {
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

test('validates cues without moving tightly spaced cues to later frames', () => {
  const cues = [cue(0.501), cue(0.502), cue(0.503)]
  expect(() => validateRecordingCues(cues, 1)).not.toThrow()
  expect(cues.map(cue => cue.timeStart)).toEqual([0.501, 0.502, 0.503])
  for (const invalid of [[cue(-1)], [cue(2)], [cue(0.5), cue(0.5)], [cue(0.5), cue(0.4)], [{ ...cue(0.5), timeEnd: 0.4 }]]) {
    expect(() => validateRecordingCues(invalid, 1)).toThrow()
  }
})
