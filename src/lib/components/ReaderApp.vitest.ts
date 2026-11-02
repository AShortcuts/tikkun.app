import { mount, unmount } from 'svelte'
import { afterEach, expect, test, vi } from 'vitest'
import ReaderApp from './ReaderApp.svelte'
import type { ReaderLoadingAnimation } from './reader-loading.ts'
import type { ReaderAppOptions } from '../../../app/index.ts'
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
  // The reveal finishes the fill and holds it before opening, so it outlasts the default wait.
  await vi.waitFor(() => expect(
    target?.querySelector('[data-target-id="reader-boot-state"]')
  ).toBeNull(), { timeout: 3000 })

  await unmount(component!)
  component = null
  expect(stopApp).toHaveBeenCalledOnce()
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
    'Opening your reading'
  )

  ready.resolve()
  await eventually(() => root.dataset.readerBootState === 'ready' ? root : null)
  expect(root.getAttribute('aria-busy')).toBe('false')
  expect(required('.reader-loading-doors').classList.contains('open')).toBe(true)
  await vi.waitFor(() => expect(root.querySelector('[data-target-id="reader-boot-state"]')).toBeNull(), { timeout: 3000 })
})

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
  startApp(options?: ReaderAppOptions): { readonly ready: Promise<void> }
  stopApp(): void
}>, reloadPage?: () => void, linksReady?: Promise<void>, loadingAnimation?: ReaderLoadingAnimation) {
  target = document.createElement('div')
  document.body.appendChild(target)
  component = mount(ReaderApp, {
    target,
    context: linksReady ? new Map([[NATIVE_READING_LINKS_CONTEXT, { ready: linksReady }]]) : undefined,
    props: {
      aboutHref: '/about/',
      loadApp,
      reloadPage,
      loadingAnimation,
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
