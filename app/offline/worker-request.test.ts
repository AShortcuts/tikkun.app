import { expect, test, vi } from 'vitest'
import { createOfflineWorkerRequestClient } from './worker-request.ts'

function serviceWorkerFor(worker: { postMessage(...args: unknown[]): void }) {
  const registration = { active: worker }
  return {
    controller: null,
    getRegistration: vi.fn(async () => registration),
    ready: Promise.resolve(registration),
  } as unknown as ServiceWorkerContainer
}

function respondingWorker(label: string, calls: string[]) {
  return {
    postMessage(_message: unknown, transfer: Transferable[]) {
      calls.push(label)
      ;(transfer[0] as MessagePort).postMessage({ ok: true })
    },
  }
}

test('cleans up a request when posting to the worker throws', async () => {
  const client = createOfflineWorkerRequestClient({
    serviceWorker: serviceWorkerFor({
      postMessage() {
        throw new Error('worker stopped')
      },
    }),
  })

  await expect(client.request({ type: 'TEST' }, () => true)).rejects.toThrow(
    'worker stopped'
  )
  client.destroy()
})

test('rejects pending requests when its owner is destroyed', async () => {
  const postMessage = vi.fn()
  const client = createOfflineWorkerRequestClient({
    serviceWorker: serviceWorkerFor({ postMessage }),
    responseTimeoutMs: 60_000,
  })
  const request = client.request({ type: 'TEST' }, () => true)
  await vi.waitFor(() => expect(postMessage).toHaveBeenCalledTimes(1))

  client.destroy()

  await expect(request).rejects.toThrow('cancelled')
})

test('uses the controlling worker before active and never sends work to waiting', async () => {
  const calls: string[] = []
  const controller = respondingWorker('controller', calls)
  const active = respondingWorker('active', calls)
  const waiting = respondingWorker('waiting', calls)
  const registration = { active, waiting }
  const serviceWorker = {
    controller,
    getRegistration: vi.fn(async () => registration),
    ready: Promise.resolve(registration),
  } as unknown as ServiceWorkerContainer
  const client = createOfflineWorkerRequestClient({ serviceWorker })

  await expect(
    client.request({ type: 'TEST' }, () => true)
  ).resolves.toBe('complete')
  expect(calls).toEqual(['controller'])
  expect(serviceWorker.getRegistration).not.toHaveBeenCalled()
  client.destroy()
})

test('times out a silent controlling worker using the normal response deadline', async () => {
  vi.useFakeTimers()
  try {
    const controller = { postMessage: vi.fn() }
    const registration = { active: controller }
    const serviceWorker = {
      controller,
      getRegistration: vi.fn(async () => registration),
      ready: Promise.resolve(registration),
    } as unknown as ServiceWorkerContainer
    const client = createOfflineWorkerRequestClient({
      serviceWorker,
      responseTimeoutMs: 20,
    })
    let settled = false
    const request = client.request({ type: 'NEW_PROTOCOL' }, () => true)
    void request.then(
      () => {
        settled = true
      },
      () => {
        settled = true
      }
    )

    await vi.advanceTimersByTimeAsync(0)
    expect(controller.postMessage).toHaveBeenCalledTimes(1)
    expect(serviceWorker.getRegistration).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(19)
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await expect(request).rejects.toThrow(
      'The offline worker is not ready'
    )
    expect(settled).toBe(true)
    client.destroy()
  } finally {
    vi.useRealTimers()
  }
})

test('extends the response deadline whenever the worker reports progress', async () => {
  vi.useFakeTimers()
  try {
    let clientPort: MessagePort | null = null
    const workerPort = {
      postMessage(data: unknown) {
        queueMicrotask(() => clientPort?.onmessage?.({ data } as MessageEvent))
      },
    }
    const createMessageChannel = () => {
      clientPort = {
        onmessage: null,
        onmessageerror: null,
        close: vi.fn(),
        start: vi.fn(),
      } as unknown as MessagePort
      return {
        port1: clientPort,
        port2: workerPort,
      } as unknown as MessageChannel
    }
    const controller = {
      postMessage(_message: unknown, transfer: Transferable[]) {
        const port = transfer[0] as unknown as typeof workerPort
        port.postMessage({ done: false })
        setTimeout(() => port.postMessage({ done: true }), 50)
      },
    }
    const registration = { active: controller, waiting: null }
    const serviceWorker = {
      controller,
      getRegistration: vi.fn(async () => registration),
      ready: Promise.resolve(registration),
    } as unknown as ServiceWorkerContainer
    const client = createOfflineWorkerRequestClient({
      serviceWorker,
      createMessageChannel,
      responseTimeoutMs: 100,
    })
    const request = client.request(
      { type: 'CURRENT_PROTOCOL' },
      (value) => (value as { done: boolean }).done
    )

    await vi.advanceTimersByTimeAsync(50)
    await expect(request).resolves.toBe('complete')
    expect(serviceWorker.getRegistration).not.toHaveBeenCalled()
    client.destroy()
  } finally {
    vi.useRealTimers()
  }
})

test('uses an active worker when the page has no controller and ignores waiting', async () => {
  const calls: string[] = []
  const active = respondingWorker('active', calls)
  const waiting = respondingWorker('waiting', calls)
  const registration = { active, waiting }
  const serviceWorker = {
    controller: null,
    getRegistration: vi.fn(async () => registration),
    ready: Promise.resolve(registration),
  } as unknown as ServiceWorkerContainer
  const client = createOfflineWorkerRequestClient({ serviceWorker })

  await client.request({ type: 'TEST' }, () => true)
  expect(calls).toEqual(['active'])
  client.destroy()
})

test('times out worker acquisition when ready never resolves', async () => {
  const serviceWorker = {
    controller: null,
    getRegistration: vi.fn(async () => ({ active: null, waiting: {} })),
    ready: new Promise<ServiceWorkerRegistration>(() => {}),
  } as unknown as ServiceWorkerContainer
  const client = createOfflineWorkerRequestClient({
    serviceWorker,
    acquisitionTimeoutMs: 10,
    responseTimeoutMs: 60_000,
  })

  await expect(client.request({ type: 'TEST' }, () => true)).rejects.toThrow(
    'not ready'
  )
  client.destroy()
})

test('destroy rejects a request before worker acquisition completes', async () => {
  const serviceWorker = {
    controller: null,
    getRegistration: vi.fn(async () => ({ active: null })),
    ready: new Promise<ServiceWorkerRegistration>(() => {}),
  } as unknown as ServiceWorkerContainer
  const client = createOfflineWorkerRequestClient({
    serviceWorker,
    responseTimeoutMs: 60_000,
  })
  const request = client.request({ type: 'TEST' }, () => true)
  await vi.waitFor(() => expect(serviceWorker.getRegistration).toHaveBeenCalled())

  client.destroy()

  await expect(request).rejects.toThrow('cancelled')
})

test('does not dispatch an already cancelled request', async () => {
  const postMessage = vi.fn()
  const client = createOfflineWorkerRequestClient({ serviceWorker: serviceWorkerFor({ postMessage }) })
  const controller = new AbortController()
  controller.abort()
  await expect(client.request({ type: 'DOWNLOAD_RECORDING' }, () => true, {
    signal: controller.signal,
  })).rejects.toMatchObject({ name: 'AbortError' })
  expect(postMessage).not.toHaveBeenCalled()
  client.destroy()
})

test('sends cancellation over the existing port and waits for worker acknowledgement', async () => {
  const messages: unknown[] = []
  let acknowledge: (() => void) | undefined
  const postMessage = vi.fn((_message: unknown, transfer: Transferable[]) => {
    const port = transfer[0] as MessagePort
    port.onmessage = (event) => {
      messages.push(event.data)
      acknowledge = () => { port.postMessage({ cancelled: true }); port.close() }
    }
    port.start()
  })
  const client = createOfflineWorkerRequestClient({ serviceWorker: serviceWorkerFor({ postMessage }) })
  const controller = new AbortController()
  let settled = false
  const request = client.request({ type: 'DOWNLOAD_RECORDING' }, () => true, {
    signal: controller.signal, cancelMessage: { type: 'CANCEL_RECORDING_DOWNLOAD' },
  }).then((result) => { settled = true; return result })
  await vi.waitFor(() => expect(postMessage).toHaveBeenCalledOnce())
  controller.abort()
  await vi.waitFor(() => expect(messages).toEqual([{ type: 'CANCEL_RECORDING_DOWNLOAD' }]))
  expect(settled).toBe(false)
  acknowledge!()
  await expect(request).resolves.toBe('complete')
  client.destroy()
})
