import type {
  PageVirtualizationApplication,
  PageWindowPolicyResult,
} from './page-window-policy.ts'
import {
  readStorageItem,
  writeStorageItem,
} from '../persistence/persisted-state.ts'

export type PageVirtualizationSource =
  | 'query-param'
  | 'local-storage'
  | 'memory'
  | 'default'

export interface PageVirtualizationSettingsState {
  enabled: boolean
  source: PageVirtualizationSource
  queryOverride: boolean
  storageKey: string
}

export interface PageVirtualizationSettings {
  state: () => PageVirtualizationSettingsState
  setEnabled: (enabled: boolean) => PageVirtualizationSettingsState
}

export interface PageVirtualizationMetricEvent {
  type: 'policy' | 'evict' | 'remount' | 'toggle' | 'reset'
  timestamp: number
  enabled?: boolean
  source?: PageVirtualizationSource
  pageNumber?: number
  retainedPages?: number[]
  evictionCandidates?: number[]
  evictedPages?: number[]
}

export interface PageVirtualizationMetricsSnapshot {
  current: {
    mountedPageCount: number
    knownPageCount: number
    evictedPageCount: number
    placeholderCount: number
  }
  policyApplicationCount: number
  evictionPassCount: number
  totalPagesEvicted: number
  totalRemounts: number
  peakMountedPageCount: number
  peakKnownPageCount: number
  lastPolicy: {
    retainedPages: number[]
    evictionCandidates: number[]
    evictedPages: number[]
  } | null
  events: PageVirtualizationMetricEvent[]
}

export interface PageVirtualizationMetrics {
  recordPolicyApplication: (input: {
    enabled: boolean
    source: PageVirtualizationSource
    policy: PageWindowPolicyResult
    evictedPages: number[]
    mountedPageCount: number
    knownPageCount: number
    evictedPageCount: number
  }) => void
  recordPageEvicted: (pageNumber: number) => void
  recordPageRemounted: (pageNumber: number) => void
  recordToggle: (state: PageVirtualizationSettingsState) => void
  reset: () => void
  snapshot: () => PageVirtualizationMetricsSnapshot
}

export interface PageVirtualizationDiagnostics {
  enabled: boolean
  source: PageVirtualizationSource
  latestApplication: PageVirtualizationApplication
  metrics: PageVirtualizationMetricsSnapshot
}

const DEFAULT_STORAGE_KEY = 'tikkun.pageVirtualization.enabled'
const DEFAULT_EVENT_HISTORY_LIMIT = 50

export function createPageVirtualizationSettings({
  search,
  storage,
  storageKey = DEFAULT_STORAGE_KEY,
}: {
  search: string
  storage: Storage | null
  storageKey?: string
}): PageVirtualizationSettings {
  const queryValue = new URLSearchParams(search).get('virtualizePages')
  const queryOverride = queryValue === '1' || queryValue === '0'
  let memoryOverride: boolean | null = null

  function state(): PageVirtualizationSettingsState {
    if (queryValue === '1') {
      return {
        enabled: true,
        source: 'query-param',
        queryOverride,
        storageKey,
      }
    }
    if (queryValue === '0') {
      return {
        enabled: false,
        source: 'query-param',
        queryOverride,
        storageKey,
      }
    }

    if (memoryOverride !== null) {
      return {
        enabled: memoryOverride,
        source: 'memory',
        queryOverride,
        storageKey,
      }
    }

    let stored: string | null = null
    try {
      stored = readStorageItem(storage, storageKey)
    } catch (error) {
      console.error('Failed to read page-virtualization settings', error)
    }
    if (stored === 'true' || stored === 'false') {
      return {
        enabled: stored === 'true',
        source: 'local-storage',
        queryOverride,
        storageKey,
      }
    }

    return {
      enabled: false,
      source: 'default',
      queryOverride,
      storageKey,
    }
  }

  return {
    state,
    setEnabled(enabled: boolean) {
      try {
        writeStorageItem(storage, storageKey, enabled ? 'true' : 'false')
        memoryOverride = null
      } catch (error) {
        console.error('Failed to save page-virtualization settings', error)
        memoryOverride = enabled
      }
      return state()
    },
  }
}

export function createPageVirtualizationMetrics({
  maxEventHistory = DEFAULT_EVENT_HISTORY_LIMIT,
}: {
  maxEventHistory?: number
} = {}): PageVirtualizationMetrics {
  let current = createEmptyCurrentMetrics()
  let policyApplicationCount = 0
  let evictionPassCount = 0
  let totalPagesEvicted = 0
  let totalRemounts = 0
  let peakMountedPageCount = 0
  let peakKnownPageCount = 0
  let lastPolicy: PageVirtualizationMetricsSnapshot['lastPolicy'] = null
  let events: PageVirtualizationMetricEvent[] = []

  function pushEvent(event: Omit<PageVirtualizationMetricEvent, 'timestamp'>) {
    events = [
      ...events,
      {
        timestamp: Date.now(),
        ...cloneMetricEventArrays(event),
      },
    ].slice(-maxEventHistory)
  }

  function snapshot(): PageVirtualizationMetricsSnapshot {
    return {
      current: { ...current },
      policyApplicationCount,
      evictionPassCount,
      totalPagesEvicted,
      totalRemounts,
      peakMountedPageCount,
      peakKnownPageCount,
      lastPolicy: lastPolicy
        ? {
            retainedPages: [...lastPolicy.retainedPages],
            evictionCandidates: [...lastPolicy.evictionCandidates],
            evictedPages: [...lastPolicy.evictedPages],
          }
        : null,
      events: events.map((event) => cloneMetricEventArrays(event)),
    }
  }

  return {
    recordPolicyApplication({
      enabled,
      source,
      policy,
      evictedPages,
      mountedPageCount,
      knownPageCount,
      evictedPageCount,
    }) {
      policyApplicationCount += 1
      if (enabled && policy.evictionCandidates.length > 0) {
        evictionPassCount += 1
      }
      totalPagesEvicted += evictedPages.length
      current = {
        mountedPageCount,
        knownPageCount,
        evictedPageCount,
        placeholderCount: evictedPageCount,
      }
      peakMountedPageCount = Math.max(peakMountedPageCount, mountedPageCount)
      peakKnownPageCount = Math.max(peakKnownPageCount, knownPageCount)
      lastPolicy = {
        retainedPages: [...policy.retainedPages],
        evictionCandidates: [...policy.evictionCandidates],
        evictedPages: [...evictedPages],
      }
      pushEvent({
        type: 'policy',
        enabled,
        source,
        retainedPages: policy.retainedPages,
        evictionCandidates: policy.evictionCandidates,
        evictedPages,
      })
    },
    recordPageEvicted(pageNumber: number) {
      pushEvent({ type: 'evict', pageNumber })
    },
    recordPageRemounted(pageNumber: number) {
      totalRemounts += 1
      pushEvent({ type: 'remount', pageNumber })
    },
    recordToggle(state: PageVirtualizationSettingsState) {
      pushEvent({
        type: 'toggle',
        enabled: state.enabled,
        source: state.source,
      })
    },
    reset() {
      current = createEmptyCurrentMetrics()
      policyApplicationCount = 0
      evictionPassCount = 0
      totalPagesEvicted = 0
      totalRemounts = 0
      peakMountedPageCount = 0
      peakKnownPageCount = 0
      lastPolicy = null
      events = []
      pushEvent({ type: 'reset' })
    },
    snapshot,
  }
}

function createEmptyCurrentMetrics() {
  return {
    mountedPageCount: 0,
    knownPageCount: 0,
    evictedPageCount: 0,
    placeholderCount: 0,
  }
}

function cloneMetricEventArrays<T extends Omit<PageVirtualizationMetricEvent, 'timestamp'> | PageVirtualizationMetricEvent>(
  event: T
): T {
  return {
    ...event,
    retainedPages: event.retainedPages ? [...event.retainedPages] : undefined,
    evictionCandidates: event.evictionCandidates
      ? [...event.evictionCandidates]
      : undefined,
    evictedPages: event.evictedPages ? [...event.evictedPages] : undefined,
  }
}
