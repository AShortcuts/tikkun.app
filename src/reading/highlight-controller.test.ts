import { expect, test } from 'vitest'
import type { WordCue } from '../audio/types.ts'
import { HighlightController } from './highlight-controller.ts'

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
    addEventListener() {},
    clientHeight: 100,
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

function createVisibleCenteredTokenElement(tokenKey: string) {
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
        top: 40,
        bottom: 60,
        left: 0,
        right: 10,
        width: 10,
        height: 20,
        x: 0,
        y: 40,
        toJSON() {
          return {}
        },
      }
    },
  } as unknown as HTMLElement
}

function createConnectedTokenElement(tokenKey: string, label: string) {
  return {
    ...createVisibleCenteredTokenElement(tokenKey),
    textContent: label,
    isConnected: true,
  } as unknown as HTMLElement
}

function createBookWithVisibleTokens(tokenKeys: string[]) {
  const tokens = new Map(
    tokenKeys.map((tokenKey) => [tokenKey, createVisibleCenteredTokenElement(tokenKey)])
  )
  const scrollCalls: unknown[] = []
  return {
    addEventListener() {},
    clientHeight: 100,
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

test('notifies listeners only when the active token changes or clears', async () => {
  const book = createBookWithTokens(['12:7:0:2', '12:8:0:0'])
  const controller = new HighlightController(book)
  const activeTokens: Array<string | null> = []
  const stopListening = controller.onActiveTokenChanged((tokenKey) => {
    activeTokens.push(tokenKey)
  })

  await controller.activateTokenKey('12:7:0:2', { scroll: false })
  await controller.activateTokenKey('12:7:0:2', { scroll: false })
  await controller.activateTokenKey('12:8:0:0', { scroll: false })
  controller.clear()
  controller.clear()
  stopListening()
  await controller.activateTokenKey('12:7:0:2', { scroll: false })

  expect(activeTokens).toEqual(['12:7:0:2', '12:8:0:0', null])
})

test('scrolls whenever the highlighted token changes', async () => {
  const book = createBookWithTokens(['12:7:0:2', '12:7:0:3', '12:8:0:0']) as HTMLElement & {
    scrollCalls: unknown[]
  }
  const controller = new HighlightController(book)

  await controller.activateTokenKey('12:7:0:2', { scroll: true })
  expect(book.scrollCalls.length).toBe(1)
  expect(book.scrollCalls[0]).toEqual({
    top: 165,
    behavior: 'smooth',
  })

  await controller.activateTokenKey('12:7:0:3', { scroll: true })
  expect(book.scrollCalls.length).toBe(2)

  await controller.activateTokenKey('12:8:0:0', { scroll: true })
  expect(book.scrollCalls.length).toBe(3)

  await controller.activateTokenKey('12:8:0:0', { scroll: true })
  expect(book.scrollCalls.length).toBe(3)
})

test('recenters even when the next highlighted token is already visible', async () => {
  const book = createBookWithVisibleTokens(['12:7:0:2', '12:7:0:3']) as HTMLElement & {
    scrollCalls: unknown[]
  }
  const controller = new HighlightController(book)

  await controller.activateTokenKey('12:7:0:2', { scroll: true })
  await controller.activateTokenKey('12:7:0:3', { scroll: true })

  expect(book.scrollCalls.length).toBe(2)
})

test('uses element geometry to center tokens inside the book', async () => {
  const scrollCalls: unknown[] = []
  const book = {
    addEventListener() {},
    clientHeight: 100,
    scrollTop: 0,
    querySelectorAll(): HTMLElement[] {
      return [token]
    },
    scrollTo(options: unknown) {
      scrollCalls.push(options)
    },
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

  const page = { offsetTop: 30, offsetParent: book }
  const line = { offsetTop: 80, offsetParent: page }
  const token = {
    dataset: { tokenKey: '12:7:0:2' },
    offsetTop: 50,
    offsetHeight: 20,
    offsetParent: line,
    classList: {
      add() {},
      remove() {},
      contains() {
        return false
      },
    },
    getBoundingClientRect() {
      return {
        top: 160,
        bottom: 180,
        left: 0,
        right: 10,
        width: 10,
        height: 20,
        x: 0,
        y: 0,
        toJSON() {
          return {}
        },
      }
    },
  } as unknown as HTMLElement

  const controller = new HighlightController(book)
  await controller.activateTokenKey('12:7:0:2', { scroll: true })

  expect(scrollCalls).toEqual([
    {
      top: 120,
      behavior: 'smooth',
    },
  ])
})

test('drops cached token elements when the display changes', async () => {
  const oldToken = createVisibleCenteredTokenElement('12:7:0:2')
  const newToken = createVisibleCenteredTokenElement('12:7:0:2')
  let activeToken = oldToken
  const book = {
    addEventListener() {},
    clientHeight: 100,
    scrollTop: 0,
    querySelectorAll(selector: string): HTMLElement[] {
      return selector === '[data-token-key="12:7:0:2"]' ? [activeToken] : []
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

  expect(await controller.activateTokenKey('12:7:0:2', { scroll: false })).toBe(oldToken)

  activeToken = newToken
  controller.setDisplay({} as never)

  expect(await controller.activateTokenKey('12:7:0:2', { scroll: false })).toBe(newToken)
})

test('mounts the cue page before activating a cue token', async () => {
  const tokenKey = '12:7:0:2'
  const token = createVisibleCenteredTokenElement(tokenKey)
  const calls: number[] = []
  const book = {
    addEventListener() {},
    clientHeight: 100,
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

test('invalidates a pending cue activation when the display changes', async () => {
  const tokenKey = '12:7:0:2'
  const controller = new HighlightController(createBookWithTokens([tokenKey]))
  let resolveMount: () => void = () => {
    throw new Error('Page mount was not started')
  }
  controller.setDisplay({
    ensurePageMounted() {
      return new Promise<void>((resolve) => {
        resolveMount = resolve
      })
    },
  } as never)

  const pending = controller.activateCue({
    timeStart: 0,
    pageNumber: 12,
    lineIndex: 7,
    fragmentIndex: 0,
    wordIndex: 2,
  }, { scroll: false })
  controller.setDisplay({ ensurePageMounted: async (): Promise<void> => {} } as never)
  resolveMount()

  await expect(pending).resolves.toBeNull()
  expect(controller.getActiveTokenKey()).toBeNull()
})

test('evicts old token element cache entries instead of retaining every highlighted word', async () => {
  const tokens = new Map<string, HTMLElement>()
  for (let index = 0; index < 405; index++) {
    const key = `12:7:0:${index}`
    tokens.set(key, createConnectedTokenElement(key, `old-${index}`))
  }
  const book = {
    addEventListener() {},
    clientHeight: 100,
    scrollTop: 0,
    querySelectorAll(selector: string): HTMLElement[] {
      const match = selector.match(/\[data-token-key="(.+)"\]/)
      if (!match) return []
      const token = tokens.get(match[1])
      return token ? [token] : []
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

  for (let index = 0; index < 405; index++) {
    await controller.activateTokenKey(`12:7:0:${index}`, { scroll: false })
  }

  const replacement = createConnectedTokenElement('12:7:0:0', 'new-0')
  tokens.set('12:7:0:0', replacement)

  expect(await controller.activateTokenKey('12:7:0:0', { scroll: false })).toBe(
    replacement
  )
})
