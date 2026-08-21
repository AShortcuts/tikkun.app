export interface OfflineWorkerRequestClient {
  readonly supported: boolean
  request(
    message: Readonly<Record<string, unknown>>,
    onMessage: (value: unknown) => boolean
  ): Promise<'complete' | 'unavailable'>
  destroy(): void
}

interface ActiveRequest {
  port: MessagePort | null
  reject(error: Error): void
  close(): void
}

const WORKER_RESPONSE_TIMEOUT_MS = 5000
const WORKER_NOT_READY_MESSAGE =
  'The offline worker is not ready. Apply any available update and try again.'

export function createOfflineWorkerRequestClient({
  serviceWorker,
  createMessageChannel = () => new MessageChannel(),
  acquisitionTimeoutMs = WORKER_RESPONSE_TIMEOUT_MS,
  responseTimeoutMs = WORKER_RESPONSE_TIMEOUT_MS,
}: {
  serviceWorker: ServiceWorkerContainer | null
  createMessageChannel?: () => MessageChannel
  acquisitionTimeoutMs?: number
  responseTimeoutMs?: number
}): OfflineWorkerRequestClient {
  let destroyed = false
  const activeRequests = new Set<ActiveRequest>()

  const getActiveWorker = async () => {
    if (!serviceWorker || destroyed) return null
    const initialController = serviceWorker.controller
    if (initialController) return initialController
    const registration = await serviceWorker.getRegistration()
    if (destroyed) return null
    if (serviceWorker.controller) return serviceWorker.controller
    if (registration?.active) return registration.active
    const readyRegistration = await serviceWorker.ready
    if (destroyed) return null
    return serviceWorker.controller ?? readyRegistration.active ?? null
  }

  return {
    supported: Boolean(serviceWorker),
    async request(message, onMessage) {
      if (!serviceWorker || destroyed) return 'unavailable'

      return new Promise<'complete' | 'unavailable'>((resolve, reject) => {
        let settled = false
        let responseTimer = 0
        const request: ActiveRequest = {
          port: null,
          reject,
          close: () => {
            if (settled) return
            settled = true
            clearTimeout(responseTimer)
            activeRequests.delete(request)
            request.port?.close()
            request.port = null
          },
        }
        const fail = (error: Error) => {
          request.close()
          reject(error)
        }
        const armTimer = (timeoutMs: number, errorMessage: string) => {
          clearTimeout(responseTimer)
          responseTimer = setTimeout(() => {
            fail(new Error(errorMessage))
          }, timeoutMs) as unknown as number
        }
        const armResponseTimer = () =>
          armTimer(responseTimeoutMs, WORKER_NOT_READY_MESSAGE)
        armTimer(acquisitionTimeoutMs, WORKER_NOT_READY_MESSAGE)
        activeRequests.add(request)

        void getActiveWorker()
          .then((worker) => {
            if (settled) return
            if (!worker) {
              request.close()
              resolve('unavailable')
              return
            }
            armResponseTimer()
            const channel = createMessageChannel()
            const port = channel.port1
            request.port = port
            port.onmessage = (event) => {
              try {
                armResponseTimer()
                if (!onMessage(event.data)) return
                request.close()
                resolve('complete')
              } catch (error) {
                fail(
                  error instanceof Error
                    ? error
                    : new Error(
                        'The offline worker returned an invalid response.'
                      )
                )
              }
            }
            port.onmessageerror = () => {
              fail(
                new Error('The offline worker response could not be read.')
              )
            }
            port.start()
            try {
              worker.postMessage(message, [channel.port2])
            } catch (error) {
              fail(
                error instanceof Error
                  ? error
                  : new Error('The offline worker request could not be sent.')
              )
            }
          })
          .catch((error: unknown) => {
            if (settled) return
            fail(
              error instanceof Error
                ? error
                : new Error('The offline worker could not be reached.')
            )
          })
      })
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      for (const request of activeRequests) {
        request.close()
        request.reject(new Error('The offline request was cancelled.'))
      }
      activeRequests.clear()
    },
  }
}
