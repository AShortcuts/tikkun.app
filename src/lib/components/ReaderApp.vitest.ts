import { mount, unmount } from 'svelte'
import { afterEach, expect, test, vi } from 'vitest'
import ReaderApp from './ReaderApp.svelte'
import { NATIVE_READING_LINKS_CONTEXT } from '../../../app/platform/native-reading-links.ts'

let component: ReturnType<typeof mount> | null = null
let target: HTMLElement | null = null

afterEach(async () => {
  if (component) await unmount(component)
  component = null
  target?.remove()
  target = null
  vi.restoreAllMocks()
})

test('waits for native launch resolution before importing or starting Reader', async () => {
  const linksReady = deferred()
  const startApp = vi.fn(() => ({ ready: Promise.resolve() }))
  const loadApp = vi.fn(async () => ({ startApp, stopApp: vi.fn() }))
  mountReader(loadApp, undefined, linksReady.promise)
  await eventually(() => required('[data-target-id="reader-boot-state"]'))
  expect(loadApp).not.toHaveBeenCalled()
  linksReady.resolve()
  await eventually(() => startApp.mock.calls.length ? target : null)
  expect(loadApp).toHaveBeenCalledOnce()
})

test('unmounting during native launch resolution does not start a stale Reader', async () => {
  const linksReady = deferred()
  const loadApp = vi.fn(async () => ({ startApp: () => ({ ready: Promise.resolve() }), stopApp: vi.fn() }))
  mountReader(loadApp, undefined, linksReady.promise)
  await eventually(() => required('[data-target-id="reader-boot-state"]'))
  await unmount(component!)
  component = null
  linksReady.resolve()
  await Promise.resolve()
  expect(loadApp).not.toHaveBeenCalled()
})

test('shows recovery links and retries a rejected Reader import', async () => {
  const failure = new Error('chunk unavailable')
  const startApp = vi.fn(() => ({ ready: Promise.resolve() }))
  const stopApp = vi.fn()
  const loadApp = vi
    .fn()
    .mockRejectedValueOnce(failure)
    .mockResolvedValueOnce({ startApp, stopApp })
  vi.spyOn(console, 'error').mockImplementation(() => {})

  mountReader(loadApp)
  await eventually(() =>
    target?.querySelector('[data-reader-boot-state="failed"]')
  )

  const root = required<HTMLElement>('[data-target-id="app-root"]')
  const failureState = required<HTMLElement>(
    '[data-target-id="reader-boot-state"]'
  )
  expect(root.getAttribute('aria-busy')).toBe('false')
  expect(failureState.getAttribute('role')).toBe('alert')
  expect(failureState.textContent).toContain('Reader couldn’t start')
  expect(required<HTMLAnchorElement>('a[href="/readings/"]').textContent).toBe(
    'Reading index'
  )
  expect(required<HTMLAnchorElement>('a[href="/about/"]').textContent).toBe(
    'About'
  )
  expect(console.error).toHaveBeenCalledWith(
    'Failed to start the Reader',
    failure
  )

  required<HTMLButtonElement>('.reader-boot-actions button').click()
  await eventually(() =>
    root.dataset.readerBootState === 'ready' ? root : null
  )

  expect(loadApp).toHaveBeenCalledTimes(2)
  expect(startApp).toHaveBeenCalledOnce()
  expect(
    target?.querySelector('[data-target-id="reader-boot-state"]')
  ).toBeNull()

  await unmount(component!)
  component = null
  expect(stopApp).toHaveBeenCalledOnce()
})

test('cleans up a partially started Reader and exposes retry after start throws', async () => {
  const failure = new Error('runtime failed')
  const stopApp = vi.fn()
  const loadApp = vi.fn(async () => ({
    startApp: () => {
      throw failure
    },
    stopApp,
  }))
  vi.spyOn(console, 'error').mockImplementation(() => {})

  mountReader(loadApp)
  await eventually(() =>
    target?.querySelector('[data-reader-boot-state="failed"]')
  )

  expect(stopApp).toHaveBeenCalledOnce()
  expect(required('[data-target-id="reader-boot-state"]').textContent).toContain(
    'Try again'
  )
  expect(console.error).toHaveBeenCalledWith(
    'Failed to start the Reader',
    failure
  )
})

test('keeps loading until the requested reading is positioned', async () => {
  const ready = deferred()
  const startApp = vi.fn(() => ({ ready: ready.promise }))
  mountReader(async () => ({ startApp, stopApp: vi.fn() }))
  await eventually(() => startApp.mock.calls.length ? target : null)

  const root = required<HTMLElement>('[data-target-id="app-root"]')
  expect(root.dataset.readerBootState).toBe('loading')
  expect(root.getAttribute('aria-busy')).toBe('true')
  expect(required('[data-target-id="reader-boot-state"]').textContent).toContain(
    'Opening Reader'
  )

  ready.resolve()
  await eventually(() => root.dataset.readerBootState === 'ready' ? root : null)
  expect(root.getAttribute('aria-busy')).toBe('false')
  expect(root.querySelector('[data-target-id="reader-boot-state"]')).toBeNull()
})

test('reloads on retry after initial positioning fails, clearing failed text imports', async () => {
  const ready = deferred()
  const failure = new Error('target page unavailable')
  const startApp = vi.fn(() => ({ ready: ready.promise }))
  const stopApp = vi.fn()
  const loadApp = vi.fn(async () => ({ startApp, stopApp }))
  const reloadPage = vi.fn()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mountReader(loadApp, reloadPage)
  await eventually(() => startApp.mock.calls.length ? target : null)

  ready.reject(failure)
  await eventually(() => target?.querySelector('[data-reader-boot-state="failed"]'))
  expect(stopApp).toHaveBeenCalledOnce()
  expect(console.error).toHaveBeenCalledWith('Failed to start the Reader', failure)

  required<HTMLButtonElement>('.reader-boot-actions button').click()
  expect(reloadPage).toHaveBeenCalledOnce()
  expect(startApp).toHaveBeenCalledOnce()
  expect(stopApp).toHaveBeenCalledOnce()
})

test.each(['resolve', 'reject'] as const)(
  'stops a loading Reader on unmount without reacting to its later %s',
  async (settlement) => {
    const ready = deferred()
    const startApp = vi.fn(() => ({ ready: ready.promise }))
    const stopApp = vi.fn()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mountReader(async () => ({ startApp, stopApp }))
    await eventually(() => startApp.mock.calls.length ? target : null)

    await unmount(component!)
    component = null
    expect(stopApp).toHaveBeenCalledOnce()
    if (settlement === 'resolve') ready.resolve()
    else ready.reject(new Error('late load failure'))
    await Promise.resolve()
    await Promise.resolve()
    expect(stopApp).toHaveBeenCalledOnce()
    expect(console.error).not.toHaveBeenCalled()
  }
)

function deferred() {
  let resolve!: () => void
  let reject!: (error: unknown) => void
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function mountReader(loadApp: () => Promise<{
  startApp(): { readonly ready: Promise<void> }
  stopApp(): void
}>, reloadPage?: () => void, linksReady?: Promise<void>) {
  target = document.createElement('div')
  document.body.appendChild(target)
  component = mount(ReaderApp, {
    target,
    context: linksReady ? new Map([[NATIVE_READING_LINKS_CONTEXT, { ready: linksReady }]]) : undefined,
    props: {
      aboutHref: '/about/',
      loadApp,
      reloadPage,
    },
  })
}

async function eventually(read: () => Element | null | undefined) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const value = read()
    if (value) return value
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  throw new Error('Timed out waiting for Reader boot state')
}

function required<T extends Element = HTMLElement>(selector: string): T {
  const element = target?.querySelector<T>(selector)
  if (!element) throw new Error(`Missing test element: ${selector}`)
  return element
}
