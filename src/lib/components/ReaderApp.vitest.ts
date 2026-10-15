import { mount, unmount } from 'svelte'
import { afterEach, expect, test, vi } from 'vitest'
import { commands, page } from 'vitest/browser'
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
  await vi.waitFor(() => expect(
    target?.querySelector('[data-target-id="reader-boot-state"]')
  ).toBeNull())

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
    'Opening your reading'
  )

  ready.resolve()
  await eventually(() => root.dataset.readerBootState === 'ready' ? root : null)
  expect(root.getAttribute('aria-busy')).toBe('false')
  expect(required('.reader-loading-doors').classList.contains('open')).toBe(true)
  await vi.waitFor(() => expect(root.querySelector('[data-target-id="reader-boot-state"]')).toBeNull())
})

test('starts with the rendered document and advances as real startup work completes', async () => {
  const imported = deferred()
  const ready = deferred()
  let report: ReaderAppOptions['onStartupProgress']
  const startApp = vi.fn((options?: ReaderAppOptions) => {
    report = options?.onStartupProgress
    return { ready: ready.promise }
  })
  mountReader(async () => {
    await imported.promise
    return { startApp, stopApp: vi.fn() }
  }, undefined, undefined, 'fill')
  const root = await eventually(() => target?.querySelector<HTMLElement>('[data-reader-boot-progress]'))
  expect(root.getAttribute('data-reader-boot-progress')).toBe('0.2')
  expect(getComputedStyle(required('.reader-loading-entry')).animationName).not.toBe('none')
  await new Promise(resolve => setTimeout(resolve, 250))
  expect(root.getAttribute('data-reader-boot-progress')).toBe('0.2')
  expect(getComputedStyle(required('.reader-loading-fill')).clipPath).toBe('inset(0px 0px 80%)')

  imported.resolve()
  await eventually(() => startApp.mock.calls.length ? root : null)
  await vi.waitFor(() => expect(root.getAttribute('data-reader-boot-progress')).toBe('0.4'))
  report?.('text')
  report?.('text')
  await vi.waitFor(() => expect(Number(root.getAttribute('data-reader-boot-progress'))).toBeCloseTo(0.6))
  const fill = required<SVGElement>('.reader-loading-fill')
  await vi.waitFor(() => expect(getComputedStyle(fill).clipPath).toBe('inset(0px 0px 40%)'))
  await new Promise(resolve => setTimeout(resolve, 250))
  expect(Number(root.getAttribute('data-reader-boot-progress'))).toBeCloseTo(0.6)
  expect(root.getAttribute('data-reader-boot-state')).toBe('loading')

  report?.('rendered')
  await vi.waitFor(() => expect(root.getAttribute('data-reader-boot-progress')).toBe('0.8'))
  expect(root.getAttribute('data-reader-boot-state')).toBe('loading')
  report?.('positioned')
  await vi.waitFor(() => expect(root.getAttribute('data-reader-boot-progress')).toBe('1'))
  expect(root.getAttribute('data-reader-boot-state')).toBe('loading')
  expect(getComputedStyle(fill).clipPath).toBe('inset(0px 0px 0%)')
  expect(getComputedStyle(fill).transitionDuration).toBe('0s')
  ready.resolve()
  await vi.waitFor(() => expect(root.getAttribute('data-reader-boot-state')).toBe('ready'))
  expect(root.getAttribute('data-reader-boot-progress')).toBe('1')
  expect(root.querySelector('.reader-loading-mark')).toBeNull()
  report?.('text')
  expect(root.getAttribute('data-reader-boot-progress')).toBe('1')
})

test('blends rapid startup updates into forward motion without resetting the entry animation', async () => {
  const imported = deferred()
  const ready = deferred()
  let report: ReaderAppOptions['onStartupProgress']
  const startApp = vi.fn((options?: ReaderAppOptions) => {
    report = options?.onStartupProgress
    return { ready: ready.promise }
  })
  mountReader(async () => {
    await imported.promise
    return { startApp, stopApp: vi.fn() }
  }, undefined, undefined, 'fill')
  await eventually(() => target?.querySelector('.reader-loading-entry'))
  const entry = required('.reader-loading-entry')
  const fill = required('.reader-loading-fill')
  const entryAnimation = entry.getAnimations()[0]
  expect(entryAnimation).toBeDefined()
  const fillProgress = () => {
    const inset = getComputedStyle(fill).clipPath.match(/inset\(0px 0px ([\d.]+)%\)/)
    if (!inset) throw new Error(`Unexpected fill mask: ${getComputedStyle(fill).clipPath}`)
    return 1 - Number(inset[1]) / 100
  }
  // Establish the initial style before exercising updates in consecutive frames.
  fillProgress()
  imported.resolve()
  await eventually(() => startApp.mock.calls.length ? target : null)
  report?.('text')
  await new Promise(requestAnimationFrame)
  const samples = [fillProgress()]
  report?.('rendered')
  for (let frame = 0; frame < 6; frame += 1) {
    await new Promise(requestAnimationFrame)
    samples.push(fillProgress())
  }

  expect(entryAnimation.playState).not.toBe('idle')
  expect(samples.every((value, index) => index === 0 || value >= samples[index - 1] - 0.001)).toBe(true)
  expect(new Set(samples.filter(value => value > 0.2 && value < 0.79).map(value => value.toFixed(3))).size).toBeGreaterThanOrEqual(3)
  report?.('positioned')
  await vi.waitFor(() => expect(fillProgress()).toBe(1))
  expect(getComputedStyle(entry).animationName).toBe('none')
  ready.resolve()
  await vi.waitFor(() => expect(target?.querySelector('.reader-loading-mark')).toBeNull())
})

test.each([[390, 844], [1280, 720]])('opens diagonal doors only after readiness and covers the %i x %i viewport', async (width, height) => {
  const originalSize = { width: window.innerWidth, height: window.innerHeight }
  const html = document.documentElement
  const previousMotion = html.dataset.readerReducedMotion
  try {
    html.dataset.readerReducedMotion = 'off'
    await page.viewport(width, height)
    const ready = deferred()
    let report: ReaderAppOptions['onStartupProgress']
    const startApp = vi.fn((options?: ReaderAppOptions) => {
      report = options?.onStartupProgress
      return { ready: ready.promise }
    })
    mountReader(async () => ({ startApp, stopApp: vi.fn() }))
    await eventually(() => startApp.mock.calls.length ? target : null)
    const root = required('[data-target-id="app-root"]')
    const doors = required<HTMLElement>('.reader-loading-doors')
    expect(target?.querySelector('.reader-loading-mark')).toBeNull()
    expect(doors.getBoundingClientRect().width).toBe(width)
    expect(doors.getBoundingClientRect().height).toBe(height)
    for (const [x, y] of [[1, 1], [width - 1, 1], [1, height - 1], [width - 1, height - 1]]) {
      expect(document.elementFromPoint(x, y)?.closest('.reader-loading-doors')).toBe(doors)
    }

    report?.('text')
    report?.('rendered')
    report?.('positioned')
    await vi.waitFor(() => expect(root.getAttribute('data-reader-boot-progress')).toBe('1'))
    expect(doors.classList.contains('open')).toBe(false)
    ready.resolve()
    await eventually(() => root.getAttribute('data-reader-boot-state') === 'ready' ? root : null)
    expect(root.getAttribute('aria-busy')).toBe('false')
    expect(doors.getAttribute('aria-hidden')).toBe('true')
    expect(getComputedStyle(doors).pointerEvents).toBe('none')

    const upper = required('.reader-door.northeast')
    const lower = required('.reader-door.southwest')
    const animations = [...upper.getAnimations(), ...lower.getAnimations()]
    expect(animations).toHaveLength(2)
    for (const animation of animations) {
      animation.pause()
      animation.currentTime = 340
    }
    await new Promise(requestAnimationFrame)
    const northeast = new DOMMatrixReadOnly(getComputedStyle(upper).transform)
    const southwest = new DOMMatrixReadOnly(getComputedStyle(lower).transform)
    expect(northeast.m41).toBeGreaterThan(0)
    expect(northeast.m42).toBeCloseTo(-northeast.m41)
    expect(southwest.m41).toBeCloseTo(-northeast.m41)
    expect(southwest.m42).toBeCloseTo(northeast.m41)
    expect(northeast.m11).toBe(1)
    expect(northeast.m22).toBe(1)
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width)
    for (const animation of animations) animation.finish()
    await vi.waitFor(() => expect(target?.querySelector('.reader-loading-doors')).toBeNull())
  } finally {
    if (previousMotion === undefined) delete html.dataset.readerReducedMotion
    else html.dataset.readerReducedMotion = previousMotion
    await page.viewport(originalSize.width, originalSize.height)
  }
})

test.each(['explicit', 'system', 'changed-during-reveal'] as const)('skips or cancels the doors for %s reduced motion', async (mode) => {
  const html = document.documentElement
  const previousMotion = html.dataset.readerReducedMotion
  try {
    html.dataset.readerReducedMotion = mode === 'explicit' ? 'on' : 'automatic'
    await commands.emulateAccessibilityMedia({ reducedMotion: mode === 'system' ? 'reduce' : 'no-preference' })
    const ready = deferred()
    mountReader(async () => ({ startApp: () => ({ ready: ready.promise }), stopApp: vi.fn() }))
    await eventually(() => target?.querySelector('.reader-loading-doors'))
    const upper = required('.reader-door.northeast')
    ready.resolve()
    if (mode === 'changed-during-reveal') {
      await vi.waitFor(() => expect(upper.getAnimations()).toHaveLength(1))
      html.dataset.readerReducedMotion = 'on'
      expect(getComputedStyle(upper).animationName).toBe('none')
    }
    await vi.waitFor(() => expect(target?.querySelector('.reader-loading-doors')).toBeNull())
    expect(required('[data-target-id="app-root"]').getAttribute('data-reader-boot-state')).toBe('ready')
  } finally {
    if (previousMotion === undefined) delete html.dataset.readerReducedMotion
    else html.dataset.readerReducedMotion = previousMotion
    await commands.emulateAccessibilityMedia({ reducedMotion: null })
  }
})

test('unmounting during the door reveal cancels presentation work', async () => {
  const ready = deferred()
  const stopApp = vi.fn()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mountReader(async () => ({ startApp: () => ({ ready: ready.promise }), stopApp }))
  const doors = await eventually(() => target?.querySelector('.reader-loading-doors'))
  ready.resolve()
  await eventually(() => doors.classList.contains('open') ? doors : null)
  await unmount(component!)
  component = null
  await new Promise(requestAnimationFrame)
  expect(stopApp).toHaveBeenCalledOnce()
  expect(target?.querySelector('.reader-loading-doors')).toBeNull()
  expect(console.error).not.toHaveBeenCalled()
})

test('a failed startup never fills to completion or accepts late progress', async () => {
  const ready = deferred()
  let report: ReaderAppOptions['onStartupProgress']
  const startApp = vi.fn((options?: ReaderAppOptions) => {
    report = options?.onStartupProgress
    return { ready: ready.promise }
  })
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mountReader(async () => ({ startApp, stopApp: vi.fn() }))
  await eventually(() => startApp.mock.calls.length ? target : null)
  ready.reject(new Error('text failed'))
  const failed = await eventually(() => target?.querySelector('[data-reader-boot-state="failed"]'))
  expect(target?.querySelector('.reader-loading-doors')).toBeNull()
  expect(failed.getAttribute('data-reader-boot-progress')).toBe('0.4')
  report?.('text')
  report?.('rendered')
  report?.('positioned')
  await Promise.resolve()
  expect(failed.getAttribute('data-reader-boot-progress')).toBe('0.4')
})

test('uses static progress steps for system and explicit reduced motion', async () => {
  const html = document.documentElement
  const previousMotion = html.dataset.readerReducedMotion
  try {
    const ready = deferred()
    mountReader(async () => ({ startApp: () => ({ ready: ready.promise }), stopApp: vi.fn() }), undefined, undefined, 'fill')
    await eventually(() => target?.querySelector('.reader-loading-fill'))
    const fill = required('.reader-loading-fill')
    const entry = required('.reader-loading-entry')
    html.dataset.readerReducedMotion = 'on'
    expect(getComputedStyle(fill).transitionDuration).toBe('0s')
    expect(getComputedStyle(fill).animationName).toBe('none')
    expect(getComputedStyle(entry).animationName).toBe('none')
    html.dataset.readerReducedMotion = 'automatic'
    await commands.emulateAccessibilityMedia({ reducedMotion: 'reduce' })
    expect(getComputedStyle(fill).transitionDuration).toBe('0s')
    expect(getComputedStyle(entry).animationName).toBe('none')
    html.dataset.readerReducedMotion = 'off'
    expect(getComputedStyle(fill).transitionProperty).toBe('clip-path')
    expect(parseFloat(getComputedStyle(fill).transitionDuration)).toBe(0.18)
    ready.resolve()
  } finally {
    if (previousMotion === undefined) delete html.dataset.readerReducedMotion
    else html.dataset.readerReducedMotion = previousMotion
    await commands.emulateAccessibilityMedia({ reducedMotion: null })
  }
})

test('keeps browser chrome in the saved theme during startup and custom color edits', async () => {
  const root = document.documentElement
  const previousStyle = root.getAttribute('style')
  const previousTheme = root.dataset.readerTheme
  try {
    root.dataset.readerTheme = 'custom'
    root.style.setProperty('--reader-custom-background-color', '#112233')
    const ready = deferred()
    mountReader(async () => ({ startApp: () => ({ ready: ready.promise }), stopApp: vi.fn() }))
    await vi.waitFor(() => expect(document.querySelector<HTMLMetaElement>('#reader-theme-color')?.content).toBe('#112233'))
    expect(required('[data-target-id="app-root"]').dataset.readerBootState).toBe('loading')

    root.style.setProperty('--reader-custom-background-color', '#223344')
    await vi.waitFor(() => expect(document.querySelector<HTMLMetaElement>('#reader-theme-color')?.content).toBe('#223344'))
    ready.resolve()
  } finally {
    if (component) await unmount(component)
    component = null
    if (previousStyle === null) root.removeAttribute('style')
    else root.setAttribute('style', previousStyle)
    if (previousTheme === undefined) delete root.dataset.readerTheme
    else root.dataset.readerTheme = previousTheme
  }
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
