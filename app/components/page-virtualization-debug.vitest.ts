import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import {
  createPageVirtualizationMetrics,
  createPageVirtualizationSettings,
} from './page-virtualization-debug.ts'
import { computePageWindowPolicy } from './page-window-policy.ts'

describe('createPageVirtualizationSettings', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  test('defaults to disabled', () => {
    const settings = createPageVirtualizationSettings({
      search: '',
      storage: localStorage,
    })

    expect(settings.state()).toMatchObject({
      enabled: false,
      source: 'default',
    })
  })

  test('uses localStorage when no query param is present', () => {
    localStorage.setItem('tikkun.pageVirtualization.enabled', 'true')

    const settings = createPageVirtualizationSettings({
      search: '',
      storage: localStorage,
    })

    expect(settings.state()).toMatchObject({
      enabled: true,
      source: 'local-storage',
    })
  })

  test('query param enables virtualization over localStorage', () => {
    localStorage.setItem('tikkun.pageVirtualization.enabled', 'false')

    const settings = createPageVirtualizationSettings({
      search: '?virtualizePages=1',
      storage: localStorage,
    })

    expect(settings.state()).toMatchObject({
      enabled: true,
      source: 'query-param',
    })
  })

  test('query param disables virtualization over localStorage', () => {
    localStorage.setItem('tikkun.pageVirtualization.enabled', 'true')

    const settings = createPageVirtualizationSettings({
      search: '?virtualizePages=0',
      storage: localStorage,
    })

    expect(settings.state()).toMatchObject({
      enabled: false,
      source: 'query-param',
    })
  })

  test('debug setter persists when not query-param controlled', () => {
    const settings = createPageVirtualizationSettings({
      search: '',
      storage: localStorage,
    })

    settings.setEnabled(true)

    expect(settings.state()).toMatchObject({
      enabled: true,
      source: 'local-storage',
    })
    expect(localStorage.getItem('tikkun.pageVirtualization.enabled')).toBe('true')
  })

  test('keeps a session-only setting when browser storage is unavailable', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const settings = createPageVirtualizationSettings({
      search: '',
      storage: null,
    })

    expect(settings.setEnabled(true)).toMatchObject({
      enabled: true,
      source: 'memory',
    })
    expect(settings.state()).toMatchObject({ enabled: true, source: 'memory' })
    log.mockRestore()
  })
})

describe('createPageVirtualizationMetrics', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(1_700_000_000_000)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('records policy applications while virtualization is disabled', () => {
    const metrics = createPageVirtualizationMetrics()
    const policy = computePageWindowPolicy({
      mountedPageNumbers: [1, 2, 3],
      viewportPageNumber: 1,
      config: { viewportRadius: 0, playbackForwardPageCount: 2 },
    })

    metrics.recordPolicyApplication({
      enabled: false,
      source: 'default',
      policy,
      evictedPages: [],
      mountedPageCount: 3,
      knownPageCount: 3,
      evictedPageCount: 0,
    })

    expect(metrics.snapshot()).toMatchObject({
      policyApplicationCount: 1,
      evictionPassCount: 0,
      totalPagesEvicted: 0,
      peakMountedPageCount: 3,
      peakKnownPageCount: 3,
      lastPolicy: {
        retainedPages: [1],
        evictionCandidates: [2, 3],
        evictedPages: [],
      },
    })
  })

  test('records eviction passes and actual evicted pages', () => {
    const metrics = createPageVirtualizationMetrics()
    const policy = computePageWindowPolicy({
      mountedPageNumbers: [1, 2, 3, 4],
      viewportPageNumber: 2,
      config: { viewportRadius: 0, playbackForwardPageCount: 2 },
    })

    metrics.recordPolicyApplication({
      enabled: true,
      source: 'local-storage',
      policy,
      evictedPages: [1, 4],
      mountedPageCount: 2,
      knownPageCount: 4,
      evictedPageCount: 2,
    })

    expect(metrics.snapshot()).toMatchObject({
      policyApplicationCount: 1,
      evictionPassCount: 1,
      totalPagesEvicted: 2,
      current: {
        mountedPageCount: 2,
        knownPageCount: 4,
        evictedPageCount: 2,
        placeholderCount: 2,
      },
      lastPolicy: {
        evictedPages: [1, 4],
      },
    })
  })

  test('records remounts and caps event history', () => {
    const metrics = createPageVirtualizationMetrics({ maxEventHistory: 3 })

    metrics.recordPageRemounted(1)
    metrics.recordPageRemounted(2)
    metrics.recordPageEvicted(3)
    metrics.recordPageRemounted(4)

    const snapshot = metrics.snapshot()
    expect(snapshot.totalRemounts).toBe(3)
    expect(snapshot.events).toHaveLength(3)
    expect(snapshot.events.map((event) => event.pageNumber)).toEqual([2, 3, 4])
  })
})
