import { expect, test, vi } from 'vitest'
import type { ParshaAudioRecording } from '../audio/types.ts'
import { createOfflineRecordingDownloadController } from './recording-download.ts'

type WorkerCommand =
  | 'GET_RECORDING_DOWNLOAD_STATUS'
  | 'DOWNLOAD_RECORDING'
  | 'REMOVE_RECORDING_DOWNLOAD'
  | 'REMOVE_OTHER_RECORDING_DOWNLOADS'

const mediaIdentity = {
  algorithm: 'sha256' as const,
  digest: 'a'.repeat(64),
  byteLength: 12,
}

const recording = (id: string): ParshaAudioRecording => ({
  id,
  narratorId: 'reader',
  reading: { kind: 'parsha', id: 'beresheet', name: 'Beresheet' },
  aliyah: 1,
  title: `${id} title`,
  playSrc: `/audio/${id}.m4a?tikkun-media=${mediaIdentity.digest}`,
  downloadSrc: `/audio/${id}.m4a`,
  format: 'm4a',
  status: 'available',
  mediaIdentity,
  parshaSlug: 'beresheet',
  parshaName: 'Beresheet',
})

function createServiceWorker(
  respond: (
    command: WorkerCommand,
    audioId: string,
    port: MessagePort
  ) => void
) {
  const worker = {
    postMessage: vi.fn(
      (
        message: {
          type: WorkerCommand
          recording: { audioId: string }
        },
        transfer: Transferable[]
      ) => {
        respond(
          message.type,
          message.recording.audioId,
          transfer[0] as MessagePort
        )
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
  audioId: string,
  state: 'idle' | 'downloading' | 'complete' | 'removing' | 'error',
  downloadedBytes: number,
  totalBytes = mediaIdentity.byteLength,
  otherCount = 0,
  otherBytes = 0,
  exactStored = state === 'complete'
) => ({
  type: 'RECORDING_DOWNLOAD_STATUS',
  audioId,
  state,
  downloadedBytes,
  totalBytes,
  otherCount,
  otherBytes,
  exactStored,
  complete: state === 'complete',
})

test('reports no recording and unsupported media honestly', async () => {
  const controller = createOfflineRecordingDownloadController({
    serviceWorker: null,
    getRecording: () => null,
  })

  await controller.refresh()
  expect(controller.getSnapshot()).toMatchObject({
    supported: false,
    phase: 'unavailable',
    recordingId: null,
  })
  controller.destroy()

  const current = {
    ...recording('unverified'),
    mediaIdentity: undefined,
  }
  const unsupported = createOfflineRecordingDownloadController({
    serviceWorker: {} as ServiceWorkerContainer,
    getRecording: () => current,
  })
  await unsupported.refresh()
  expect(unsupported.getSnapshot()).toMatchObject({
    phase: 'unavailable',
    recordingId: 'unverified',
    errorMessage: expect.stringContaining('verified media identity'),
  })
  unsupported.destroy()
})

test('tracks explicit download progress, completion, and removal', async () => {
  const current = recording('beresheet-1')
  const { serviceWorker, worker } = createServiceWorker(
    (command, audioId, port) => {
      if (command === 'GET_RECORDING_DOWNLOAD_STATUS') {
        port.postMessage(status(audioId, 'idle', 0))
      } else if (command === 'DOWNLOAD_RECORDING') {
        port.postMessage(status(audioId, 'idle', 0))
        port.postMessage(status(audioId, 'downloading', 5))
        port.postMessage(status(audioId, 'complete', 12))
      } else {
        port.postMessage(status(audioId, 'removing', 12))
        port.postMessage(status(audioId, 'idle', 0))
      }
    }
  )
  const controller = createOfflineRecordingDownloadController({
    serviceWorker,
    getRecording: () => current,
  })
  const phases: string[] = []
  const unsubscribe = controller.subscribe((snapshot) => {
    phases.push(`${snapshot.phase}:${snapshot.downloadedBytes}`)
  })

  await controller.refresh()
  expect(controller.getSnapshot()).toMatchObject({
    phase: 'idle',
    recordingId: current.id,
    recordingTitle: current.title,
    totalBytes: 12,
  })
  await controller.download()
  expect(controller.getSnapshot()).toMatchObject({
    phase: 'complete',
    downloadedBytes: 12,
  })
  expect(phases).toContain('downloading:5')
  await controller.remove()
  expect(controller.getSnapshot()).toMatchObject({
    phase: 'idle',
    downloadedBytes: 0,
  })
  expect(worker.postMessage).toHaveBeenCalledTimes(3)

  unsubscribe()
  controller.destroy()
})

test('ignores a late response from the previously active recording', async () => {
  let current = recording('first')
  const pending = new Map<string, MessagePort>()
  const { serviceWorker } = createServiceWorker(
    (_command, audioId, port) => {
      pending.set(audioId, port)
    }
  )
  const controller = createOfflineRecordingDownloadController({
    serviceWorker,
    getRecording: () => current,
  })

  const firstRefresh = controller.refresh()
  await vi.waitFor(() => expect(pending.has('first')).toBe(true))
  current = recording('second')
  const secondRefresh = controller.refresh()
  await vi.waitFor(() => expect(pending.has('second')).toBe(true))
  pending.get('second')?.postMessage(status('second', 'complete', 12))
  await secondRefresh
  pending.get('first')?.postMessage(status('first', 'idle', 0))
  await firstRefresh

  expect(controller.getSnapshot()).toMatchObject({
    recordingId: 'second',
    phase: 'complete',
    downloadedBytes: 12,
  })
  controller.destroy()
})

test('rebinds during an active download and never removes the newly active recording from a stale action', async () => {
  let current = recording('first')
  const pendingDownload = new Map<string, MessagePort>()
  const commands: Array<{ command: WorkerCommand; audioId: string }> = []
  const { serviceWorker } = createServiceWorker(
    (command, audioId, port) => {
      commands.push({ command, audioId })
      if (command === 'DOWNLOAD_RECORDING') {
        pendingDownload.set(audioId, port)
        port.postMessage(status(audioId, 'downloading', 5))
        return
      }
      if (command === 'GET_RECORDING_DOWNLOAD_STATUS') {
        port.postMessage(
          status(audioId, audioId === 'second' ? 'complete' : 'idle',
            audioId === 'second' ? 12 : 0)
        )
        return
      }
      port.postMessage(status(audioId, 'idle', 0))
    }
  )
  const controller = createOfflineRecordingDownloadController({
    serviceWorker,
    getRecording: () => current,
  })

  await controller.refresh()
  const firstDownload = controller.download('first')
  await vi.waitFor(() => expect(pendingDownload.has('first')).toBe(true))
  current = recording('second')
  await controller.refresh()
  expect(controller.getSnapshot()).toMatchObject({
    recordingId: 'second',
    phase: 'complete',
  })

  pendingDownload.get('first')?.postMessage(status('first', 'complete', 12))
  await firstDownload
  expect(controller.getSnapshot()).toMatchObject({
    recordingId: 'second',
    phase: 'complete',
  })

  await controller.remove('first')
  expect(
    commands.some(
      ({ command, audioId }) =>
        command === 'REMOVE_RECORDING_DOWNLOAD' && audioId === 'second'
    )
  ).toBe(false)
  expect(controller.getSnapshot().recordingId).toBe('second')
  controller.destroy()
})

test('preserves verified current-copy facts and returns a correlated removal failure', async () => {
  const current = recording('beresheet-1')
  const { serviceWorker } = createServiceWorker((command, audioId, port) => {
    if (command === 'GET_RECORDING_DOWNLOAD_STATUS') {
      port.postMessage(status(audioId, 'complete', 12, 12, 0, 0, true))
      return
    }
    port.postMessage(status(audioId, 'removing', 12, 12, 0, 0, true))
    port.postMessage({
      ...status(audioId, 'error', 12, 12, 0, 0, true),
      errorMessage: 'Offline removal failed.',
    })
  })
  const controller = createOfflineRecordingDownloadController({
    serviceWorker,
    getRecording: () => current,
  })

  await controller.refresh()
  const result = await controller.remove(current.id)

  expect(result).toEqual({
    status: 'failed',
    errorMessage: 'Offline removal failed.',
  })
  expect(controller.getSnapshot()).toMatchObject({
    phase: 'error',
    exactStored: true,
    downloadedBytes: 12,
    storedCount: 1,
    storedBytes: 12,
    errorMessage: 'Offline removal failed.',
  })
  controller.destroy()
})

test('returns a late removal failure after rebinding without staining the new recording', async () => {
  let current = recording('first')
  const pendingRemoval: { port: MessagePort | null } = { port: null }
  const { serviceWorker } = createServiceWorker((command, audioId, port) => {
    if (command === 'REMOVE_RECORDING_DOWNLOAD') {
      pendingRemoval.port = port
      port.postMessage(status(audioId, 'removing', 12, 12, 0, 0, true))
      return
    }
    port.postMessage(
      status(
        audioId,
        audioId === 'first' ? 'complete' : 'idle',
        audioId === 'first' ? 12 : 0,
        12,
        0,
        0,
        audioId === 'first'
      )
    )
  })
  const controller = createOfflineRecordingDownloadController({
    serviceWorker,
    getRecording: () => current,
  })

  await controller.refresh()
  const removal = controller.remove('first')
  await vi.waitFor(() => expect(pendingRemoval.port).not.toBeNull())

  current = recording('second')
  await controller.refresh()
  pendingRemoval.port?.postMessage({
    ...status('first', 'error', 12, 12, 0, 0, true),
    errorMessage: 'Late removal failed.',
  })

  await expect(removal).resolves.toEqual({
    status: 'failed',
    errorMessage: 'Late removal failed.',
  })
  expect(controller.getSnapshot()).toMatchObject({
    recordingId: 'second',
    phase: 'idle',
    exactStored: false,
    errorMessage: null,
  })
  controller.destroy()
})

test('inventories and removes stored recordings without an active recording', async () => {
  const commands: string[] = []
  let count = 3
  let totalBytes = 42
  const worker = {
    postMessage(message: { type: string }, transfer: Transferable[]) {
      commands.push(message.type)
      const port = transfer[0] as MessagePort
      const send = (state: 'idle' | 'removing') =>
        port.postMessage({
          type: 'RECORDING_DOWNLOAD_INVENTORY_STATUS',
          state,
          count,
          totalBytes,
          complete: state === 'idle' && count === 0,
        })
      if (message.type === 'REMOVE_ALL_RECORDING_DOWNLOADS') {
        send('removing')
        count = 0
        totalBytes = 0
      }
      send('idle')
    },
  }
  const registration = { active: worker }
  const serviceWorker = {
    controller: null,
    getRegistration: vi.fn(async () => registration),
    ready: Promise.resolve(registration),
  } as unknown as ServiceWorkerContainer
  const controller = createOfflineRecordingDownloadController({
    serviceWorker,
    getRecording: () => null,
  })

  await controller.refresh()
  expect(controller.getSnapshot()).toMatchObject({
    phase: 'no-recording',
    recordingId: null,
    storedCount: 3,
    storedBytes: 42,
    inventoryPhase: 'idle',
  })

  await controller.removeAll()
  expect(commands).toEqual([
    'GET_RECORDING_DOWNLOAD_INVENTORY',
    'REMOVE_ALL_RECORDING_DOWNLOADS',
  ])
  expect(controller.getSnapshot()).toMatchObject({
    phase: 'no-recording',
    storedCount: 0,
    storedBytes: 0,
    inventoryPhase: 'idle',
  })
  controller.destroy()
})

test('exposes and explicitly removes recordings no longer in the active catalog entry', async () => {
  const current = recording('beresheet-1')
  const commands: WorkerCommand[] = []
  const { serviceWorker } = createServiceWorker((command, audioId, port) => {
    commands.push(command)
    if (command === 'REMOVE_OTHER_RECORDING_DOWNLOADS') {
      port.postMessage(status(audioId, 'removing', 0, 12, 2, 30))
      port.postMessage(status(audioId, 'idle', 0))
      return
    }
    port.postMessage(status(audioId, 'idle', 0, 12, 2, 30))
  })
  const controller = createOfflineRecordingDownloadController({
    serviceWorker,
    getRecording: () => current,
  })

  await controller.refresh()
  expect(controller.getSnapshot()).toMatchObject({
    phase: 'idle',
    otherCount: 2,
    otherBytes: 30,
  })

  await controller.removeOthers(current.id)
  expect(commands).toContain('REMOVE_OTHER_RECORDING_DOWNLOADS')
  expect(controller.getSnapshot()).toMatchObject({
    phase: 'idle',
    otherCount: 0,
    otherBytes: 0,
  })
  controller.destroy()
})

test('surfaces malformed worker responses as a retryable error', async () => {
  const current = recording('beresheet-1')
  const { serviceWorker } = createServiceWorker((_command, _audioId, port) => {
    port.postMessage({ type: 'UNKNOWN' })
  })
  const controller = createOfflineRecordingDownloadController({
    serviceWorker,
    getRecording: () => current,
  })

  await controller.refresh()
  expect(controller.getSnapshot()).toMatchObject({
    phase: 'error',
    errorMessage: 'The offline worker returned an invalid response.',
  })
  controller.destroy()
})

test('rejects non-string worker error messages', async () => {
  const current = recording('beresheet-1')
  const { serviceWorker } = createServiceWorker((_command, audioId, port) => {
    port.postMessage({
      ...status(audioId, 'error', 0),
      errorMessage: { unsafe: true },
    })
  })
  const controller = createOfflineRecordingDownloadController({
    serviceWorker,
    getRecording: () => current,
  })

  await controller.refresh()
  expect(controller.getSnapshot()).toMatchObject({
    phase: 'error',
    errorMessage: 'The offline worker returned an invalid response.',
  })
  controller.destroy()
})
