import { flushSync, mount, unmount } from 'svelte'
import { afterEach, expect, test, vi } from 'vitest'
import ServiceWorkerUpdate from './ServiceWorkerUpdate.svelte'

let component: ReturnType<typeof mount> | null = null
let target: HTMLElement | null = null
let serviceWorkerDescriptor: PropertyDescriptor | undefined

afterEach(async () => {
  if (component) await unmount(component)
  component = null
  target?.remove()
  target = null
  vi.restoreAllMocks()
  vi.useRealTimers()

  if (serviceWorkerDescriptor) {
    Object.defineProperty(
      navigator,
      'serviceWorker',
      serviceWorkerDescriptor
    )
  } else {
    Reflect.deleteProperty(navigator, 'serviceWorker')
  }
  serviceWorkerDescriptor = undefined
})

test('announces and locks the applying state after requesting an update', async () => {
  const waitingWorker = Object.assign(new EventTarget(), {
    postMessage: vi.fn(),
    state: 'installed' as ServiceWorkerState,
  }) as unknown as ServiceWorker
  const registration = Object.assign(new EventTarget(), {
    waiting: waitingWorker,
    installing: null,
    update: vi.fn(async () => {}),
  }) as unknown as ServiceWorkerRegistration
  const serviceWorker = Object.assign(new EventTarget(), {
    controller: {} as ServiceWorker,
    getRegistrations: vi.fn(async () => [registration]),
    register: vi.fn(async () => registration),
  }) as unknown as ServiceWorkerContainer

  serviceWorkerDescriptor = Object.getOwnPropertyDescriptor(
    Navigator.prototype,
    'serviceWorker'
  )
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: serviceWorker,
  })
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(null, {
      status: 200,
      headers: { 'content-type': 'text/javascript' },
    })
  )

  target = document.createElement('div')
  document.body.appendChild(target)
  component = mount(ServiceWorkerUpdate, { target })
  await eventually(() => target?.querySelector('.service-worker-update'))

  const status = required<HTMLElement>('.service-worker-update')
  const reload = required<HTMLButtonElement>('.service-worker-update-action')
  expect(status.getAttribute('aria-busy')).toBe('false')
  expect(reload.textContent).toBe('Reload')

  reload.click()
  flushSync()

  expect(waitingWorker.postMessage).toHaveBeenCalledWith({
    type: 'SKIP_WAITING',
  })
  expect(status.getAttribute('aria-busy')).toBe('true')
  expect(status.textContent).toContain('Applying update…')
  expect(reload.textContent).toBe('Reloading…')
  expect(reload.disabled).toBe(true)
  expect(
    required<HTMLButtonElement>('[aria-label="Dismiss update"]').disabled
  ).toBe(true)
})

test('recovers controls when activation never changes the controller', async () => {
  const waitingWorker = Object.assign(new EventTarget(), {
    postMessage: vi.fn(),
    state: 'installed' as ServiceWorkerState,
  }) as unknown as ServiceWorker
  const registration = Object.assign(new EventTarget(), {
    waiting: waitingWorker,
    installing: null,
    update: vi.fn(async () => {}),
  }) as unknown as ServiceWorkerRegistration
  const serviceWorker = Object.assign(new EventTarget(), {
    controller: {} as ServiceWorker,
    getRegistrations: vi.fn(async () => [registration]),
    register: vi.fn(async () => registration),
  }) as unknown as ServiceWorkerContainer

  serviceWorkerDescriptor = Object.getOwnPropertyDescriptor(
    Navigator.prototype,
    'serviceWorker'
  )
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: serviceWorker,
  })
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(null, {
      status: 200,
      headers: { 'content-type': 'text/javascript' },
    })
  )

  target = document.createElement('div')
  document.body.appendChild(target)
  component = mount(ServiceWorkerUpdate, { target })
  await eventually(() => target?.querySelector('.service-worker-update'))

  const reload = required<HTMLButtonElement>('.service-worker-update-action')
  vi.useFakeTimers()
  reload.click()
  await vi.advanceTimersByTimeAsync(10_000)
  flushSync()

  const status = required<HTMLElement>('.service-worker-update')
  expect(status.getAttribute('role')).toBe('alert')
  expect(status.getAttribute('aria-busy')).toBe('false')
  expect(status.textContent).toContain('Update did not finish')
  expect(reload.textContent).toBe('Reload page')
  expect(reload.disabled).toBe(false)
  expect(
    required<HTMLButtonElement>('[aria-label="Dismiss update"]').disabled
  ).toBe(false)
})

test('removes obsolete local workers and app-shell caches without deleting Torah data', async () => {
  const unregisterFirst = vi.fn(async () => true)
  const unregisterSecond = vi.fn(async () => true)
  const serviceWorker = Object.assign(new EventTarget(), {
    controller: null,
    getRegistrations: vi.fn(async () => [
      { unregister: unregisterFirst },
      { unregister: unregisterSecond },
    ]),
    register: vi.fn(),
  }) as unknown as ServiceWorkerContainer
  const cacheKeys = vi.fn(async () => [
    'tikkun-shell-old-build',
    'tikkun-torah',
    'unrelated-cache',
  ])
  const deleteCache = vi.fn(async () => true)
  const originalCaches = Object.getOwnPropertyDescriptor(window, 'caches')

  serviceWorkerDescriptor = Object.getOwnPropertyDescriptor(
    Navigator.prototype,
    'serviceWorker'
  )
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: serviceWorker,
  })
  Object.defineProperty(window, 'caches', {
    configurable: true,
    value: { keys: cacheKeys, delete: deleteCache },
  })
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(null, { status: 404, headers: { 'content-type': 'text/html' } })
  )

  try {
    target = document.createElement('div')
    document.body.appendChild(target)
    component = mount(ServiceWorkerUpdate, { target })

    await vi.waitFor(() => expect(unregisterSecond).toHaveBeenCalledOnce())

    expect(unregisterFirst).toHaveBeenCalledOnce()
    expect(cacheKeys).toHaveBeenCalledOnce()
    expect(deleteCache).toHaveBeenCalledOnce()
    expect(deleteCache).toHaveBeenCalledWith('tikkun-shell-old-build')
    expect(deleteCache).not.toHaveBeenCalledWith('tikkun-torah')
    expect(deleteCache).not.toHaveBeenCalledWith('unrelated-cache')
    expect(serviceWorker.register).not.toHaveBeenCalled()
  } finally {
    if (originalCaches) {
      Object.defineProperty(window, 'caches', originalCaches)
    } else {
      Reflect.deleteProperty(window, 'caches')
    }
  }
})

test('treats worker preparation cancellation during navigation as expected cleanup', async () => {
  const serviceWorker = Object.assign(new EventTarget(), {
    controller: null,
    getRegistrations: vi.fn(async () => []),
    register: vi.fn(),
  }) as unknown as ServiceWorkerContainer
  serviceWorkerDescriptor = Object.getOwnPropertyDescriptor(
    Navigator.prototype,
    'serviceWorker'
  )
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: serviceWorker,
  })

  let requestSignal: AbortSignal | null = null
  vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => {
    requestSignal = init?.signal ?? null
    return new Promise((_resolve, reject) => {
      requestSignal?.addEventListener(
        'abort',
        () => reject(new DOMException('Navigation cancelled', 'AbortError')),
        { once: true }
      )
    })
  })
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

  target = document.createElement('div')
  document.body.appendChild(target)
  component = mount(ServiceWorkerUpdate, { target })
  await vi.waitFor(() => expect(requestSignal).not.toBeNull())

  await unmount(component)
  component = null
  await vi.waitFor(() => expect(requestSignal?.aborted).toBe(true))

  expect(consoleError).not.toHaveBeenCalled()
  expect(serviceWorker.register).not.toHaveBeenCalled()
})

async function eventually(read: () => Element | null | undefined) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const value = read()
    if (value) return value
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  throw new Error('Timed out waiting for mounted update prompt')
}

function required<T extends Element>(selector: string): T {
  const element = target?.querySelector<T>(selector)
  if (!element) throw new Error(`Missing test element: ${selector}`)
  return element
}
