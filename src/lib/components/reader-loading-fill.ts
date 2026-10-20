// One spring drives every copy of the loading aleph, so the door halves can never drift apart.

// Must match the reader-fill-start keyframes in ReaderLoadingMark.svelte.
const START_FILL = 0.24
const START_CURVE = [0.25, 0.6, 0.3, 1] as const

// The fill follows a critically damped spring, so it gathers and sheds speed
// instead of lurching. Its goal is the real progress plus a small creep that
// eases out over time and never passes a fraction of the next step, so a
// stalled load visibly comes to rest.
const SPRING_RATE = 11
const CREEP_SHARE = 0.35
const CREEP_TIME_S = 1.8
// Once startup completes, aim a little past full so the fill lands on full
// with some speed and stops, instead of spending a long spring tail near it.
const FINISH_LEAD = 0.04
const SUBSTEP_S = 1 / 120
// A frame that arrives late (the page was busy) advances at most this much, so a
// stall reads as a pause and the fill never leaps ahead to catch up.
const MAX_FRAME_S = 1 / 30

export type LoadingFill = {
  set(progress: number, step: number): void
  attach(element: SVGSVGElement): () => void
  onFilled(callback: () => void): () => void
}

function prefersReducedMotion() {
  const preference = document.documentElement.dataset.readerReducedMotion
  return preference === 'on'
    || (preference !== 'off' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
}

function cubicBezierSlope(x: number, [x1, y1, x2, y2]: readonly [number, number, number, number]) {
  const curve = (t: number, a: number, b: number) => 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t ** 2 * b + t ** 3
  const slope = (t: number, a: number, b: number) =>
    3 * (1 - t) ** 2 * a + 6 * (1 - t) * t * (b - a) + 3 * t ** 2 * (1 - b)
  let t = x
  for (let i = 0; i < 8; i += 1) {
    const dx = slope(t, x1, x2)
    if (Math.abs(dx) < 1e-6) break
    t = Math.min(1, Math.max(0, t - (curve(t, x1, x2) - x) / dx))
  }
  const dx = slope(t, x1, x2)
  return dx > 1e-6 ? slope(t, y1, y2) / dx : 0
}

function readStart(element: SVGSVGElement, fallback: number) {
  const empty = getComputedStyle(element).clipPath.match(/inset\(0(?:px)? 0(?:px)? ([\d.]+)%/)
  // An unreadable mask falls back to the real progress, never ahead of it.
  const shown = empty ? 1 - Number(empty[1]) / 100 : fallback
  // Inherit the pre-hydration animation's speed so the handoff has no stall.
  const animation = element.getAnimations()[0]
  const timing = animation?.effect?.getComputedTiming()
  const duration = Number(animation?.effect?.getTiming().duration)
  const fraction = timing?.progress
  const velocity = animation?.playState === 'running' && typeof fraction === 'number' && duration > 0
    ? cubicBezierSlope(fraction, START_CURVE) * START_FILL / (duration / 1000)
    : 0
  return { shown, velocity }
}

export function createLoadingFill(): LoadingFill {
  const elements = new Set<SVGSVGElement>()
  const listeners = new Set<() => void>()
  let progress = 0
  let step = 0
  let shown: number | null = null
  let velocity = 0
  let clock = 0
  let creepTarget = -1
  let creepStart = 0
  let last: number | null = null
  let frame = 0
  let filled = false

  const mask = () => `inset(0 0 ${((1 - (shown ?? progress)) * 100).toFixed(3)}% 0)`
  let rendered = ''
  function render() {
    const next = mask()
    if (next === rendered) return
    rendered = next
    for (const element of elements) element.style.clipPath = next
  }

  function advance(elapsed: number) {
    clock += elapsed
    const target = progress
    const creepShare = target >= 1 ? 0 : step * CREEP_SHARE
    if (target !== creepTarget) {
      creepTarget = target
      creepStart = clock
    }
    let value = shown ?? target
    if (prefersReducedMotion()) {
      value = target
      velocity = 0
    } else {
      const goal = target >= 1 ? 1 + FINISH_LEAD
        : target + creepShare * (1 - Math.exp(-(clock - creepStart) / CREEP_TIME_S))
      for (let remaining = elapsed; remaining > 0; remaining -= SUBSTEP_S) {
        const h = Math.min(SUBSTEP_S, remaining)
        velocity += (SPRING_RATE ** 2 * (goal - value) - 2 * SPRING_RATE * velocity) * h
        // The fill never runs backward.
        velocity = Math.max(0, velocity)
        value += velocity * h
      }
      const ceiling = Math.min(1, target + creepShare)
      if (value > ceiling) {
        value = ceiling
        velocity = 0
      }
    }
    shown = value
    if (target >= 1 && value >= 1 && !filled) {
      filled = true
      for (const listener of listeners) listener()
    }
  }

  function tick(now: number) {
    const elapsed = last === null ? 0 : Math.min((now - last) / 1000, MAX_FRAME_S)
    last = now
    advance(elapsed)
    render()
    frame = requestAnimationFrame(tick)
  }

  return {
    set(nextProgress, nextStep) {
      progress = nextProgress
      step = nextStep
    },
    attach(element) {
      if (shown === null) ({ shown, velocity } = readStart(element, progress))
      elements.add(element)
      element.style.clipPath = mask()
      element.classList.add('live')
      if (!frame) frame = requestAnimationFrame(tick)
      return () => {
        elements.delete(element)
        if (elements.size) return
        cancelAnimationFrame(frame)
        frame = 0
        last = null
      }
    },
    onFilled(callback) {
      if (filled) callback()
      listeners.add(callback)
      return () => listeners.delete(callback)
    },
  }
}
