import { expect, test, vi } from 'vitest'
import { createOfflineTorahDownloadController } from './torah-download.ts'

type WorkerCommand =
  | 'GET_TORAH_DOWNLOAD_STATUS'
  | 'DOWNLOAD_TORAH_PAGES'

function createServiceWorker(
  respond: (command: WorkerCommand, port: MessagePort) => void
) {
  const worker = {
    postMessage: vi.fn(
      (message: { type: WorkerCommand }, transfer: Transferable[]) => {
        respond(message.type, transfer[0] as MessagePort)
      }
    ),
  }
  const registration = { active: worker }
  const serviceWorker = {
    controller: null,
    getRegistration: vi.fn(async () => registration),
    ready: Promise.resolve(registration),
  }
  return {
    serviceWorker: serviceWorker as unknown as ServiceWorkerContainer,
    worker,
  }
}

const status = (
  state: 'idle' | 'downloading' | 'complete' | 'error',
  downloaded: number,
  total: number
) => ({
  type: 'TORAH_DOWNLOAD_STATUS',
  state,
  downloaded,
  total,
  complete: state === 'complete',
})

test('reports unavailable when no service worker controls the app', async () => {
  const controller = createOfflineTorahDownloadController({
    serviceWorker: null,
  })

  expect(controller.getSnapshot().phase).toBe('unavailable')
  await controller.refresh()
  expect(controller.getSnapshot()).toMatchObject({
    supported: false,
    phase: 'unavailable',
    downloaded: 0,
    total: 0,
  })

  controller.destroy()
})

test('tracks explicit Torah download progress through one message channel', async () => {
  const { serviceWorker, worker } = createServiceWorker((command, port) => {
    if (command === 'GET_TORAH_DOWNLOAD_STATUS') {
      port.postMessage(status('idle', 1, 3))
      return
    }
    port.postMessage(status('downloading', 1, 3))
    port.postMessage(status('downloading', 2, 3))
    port.postMessage(status('complete', 3, 3))
  })
  const controller = createOfflineTorahDownloadController({ serviceWorker })
  const phases: string[] = []
  const unsubscribe = controller.subscribe((snapshot) => {
    phases.push(`${snapshot.phase}:${snapshot.downloaded}`)
  })

  await controller.refresh()
  expect(controller.getSnapshot()).toMatchObject({
    phase: 'idle',
    downloaded: 1,
    total: 3,
  })

  await controller.download()
  expect(controller.getSnapshot()).toMatchObject({
    phase: 'complete',
    downloaded: 3,
    total: 3,
  })
  expect(phases).toContain('downloading:2')
  expect(worker.postMessage).toHaveBeenCalledTimes(2)

  unsubscribe()
  controller.destroy()
})

test('surfaces malformed worker responses as an actionable error state', async () => {
  const { serviceWorker } = createServiceWorker((_command, port) => {
    port.postMessage({ type: 'UNKNOWN' })
  })
  const controller = createOfflineTorahDownloadController({ serviceWorker })

  await controller.refresh()

  expect(controller.getSnapshot()).toMatchObject({
    phase: 'error',
    errorMessage: 'The offline worker returned an invalid response.',
  })
  controller.destroy()
})
