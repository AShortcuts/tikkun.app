import { afterEach, expect, test, vi } from 'vitest'
import { commands } from 'vitest/browser'
import { createMount } from '../lifecycle/mount.ts'
import { mountReaderSwipeBack, type ReaderSwipeDestination } from './reader-swipe-back.ts'

let destroy: (() => void) | undefined
afterEach(async () => {
  destroy?.()
  destroy = undefined
  vi.restoreAllMocks()
  await commands.emulateAccessibilityMedia({ reducedMotion: null })
  delete document.documentElement.dataset.readerReducedMotion
  document.body.innerHTML = ''
})

function fixture(prepareOverride?: () => Promise<ReaderSwipeDestination | null>) {
  document.body.innerHTML = '<main style="width:390px"><div class="surface"><span>Reading</span><button>Play</button></div></main>'
  const container = document.querySelector('main')!
  const surface = container.querySelector<HTMLElement>('.surface')!
  const destination = { element: document.createElement('div'), commit: vi.fn(), cancel: vi.fn() }
  const prepare = vi.fn(prepareOverride ?? (async () => destination))
  let now = 0
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  vi.spyOn(surface, 'setPointerCapture').mockImplementation(() => {})
  const enabled = vi.fn(() => true)
  destroy = createMount()(scope => mountReaderSwipeBack(scope, { surface, container, enabled, prepare }))
  const pointer = (type: string, x: number, y = 100, elapsed = 100, target: Element = surface, id = 1) => {
    now += elapsed
    target.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId: id, pointerType: 'touch', isPrimary: id === 1,
      clientX: x, clientY: y,
    }))
  }
  return { surface, container, destination, prepare, pointer, enabled }
}

test('drag follows the finger, commits contents, and consumes the release click', async () => {
  const { surface, container, destination, pointer } = fixture()
  pointer('pointerdown', 30)
  pointer('pointermove', 190)
  await Promise.resolve()
  surface.querySelector('span')!.dispatchEvent(new PointerEvent('lostpointercapture', { bubbles: true, pointerId: 1 }))
  expect(destination.cancel).not.toHaveBeenCalled()
  expect(surface.style.transform).toBe('translate3d(160px, 0px, 0px)')
  pointer('pointerup', 190)
  const click = new MouseEvent('click', { bubbles: true, cancelable: true })
  surface.dispatchEvent(click)
  expect(click.defaultPrevented).toBe(true)
  await vi.waitFor(() => expect(destination.commit).toHaveBeenCalledOnce())
  expect(destination.cancel).not.toHaveBeenCalled()
  expect(surface.style.transform).toBe('')
  expect(container.classList.contains('is-swiping-back')).toBe(false)
})

test.each(['short', 'reversed'] as const)('a %s drag returns to the same reader', async kind => {
  const { surface, destination, pointer } = fixture()
  pointer('pointerdown', 30)
  pointer('pointermove', kind === 'short' ? 65 : 210, 100, 300)
  await Promise.resolve()
  if (kind === 'reversed') pointer('pointermove', 90, 100, 100)
  pointer('pointerup', kind === 'short' ? 65 : 90, 100, 20)
  await vi.waitFor(() => expect(destination.cancel).toHaveBeenCalledOnce())
  expect(destination.commit).not.toHaveBeenCalled()
  expect(surface.style.transform).toBe('')
})

test('a short, deliberate flick opens contents', async () => {
  const { destination, pointer } = fixture()
  pointer('pointerdown', 30)
  pointer('pointermove', 85, 100, 30)
  await Promise.resolve()
  pointer('pointerup', 85, 100, 10)
  await vi.waitFor(() => expect(destination.commit).toHaveBeenCalledOnce())
})

test('vertical scrolling, controls, and disabled navigation never prepare contents', () => {
  const { surface, prepare, pointer, enabled } = fixture()
  pointer('pointerdown', 30)
  pointer('pointermove', 34, 150)
  pointer('pointerup', 34, 150)
  pointer('pointerdown', 30, 100, 100, surface.querySelector('button')!)
  pointer('pointermove', 200)
  pointer('pointerup', 200)
  enabled.mockReturnValue(false)
  pointer('pointerdown', 30)
  pointer('pointermove', 200)
  expect(prepare).not.toHaveBeenCalled()
})

test('a second touch cancels the gesture instead of switching fingers', async () => {
  const { destination, pointer, surface } = fixture()
  pointer('pointerdown', 30)
  pointer('pointermove', 130)
  await Promise.resolve()
  pointer('pointerdown', 200, 100, 10, surface, 2)
  pointer('pointerup', 250)
  expect(destination.cancel).toHaveBeenCalledOnce()
  expect(destination.commit).not.toHaveBeenCalled()
  expect(surface.style.transform).toBe('')
})

test('teardown cancels a preview that finishes loading after the gesture ends', async () => {
  let resolve!: (value: ReaderSwipeDestination) => void
  const { destination, pointer, surface } = fixture(() => new Promise(done => { resolve = done }))
  pointer('pointerdown', 30)
  pointer('pointermove', 200)
  destroy!()
  resolve(destination)
  await Promise.resolve()
  expect(destination.cancel).toHaveBeenCalledOnce()
  expect(destination.commit).not.toHaveBeenCalled()
  expect(surface.style.transform).toBe('')
})

test.each(['system', 'reader'])('%s reduced motion keeps swipe navigation without translating the reader', async source => {
  if (source === 'system') await commands.emulateAccessibilityMedia({ reducedMotion: 'reduce' })
  else document.documentElement.dataset.readerReducedMotion = 'on'
  const { surface, destination, pointer } = fixture()
  pointer('pointerdown', 30)
  pointer('pointermove', 200)
  await Promise.resolve()
  expect(surface.style.transform).toBe('')
  pointer('pointerup', 200)
  expect(destination.commit).toHaveBeenCalledOnce()
})
