export type OfflineTorahDownloadPhase =
  | 'checking'
  | 'idle'
  | 'downloading'
  | 'complete'
  | 'unavailable'
  | 'error'

export interface OfflineTorahDownloadSnapshot {
  supported: boolean
  phase: OfflineTorahDownloadPhase
  downloaded: number
  total: number
  errorMessage: string | null
}

export interface OfflineTorahDownloadController {
  getSnapshot(): OfflineTorahDownloadSnapshot
  subscribe(
    listener: (snapshot: OfflineTorahDownloadSnapshot) => void
  ): () => void
  refresh(): Promise<void>
  download(): Promise<void>
  destroy(): void
}

type TorahDownloadWorkerMessage = {
  type: 'TORAH_DOWNLOAD_STATUS'
  state: 'idle' | 'downloading' | 'complete' | 'error'
  downloaded: number
  total: number
  complete: boolean
  errorMessage?: string
}

const WORKER_RESPONSE_TIMEOUT_MS = 5000

const isNonNegativeInteger = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) >= 0

function parseWorkerMessage(value: unknown): TorahDownloadWorkerMessage {
  if (!value || typeof value !== 'object') {
    throw new Error('The offline worker returned an invalid response.')
  }
  const message = value as Partial<TorahDownloadWorkerMessage>
  if (
    message.type !== 'TORAH_DOWNLOAD_STATUS' ||
    !['idle', 'downloading', 'complete', 'error'].includes(
      message.state ?? ''
    ) ||
    !isNonNegativeInteger(message.downloaded) ||
    !isNonNegativeInteger(message.total) ||
    message.downloaded > message.total ||
    typeof message.complete !== 'boolean'
  ) {
    throw new Error('The offline worker returned an invalid response.')
  }
  return message as TorahDownloadWorkerMessage
}

const messageFromError = (error: unknown) =>
  error instanceof Error
    ? error.message
    : 'The Torah download could not be completed.'

export function createOfflineTorahDownloadController({
  serviceWorker,
  createMessageChannel = () => new MessageChannel(),
}: {
  serviceWorker: ServiceWorkerContainer | null
  createMessageChannel?: () => MessageChannel
}): OfflineTorahDownloadController {
  let snapshot: OfflineTorahDownloadSnapshot = {
    supported: Boolean(serviceWorker),
    phase: serviceWorker ? 'checking' : 'unavailable',
    downloaded: 0,
    total: 0,
    errorMessage: null,
  }
  let destroyed = false
  let refreshPromise: Promise<void> | null = null
  let downloadPromise: Promise<void> | null = null
  const listeners = new Set<
    (snapshot: OfflineTorahDownloadSnapshot) => void
  >()
  const activePorts = new Set<MessagePort>()

  const updateSnapshot = (updates: Partial<OfflineTorahDownloadSnapshot>) => {
    if (destroyed) return
    snapshot = { ...snapshot, ...updates }
    listeners.forEach((listener) => listener({ ...snapshot }))
  }

  const getActiveWorker = async () => {
    if (!serviceWorker) return null
    const registration = await serviceWorker.getRegistration()
    if (!registration) return serviceWorker.controller
    if (registration.waiting) return registration.waiting
    if (registration.active) return registration.active
    const readyRegistration = await serviceWorker.ready
    return readyRegistration.active ?? serviceWorker.controller
  }

  const requestStatus = async (
    command: 'GET_TORAH_DOWNLOAD_STATUS' | 'DOWNLOAD_TORAH_PAGES'
  ) => {
    const worker = await getActiveWorker()
    if (!worker) {
      updateSnapshot({
        phase: 'unavailable',
        errorMessage: null,
      })
      return
    }

    await new Promise<void>((resolve, reject) => {
      const channel = createMessageChannel()
      const port = channel.port1
      const responseTimer = setTimeout(() => {
        close()
        reject(
          new Error(
            'The offline worker is not ready. Apply any available update and try again.'
          )
        )
      }, WORKER_RESPONSE_TIMEOUT_MS)
      activePorts.add(port)
      const close = () => {
        clearTimeout(responseTimer)
        activePorts.delete(port)
        port.close()
      }
      port.onmessage = (event) => {
        try {
          clearTimeout(responseTimer)
          const message = parseWorkerMessage(event.data)
          updateSnapshot({
            phase: message.state,
            downloaded: message.downloaded,
            total: message.total,
            errorMessage: message.errorMessage ?? null,
          })
          if (
            command === 'GET_TORAH_DOWNLOAD_STATUS' ||
            message.state === 'complete' ||
            message.state === 'error'
          ) {
            close()
            resolve()
          }
        } catch (error) {
          close()
          reject(error)
        }
      }
      port.onmessageerror = () => {
        close()
        reject(new Error('The offline worker response could not be read.'))
      }
      port.start()
      worker.postMessage({ type: command }, [channel.port2])
    })
  }

  const runRequest = async (
    command: 'GET_TORAH_DOWNLOAD_STATUS' | 'DOWNLOAD_TORAH_PAGES'
  ) => {
    try {
      await requestStatus(command)
    } catch (error) {
      updateSnapshot({
        phase: 'error',
        errorMessage: messageFromError(error),
      })
    }
  }

  return {
    getSnapshot: () => ({ ...snapshot }),
    subscribe: (listener) => {
      listeners.add(listener)
      listener({ ...snapshot })
      return () => listeners.delete(listener)
    },
    refresh: () => {
      if (destroyed || snapshot.phase === 'downloading') {
        return Promise.resolve()
      }
      if (refreshPromise) return refreshPromise
      updateSnapshot({ phase: 'checking', errorMessage: null })
      const request = runRequest('GET_TORAH_DOWNLOAD_STATUS').finally(() => {
        if (refreshPromise === request) refreshPromise = null
      })
      refreshPromise = request
      return request
    },
    download: () => {
      if (destroyed || snapshot.phase === 'complete') return Promise.resolve()
      if (downloadPromise) return downloadPromise
      updateSnapshot({ phase: 'downloading', errorMessage: null })
      const request = runRequest('DOWNLOAD_TORAH_PAGES').finally(() => {
        if (downloadPromise === request) downloadPromise = null
      })
      downloadPromise = request
      return request
    },
    destroy: () => {
      destroyed = true
      activePorts.forEach((port) => port.close())
      activePorts.clear()
      listeners.clear()
      refreshPromise = null
      downloadPromise = null
    },
  }
}
