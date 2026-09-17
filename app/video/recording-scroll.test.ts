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

test('keeps scrolling toward the same line without restarting on each word', () => {
  const scroll = retargetRecordingScroll(null, 0, 300, 0)!
  const position = sampleRecordingScroll(scroll, 80).position
  expect(retargetRecordingScroll(scroll, position, 300, 80)).toBe(scroll)
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

test('supports backward movement and stops at an already reached destination', () => {
  const scroll = retargetRecordingScroll(null, 500, 10, 0)!
  expect(sampleRecordingScroll(scroll, 100).position).toBeLessThan(500)
  expect(sampleRecordingScroll(scroll, 3000).position).toBe(10)
  expect(retargetRecordingScroll(null, 10, 10.1, 0)).toBeNull()
  expect(() => retargetRecordingScroll(null, NaN, 10, 0)).toThrow()
})

test('distinguishes an unchanged target from a near-current ignored request', () => {
  const scroll = retargetRecordingScroll(null, 0, 300, 0)!
  const current = sampleRecordingScroll(scroll, 90).position
  expect(retargetRecordingScroll(scroll, current, current + 0.25, 90)).toBe(scroll)
  const changed = retargetRecordingScroll(scroll, current, 300.25, 90)!
  expect(changed).not.toBe(scroll)
  expect(changed.to).toBe(300.25)
  expect(sampleRecordingScroll(changed, 90).velocity).toBe(0)
})
