export type ReaderResizePhase = 'viewport' | 'chrome' | 'content' | 'position'

interface ReaderResizeView extends EventTarget {
  requestAnimationFrame(callback: FrameRequestCallback): number
  cancelAnimationFrame(handle: number): void
  readonly visualViewport?: EventTarget | null
}

export interface ReaderResizeSubscription {
  request(): void
  destroy(): void
}

const phases: readonly ReaderResizePhase[] = ['viewport', 'chrome', 'content', 'position']
const coordinators = new WeakMap<ReaderResizeView, ReturnType<typeof createCoordinator>>()

function createCoordinator(view: ReaderResizeView) {
  const listeners = new Map<() => void, ReaderResizePhase>()
  let frame = 0
  let activePhase: ReaderResizePhase | null = null
  const request = () => {
    if (frame || !listeners.size) return
    frame = view.requestAnimationFrame(() => {
      frame = 0
      try {
        for (const phase of phases) {
          activePhase = phase
          // A viewport change can replace the display before the content phase.
          for (const [update, registeredPhase] of [...listeners]) {
            if (registeredPhase === phase && listeners.has(update)) update()
          }
        }
      } finally {
        activePhase = null
      }
    })
  }
  view.addEventListener('resize', request)
  view.visualViewport?.addEventListener('resize', request)

  return {
    subscribe(phase: ReaderResizePhase, update: () => void): ReaderResizeSubscription {
      listeners.set(update, phase)
      return {
        request() {
          if (activePhase && phases.indexOf(phase) > phases.indexOf(activePhase)) return
          request()
        },
        destroy() {
          listeners.delete(update)
          if (listeners.size) return
          if (frame) view.cancelAnimationFrame(frame)
          frame = 0
          view.removeEventListener('resize', request)
          view.visualViewport?.removeEventListener('resize', request)
          coordinators.delete(view)
        },
      }
    },
  }
}

/** One ordered layout transaction per frame, shared by reader components. */
export function observeReaderResize(
  view: ReaderResizeView,
  phase: ReaderResizePhase,
  update: () => void,
): ReaderResizeSubscription {
  let coordinator = coordinators.get(view)
  if (!coordinator) {
    coordinator = createCoordinator(view)
    coordinators.set(view, coordinator)
  }
  return coordinator.subscribe(phase, update)
}
