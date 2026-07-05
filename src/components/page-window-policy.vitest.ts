import { describe, expect, test } from 'vitest'

import {
  applyPageWindowPolicyEviction,
  computePageWindowPolicy,
} from './page-window-policy.ts'

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

  test('retains the latest rail target page outside the viewport radius', () => {
    const policy = computePageWindowPolicy({
      mountedPageNumbers: pages(1, 25),
      viewportPageNumber: 18,
      railTargetPageNumber: 8,
      config: { viewportRadius: 2, playbackForwardPageCount: 2 },
    })

    expect(policy.retainedPages).toContain(8)
    expect(policy.retainReasons).toContainEqual({
      pageNumber: 8,
      reasons: ['rail-target'],
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

  test('returns mounted pages outside all retain reasons as eviction candidates', () => {
    const policy = computePageWindowPolicy({
      mountedPageNumbers: pages(15, 23),
      viewportPageNumber: 18,
      railTargetPageNumber: 15,
      playbackPageNumbers: [22],
      config: { viewportRadius: 1, playbackForwardPageCount: 2 },
    })

    expect(policy.retainedPages).toEqual([15, 17, 18, 19, 22])
    expect(policy.evictionCandidates).toEqual([16, 20, 21, 23])
  })

  test('sorts retain reasons in a stable priority order', () => {
    const policy = computePageWindowPolicy({
      mountedPageNumbers: pages(15, 21),
      viewportPageNumber: 18,
      railTargetPageNumber: 18,
      playbackPageNumbers: [18],
      initialNeighborPageNumbers: [18],
      config: { viewportRadius: 0, playbackForwardPageCount: 2 },
    })

    expect(policy.retainReasons).toEqual([
      {
        pageNumber: 18,
        reasons: ['viewport', 'rail-target', 'playback', 'initial-neighbor'],
      },
    ])
  })

  test('does not evict candidates when virtualization is disabled', () => {
    const policy = computePageWindowPolicy({
      mountedPageNumbers: [1, 2, 3],
      viewportPageNumber: 1,
      config: { viewportRadius: 0, playbackForwardPageCount: 2 },
    })
    const evicted: number[][] = []

    const result = applyPageWindowPolicyEviction({
      enabled: false,
      policy,
      evictPages(pageNumbers) {
        evicted.push(pageNumbers)
        return pageNumbers
      },
    })

    expect(result).toEqual({ enabled: false, evictedPages: [] })
    expect(evicted).toEqual([])
  })

  test('evicts only candidates when virtualization is enabled', () => {
    const policy = computePageWindowPolicy({
      mountedPageNumbers: [1, 2, 3, 4],
      viewportPageNumber: 2,
      railTargetPageNumber: 4,
      config: { viewportRadius: 0, playbackForwardPageCount: 2 },
    })

    const result = applyPageWindowPolicyEviction({
      enabled: true,
      policy,
      evictPages: (pageNumbers) => pageNumbers.filter((pageNumber) => pageNumber !== 3),
    })

    expect(policy.evictionCandidates).toEqual([1, 3])
    expect(result).toEqual({ enabled: true, evictedPages: [1] })
  })
})
