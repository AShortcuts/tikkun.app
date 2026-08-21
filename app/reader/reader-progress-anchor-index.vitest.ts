import { beforeEach, expect, test, vi } from 'vitest'

import type { LeiningRun } from '../calendar-model/model-types.ts'
import type {
  RenderedLineInfo,
  RenderedPageInfo,
} from '../view-model/scroll-view-model.ts'
import {
  createReaderProgressAnchorIndex,
  type ReaderProgressAnchorIndex,
} from './reader-progress-anchor-index.ts'

type AnchorFixture = {
  book: HTMLElement
  index: ReaderProgressAnchorIndex
  lines: HTMLElement[]
  rootRect: ReturnType<typeof vi.fn>
  lineRects: ReturnType<typeof vi.fn>[]
  querySelectorAll: ReturnType<typeof vi.spyOn>
}

const rectAt = (top: number, height = 20) =>
  DOMRect.fromRect({ x: 0, y: top, width: 100, height })

function createFixture(
  anchors: Array<{
    top: number
    label: string
    aliyahStarts: string
    run?: LeiningRun
  }> = [
    { top: 500, label: 'שני', aliyahStarts: '2' },
    { top: 300, label: 'ignored', aliyahStarts: '1' },
    { top: 700, label: 'שלישי', aliyahStarts: '3' },
  ]
): AnchorFixture {
  const initialScrollTop = 200
  const rootTop = 100
  const book = document.createElement('main')
  const page = document.createElement('div')
  page.className = 'tikkun-page'
  book.append(page)
  document.body.append(book)
  Object.defineProperty(book, 'scrollTop', {
    configurable: true,
    value: initialScrollTop,
    writable: true,
  })

  const rootRect = vi.fn(() => rectAt(rootTop, 600))
  book.getBoundingClientRect = rootRect
  const lineRects: ReturnType<typeof vi.fn>[] = []
  const lineInfos: RenderedLineInfo[] = []
  const lines = anchors.map((anchor, lineIndex) => {
    const line = document.createElement('div')
    line.dataset.lineIndex = `${lineIndex}`
    line.dataset.aliyahStarts = anchor.aliyahStarts
    line.innerHTML = `<span class="aliyah-label-text">${anchor.label}</span>`
    const contentPosition = initialScrollTop + (anchor.top - rootTop)
    const lineRect = vi.fn(() =>
      rectAt(contentPosition - book.scrollTop + rootTop)
    )
    line.getBoundingClientRect = lineRect
    lineRects.push(lineRect)
    lineInfos.push({ run: anchor.run } as RenderedLineInfo)
    page.append(line)
    return line
  })
  page.tikkunPage = {
    type: 'page',
    contentIndex: 0,
    pageNumber: 1,
    lines: lineInfos,
  } satisfies RenderedPageInfo

  const querySelectorAll = vi.spyOn(book, 'querySelectorAll')
  return {
    book,
    index: createReaderProgressAnchorIndex(book),
    lines,
    rootRect,
    lineRects,
    querySelectorAll,
  }
}

beforeEach(() => {
  document.body.innerHTML = ''
})

test('builds one sorted immutable snapshot with current anchor semantics', () => {
  const firstRun = { id: 'run-one' } as LeiningRun
  const secondRun = { id: 'run-two' } as LeiningRun
  const fixture = createFixture([
    { top: 500, label: 'שני', aliyahStarts: '2', run: secondRun },
    { top: 300, label: 'not used', aliyahStarts: '1', run: firstRun },
    { top: 500, label: 'שביעי', aliyahStarts: '7,Maftir', run: secondRun },
  ])

  const snapshot = fixture.index.snapshot()

  expect(snapshot.anchors.map(({ position }) => position)).toEqual([400, 600, 600])
  expect(snapshot.anchors.map(({ label }) => label)).toEqual([
    'ראשון',
    'שני',
    'שביעי',
  ])
  expect(snapshot.anchors.map(({ aliyahIndex }) => aliyahIndex)).toEqual([
    1,
    2,
    'Maftir',
  ])
  expect(snapshot.anchors.map(({ run }) => run?.id)).toEqual([
    'run-one',
    'run-two',
    'run-two',
  ])
  expect(snapshot.at(399)).toMatchObject({ index: 0, current: snapshot.anchors[0] })
  expect(snapshot.at(600)).toMatchObject({ index: 2, current: snapshot.anchors[2] })
  expect(snapshot.at(601)).toMatchObject({ index: 2, next: null })
  expect(Object.isFrozen(snapshot)).toBe(true)
  expect(Object.isFrozen(snapshot.anchors)).toBe(true)
  expect(snapshot.anchors.every(Object.isFrozen)).toBe(true)
  expect(fixture.querySelectorAll).toHaveBeenCalledOnce()
  expect(fixture.rootRect).toHaveBeenCalledOnce()
  expect(fixture.lineRects.every((measure) => measure.mock.calls.length === 1)).toBe(
    true
  )
})

test('reuses clean geometry across routine position reads', () => {
  const fixture = createFixture()
  const initial = fixture.index.snapshot()
  const initialPositions = initial.anchors.map(({ position }) => position)

  fixture.book.scrollTop = 900
  for (let index = 0; index < 100; index += 1) {
    const snapshot = fixture.index.snapshot()
    expect(snapshot).toBe(initial)
    snapshot.at(index * 10)
  }

  expect(fixture.querySelectorAll).toHaveBeenCalledOnce()
  expect(fixture.rootRect).toHaveBeenCalledOnce()
  expect(fixture.lineRects.every((measure) => measure.mock.calls.length === 1)).toBe(
    true
  )

  fixture.index.invalidate('page-rendered')
  const rebuilt = fixture.index.snapshot()
  expect(rebuilt.anchors.map(({ position }) => position)).toEqual(initialPositions)
  expect(fixture.querySelectorAll).toHaveBeenCalledTimes(2)
  expect(fixture.rootRect).toHaveBeenCalledTimes(2)
  expect(fixture.lineRects.every((measure) => measure.mock.calls.length === 2)).toBe(
    true
  )
})

test('coalesces explicit invalidations into one lazy rebuild', () => {
  const fixture = createFixture()
  const first = fixture.index.snapshot()

  fixture.index.invalidate('page-rendered')
  fixture.index.invalidate('page-evicted')
  fixture.index.invalidate('page-rendered')

  expect(fixture.querySelectorAll).toHaveBeenCalledOnce()

  const second = fixture.index.snapshot()
  expect(second).not.toBe(first)
  expect(second.revision).toBe(2)
  expect(fixture.querySelectorAll).toHaveBeenCalledTimes(2)
})

test('drops disconnected anchors only after invalidation and keeps old snapshots stable', () => {
  const fixture = createFixture()
  const first = fixture.index.snapshot()
  const removedLine = fixture.lines[0]
  removedLine.remove()

  expect(fixture.index.snapshot()).toBe(first)
  expect(first.anchors.some(({ line }) => line === removedLine)).toBe(true)

  fixture.index.invalidate('page-evicted')
  const second = fixture.index.snapshot()

  expect(second.anchors.some(({ line }) => line === removedLine)).toBe(false)
  expect(first.anchors.some(({ line }) => line === removedLine)).toBe(true)
  expect(first.anchors).toHaveLength(3)
  expect(second.anchors).toHaveLength(2)
})

test('uses its line map for exact anchors and targeted geometry for ordinary lines', () => {
  const fixture = createFixture()
  const snapshot = fixture.index.snapshot()
  const anchorChild = fixture.lines[1].firstElementChild as HTMLElement

  expect(fixture.index.anchorForElement(anchorChild)).toBe(snapshot.anchors[0])
  expect(fixture.rootRect).toHaveBeenCalledOnce()

  const ordinaryLine = document.createElement('div')
  ordinaryLine.dataset.lineIndex = '20'
  const ordinaryWord = document.createElement('span')
  ordinaryLine.append(ordinaryWord)
  fixture.book.append(ordinaryLine)
  const ordinaryRect = vi.fn(() => rectAt(450))
  ordinaryLine.getBoundingClientRect = ordinaryRect

  expect(fixture.index.anchorForElement(ordinaryWord)).toBe(snapshot.anchors[0])
  expect(fixture.querySelectorAll).toHaveBeenCalledOnce()
  expect(fixture.rootRect).toHaveBeenCalledTimes(2)
  expect(ordinaryRect).toHaveBeenCalledOnce()
})

test('releases cached DOM state when destroyed', () => {
  const fixture = createFixture()
  fixture.index.snapshot()

  fixture.index.destroy()
  fixture.index.destroy()
  fixture.index.invalidate('reader-model')

  expect(() => fixture.index.snapshot()).toThrow(
    'Reader progress anchor index has been destroyed'
  )
  expect(() => fixture.index.anchorForElement(fixture.lines[0])).toThrow(
    'Reader progress anchor index has been destroyed'
  )
})
