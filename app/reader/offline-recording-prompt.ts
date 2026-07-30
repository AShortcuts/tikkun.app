import type { MountScope } from '../lifecycle/mount.ts'

type PendingRetry = {
  retry: () => Promise<void>
  isCurrent?: () => boolean
}

export interface OfflineRecordingPromptOptions {
  document: Document
  view: Window
  isOnline(): boolean
  onRetryError(error: unknown): void
}

export interface OfflineRecordingPrompt {
  canUseNetwork(retry?: () => Promise<void>, isCurrent?: () => boolean): boolean
  setPendingRetry(retry?: () => Promise<void>, isCurrent?: () => boolean): void
  show(options?: { force?: boolean }): void
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

  const setPendingRetry = (
    retry?: () => Promise<void>,
    isCurrent?: () => boolean
  ) => {
    pendingRetry = retry ? { retry, isCurrent } : null
  }

  const canUseNetwork = (
    retry?: () => Promise<void>,
    isCurrent?: () => boolean
  ) => {
    if (options.isOnline()) return true
    setPendingRetry(retry, isCurrent)
    show({ force: true })
    return false
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
    'offline',
    () => {
      dismissed = false
      show()
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

  if (!options.isOnline()) show()

  scope.own(() => {
    pendingRetry = null
    hide()
  })

  return { canUseNetwork, setPendingRetry, show, hide }
}
