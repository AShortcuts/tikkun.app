import { expect, test } from 'vitest'
import { outputValidationErrors } from './video-output-validation.mjs'

const expected = { width: 1920, height: 1080, fps: 30, frameCount: 300, duration: 10, renderMode: 'deterministic-frames' }
const probe = {
  streams: [
    { codec_type: 'video', width: 1920, height: 1080, avg_frame_rate: '30/1', nb_read_frames: '300' },
    { codec_type: 'audio' },
  ],
  format: { duration: '10.0' },
}
const withVideo = (changes) => ({ ...probe, streams: [{ ...probe.streams[0], ...changes }, probe.streams[1]] })

test('complete video with exact frame count passes', () => {
  expect(outputValidationErrors(probe, expected, '')).toEqual([])
})

test.each(['299'])('rejects missing, extra or unavailable frame count %s', (nb_read_frames) => {
  expect(outputValidationErrors(withVideo({ nb_read_frames }), expected, '').join()).toMatch(/frame count/)
})

test('cue-keyframe held frames may duplicate but may not drop', () => {
  const cueExpected = { ...expected, renderMode: 'cue-keyframes' }
  expect(outputValidationErrors(probe, cueExpected, 'dup=20')).toEqual([])
  expect(outputValidationErrors(probe, cueExpected, 'drop=1').join()).toMatch(/dropped/)
})
