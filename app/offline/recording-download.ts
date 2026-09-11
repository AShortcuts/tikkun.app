import type { AudioMediaIdentity, AudioRecording } from '../audio/types.ts'
import { createOfflineWorkerRequestClient } from './worker-request.ts'

export type OfflineRecordingDownloadPhase =
  | 'no-recording'
  | 'checking'
  | 'idle'
  | 'downloading'
  | 'complete'
  | 'removing'
  | 'unavailable'
  | 'error'

export type OfflineRecordingInventoryPhase =
  | 'checking'
  | 'idle'
  | 'removing'
  | 'unavailable'
  | 'error'

export interface OfflineRecordingDownloadSnapshot {
  supported: boolean
  phase: OfflineRecordingDownloadPhase
  recordingId: string | null
  recordingTitle: string | null
  exactStored: boolean
  downloadedBytes: number
  totalBytes: number
  otherCount: number
  otherBytes: number
  storedCount: number
  storedBytes: number
  inventoryPhase: OfflineRecordingInventoryPhase
  inventoryErrorMessage: string | null
  errorMessage: string | null
  removalPending?: boolean
  storageLocation?: 'browser' | 'device'
  requiresDependencyRepair?: boolean
}

export interface OfflineRecordingRemovalResult {
  status: 'completed' | 'failed' | 'skipped' | 'pending'
  errorMessage: string | null
}

export interface OfflineRecordingDownloadController {
  getSnapshot(): OfflineRecordingDownloadSnapshot
  subscribe(
    listener: (snapshot: OfflineRecordingDownloadSnapshot) => void
  ): () => void
  refresh(): Promise<void>
  download(expectedRecordingId?: string | null): Promise<void>
  remove(expectedRecordingId?: string | null): Promise<OfflineRecordingRemovalResult>
  removeOthers(
    expectedRecordingId?: string | null
  ): Promise<OfflineRecordingRemovalResult>
  removeAll(): Promise<OfflineRecordingRemovalResult>
  destroy(): void
}

type RecordingDownloadWorkerMessage = {
  type: 'RECORDING_DOWNLOAD_STATUS'
  audioId: string
  state: 'idle' | 'downloading' | 'complete' | 'removing' | 'error'
  downloadedBytes: number
  totalBytes: number
  otherCount: number
  otherBytes: number
  exactStored: boolean
  complete: boolean
  errorMessage?: string
}

type RecordingDownloadInventoryWorkerMessage = {
  type: 'RECORDING_DOWNLOAD_INVENTORY_STATUS'
  state: 'idle' | 'removing' | 'error'
  count: number
  totalBytes: number
  complete: boolean
  errorMessage?: string
}

export type RecordingDescriptor = {
  audioId: string
  title: string
  url: string
  digest: string
  byteLength: number
}

export type OfflineDownloadRecording = Pick<
  AudioRecording,
  'id' | 'title' | 'playSrc' | 'status'
> & {
  readonly mediaIdentity?: Readonly<AudioMediaIdentity>
}

const isNonNegativeInteger = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) >= 0

export function parseRecordingDownloadMessage(
  value: unknown,
  expectedAudioId: string
): RecordingDownloadWorkerMessage {
  if (!value || typeof value !== 'object') {
    throw new Error('The offline worker returned an invalid response.')
  }
  const message = value as Partial<RecordingDownloadWorkerMessage>
  if (
    message.type !== 'RECORDING_DOWNLOAD_STATUS' ||
    message.audioId !== expectedAudioId ||
    !['idle', 'downloading', 'complete', 'removing', 'error'].includes(
      message.state ?? ''
    ) ||
    !isNonNegativeInteger(message.downloadedBytes) ||
    !isNonNegativeInteger(message.totalBytes) ||
    !isNonNegativeInteger(message.otherCount) ||
    !isNonNegativeInteger(message.otherBytes) ||
    typeof message.exactStored !== 'boolean' ||
    message.downloadedBytes > message.totalBytes ||
    typeof message.complete !== 'boolean' ||
    message.complete !== (message.state === 'complete') ||
    (message.errorMessage !== undefined &&
      (typeof message.errorMessage !== 'string' ||
        message.errorMessage.length > 1000))
  ) {
    throw new Error('The offline worker returned an invalid response.')
  }
  return message as RecordingDownloadWorkerMessage
}

function parseInventoryWorkerMessage(
  value: unknown
): RecordingDownloadInventoryWorkerMessage {
  if (!value || typeof value !== 'object') {
    throw new Error('The offline worker returned an invalid response.')
  }
  const message = value as Partial<RecordingDownloadInventoryWorkerMessage>
  if (
    message.type !== 'RECORDING_DOWNLOAD_INVENTORY_STATUS' ||
    !['idle', 'removing', 'error'].includes(message.state ?? '') ||
    !isNonNegativeInteger(message.count) ||
    !isNonNegativeInteger(message.totalBytes) ||
    typeof message.complete !== 'boolean' ||
    message.complete !== (message.state === 'idle' && message.count === 0) ||
    (message.errorMessage !== undefined &&
      (typeof message.errorMessage !== 'string' ||
        message.errorMessage.length > 1000))
  ) {
    throw new Error('The offline worker returned an invalid response.')
  }
  return message as RecordingDownloadInventoryWorkerMessage
}

export function descriptorForRecording(
  recording: OfflineDownloadRecording | null
): RecordingDescriptor | null {
  if (
    !recording ||
    recording.status !== 'available' ||
    !recording.mediaIdentity
  ) {
    return null
  }
  return {
    audioId: recording.id,
    title: recording.title,
    url: recording.playSrc,
    digest: recording.mediaIdentity.digest,
    byteLength: recording.mediaIdentity.byteLength,
  }
}

const descriptorKey = (descriptor: RecordingDescriptor) =>
  `${descriptor.audioId}:${descriptor.digest}:${descriptor.byteLength}:${descriptor.url}`

const messageFromError = (error: unknown) =>
  error instanceof Error
    ? error.message
    : 'The recording could not be saved for offline playback.'

type RecordingWorkerCommand =
  | 'GET_RECORDING_DOWNLOAD_STATUS'
  | 'DOWNLOAD_RECORDING'
  | 'REMOVE_RECORDING_DOWNLOAD'
  | 'REMOVE_OTHER_RECORDING_DOWNLOADS'

type RecordingRequestOutcome =
  | { status: 'received'; message: RecordingDownloadWorkerMessage }
  | { status: 'unavailable' }
  | { status: 'failed'; errorMessage: string }

type InventoryRequestOutcome =
  | { status: 'received'; message: RecordingDownloadInventoryWorkerMessage }
  | { status: 'unavailable' }
  | { status: 'failed'; errorMessage: string }

const skippedRemovalResult = (): OfflineRecordingRemovalResult => ({
  status: 'skipped',
  errorMessage: null,
})

const removalResultFromOutcome = (
  outcome: RecordingRequestOutcome | InventoryRequestOutcome
): OfflineRecordingRemovalResult => {
  if (outcome.status === 'failed') {
    return { status: 'failed', errorMessage: outcome.errorMessage }
  }
  if (outcome.status === 'unavailable') {
    return {
      status: 'failed',
      errorMessage:
        'Offline recording downloads are not available in this browser.',
    }
  }
  if (outcome.message.state === 'error') {
    return {
      status: 'failed',
      errorMessage:
        outcome.message.errorMessage ??
        'The offline recording removal paused.',
    }
  }
  return { status: 'completed', errorMessage: null }
}

export function createOfflineRecordingDownloadController({
  serviceWorker,
  getRecording,
  createMessageChannel = () => new MessageChannel(),
}: {
  serviceWorker: ServiceWorkerContainer | null
  getRecording(): OfflineDownloadRecording | null
  createMessageChannel?: () => MessageChannel
}): OfflineRecordingDownloadController {
  const workerRequests = createOfflineWorkerRequestClient({
    serviceWorker,
    createMessageChannel,
    responseTimeoutMs: 120_000,
  })
  let destroyed = false
  let bindingGeneration = 0
  let boundDescriptorKey: string | null = null
  let presentationGeneration = 0
  const refreshes = new Map<string, Promise<void>>()
  const operations = new Map<
    string,
    { command: RecordingWorkerCommand; promise: Promise<RecordingRequestOutcome> }
  >()
  let inventoryRefresh: Promise<void> | null = null
  let inventoryOperation: Promise<InventoryRequestOutcome> | null = null
  let snapshot: OfflineRecordingDownloadSnapshot = {
    supported: workerRequests.supported,
    phase: workerRequests.supported ? 'no-recording' : 'unavailable',
    recordingId: null,
    recordingTitle: null,
    exactStored: false,
    downloadedBytes: 0,
    totalBytes: 0,
    otherCount: 0,
    otherBytes: 0,
    storedCount: 0,
    storedBytes: 0,
    inventoryPhase: workerRequests.supported ? 'checking' : 'unavailable',
    inventoryErrorMessage: null,
    errorMessage: null,
  }
  const listeners = new Set<
    (snapshot: OfflineRecordingDownloadSnapshot) => void
  >()

  const updateSnapshot = (
    updates: Partial<OfflineRecordingDownloadSnapshot>
  ) => {
    if (destroyed) return
    snapshot = { ...snapshot, ...updates }
    listeners.forEach((listener) => listener({ ...snapshot }))
  }

  const bindCurrentRecording = () => {
    const recording = getRecording()
    const descriptor = descriptorForRecording(recording)
    const nextKey = descriptor ? descriptorKey(descriptor) : null
    const bindingChanged = nextKey !== boundDescriptorKey
    if (bindingChanged) {
      boundDescriptorKey = nextKey
      bindingGeneration += 1
      presentationGeneration += 1
    }

    if (!recording) {
      updateSnapshot({
        phase: workerRequests.supported ? 'no-recording' : 'unavailable',
        recordingId: null,
        recordingTitle: null,
        exactStored: false,
        downloadedBytes: 0,
        totalBytes: 0,
        otherCount: 0,
        otherBytes: 0,
        inventoryPhase: workerRequests.supported
          ? snapshot.inventoryPhase
          : 'unavailable',
        errorMessage: null,
      })
      return null
    }
    if (!descriptor) {
      updateSnapshot({
        phase: 'unavailable',
        recordingId: recording.id,
        recordingTitle: recording.title,
        exactStored: false,
        downloadedBytes: 0,
        totalBytes: recording.mediaIdentity?.byteLength ?? 0,
        otherCount: 0,
        otherBytes: 0,
        errorMessage:
          'This recording does not have the verified media identity required for offline storage.',
      })
      return null
    }
    const key = descriptorKey(descriptor)
    updateSnapshot(
      bindingChanged
        ? {
            phase: workerRequests.supported ? 'checking' : 'unavailable',
            recordingId: descriptor.audioId,
            recordingTitle: descriptor.title,
            exactStored: false,
            downloadedBytes: 0,
            totalBytes: descriptor.byteLength,
            otherCount: 0,
            otherBytes: 0,
            errorMessage: null,
          }
        : {
            recordingId: descriptor.audioId,
            recordingTitle: descriptor.title,
            totalBytes: descriptor.byteLength,
          }
    )
    return {
      descriptor,
      key,
      generation: bindingGeneration,
    }
  }

  type RecordingBinding = NonNullable<ReturnType<typeof bindCurrentRecording>>

  const isCurrentRequest = (
    binding: RecordingBinding,
    presentation: number
  ) =>
    binding.generation === bindingGeneration &&
    binding.key === boundDescriptorKey &&
    presentation === presentationGeneration

  const requestStatus = async (
    command: RecordingWorkerCommand,
    binding: RecordingBinding,
    presentation: number
  ): Promise<RecordingRequestOutcome> => {
    const { descriptor } = binding
    let terminalMessage: RecordingDownloadWorkerMessage | null = null
    const result = await workerRequests.request(
      { type: command, recording: descriptor },
      (value) => {
        const message = parseRecordingDownloadMessage(value, descriptor.audioId)
        if (isCurrentRequest(binding, presentation)) {
          updateSnapshot({
            phase: message.state,
            exactStored: message.exactStored,
            downloadedBytes: message.downloadedBytes,
            totalBytes: message.totalBytes,
            otherCount: message.otherCount,
            otherBytes: message.otherBytes,
            storedCount: (message.exactStored ? 1 : 0) + message.otherCount,
            storedBytes:
              (message.exactStored ? message.totalBytes : 0) +
              message.otherBytes,
            inventoryPhase: 'idle',
            inventoryErrorMessage: null,
            errorMessage: message.errorMessage ?? null,
          })
        }
        const terminal =
          command === 'GET_RECORDING_DOWNLOAD_STATUS' ||
          message.state === 'complete' ||
          ((command === 'REMOVE_RECORDING_DOWNLOAD' ||
            command === 'REMOVE_OTHER_RECORDING_DOWNLOADS') &&
            message.state === 'idle') ||
          message.state === 'error'
        if (terminal) terminalMessage = message
        return terminal
      }
    )
    if (result === 'unavailable' && isCurrentRequest(binding, presentation)) {
      updateSnapshot({ phase: 'unavailable', errorMessage: null })
    }
    if (result === 'unavailable') return { status: 'unavailable' }
    if (!terminalMessage) {
      return {
        status: 'failed',
        errorMessage: 'The offline worker returned no terminal response.',
      }
    }
    return { status: 'received', message: terminalMessage }
  }

  const runRequest = async (
    command: RecordingWorkerCommand,
    binding: RecordingBinding,
    presentation: number
  ): Promise<RecordingRequestOutcome> => {
    try {
      return await requestStatus(command, binding, presentation)
    } catch (error) {
      const errorMessage = messageFromError(error)
      if (isCurrentRequest(binding, presentation)) {
        updateSnapshot({
          phase: 'error',
          errorMessage,
        })
      }
      return { status: 'failed', errorMessage }
    }
  }

  const refreshBinding = (binding: RecordingBinding): Promise<void> => {
    const operation = operations.get(binding.key)
    if (operation) return operation.promise.then(() => undefined)
    const existing = refreshes.get(binding.key)
    if (existing) return existing
    const presentation = ++presentationGeneration
    if (isCurrentRequest(binding, presentation)) {
      updateSnapshot({ phase: 'checking', errorMessage: null })
    }
    const request = runRequest(
      'GET_RECORDING_DOWNLOAD_STATUS',
      binding,
      presentation
    )
      .then(() => undefined)
      .finally(() => {
        if (refreshes.get(binding.key) === request) {
          refreshes.delete(binding.key)
        }
      })
    refreshes.set(binding.key, request)
    return request
  }

  const runInventoryRequest = async (
    command:
      | 'GET_RECORDING_DOWNLOAD_INVENTORY'
      | 'REMOVE_ALL_RECORDING_DOWNLOADS'
  ): Promise<InventoryRequestOutcome> => {
    try {
      let terminalMessage: RecordingDownloadInventoryWorkerMessage | null = null
      const result = await workerRequests.request({ type: command }, (value) => {
        const message = parseInventoryWorkerMessage(value)
        updateSnapshot({
          storedCount: message.count,
          storedBytes: message.totalBytes,
          inventoryPhase: message.state,
          inventoryErrorMessage: message.errorMessage ?? null,
        })
        const terminal = message.state === 'idle' || message.state === 'error'
        if (terminal) terminalMessage = message
        return terminal
      })
      if (result === 'unavailable') {
        updateSnapshot({
          inventoryPhase: 'unavailable',
          inventoryErrorMessage: null,
        })
        return { status: 'unavailable' }
      }
      if (!terminalMessage) {
        return {
          status: 'failed',
          errorMessage: 'The offline worker returned no terminal response.',
        }
      }
      return { status: 'received', message: terminalMessage }
    } catch (error) {
      const errorMessage = messageFromError(error)
      updateSnapshot({
        inventoryPhase: 'error',
        inventoryErrorMessage: errorMessage,
      })
      return { status: 'failed', errorMessage }
    }
  }

  const refreshInventory = (): Promise<void> => {
    if (inventoryOperation) return inventoryOperation.then(() => undefined)
    if (inventoryRefresh) return inventoryRefresh
    updateSnapshot({ inventoryPhase: 'checking', inventoryErrorMessage: null })
    const request = runInventoryRequest('GET_RECORDING_DOWNLOAD_INVENTORY')
      .then(() => undefined)
      .finally(() => {
        if (inventoryRefresh === request) inventoryRefresh = null
      })
    inventoryRefresh = request
    return request
  }

  const refreshCurrentAfter = (binding: RecordingBinding): Promise<void> => {
    if (destroyed) return Promise.resolve()
    const current = bindCurrentRecording()
    if (
      current &&
      (current.key !== binding.key ||
        current.generation !== binding.generation)
    ) {
      return refreshBinding(current)
    }
    return Promise.resolve()
  }

  const expectedRecordingStillCurrent = (
    binding: RecordingBinding,
    expectedRecordingId: string | null | undefined
  ) =>
    expectedRecordingId === undefined ||
    expectedRecordingId === binding.descriptor.audioId

  return {
    getSnapshot: () => ({ ...snapshot }),
    subscribe(listener) {
      listeners.add(listener)
      listener({ ...snapshot })
      return () => listeners.delete(listener)
    },
    refresh() {
      if (destroyed) return Promise.resolve()
      const binding = bindCurrentRecording()
      if (!binding) {
        return workerRequests.supported
          ? refreshInventory()
          : Promise.resolve()
      }
      return refreshBinding(binding)
    },
    download(expectedRecordingId) {
      if (destroyed) return Promise.resolve()
      const binding = bindCurrentRecording()
      if (!binding) return Promise.resolve()
      if (!expectedRecordingStillCurrent(binding, expectedRecordingId)) {
        return refreshBinding(binding)
      }
      const activeOperation = operations.get(binding.key)
      if (activeOperation) {
        return activeOperation.promise.then(() => undefined)
      }
      if (snapshot.exactStored) return Promise.resolve()
      const presentation = ++presentationGeneration
      updateSnapshot({
        phase: 'downloading',
        downloadedBytes: 0,
        errorMessage: null,
      })
      const request = runRequest(
        'DOWNLOAD_RECORDING',
        binding,
        presentation
      ).finally(() => {
        if (operations.get(binding.key)?.promise === request) {
          operations.delete(binding.key)
        }
        return refreshCurrentAfter(binding)
      })
      operations.set(binding.key, { command: 'DOWNLOAD_RECORDING', promise: request })
      return request.then(() => undefined)
    },
    remove(expectedRecordingId) {
      if (destroyed) return Promise.resolve(skippedRemovalResult())
      const binding = bindCurrentRecording()
      if (!binding) return Promise.resolve(skippedRemovalResult())
      if (!expectedRecordingStillCurrent(binding, expectedRecordingId)) {
        return refreshBinding(binding).then(skippedRemovalResult)
      }
      const activeOperation = operations.get(binding.key)
      if (activeOperation) {
        return activeOperation.command === 'REMOVE_RECORDING_DOWNLOAD'
          ? activeOperation.promise.then(removalResultFromOutcome)
          : activeOperation.promise.then(skippedRemovalResult)
      }
      if (!snapshot.exactStored) {
        return refreshBinding(binding).then(skippedRemovalResult)
      }
      const presentation = ++presentationGeneration
      updateSnapshot({ phase: 'removing', errorMessage: null })
      const request = runRequest(
        'REMOVE_RECORDING_DOWNLOAD',
        binding,
        presentation
      ).finally(() => {
        if (operations.get(binding.key)?.promise === request) {
          operations.delete(binding.key)
        }
        return refreshCurrentAfter(binding)
      })
      operations.set(binding.key, {
        command: 'REMOVE_RECORDING_DOWNLOAD',
        promise: request,
      })
      return request.then(removalResultFromOutcome)
    },
    removeOthers(expectedRecordingId) {
      if (destroyed) return Promise.resolve(skippedRemovalResult())
      const binding = bindCurrentRecording()
      if (!binding) return Promise.resolve(skippedRemovalResult())
      if (!expectedRecordingStillCurrent(binding, expectedRecordingId)) {
        return refreshBinding(binding).then(skippedRemovalResult)
      }
      const activeOperation = operations.get(binding.key)
      if (activeOperation) {
        return activeOperation.command === 'REMOVE_OTHER_RECORDING_DOWNLOADS'
          ? activeOperation.promise.then(removalResultFromOutcome)
          : activeOperation.promise.then(skippedRemovalResult)
      }
      if (snapshot.otherCount === 0) {
        return refreshBinding(binding).then(skippedRemovalResult)
      }
      const presentation = ++presentationGeneration
      updateSnapshot({ phase: 'removing', errorMessage: null })
      const request = runRequest(
        'REMOVE_OTHER_RECORDING_DOWNLOADS',
        binding,
        presentation
      ).finally(() => {
        if (operations.get(binding.key)?.promise === request) {
          operations.delete(binding.key)
        }
        return refreshCurrentAfter(binding)
      })
      operations.set(binding.key, {
        command: 'REMOVE_OTHER_RECORDING_DOWNLOADS',
        promise: request,
      })
      return request.then(removalResultFromOutcome)
    },
    removeAll() {
      if (destroyed || !workerRequests.supported) {
        return Promise.resolve(skippedRemovalResult())
      }
      if (inventoryOperation) {
        return inventoryOperation.then(removalResultFromOutcome)
      }
      if (snapshot.storedCount === 0) {
        return refreshInventory().then(skippedRemovalResult)
      }
      updateSnapshot({
        inventoryPhase: 'removing',
        inventoryErrorMessage: null,
      })
      const request = runInventoryRequest(
        'REMOVE_ALL_RECORDING_DOWNLOADS'
      ).finally(() => {
        if (inventoryOperation === request) inventoryOperation = null
        const binding = bindCurrentRecording()
        if (binding) return refreshBinding(binding)
      })
      inventoryOperation = request
      return request.then(removalResultFromOutcome)
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      bindingGeneration += 1
      workerRequests.destroy()
      listeners.clear()
      refreshes.clear()
      operations.clear()
      inventoryRefresh = null
      inventoryOperation = null
    },
  }
}
