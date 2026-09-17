export interface RecordingScroll {
  from: number
  to: number
  startMs: number
  durationMs: number
}

// Desktop Chromium's programmatic scroll profile: distance-based duration and
// cubic-bezier(0.4, 0, 0, 1). Keep this separate from the browser's wall clock.
// https://source.chromium.org/chromium/chromium/src/+/main:cc/animation/scroll_offset_animation_curve.cc
function curve(progress: number) {
  const x1 = 0.4
  const y1 = 0
  const coordinate = (t: number, first: number, second: number) =>
    3 * (1 - t) ** 2 * t * first + 3 * (1 - t) * t ** 2 * second + t ** 3
  let low = 0
  let high = 1
  for (let iteration = 0; iteration < 28; iteration += 1) {
    const middle = (low + high) / 2
    if (coordinate(middle, x1, 0) < progress) low = middle
    else high = middle
  }
  const t = (low + high) / 2
  const derivative = (first: number, second: number) =>
    3 * (1 - t) ** 2 * first + 6 * (1 - t) * t * (second - first) +
    3 * t ** 2 * (1 - second)
  return {
    value: coordinate(t, y1, 1),
    slope: derivative(y1, 1) / derivative(x1, 0),
  }
}

export function sampleRecordingScroll(scroll: RecordingScroll, milliseconds: number) {
  const progress = (milliseconds - scroll.startMs) / scroll.durationMs
  if (progress >= 1) return { position: scroll.to, velocity: 0, finished: true }
  if (progress <= 0) return {
    position: scroll.from,
    velocity: 0,
    finished: false,
  }
  const eased = curve(progress)
  return {
    position: scroll.from + (scroll.to - scroll.from) * eased.value,
    velocity: eased.slope * (scroll.to - scroll.from) / scroll.durationMs,
    finished: false,
  }
}

export function retargetRecordingScroll(
  previous: RecordingScroll | null,
  from: number,
  to: number,
  milliseconds: number
): RecordingScroll | null {
  if (![from, to, milliseconds].every(Number.isFinite)) {
    throw new RangeError('Recording scroll coordinates and time must be finite')
  }
  if (previous && previous.to === to) return previous
  const delta = to - from
  // Match the reader's minimum-scroll-distance guard: ignoring a request must
  // not cancel an animation that is already running.
  if (Math.abs(delta) <= 0.5) return previous
  // Element.scrollTo starts a fresh ease for a changed target. Velocity-carrying
  // UpdateTarget curves belong to a different Chromium scrolling path.
  // https://source.chromium.org/chromium/chromium/src/+/main:third_party/blink/renderer/core/scroll/programmatic_scroll_animator.cc
  const durationMs = Math.min(1500, Math.sqrt(Math.abs(delta)) * 1000 / 60)
  return { from, to, startMs: milliseconds, durationMs }
}
