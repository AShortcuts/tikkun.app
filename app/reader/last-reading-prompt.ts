import type { MountScope } from '../lifecycle/mount.ts'
import type { LastReading } from '../reading/last-reading.ts'

export interface LastReadingPromptOptions {
  document: Document
  disabled: boolean
  onResume(lastReading: LastReading): void
}

export interface LastReadingPrompt {
  show(lastReading: LastReading): void
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
  let dismissed = false
  let target: LastReading | null = null

  const hide = () => {
    prompt?.classList.add('u-hidden')
  }

  const dismiss = () => {
    dismissed = true
    hide()
  }

  const show = (lastReading: LastReading) => {
    if (dismissed || options.disabled || !prompt || !copy) return
    const locationLabel = lastReading.aliyahLabel
      ? `${lastReading.parshaName}, ${lastReading.aliyahLabel}`
      : lastReading.parshaName
    copy.textContent = `Resume ${locationLabel}?`
    target = lastReading
    prompt.classList.remove('u-hidden')
  }

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
