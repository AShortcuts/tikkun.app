import type { MountScope } from '../lifecycle/mount.ts'

type PendingRetry = {
  retry: () => Promise<void>
  isCurrent?: () => boolean
}

export interface OfflineRecordingPromptOptions {
  document: Document
  view: Window
  onRetryError(error: unknown): void
}

export interface OfflineRecordingPrompt {
  recordPlaybackFailure(
    retry: () => Promise<void>,
    isCurrent?: () => boolean
  ): void
  clearPlaybackFailure(): void
  hide(): void
}

export function createOfflineRecordingPrompt(
  scope: MountScope,
  options: OfflineRecordingPromptOptions
): OfflineRecordingPrompt {
  const prompt = options.document.querySelector<HTMLElement>(
    '[data-target-id="app-offline-prompt"]'
  )
  const dismissButton = options.document.querySelector<HTMLButtonElement>(
    '[data-target-id="app-offline-dismiss"]'
  )
  let dismissed = false
  let pendingRetry: PendingRetry | null = null

  const show = ({ force = false }: { force?: boolean } = {}) => {
    if (force) dismissed = false
    if (!dismissed) prompt?.classList.remove('u-hidden')
  }

  const hide = () => {
    prompt?.classList.add('u-hidden')
  }

  const recordPlaybackFailure = (
    retry: () => Promise<void>,
    isCurrent?: () => boolean
  ) => {
    pendingRetry = { retry, isCurrent }
    show({ force: true })
  }

  const clearPlaybackFailure = () => {
    pendingRetry = null
    hide()
  }

  dismissButton?.addEventListener(
    'click',
    () => {
      dismissed = true
      hide()
    },
    { signal: scope.signal }
  )

  options.view.addEventListener(
    'online',
    () => {
      dismissed = false
      hide()
      const pending = pendingRetry
      pendingRetry = null
      if (!pending || pending.isCurrent?.() === false) return
      void pending.retry().catch((error) => {
        if (pending.isCurrent?.() !== false) options.onRetryError(error)
      })
    },
    { signal: scope.signal }
  )

  scope.own(() => {
    pendingRetry = null
    hide()
  })

  return { recordPlaybackFailure, clearPlaybackFailure, hide }
}
