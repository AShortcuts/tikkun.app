import { describe, expect, test } from 'vitest'

import { computePageWindowPolicy } from './page-window-policy.ts'

const pages = (start: number, end: number) =>
  Array.from({ length: end - start + 1 }, (_, index) => start + index)

describe('computePageWindowPolicy', () => {
  test('retains the viewport page plus its configured radius', () => {
    const policy = computePageWindowPolicy({
      mountedPageNumbers: pages(1, 25),
      viewportPageNumber: 18,
      config: { viewportRadius: 2, playbackForwardPageCount: 2 },
    })

    expect(policy.retainedPages).toEqual([16, 17, 18, 19, 20])
    expect(policy.retainReasons).toContainEqual({
      pageNumber: 18,
      reasons: ['viewport'],
    })
  })

  test('retains current and upcoming playback cue pages outside the viewport radius', () => {
    const policy = computePageWindowPolicy({
      mountedPageNumbers: pages(1, 25),
      viewportPageNumber: 8,
      playbackPageNumbers: [20, 21, 22, 23],
      config: { viewportRadius: 1, playbackForwardPageCount: 2 },
    })

    expect(policy.retainedPages).toEqual([7, 8, 9, 20, 21, 22])
    expect(policy.retainReasons).toContainEqual({
      pageNumber: 20,
      reasons: ['playback'],
    })
  })
})
