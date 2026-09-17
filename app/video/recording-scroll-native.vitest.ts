import { afterEach, expect, test } from 'vitest'
import { retargetRecordingScroll, sampleRecordingScroll } from './recording-scroll.ts'

let book: HTMLElement | null = null
afterEach(() => book?.remove())
const raf = () => new Promise<number>(resolve => requestAnimationFrame(resolve))

test.each([
  { first: 60, next: 60, afterMs: 60 },
  { first: 300, next: 600, afterMs: 80 },
  { first: 300, next: 60, afterMs: 80 },
  { first: 60, next: 120, afterMs: 60 },
])('matches native scrollTo through $first -> $next px interruption', async ({ first, next, afterMs }) => {
  const root = document.createElement('div')
  book = root
  root.style.cssText = 'height:240px;width:500px;overflow:auto;scroll-behavior:auto;overflow-anchor:none;'
  root.innerHTML = '<div style="height:10000px"></div>'
  document.body.append(root)
  root.scrollTo({ top: 2000, behavior: 'instant' })
  await raf()
  await raf()
  const start = await raf()
  root.scrollTo({ top: 2000 + first, behavior: 'smooth' })
  let curve = retargetRecordingScroll(null, 2000, 2000 + first, 0)!
  let retargeted = false
  let finished = false
  let maxPixelError = 0
  for (let index = 0; index < 150; index++) {
    const ms = (await raf()) - start
    const sampled = sampleRecordingScroll(curve, ms)
    const predicted = Math.round(sampled.position)
    maxPixelError = Math.max(maxPixelError, Math.abs(root.scrollTop - predicted))
    if (!retargeted && ms >= afterMs) {
      retargeted = true
      root.scrollTo({ top: 2000 + next, behavior: 'smooth' })
      curve = retargetRecordingScroll(curve, predicted, 2000 + next, ms)!
    } else if (retargeted && root.scrollTop === 2000 + next && sampled.finished) {
      finished = true
      break
    }
  }
  expect(finished).toBe(true)
  // Native scroll positions are rounded, and its float timing math differs
  // slightly from JavaScript. Carrying velocity would fail by tens of pixels.
  expect(maxPixelError).toBeLessThanOrEqual(2)
})
