import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { page } from 'vitest/browser'
import { get } from 'svelte/store'
import { flushSync, mount, unmount } from 'svelte'
import '../../css/master.css'
import NativeUpdatePrompt from './NativeUpdatePrompt.svelte'
import { nativeUpdatePromptDismissed, nativeUpdateState, updateChannel } from './update-state.ts'
import { checkNativeUpdates } from './native-updates.ts'

let target: HTMLElement
let component: ReturnType<typeof mount> | null
const prepare = vi.fn()

beforeEach(() => {
  const channel = { phase: 'idle' as const, pending: false, checkedAt: null }
  nativeUpdateState.set({ web: { ...channel }, content: { ...channel }, applying: false, canCancel: false, applyError: null })
  nativeUpdatePromptDismissed.set(false)
  target = document.createElement('div')
  document.body.append(target)
  component = mount(NativeUpdatePrompt, { target, props: { prepare } })
  flushSync()
})
afterEach(async () => {
  if (component) await unmount(component)
  component = null
  target.remove()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

test.each([320])('native updates use the same centered pill, Apply/Later and neutral Cancel at %ipx', async width => {
  await page.viewport(width, 844)
  const fetcher = vi.spyOn(globalThis, 'fetch')
  expect(target.textContent).toBe('')
  updateChannel('web', { phase: 'ready', pending: true })
  flushSync()
  const prompt = target.querySelector<HTMLElement>('.service-worker-update')!
  const action = target.querySelector<HTMLButtonElement>('.service-worker-update-action')!
  const bounds = prompt.getBoundingClientRect()
  expect(Math.abs(bounds.left + bounds.width / 2 - width / 2)).toBeLessThan(1)
  expect(bounds.left).toBeGreaterThanOrEqual(8)
  expect(bounds.right).toBeLessThanOrEqual(width - 8)
  expect(getComputedStyle(prompt).borderRadius).toBe('999px')
  expect(getComputedStyle(action).fontWeight).toBe('500')
  expect(action.textContent).toBe('Apply')
  await page.screenshot({ path: `../../.vitest-attachments/native-update-prompt-${width}.png` })
  vi.useFakeTimers()
  action.click()
  flushSync()
  expect(action.textContent).toBe('Cancel')
  // Cancel is a quiet tint of the prompt's own ink, never a warning color.
  const ink = getComputedStyle(prompt).color
  expect(getComputedStyle(action).color).toBe(ink)
  expect(getComputedStyle(action).backgroundColor).not.toBe('rgb(139, 32, 64)')
  expect(prompt.querySelector('.service-worker-update-progress')).not.toBeNull()
  expect(target.querySelector('[aria-label="Dismiss update"]')).toBeNull()
  action.click()
  await vi.advanceTimersByTimeAsync(1200)
  flushSync()
  expect(action.textContent).toBe('Apply')
  expect(prepare).not.toHaveBeenCalled()
  expect(fetcher).not.toHaveBeenCalled()
  expect(get(nativeUpdateState).web.pending).toBe(true)
})

test('Later only hides the prompt; manual checking can show it again', async () => {
  updateChannel('web', { phase: 'ready', pending: true })
  flushSync()
  await page.getByRole('button', { name: 'Dismiss update' }).click()
  expect(target.textContent).toBe('')
  expect(get(nativeUpdateState).web.pending).toBe(true)
  await checkNativeUpdates(true)
  flushSync()
  expect(target.textContent).toContain('Update available')
})

test('new recordings and cues from the website use the same prompt as app updates', async () => {
  updateChannel('content', { phase: 'ready', pending: true })
  flushSync()
  expect(target.textContent).toContain('Update available')
  expect(target.querySelector('.service-worker-update-action')?.textContent).toBe('Apply')
})
