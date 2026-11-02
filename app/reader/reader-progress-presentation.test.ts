import { describe, expect, test } from 'vitest'

import {
  resolveReaderProgressPresentation,
  type ReaderProgressPresentationAnchor,
  type ReaderProgressPresentationSource,
} from './reader-progress-presentation.ts'

interface TestAnchor extends ReaderProgressPresentationAnchor {
  readonly id: string
  readonly last?: boolean
}

describe('resolveReaderProgressPresentation', () => {

  test('uses range current for chrome and its matching anchor for progress', () => {
    const firstLine = {}
    const secondLine = {}
    const first = anchor('first', 0, { line: firstLine })
    const second = anchor('second', 200, { line: secondLine })
    const third = anchor('third', 400)
    const source = sourceFor([first, second, third])

    const result = resolve(source, {
      viewportPosition: 150,
      rangeCurrent: second,
    })

    expect(result).toMatchObject({
      kind: 'ready',
      current: second,
      label: 'second',
      progressIndex: 1,
      percent: 0,
      requestNextAnchor: null,
    })
  })

  test('keeps range label but falls back to geometric progress when unmatched', () => {
    const first = anchor('first', 0)
    const second = anchor('second', 200)
    const third = anchor('third', 400)
    const rangeCurrent = anchor('range', 999, { line: {} })
    const source = sourceFor([first, second, third])

    const result = resolve(source, {
      viewportPosition: 250,
      rangeCurrent,
    })

    expect(result).toMatchObject({
      kind: 'ready',
      current: rangeCurrent,
      label: 'range',
      progressIndex: 1,
      percent: 25,
    })
  })

  test('requests the next anchor explicitly when current is not final', () => {
    const current = anchor('current', 100)
    const result = resolve(sourceFor([current]), {
      viewportPosition: 125,
    })

    expect(result).toEqual({
      kind: 'request-next-anchor',
      current,
      label: 'current',
      progressIndex: 0,
      percent: null,
      requestNextAnchor: { afterIndex: 0 },
    })
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.requestNextAnchor)).toBe(true)
  })

  test.each([{ name: 'below start', viewportPosition: 50, expected: 0 }])('clamps progress $name', ({ viewportPosition, expected }) => {
    const firstLine = {}
    const first = anchor('first', 100, { line: firstLine })
    const second = anchor('second', 300)
    const result = resolve(sourceFor([first, second]), {
      viewportPosition,
      rangeCurrent: first,
    })

    expect(result).toMatchObject({ kind: 'ready', percent: expected })
  })
})

function resolve(
  source: ReaderProgressPresentationSource<TestAnchor>,
  {
    viewportPosition = 0,
    scrollHeight = 1_000,
    rangeCurrent = null,
  }: {
    viewportPosition?: number
    scrollHeight?: number
    rangeCurrent?: TestAnchor | null
  } = {}
) {
  return resolveReaderProgressPresentation({
    source,
    viewportPosition,
    getScrollHeight: () => scrollHeight,
    rangeCurrent,
    isLastAnchor: (candidate) => candidate.last === true,
  })
}

function anchor(
  id: string,
  position: number,
  {
    line = {},
    last = false,
  }: { line?: object | null; last?: boolean } = {}
): TestAnchor {
  return Object.freeze({ id, line, label: id, position, last })
}

function sourceFor(
  anchors: readonly TestAnchor[]
): ReaderProgressPresentationSource<TestAnchor> {
  const frozenAnchors = Object.freeze([...anchors])
  return Object.freeze({
    anchors: frozenAnchors,
    at(position: number) {
      let index = 0
      for (let candidate = 0; candidate < frozenAnchors.length; candidate += 1) {
        if (frozenAnchors[candidate].position <= position) index = candidate
        else break
      }
      return Object.freeze({
        index,
        current: frozenAnchors[index] ?? null,
      })
    },
  })
}
