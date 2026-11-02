import { beforeEach, expect, test, vi } from 'vitest'

import { LeiningGenerator } from '../calendar-model/generator.ts'
import type { LeiningRun } from '../calendar-model/model-types.ts'
import Page from '../components/Page.ts'
import {
  ScrollViewModel,
  type RenderedLineInfo,
  type RenderedPageInfo,
} from '../view-model/scroll-view-model.ts'
import {
  createReaderProgressAnchorIndex,
  type ReaderProgressAnchorIndex,
} from './reader-progress-anchor-index.ts'
import '../../css/master.css'

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

test.each([['reading', 'one', true]] as const)('anchors Noach 3 at the correct boundary in %s / %s with annotations=%s', async (layout, sides, annotationsEnabled) => {
  const generator = new LeiningGenerator({
    ashkenazi: true,
    includeModernHolidays: false,
    israel: false,
  })
  const model = ScrollViewModel.forId(generator, '2026-10-17:shacharis,main', {
    scroll: 'torah', b: 1, c: 7, v: 17,
  })
  if (!model) throw new Error('Noach model not found')
  const { page: source } = await model.startingLocation
  if (source.type !== 'page') throw new Error('Noach page not found')
  expect(source.pageNumber).toBe(7)

  const book = document.createElement('main')
  book.className = `tikkun-book mod-annotations-${annotationsEnabled ? 'on' : 'off'}`
  book.dataset.readerLayout = layout
  book.dataset.readerSides = sides
  book.style.cssText = 'height:560px;width:1000px;overflow:auto'
  const page = document.createElement('section')
  page.className = 'tikkun-page'
  page.tikkunPage = source
  page.innerHTML = Page(source, { annotationsEnabled, presentation: { layout, sides } })
  book.append(page)
  document.body.append(book)
  book.scrollTop = 100

  const line = book.querySelector<HTMLElement>('[data-class="line"][data-line-index="39"]')
  const word = line?.querySelector<HTMLElement>('[data-reader-canonical="true"] .word[data-token-key="7:39:0:4"]')
  const label = line?.querySelector<HTMLElement>('.aliyah-label-text')
  if (!line || !word || !label) throw new Error('Noach 3 shared-line fixture is incomplete')
  expect(source.lines[39].focalRef).toEqual({ b: 1, c: 7, v: 16 })
  expect(word.textContent?.normalize('NFD').replace(/\p{M}/gu, '').trim()).toBe('ויהי')

  const linePosition = book.scrollTop + line.getBoundingClientRect().top - book.getBoundingClientRect().top
  const wordPosition = book.scrollTop + word.getBoundingClientRect().top - book.getBoundingClientRect().top
  if (layout === 'reading') expect(wordPosition - linePosition).toBeGreaterThan(5)
  const expectedPosition = layout === 'reading' ? wordPosition : linePosition
  const queries = vi.spyOn(book, 'querySelectorAll')
  const rootRect = vi.spyOn(book, 'getBoundingClientRect')
  const wordRect = vi.spyOn(word, 'getBoundingClientRect')
  const index = createReaderProgressAnchorIndex(book)
  const initial = index.snapshot()
  const anchor = initial.anchors.find((candidate) => candidate.aliyahIndex === 3)
  expect(anchor?.line).toBe(line)
  expect(anchor?.position).toBeCloseTo(expectedPosition, 5)
  expect(initial.at(expectedPosition - 1).current?.aliyahIndex).toBe(2)
  expect(initial.at(expectedPosition).current).toBe(anchor)
  if (layout === 'reading') expect(initial.at(linePosition).current?.aliyahIndex).toBe(2)

  const queryCount = queries.mock.calls.length
  const wordMeasureCount = wordRect.mock.calls.length
  book.scrollTop += 50
  for (let read = 0; read < 10; read += 1) {
    expect(index.snapshot()).toBe(initial)
    expect(index.anchorForElement(label)).toBe(anchor)
  }
  expect(queries).toHaveBeenCalledTimes(queryCount)
  expect(rootRect).toHaveBeenCalledOnce()
  expect(wordRect).toHaveBeenCalledTimes(wordMeasureCount)

  index.invalidate('annotations')
  index.invalidate('viewport-resized')
  const rebuilt = index.snapshot()
  expect(rebuilt.revision).toBe(initial.revision + 1)
  expect(rebuilt.anchors.find((candidate) => candidate.aliyahIndex === 3)?.position)
    .toBeCloseTo(expectedPosition, 5)
  expect(rootRect).toHaveBeenCalledTimes(2)
  index.destroy()
})
