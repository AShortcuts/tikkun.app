import { afterEach, expect, test, vi } from 'vitest'
import { page as browser } from 'vitest/browser'
import Page from '../components/Page.ts'
import { applyReaderPageLayout } from '../components/reader-page-layout.ts'
import { createMount } from '../lifecycle/mount.ts'
import { loadPrintPassage } from '../printing/print-model.ts'
import type { ReaderPagePresentation } from '../reader-presentation.ts'
import { createArrivalCue } from './arrival-cue.ts'
import '../../css/master.css'

let destroy: (() => void) | undefined
afterEach(() => {
  destroy?.()
  document.body.replaceChildren()
  delete document.documentElement.dataset.readerTheme
  delete document.documentElement.dataset.readerReducedMotion
  delete document.documentElement.dataset.readerIsolated
  delete document.documentElement.dataset.readerPhone
  vi.useRealTimers()
})

async function setup(presentation: ReaderPagePresentation) {
  const passage = await loadPrintPassage([{
    start: { scroll: 'torah', b: 1, c: 1, v: 6 },
    end: { scroll: 'torah', b: 1, c: 1, v: 6 },
  }])
  await document.fonts.load('28px ShlomosemiStam')
  document.body.innerHTML = `<div class="tikkun-book" data-target-id="tikkun-book" data-reader-layout="${presentation.layout}" data-reader-sides="${presentation.sides}"><section class="tikkun-page"></section></div>`
  const root = document.querySelector<HTMLElement>('.tikkun-page')!
  root.innerHTML = Page(passage.pages[0], { presentation, annotationsEnabled: true })
  applyReaderPageLayout(root, presentation)
  const line = root.querySelector<HTMLElement>('[data-class="line"][data-line-index="7"]')!
  let cue!: ReturnType<typeof createArrivalCue>
  destroy = createMount()(scope => { cue = createArrivalCue(scope, document, window) })
  return { root, line, cue }
}

test.each<['reading' | 'match', 'one' | 'two', number]>([['reading', 'one', 390]])('spans the destination row in %s/%s at %ipx without moving text', async (layout, sides, width) => {
  await browser.viewport(width, 900)
  const { root, line, cue } = await setup({ layout, sides })
  const word = line.querySelector<HTMLElement>('.word')!
  word.classList.add('is-active-word')
  const before = word.getBoundingClientRect().toJSON()
  cue.show(line)
  const container = root.closest('.tikkun-book')!
  const strips = [...container.querySelectorAll<HTMLElement>('.reader-arrival-cue > span')]
  expect(strips).toHaveLength(sides === 'two' ? 2 : 1)
  expect(word.getBoundingClientRect().toJSON()).toEqual(before)
  expect(word.classList.contains('is-active-word')).toBe(true)
  const target = word.getBoundingClientRect()
  expect(strips.some(strip => {
    const rect = strip.getBoundingClientRect()
    return rect.left <= target.left && rect.right >= target.right && Math.abs(rect.top - target.top) < 4
  })).toBe(true)
  expect(getComputedStyle(container.querySelector('.reader-arrival-cue')!).pointerEvents).toBe('none')
})

test('replaces an earlier cue and removes all decoration after 1.6 seconds and unmount', async () => {
  const { root, line, cue } = await setup({ layout: 'reading', sides: 'two' })
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  cue.show(line)
  vi.advanceTimersByTime(1000)
  cue.show(line)
  vi.advanceTimersByTime(600)
  expect(root.querySelectorAll('.reader-arrival-cue')).toHaveLength(1)
  vi.advanceTimersByTime(1000)
  expect(root.querySelector('.reader-arrival-cue')).toBeNull()
  expect(root.classList.contains('mod-arrival-cue')).toBe(false)
  cue.show(line)
  destroy?.()
  expect(root.querySelector('.reader-arrival-cue')).toBeNull()
})
