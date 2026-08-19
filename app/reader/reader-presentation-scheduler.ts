export type ReaderPresentationInvalidation =
  | 'viewport-title'
  | 'reader-position'
  | 'inline-audio'
  | 'playback-state'

export interface ReaderPresentationFrame {
  readonly revision: number
  readonly invalidations: readonly ReaderPresentationInvalidation[]
}

export interface ReaderPresentationSchedulerDiagnostics {
  readonly pendingInvalidations: readonly ReaderPresentationInvalidation[]
  readonly deferredInvalidations: readonly ReaderPresentationInvalidation[]
  readonly animationFrameScheduled: boolean
  readonly invalidationRequestCount: number
  readonly coalescedRequestCount: number
  readonly scheduledAnimationFrameCount: number
  readonly presentationCount: number
}

export interface ReaderPresentationScheduler {
  /** Presents each invalidated concern once in the next animation frame. */
  invalidate(...invalidations: ReaderPresentationInvalidation[]): void
  /** Waits one layout frame, then joins the normal presentation queue. */
  invalidateAfterLayout(
    ...invalidations: ReaderPresentationInvalidation[]
  ): void
  diagnostics(): ReaderPresentationSchedulerDiagnostics
  destroy(): void
}

interface AnimationFrameAdapter {
  request(callback: FrameRequestCallback): number
  cancel(frame: number): void
}

const INVALIDATION_ORDER: readonly ReaderPresentationInvalidation[] = [
  'viewport-title',
  'inline-audio',
  'reader-position',
  'playback-state',
]

export function createReaderPresentationScheduler({
  frame,
  present,
}: {
  frame: AnimationFrameAdapter
  present(snapshot: ReaderPresentationFrame): void
}): ReaderPresentationScheduler {
  const pending = new Set<ReaderPresentationInvalidation>()
  const deferred = new Set<ReaderPresentationInvalidation>()
  let animationFrame: number | null = null
  let destroyed = false
  let invalidationRequestCount = 0
  let coalescedRequestCount = 0
  let scheduledAnimationFrameCount = 0
  let presentationCount = 0

  const ordered = (values: ReadonlySet<ReaderPresentationInvalidation>) =>
    INVALIDATION_ORDER.filter((invalidation) => values.has(invalidation))

  const scheduleFrame = () => {
    if (animationFrame !== null) return false

    scheduledAnimationFrameCount += 1
    animationFrame = frame.request(() => {
      animationFrame = null
      if (destroyed) return

      const invalidationsToPresent = Object.freeze(ordered(pending))
      pending.clear()
      try {
        if (invalidationsToPresent.length > 0) {
          presentationCount += 1
          present(
            Object.freeze({
              revision: presentationCount,
              invalidations: invalidationsToPresent,
            })
          )
        }
      } finally {
        if (deferred.size > 0) {
          for (const invalidation of deferred) pending.add(invalidation)
          deferred.clear()
          scheduleFrame()
        }
      }
    })
    return true
  }

  const recordRequest = (scheduled: boolean) => {
    invalidationRequestCount += 1
    if (!scheduled) coalescedRequestCount += 1
  }

  return {
    invalidate(...invalidations) {
      if (destroyed || invalidations.length === 0) return
      for (const invalidation of invalidations) pending.add(invalidation)
      recordRequest(scheduleFrame())
    },
    invalidateAfterLayout(...invalidations) {
      if (destroyed || invalidations.length === 0) return
      for (const invalidation of invalidations) deferred.add(invalidation)
      recordRequest(scheduleFrame())
    },
    diagnostics() {
      return Object.freeze({
        pendingInvalidations: Object.freeze(ordered(pending)),
        deferredInvalidations: Object.freeze(ordered(deferred)),
        animationFrameScheduled: animationFrame !== null,
        invalidationRequestCount,
        coalescedRequestCount,
        scheduledAnimationFrameCount,
        presentationCount,
      })
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      pending.clear()
      deferred.clear()
      if (animationFrame !== null) frame.cancel(animationFrame)
      animationFrame = null
    },
  }
}
