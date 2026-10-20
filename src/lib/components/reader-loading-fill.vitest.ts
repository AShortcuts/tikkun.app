import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { createLoadingFill } from './reader-loading-fill.ts'

let callbacks: FrameRequestCallback[] = []
const elements: SVGSVGElement[] = []
const previousMotion = document.documentElement.dataset.readerReducedMotion

beforeEach(() => {
  callbacks = []
  document.documentElement.dataset.readerReducedMotion = 'off'
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => callbacks.push(callback))
  vi.stubGlobal('cancelAnimationFrame', () => { callbacks = [] })
})

afterEach(() => {
  vi.unstubAllGlobals()
  elements.splice(0).forEach(element => element.remove())
  if (previousMotion === undefined) delete document.documentElement.dataset.readerReducedMotion
  else document.documentElement.dataset.readerReducedMotion = previousMotion
})

function fillElement(empty = 80) {
  const element = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  element.style.clipPath = `inset(0 0 ${empty}% 0)`
  document.body.append(element)
  elements.push(element)
  return element
}

function runFrame(now: number) {
  const queued = callbacks
  callbacks = []
  queued.forEach(callback => callback(now))
}

const shown = (element: SVGSVGElement) =>
  1 - Number(element.style.clipPath.match(/([\d.]+)%/)![1]) / 100

test('every attached copy shows the same fill on every frame', () => {
  const fill = createLoadingFill()
  fill.set(0.2, 0.2)
  const upper = fillElement()
  const lower = fillElement()
  fill.attach(upper)
  fill.attach(lower)
  for (let frame = 0; frame <= 40; frame += 1) {
    if (frame === 10) fill.set(0.6, 0.2)
    runFrame(frame * 16)
    expect(lower.style.clipPath).toBe(upper.style.clipPath)
  }
  expect(shown(upper)).toBeGreaterThan(0.4)
})

test('a frozen page resumes where it paused instead of leaping ahead', () => {
  const run = (freezeMs: number) => {
    const fill = createLoadingFill()
    fill.set(0.2, 0.2)
    const element = fillElement()
    fill.attach(element)
    for (let frame = 0; frame <= 5; frame += 1) runFrame(frame * 16)
    fill.set(0.8, 0.2)
    runFrame(80 + freezeMs)
    return shown(element)
  }
  // A 600ms freeze advances exactly as far as one late 30fps frame.
  expect(run(600)).toBeCloseTo(run(1000 / 30), 6)
  expect(run(600)).toBeLessThan(0.3)
})

test('takes over from the startup animation with its speed', () => {
  const settle = (animated: boolean) => {
    const fill = createLoadingFill()
    fill.set(0.2, 0.2)
    const element = fillElement(79)
    if (animated) {
      const animation = element.animate(
        [{ clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 76% 0)' }],
        { duration: 2600, easing: 'cubic-bezier(0.25, 0.6, 0.3, 1)', fill: 'both' }
      )
      animation.currentTime = 700
    }
    fill.attach(element)
    const start = shown(element)
    runFrame(0)
    runFrame(16)
    runFrame(32)
    return shown(element) - start
  }
  // Without inherited speed the fill starts from rest; with it, it keeps moving.
  expect(settle(true)).toBeGreaterThan(settle(false) + 0.0005)
})
