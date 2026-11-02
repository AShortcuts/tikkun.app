import { expect, test } from 'vitest'
import { retargetRecordingScroll, sampleRecordingScroll } from './recording-scroll.ts'

test('scrolls from the exact starting position to the destination without jumping', () => {
  const scroll = retargetRecordingScroll(null, 40, 400, 1200)!
  expect(sampleRecordingScroll(scroll, 1200).position).toBe(40)
  const positions = Array.from({ length: 31 }, (_, frame) => sampleRecordingScroll(scroll, 1200 + frame * scroll.durationMs / 30).position)
  expect(positions).toEqual([...positions].sort((a, b) => a - b))
  expect(positions.at(-1)).toBe(400)
  expect(sampleRecordingScroll(scroll, 4000)).toEqual({ position: 400, velocity: 0, finished: true })
})

test('restarts easing from the current position when another scrollTo target interrupts', () => {
  const scroll = retargetRecordingScroll(null, 0, 300, 0)!
  const current = sampleRecordingScroll(scroll, 90)
  const retargeted = retargetRecordingScroll(scroll, current.position, 600, 90)!
  expect(sampleRecordingScroll(retargeted, 90).position).toBe(current.position)
  expect(current.velocity).toBeGreaterThan(0)
  expect(sampleRecordingScroll(retargeted, 90).velocity).toBe(0)
  expect(sampleRecordingScroll(retargeted, 3000).position).toBe(600)
})
