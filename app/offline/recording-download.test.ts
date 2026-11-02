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
