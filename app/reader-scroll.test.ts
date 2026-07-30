import { expect, test } from 'vitest'
import { centerElementInScrollRoot, setReaderFocalPointMode } from './reader-scroll.ts'

function createRect(top: number, height: number) {
  return {
    top,
    bottom: top + height,
    left: 0,
    right: 100,
    width: 100,
    height,
    x: 0,
    y: top,
    toJSON() {
      return {}
    },
  }
}

test('skips tiny recenter requests but preserves the exact target for real moves', () => {
  setReaderFocalPointMode('reader')
  const scrollCalls: ScrollToOptions[] = []
  const root = {
    clientHeight: 100,
    scrollTop: 25,
    getBoundingClientRect: () => createRect(0, 100),
    scrollTo(options: ScrollToOptions) {
      scrollCalls.push(options)
    },
  } as unknown as HTMLElement
  const nearlyCentered = {
    getBoundingClientRect: () => createRect(44, 20),
  } as unknown as HTMLElement
  const meaningfullyOffset = {
    getBoundingClientRect: () => createRect(50, 20),
  } as unknown as HTMLElement

  expect(
    centerElementInScrollRoot(root, nearlyCentered, {
      behavior: 'smooth',
      minimumScrollDistance: 6,
    })
  ).toBe(false)
  expect(scrollCalls).toEqual([])

  expect(
    centerElementInScrollRoot(root, meaningfullyOffset, {
      behavior: 'smooth',
      minimumScrollDistance: 6,
    })
  ).toBe(true)
  expect(scrollCalls).toEqual([{ behavior: 'smooth', top: 35 }])
})
