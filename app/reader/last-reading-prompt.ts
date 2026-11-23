import type { MountScope } from '../lifecycle/mount.ts'
import type { LastReading } from '../reading/last-reading.ts'
import { READER_BANNER_AUTO_DISMISS_MS } from './banner-timing.ts'

export interface LastReadingPromptOptions {
  document: Document
  disabled: boolean
  onResume(lastReading: LastReading): void
}

export type LastReadingPromptMode = 'resume' | 'return'

export interface LastReadingPrompt {
  show(lastReading: LastReading, mode?: LastReadingPromptMode): void
  hide(): void
  dismiss(): void
}

export function createLastReadingPrompt(
  scope: MountScope,
  options: LastReadingPromptOptions
): LastReadingPrompt {
  const prompt = options.document.querySelector<HTMLElement>(
    '[data-target-id="last-reading-prompt"]'
  )
  const copy = options.document.querySelector<HTMLElement>(
    '[data-target-id="last-reading-copy"]'
  )
  const dismissButton = options.document.querySelector<HTMLButtonElement>(
    '[data-target-id="last-reading-dismiss"]'
  )
  const resumeButton = options.document.querySelector<HTMLButtonElement>(
    '[data-target-id="last-reading-resume"]'
  )
  let target: LastReading | null = null
  let autoDismissTimer: number | null = null
  const view = options.document.defaultView

  const cancelAutoDismiss = () => {
    if (autoDismissTimer === null) return
    view?.clearTimeout(autoDismissTimer)
    autoDismissTimer = null
  }

  const hide = () => {
    cancelAutoDismiss()
    prompt?.classList.add('u-hidden')
  }

  const dismiss = () => {
    target = null
    hide()
  }

  // A Return offer is a passing convenience and leaves on its own, but never
  // while someone is pointing at it or has keyboard focus inside it.
  let autoDismisses = false
  const scheduleAutoDismiss = ({ focusLeaving = false } = {}) => {
    cancelAutoDismiss()
    if (!autoDismisses || !view || !prompt || scope.signal.aborted || prompt.classList.contains('u-hidden')) return
    if (prompt.matches(':hover')) return
    if (!focusLeaving && prompt.contains(options.document.activeElement)) return
    autoDismissTimer = view.setTimeout(() => {
      autoDismissTimer = null
      dismiss()
    }, READER_BANNER_AUTO_DISMISS_MS)
  }

  const show = (
    lastReading: LastReading,
    mode: LastReadingPromptMode = 'resume'
  ) => {
    if (options.disabled || !prompt || !copy) return
    const locationLabel = lastReading.aliyahLabel
      ? `${lastReading.parshaName}, ${lastReading.aliyahLabel}`
      : lastReading.parshaName
    const action = mode === 'return' ? 'Return to' : 'Resume'
    copy.textContent = `${action} ${locationLabel}?`
    if (resumeButton) resumeButton.textContent = mode === 'return' ? 'Return' : 'Resume'
    dismissButton?.setAttribute(
      'aria-label',
      mode === 'return' ? 'Dismiss return prompt' : 'Dismiss resume prompt'
    )
    target = lastReading
    prompt.classList.remove('u-hidden')
    autoDismisses = mode === 'return'
    scheduleAutoDismiss()
  }

  prompt?.addEventListener('pointerenter', cancelAutoDismiss, { signal: scope.signal })
  prompt?.addEventListener('focusin', cancelAutoDismiss, { signal: scope.signal })
  prompt?.addEventListener('pointerleave', () => scheduleAutoDismiss(), { signal: scope.signal })
  prompt?.addEventListener('focusout', (event) => {
    // Browsers disagree on the active element during focusout; the event says where focus is going.
    const staysInside = event.relatedTarget instanceof Node && prompt.contains(event.relatedTarget)
    if (!staysInside) scheduleAutoDismiss({ focusLeaving: true })
  }, { signal: scope.signal })
  dismissButton?.addEventListener('click', dismiss, { signal: scope.signal })
  resumeButton?.addEventListener(
    'click',
    () => {
      if (!target) return
      const resumeTarget = target
      dismiss()
      options.onResume(resumeTarget)
    },
    { signal: scope.signal }
  )

  scope.own(() => {
    target = null
    hide()
  })

  return { show, hide, dismiss }
}
