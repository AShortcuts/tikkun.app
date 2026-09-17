import type { WordCue } from '../audio/types.ts'
import { getCenteredElementScrollTop } from '../reader-scroll.ts'
import { formatTokenKey } from '../reader/token-position.ts'
import { validateRecordingCues } from './cue-frame-plan.ts'
import {
  retargetRecordingScroll,
  sampleRecordingScroll,
  type RecordingScroll,
} from './recording-scroll.ts'

interface TrackedAnimation {
  startMs: number
  endMs: number
}

export interface RecordingClockOptions {
  book: HTMLElement
  cues: readonly Readonly<WordCue>[]
  duration: number
  signal: AbortSignal
  activate(seconds: number): Promise<boolean>
  clearHighlight(): void
}

export class RecordingClock {
  private readonly animations = new Map<Animation, TrackedAnimation>()
  private knownAnimations = new WeakSet<Animation>()
  private scroll: RecordingScroll | null = null
  private cueIndex = 0
  private currentSeconds = -1
  private initialized = false
  private disposed = false
  private initialScrollTop = 0
  private geometry = ''
  private expectedScrollTop = 0

  constructor(private readonly options: RecordingClockOptions) {
    validateRecordingCues(options.cues, options.duration)
  }

  private check() {
    this.options.signal.throwIfAborted()
    if (this.disposed) throw new Error('Recording clock has been disposed')
  }

  private geometryKey() {
    const { book } = this.options
    const rect = book.getBoundingClientRect()
    return [rect.x, rect.y, rect.width, rect.height, book.scrollWidth, book.scrollHeight].join(':')
  }

  private activeWord(cue: Readonly<WordCue>) {
    const { book } = this.options
    const key = formatTokenKey(cue)
    const words = [...book.querySelectorAll<HTMLElement>('.word.is-active-word')]
      .filter(word => {
        const rect = word.getBoundingClientRect()
        return word.dataset.tokenKey === key && rect.width > 0 && rect.height > 0
      })
    const rect = book.getBoundingClientRect()
    const word = words.find(element => {
      const box = element.getBoundingClientRect()
      return box.bottom > rect.top && box.top < rect.bottom
    }) ?? words[0]
    if (!word) throw new Error(`Recording word ${key} is not rendered`)
    return word
  }

  private cancelAnimations() {
    for (const animation of this.options.book.getAnimations({ subtree: true })) animation.cancel()
    for (const animation of this.animations.keys()) animation.cancel()
    this.animations.clear()
    this.knownAnimations = new WeakSet()
  }

  private async trackAnimations(milliseconds: number) {
    const pending: Promise<Animation>[] = []
    for (const animation of this.options.book.getAnimations({ subtree: true })) {
      if (this.knownAnimations.has(animation)) continue
      const endMs = animation.effect?.getComputedTiming().endTime
      if (typeof endMs !== 'number' || Number.isNaN(endMs) || endMs < 0) {
        throw new Error('Recording encountered an animation with an invalid duration')
      }
      animation.pause()
      animation.currentTime = 0
      this.animations.set(animation, { startMs: milliseconds, endMs })
      this.knownAnimations.add(animation)
      pending.push(animation.ready)
    }
    await Promise.all(pending)
    this.check()
    this.sampleAnimations(milliseconds)
  }

  private sampleAnimations(milliseconds: number) {
    for (const [animation, timing] of this.animations) {
      if (animation.playState === 'idle') {
        this.animations.delete(animation)
        continue
      }
      const elapsed = Math.max(0, milliseconds - timing.startMs)
      animation.currentTime = Math.min(elapsed, timing.endMs)
      if (elapsed >= timing.endMs) {
        // CSS transitions leave the class's final style in place when removed.
        // Other animations may use fill modes, so retain their finished effect.
        if (animation instanceof CSSTransition) animation.cancel()
        this.animations.delete(animation)
      }
    }
  }

  private sampleScroll(milliseconds: number) {
    if (!this.scroll) return
    const { position, finished } = sampleRecordingScroll(this.scroll, milliseconds)
    this.options.book.scrollTo({ top: position, behavior: 'instant' })
    if (Math.abs(this.options.book.scrollTop - position) > 1) {
      throw new Error('Recording scroll position was clamped or moved by layout')
    }
    if (finished) this.scroll = null
  }

  async prepare() {
    this.check()
    const first = this.options.cues[0]
    if (!first) throw new Error('Recording requires at least one word cue')
    if (!await this.options.activate(first.timeStart)) throw new Error('Could not prepare the first recording word')
    this.check()
    this.cancelAnimations()
    const word = this.activeWord(first)
    const { book } = this.options
    const top = Math.min(book.scrollHeight - book.clientHeight, getCenteredElementScrollTop(book, word))
    book.scrollTo({ top: Math.max(0, top), behavior: 'instant' })
    this.initialScrollTop = book.scrollTop
    this.reset()
    this.geometry = this.geometryKey()
    this.initialized = true
  }

  private reset() {
    this.options.clearHighlight()
    this.cancelAnimations()
    this.options.book.scrollTo({ top: this.initialScrollTop, behavior: 'instant' })
    this.scroll = null
    this.cueIndex = 0
    this.currentSeconds = -1
    // Commit the inactive style before starting the first cue's transition.
    this.options.book.getBoundingClientRect()
  }

  async renderAt(seconds: number) {
    this.check()
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > this.options.duration) {
      throw new RangeError('Recording time is outside the media duration')
    }
    if (!this.initialized) await this.prepare()
    if (seconds < this.currentSeconds) this.reset()
    if (this.geometryKey() !== this.geometry) throw new Error('Recording layout changed after preparation')
    const { cues, book } = this.options
    while (this.cueIndex < cues.length && cues[this.cueIndex].timeStart <= seconds) {
      const cue = cues[this.cueIndex]
      const milliseconds = cue.timeStart * 1000
      this.sampleAnimations(milliseconds)
      this.sampleScroll(milliseconds)
      if (!await this.options.activate(cue.timeStart)) {
        throw new Error(`Could not activate recording word ${formatTokenKey(cue)}`)
      }
      this.check()
      const word = this.activeWord(cue)
      const target = Math.max(0, Math.min(book.scrollHeight - book.clientHeight, getCenteredElementScrollTop(book, word)))
      this.scroll = retargetRecordingScroll(this.scroll, book.scrollTop, target, milliseconds)
      await this.trackAnimations(milliseconds)
      this.cueIndex += 1
    }
    this.sampleAnimations(seconds * 1000)
    this.sampleScroll(seconds * 1000)
    this.currentSeconds = seconds
    this.expectedScrollTop = book.scrollTop
    if (this.geometryKey() !== this.geometry) throw new Error('Recording layout changed while rendering a frame')
    const moving = this.scroll !== null || this.animations.size > 0
    if (!moving && this.cueIndex > 0) {
      const word = this.activeWord(cues[this.cueIndex - 1])
      const rect = word.getBoundingClientRect()
      const root = book.getBoundingClientRect()
      if (rect.top < root.top - 1 || rect.bottom > root.bottom + 1 ||
          rect.left < root.left - 1 || rect.right > root.right + 1) {
        throw new Error('The settled recording word is outside the reader viewport')
      }
    }
    return {
      activeTokenKey: this.cueIndex ? formatTokenKey(cues[this.cueIndex - 1]) : null,
      scrollTop: book.scrollTop,
      stableUntil: moving ? null : cues[this.cueIndex]?.timeStart ?? this.options.duration,
    }
  }

  validateFrame() {
    this.check()
    if (this.geometryKey() !== this.geometry || Math.abs(this.options.book.scrollTop - this.expectedScrollTop) > 0.5) {
      throw new Error('Recording layout or scroll changed after the frame was prepared')
    }
    for (const animation of this.options.book.getAnimations({ subtree: true })) {
      if (!this.knownAnimations.has(animation) || animation.playState === 'running' || animation.pending) {
        throw new Error('An uncontrolled animation changed the recording frame')
      }
    }
  }

  dispose() {
    this.cancelAnimations()
    this.disposed = true
  }
}
