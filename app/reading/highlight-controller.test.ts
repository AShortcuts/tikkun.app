import { expect, test } from 'vitest'
import type { WordCue } from '../audio/types.ts'
import { HighlightController } from './highlight-controller.ts'

// Each stub book fills a 100px browser viewport, so the browser and reader focal points agree.
const viewportDocument = { documentElement: { clientHeight: 100 } }

function createBookStub() {
  return {
    addEventListener() {},
    scrollTop: 0,
    querySelectorAll(): HTMLElement[] {
      return []
    },
    getBoundingClientRect() {
      return {
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        width: 0,
        height: 0,
        x: 0,
        y: 0,
        toJSON() {
          return {}
        },
      }
    },
  } as unknown as HTMLElement
}

function createTokenElement(tokenKey: string) {
  const classes = new Set<string>()
  return {
    dataset: { tokenKey },
    offsetTop: 140,
    offsetHeight: 20,
    offsetParent: { offsetTop: 40 },
    classList: {
      add(className: string) {
        classes.add(className)
      },
      remove(className: string) {
        classes.delete(className)
      },
      contains(className: string) {
        return classes.has(className)
      },
    },
    getBoundingClientRect() {
      return {
        top: 180,
        bottom: 200,
        left: 0,
        right: 10,
        width: 10,
        height: 20,
        x: 0,
        y: 180,
        toJSON() {
          return {}
        },
      }
    },
  } as unknown as HTMLElement
}

function createBookWithTokens(tokenKeys: string[]) {
  const tokens = new Map(tokenKeys.map((tokenKey) => [tokenKey, createTokenElement(tokenKey)]))
  const scrollCalls: unknown[] = []
  return {
    dataset: { readerSides: 'one' },
    classList: { contains: () => true },
    addEventListener() {},
    clientHeight: 100,
    ownerDocument: viewportDocument,
    scrollTop: 25,
    querySelectorAll(selector: string): HTMLElement[] {
      const match = selector.match(/\[data-token-key="(.+)"\]/)
      if (!match) return []
      const token = tokens.get(match[1])
      return token ? [token] : []
    },
    scrollTo(options: unknown) {
      scrollCalls.push(options)
    },
    get scrollCalls() {
      return scrollCalls
    },
    getBoundingClientRect() {
      return {
        top: 0,
        bottom: 100,
        left: 0,
        right: 0,
        width: 100,
        height: 100,
        x: 0,
        y: 0,
        toJSON() {
          return {}
        },
      }
    },
  } as unknown as HTMLElement
}

function createVisibleCenteredTokenElement(tokenKey: string, top = 40) {
  const classes = new Set<string>()
  return {
    dataset: { tokenKey },
    isConnected: true,
    offsetTop: 40,
    offsetHeight: 20,
    offsetParent: { offsetTop: 0 },
    classList: {
      add(className: string) {
        classes.add(className)
      },
      remove(className: string) {
        classes.delete(className)
      },
      contains(className: string) {
        return classes.has(className)
      },
    },
    getBoundingClientRect() {
      return {
        top,
        bottom: top + 20,
        left: 0,
        right: 10,
        width: 10,
        height: 20,
        x: 0,
        y: top,
        toJSON() {
          return {}
        },
      }
    },
  } as unknown as HTMLElement
}

function createBookWithVisibleTokens(tokenKeys: string[], tokenTop = 40) {
  const tokens = new Map(
    tokenKeys.map((tokenKey) => [
      tokenKey,
      createVisibleCenteredTokenElement(tokenKey, tokenTop),
    ])
  )
  const scrollCalls: unknown[] = []
  return {
    addEventListener() {},
    clientHeight: 100,
    ownerDocument: viewportDocument,
    scrollTop: 0,
    querySelectorAll(selector: string): HTMLElement[] {
      const match = selector.match(/\[data-token-key="(.+)"\]/)
      if (!match) return []
      const token = tokens.get(match[1])
      return token ? [token] : []
    },
    scrollTo(options: unknown) {
      scrollCalls.push(options)
    },
    get scrollCalls() {
      return scrollCalls
    },
    getBoundingClientRect() {
      return {
        top: 0,
        bottom: 100,
        left: 0,
        right: 0,
        width: 100,
        height: 100,
        x: 0,
        y: 0,
        toJSON() {
          return {}
        },
      }
    },
  } as unknown as HTMLElement
}

test('returns the latest cue at or before the current time', () => {
  const controller = new HighlightController(createBookStub())

  const cues: WordCue[] = [
    { timeStart: 0, pageNumber: 1, lineIndex: 0, fragmentIndex: 0, wordIndex: 0 },
    { timeStart: 0.15, pageNumber: 1, lineIndex: 0, fragmentIndex: 0, wordIndex: 1 },
    { timeStart: 0.3, pageNumber: 1, lineIndex: 0, fragmentIndex: 0, wordIndex: 2 },
    { timeStart: 0.45, pageNumber: 1, lineIndex: 0, fragmentIndex: 0, wordIndex: 3 },
  ]

  expect(controller.getCueIndex(cues, -0.01)).toBe(-1)
  expect(controller.getCueIndex(cues, 0)).toBe(0)
  expect(controller.getCueIndex(cues, 0.149)).toBe(0)
  expect(controller.getCueIndex(cues, 0.3)).toBe(2)
  expect(controller.getCueIndex(cues, 1)).toBe(3)
})

test('tracks the active token key as highlights move', async () => {
  const book = createBookWithTokens(['12:7:0:2', '12:8:0:0'])
  const controller = new HighlightController(book)
  await controller.activateTokenKey('12:7:0:2', { scroll: false })

  expect(controller.getActiveTokenKey()).toBe('12:7:0:2')

  await controller.activateTokenKey('12:8:0:0', { scroll: false })
  expect(controller.getActiveTokenKey()).toBe('12:8:0:0')
})

test('lights every token of a Reading maqaf join together and releases them as one', async () => {
  const book = createBookWithTokens(['12:15:0:5', '12:15:0:6', '12:16:0:0', '12:16:0:1'])
  const tokenElement = (tokenKey: string) => book.querySelectorAll<HTMLElement>(`[data-token-key="${tokenKey}"]`)[0]
  const lead = tokenElement('12:15:0:6')
  const tail = tokenElement('12:16:0:0')
  lead.dataset.maqafGroup = '12:15:0:6 12:16:0:0'
  tail.dataset.maqafGroup = '12:15:0:6 12:16:0:0'
  const controller = new HighlightController(book)

  await controller.activateTokenKey('12:15:0:6', { scroll: false })
  expect(controller.getActiveTokenKey()).toBe('12:15:0:6')
  expect(lead.classList.contains('is-active-word')).toBe(true)
  expect(tail.classList.contains('is-active-word')).toBe(true)
  expect(tokenElement('12:15:0:5').classList.contains('is-active-word')).toBe(false)

  await controller.activateTokenKey('12:16:0:0', { scroll: false })
  expect(controller.getActiveTokenKey()).toBe('12:16:0:0')
  expect(lead.classList.contains('is-active-word')).toBe(true)
  expect(tail.classList.contains('is-active-word')).toBe(true)

  await controller.activateTokenKey('12:16:0:1', { scroll: false })
  expect(lead.classList.contains('is-active-word')).toBe(false)
  expect(tail.classList.contains('is-active-word')).toBe(false)
  expect(tokenElement('12:16:0:1').classList.contains('is-active-word')).toBe(true)

  await controller.activateTokenKey('12:15:0:6', { scroll: false })
  controller.clear()
  expect(lead.classList.contains('is-active-word')).toBe(false)
  expect(tail.classList.contains('is-active-word')).toBe(false)
})

test('recenters four-pixel playback offsets instead of accepting approximate alignment', async () => {
  const book = createBookWithVisibleTokens(['12:7:0:2'], 44) as HTMLElement & {
    scrollCalls: unknown[]
  }
  const controller = new HighlightController(book)

  await controller.activateTokenKey('12:7:0:2', { scroll: true })

  expect(book.scrollCalls).toEqual([
    {
      top: 4,
      behavior: 'smooth',
    },
  ])
})

test('mounts the cue page before activating a cue token', async () => {
  const tokenKey = '12:7:0:2'
  const token = createVisibleCenteredTokenElement(tokenKey)
  const calls: number[] = []
  const book = {
    addEventListener() {},
    clientHeight: 100,
    ownerDocument: viewportDocument,
    scrollTop: 0,
    querySelectorAll(selector: string): HTMLElement[] {
      return selector === `[data-token-key="${tokenKey}"]` ? [token] : []
    },
    scrollTo() {},
    getBoundingClientRect() {
      return {
        top: 0,
        bottom: 100,
        left: 0,
        right: 100,
        width: 100,
        height: 100,
        x: 0,
        y: 0,
        toJSON() {
          return {}
        },
      }
    },
  } as unknown as HTMLElement
  const controller = new HighlightController(book)

  controller.setDisplay({
    viewModel: { isolatedAliyah: null },
    async ensurePageMounted(pageNumber: number): Promise<null> {
      calls.push(pageNumber)
      return null
    },
  } as never)

  await controller.activateCue(
    {
      timeStart: 0,
      pageNumber: 12,
      lineIndex: 7,
      fragmentIndex: 0,
      wordIndex: 2,
    },
    { scroll: false }
  )

  expect(calls).toEqual([12])
})

test('keeps the latest cue active when an older page mount resolves later', async () => {
  const firstKey = '12:7:0:2'
  const secondKey = '13:1:0:0'
  const book = createBookWithTokens([firstKey, secondKey])
  const controller = new HighlightController(book)
  let resolveFirstMount: () => void = () => {
    throw new Error('First page mount was not started')
  }
  controller.setDisplay({
    viewModel: { isolatedAliyah: null },
    ensurePageMounted(pageNumber: number) {
      if (pageNumber !== 12) return Promise.resolve()
      return new Promise<void>((resolve) => {
        resolveFirstMount = resolve
      })
    },
  } as never)

  const first = controller.activateCue({
    timeStart: 0,
    pageNumber: 12,
    lineIndex: 7,
    fragmentIndex: 0,
    wordIndex: 2,
  }, { scroll: false })
  await controller.activateCue({
    timeStart: 1,
    pageNumber: 13,
    lineIndex: 1,
    fragmentIndex: 0,
    wordIndex: 0,
  }, { scroll: false })
  resolveFirstMount()

  await expect(first).resolves.toBeNull()
  expect(controller.getActiveTokenKey()).toBe(secondKey)
})

test('rejects neighboring words on a mounted physical line before mounting, highlighting, or scrolling', async () => {
  const selected = '12:7:0:2'
  const neighbor = '12:7:0:1'
  const book = createBookWithTokens([selected, neighbor])
  const controller = new HighlightController(book)
  const mounts: number[] = []
  controller.setDisplay({
    viewModel: { isolatedAliyah: {
      containsTokenKey: (key: string) => key === selected,
      containsRenderedTokenKey: (key: string) => key === selected,
    } },
    async ensurePageMounted(page: number) { mounts.push(page) },
  } as never)
  await controller.activateTokenKey(selected, { scroll: false })
  const cue = { timeStart: 0, pageNumber: 12, lineIndex: 7, fragmentIndex: 0, wordIndex: 1 }
  expect(await controller.activateCue(cue)).toBeNull()
  expect(await controller.activateTokenKey(neighbor)).toBeNull()
  expect(mounts).toEqual([])
  expect(controller.getActiveTokenKey()).toBe(selected)
  expect(book.querySelectorAll(`[data-token-key="${neighbor}"]`)[0].classList.contains('is-active-word')).toBe(false)
  expect(book.scrollTop).toBe(25)
})

test('keeps an exact unpointed bookmark through form changes while audio uses canonical maqaf groups', async () => {
  const canonical = '5:0:0:2'
  const plain = '5:0:0:3'
  const book = createBookWithTokens([canonical, plain])
  let annotated = false
  book.classList.contains = () => annotated
  const controller = new HighlightController(book)
  controller.setDisplay({
    viewModel: { isolatedAliyah: {
      containsTokenKey: (key: string) => key === canonical,
      tokenIdentity: () => ({ plainTokenKeys: [canonical, plain] }),
    } },
    async ensurePageMounted() {},
  } as never)
  const elements = (key: string) => book.querySelectorAll<HTMLElement>(`[data-token-key="${key}"]`)[0]
  await controller.activateTokenKey(canonical, { scroll: false, preferredPlainTokenKey: plain })
  expect(controller.getActiveTokenKey()).toBe(canonical)
  expect(elements(plain).classList.contains('is-active-word')).toBe(true)
  expect(elements(canonical).classList.contains('is-active-word')).toBe(false)
  annotated = true
  await controller.activateTokenKey(canonical, { scroll: false })
  expect(elements(canonical).classList.contains('is-active-word')).toBe(true)
  annotated = false
  await controller.activateTokenKey(canonical, { scroll: false })
  expect(elements(plain).classList.contains('is-active-word')).toBe(true)
  expect(elements(canonical).classList.contains('is-active-word')).toBe(false)
  await controller.activateCue({ timeStart: 0, pageNumber: 5, lineIndex: 0, fragmentIndex: 0, wordIndex: 2 }, { scroll: false })
  expect(elements(plain).classList.contains('is-active-word')).toBe(true)
  expect(elements(canonical).classList.contains('is-active-word')).toBe(true)
})
