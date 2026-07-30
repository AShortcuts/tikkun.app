import { expect, test, vi } from 'vitest'
import { createMount } from '../lifecycle/mount.ts'
import {
  COMPACT_READER_QUERY,
  createReaderViewport,
  type ReaderViewport,
} from './reader-viewport.ts'

test('owns one compact reader query and emits only real mode changes', () => {
  const mediaQuery = new FakeMediaQueryList(false)
  const matchMedia = vi.fn(() => mediaQuery as MediaQueryList)
  let viewport: ReaderViewport | null = null
  const destroy = createMount()((scope) => {
    viewport = createReaderViewport(scope, { matchMedia })
  })
  const listener = vi.fn()
  const unsubscribe = viewport!.onChange(listener)

  expect(matchMedia).toHaveBeenCalledWith(COMPACT_READER_QUERY)
  expect(viewport!.mode).toBe('wide')
  expect(viewport!.isCompact()).toBe(false)

  mediaQuery.setMatches(true)
  mediaQuery.setMatches(true)
  expect(listener).toHaveBeenCalledOnce()
  expect(listener).toHaveBeenCalledWith('compact')
  expect(viewport!.mode).toBe('compact')

  unsubscribe()
  mediaQuery.setMatches(false)
  expect(listener).toHaveBeenCalledOnce()

  destroy()
  mediaQuery.setMatches(true)
  expect(viewport!.mode).toBe('wide')
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
