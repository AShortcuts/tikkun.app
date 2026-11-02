import { expect, test } from 'vitest'
import { createMount } from '../lifecycle/mount.ts'
import {
  COMPACT_READER_QUERY,
  createReaderViewport,
  isMobileReaderViewport,
  readerLayoutViewport,
  type ReaderViewport,
} from './reader-viewport.ts'

test.each([{ width: 390, height: 844, touchPoints: 1, phone: true }, { width: 551, height: 900, touchPoints: 1, phone: false }, { width: NaN, height: 390, touchPoints: 1, phone: false }])('mobile eligibility uses valid viewport dimensions: $width x $height, touch $touchPoints', ({
  width, height, touchPoints, phone,
}) => {
  const view = {
    navigator: { maxTouchPoints: touchPoints } as Navigator,
    screen: { width: 1920, height: 1080 } as Screen,
    innerWidth: width,
    innerHeight: height,
  }
  expect(isMobileReaderViewport(view)).toBe(phone)
})

test.each([0.65])('pinching to %sx does not change layout size or phone eligibility', (scale) => {
  const document = { documentElement: { clientWidth: 390, clientHeight: 844 } }
  const view = { document, innerWidth: 390 / scale, innerHeight: 844 / scale }
  expect(readerLayoutViewport(view)).toEqual({ width: 390, height: 844 })
  expect(isMobileReaderViewport(view)).toBe(true)
  document.documentElement.clientWidth = 1024
  document.documentElement.clientHeight = 768
  expect(readerLayoutViewport(view)).toEqual({ width: 1024, height: 768 })
  expect(isMobileReaderViewport(view)).toBe(false)
})

test('landscape mobile eligibility stays independent from the compact width breakpoint', () => {
  const mediaQuery = new FakeMediaQueryList(false)
  const view = {
    navigator: { maxTouchPoints: 5 } as Navigator,
    innerWidth: 844,
    innerHeight: 390,
    matchMedia: () => mediaQuery as MediaQueryList,
  }
  let viewport!: ReaderViewport
  const destroy = createMount()((scope) => {
    viewport = createReaderViewport(scope, view)
  })

  expect(isMobileReaderViewport(view)).toBe(true)
  expect(viewport.isCompact()).toBe(false)
  mediaQuery.setMatches(true)
  expect(isMobileReaderViewport(view)).toBe(true)
  expect(viewport.isCompact()).toBe(true)

  view.innerWidth = 1024
  view.innerHeight = 768
  expect(isMobileReaderViewport(view)).toBe(false)
  expect(viewport.isCompact()).toBe(true)
  destroy()
})

class FakeMediaQueryList extends EventTarget {
  readonly media = COMPACT_READER_QUERY
  onchange: ((event: MediaQueryListEvent) => void) | null = null
  matches: boolean

  constructor(matches: boolean) {
    super()
    this.matches = matches
  }

  addListener(listener: (event: MediaQueryListEvent) => void) {
    this.addEventListener('change', listener as EventListener)
  }

  removeListener(listener: (event: MediaQueryListEvent) => void) {
    this.removeEventListener('change', listener as EventListener)
  }

  setMatches(matches: boolean) {
    this.matches = matches
    const event = new Event('change')
    Object.defineProperty(event, 'matches', { value: matches })
    this.dispatchEvent(event)
  }
}
