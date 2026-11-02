import { afterEach, expect, test } from 'vitest'
import '/css/page.css'
import { RecordingClock } from './recording-clock.ts'
import { nextCaptureFrame } from './cue-frame-plan.ts'
import { formatTokenKey } from '../reader/token-position.ts'
import type { WordCue } from '../audio/types.ts'
import { setReaderFocalPointMode } from '../reader-scroll.ts'

// Recording mode always centers words in the reader (applyRecordingModePreferences); this file runs the clock without it.
setReaderFocalPointMode('reader')

const fixtures: HTMLElement[] = []
const clocks: RecordingClock[] = []
const originalMotion = document.documentElement.dataset.readerReducedMotion

afterEach(() => {
  clocks.splice(0).forEach(clock => clock.dispose())
  fixtures.splice(0).forEach(fixture => fixture.remove())
  if (originalMotion === undefined) delete document.documentElement.dataset.readerReducedMotion
  else document.documentElement.dataset.readerReducedMotion = originalMotion
})

function createClock(times = [0, 0.517, 0.552, 1.4]) {
  document.documentElement.dataset.readerReducedMotion = 'off'
  const cues: WordCue[] = times.map((timeStart, index) => ({
    timeStart, pageNumber: index === 3 ? 2 : 1, lineIndex: 0, fragmentIndex: 0, wordIndex: index,
  }))
  const book = document.createElement('div')
  book.style.cssText = `position:fixed;left:40px;top:40px;width:500px;height:240px;overflow:auto;
    background:white;color:black;scroll-behavior:auto;overflow-anchor:none;
    --reader-highlight-border-radius:4px;--reader-highlight-outline-offset:2px;--reader-highlight-outline-width:1px;
    --reader-highlight-fill-surface:rgba(255,0,0,.4);--reader-highlight-fill-tint:rgba(255,0,0,.2);
    --reader-highlight-outline-color:red;--reader-highlight-glow:2px;`
  book.innerHTML = `<div style="height:160px"></div><section class="tikkun-page">
    <div style="height:90px"><span class="word" data-token-key="${formatTokenKey(cues[0])}">First</span>
    <span class="word" data-token-key="${formatTokenKey(cues[1])}">Second</span></div>
    <div style="height:140px"><span class="word" data-token-key="${formatTokenKey(cues[2])}">Wrapped line</span></div></section>
    <section class="tikkun-page"><span class="word" data-token-key="${formatTokenKey(cues[3])}">Next page</span></section>
    <div style="height:300px"></div>`
  document.body.append(book)
  fixtures.push(book)
  const words = [...book.querySelectorAll<HTMLElement>('.word')]
  const clock = new RecordingClock({
    book, cues, duration: 3, signal: new AbortController().signal,
    clearHighlight: () => words.forEach(word => word.classList.remove('is-active-word')),
    activate: async seconds => {
      const cue = [...cues].reverse().find(cue => cue.timeStart <= seconds)
      for (const word of words) word.classList.toggle('is-active-word', Boolean(cue && word.dataset.tokenKey === formatTokenKey(cue)))
      return Boolean(cue)
    },
  })
  clocks.push(clock)
  const picture = () => ({ scrollTop: book.scrollTop, words: words.map(word => {
    const style = getComputedStyle(word)
    return [style.backgroundColor, style.boxShadow, style.borderRadius, word.classList.contains('is-active-word')]
  }) })
  return { clock, book, words, picture }
}

test.each([30])('held frames match every-frame rendering at %s fps through rapid cues and page changes', async fps => {
  const dense = createClock()
  const reference: Array<ReturnType<typeof dense.picture>> = []
  for (let frame = 0; frame < 3 * fps; frame++) {
    await dense.clock.renderAt(frame / fps)
    reference.push(dense.picture())
  }
  const sparse = createClock()
  let captures = 0
  for (let frameIndex = 0; frameIndex < reference.length;) {
    const state = await sparse.clock.renderAt(frameIndex / fps)
    const next = nextCaptureFrame({ frameIndex, frameCount: reference.length, fps, stableUntil: state.stableUntil })
    const image = sparse.picture()
    for (let frame = frameIndex; frame < next; frame++) {
      expect(image, `frame ${frame}`).toEqual(reference[frame])
    }
    captures++
    frameIndex = next
  }
  expect(captures).toBeLessThan(reference.length / 2)
  expect(reference.some(frame => frame.scrollTop > reference[0].scrollTop)).toBe(true)
})

test('fails visibly if layout moves after preparing a frame', async () => {
  const { clock, book } = createClock()
  await clock.renderAt(0.3)
  book.style.height = '200px'
  expect(() => clock.validateFrame()).toThrow(/layout/)
})
