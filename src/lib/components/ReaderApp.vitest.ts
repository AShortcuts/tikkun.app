import { mount, unmount } from 'svelte'
import { afterEach, expect, test, vi } from 'vitest'
import ReaderApp from './ReaderApp.svelte'

let component: ReturnType<typeof mount> | null = null
let target: HTMLElement | null = null

afterEach(async () => {
  if (component) await unmount(component)
  component = null
  target?.remove()
  target = null
  vi.restoreAllMocks()
})

test('shows recovery links and retries a rejected Reader import', async () => {
  const failure = new Error('chunk unavailable')
  const startApp = vi.fn()
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

function mountReader(loadApp: () => Promise<{
  startApp(): unknown
  stopApp(): void
}>) {
  target = document.createElement('div')
  document.body.appendChild(target)
  component = mount(ReaderApp, {
    target,
    props: {
      aboutHref: '/about/',
      loadApp,
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
