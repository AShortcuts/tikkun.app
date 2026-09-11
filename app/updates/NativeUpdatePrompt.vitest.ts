import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { page } from 'vitest/browser'
import { get } from 'svelte/store'
import { flushSync, mount, unmount } from 'svelte'
import '../../css/master.css'
import NativeUpdatePrompt from './NativeUpdatePrompt.svelte'
import { nativeUpdatePromptDismissed, nativeUpdateState, updateChannel } from './update-state.ts'
import { checkNativeUpdates } from './native-updates.ts'
import { createMount } from '../lifecycle/mount.ts'
import { createNativeUpdatePrompt } from './native-update-prompt.ts'

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

test.each([320, 390, 1280])('native updates use the same centered pill, Apply/Later and wine Cancel at %ipx', async width => {
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
  expect(getComputedStyle(action).backgroundColor).toBe('rgb(139, 32, 64)')
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
  updateChannel('content', { phase: 'ready', pending: true })
  flushSync()
  await page.getByRole('button', { name: 'Dismiss update' }).click()
  expect(target.textContent).toBe('')
  expect(get(nativeUpdateState).content.pending).toBe(true)
  await checkNativeUpdates(true)
  flushSync()
  expect(target.textContent).toContain('Update available')
})

test('protected Apply reports the error with retry and Later in the same prompt', async () => {
  prepare.mockImplementation(() => { throw new Error('Pause audio before applying the update.') })
  vi.spyOn(console, 'error').mockImplementation(() => {})
  updateChannel('web', { phase: 'ready', pending: true })
  flushSync()
  vi.useFakeTimers()
  target.querySelector<HTMLButtonElement>('.service-worker-update-action')!.click()
  await vi.advanceTimersByTimeAsync(1200)
  await vi.waitFor(() => expect(get(nativeUpdateState).applying).toBe(false))
  flushSync()
  expect(target.querySelector('[role="alert"]')?.textContent).toContain('Pause audio')
  expect(target.querySelector('.service-worker-update-action')?.textContent).toBe('Apply')
  expect(target.querySelector('[aria-label="Dismiss update"]')).not.toBeNull()
})

test('reader lifetime owns the native prompt and cancels a pending Apply when leaving', async () => {
  await unmount(component!)
  component = null
  const destroy = createMount()(scope => createNativeUpdatePrompt(scope, document, prepare))
  updateChannel('web', { phase: 'ready', pending: true })
  flushSync()
  vi.useFakeTimers()
  document.querySelector<HTMLButtonElement>('.service-worker-update-action')!.click()
  destroy()
  await vi.advanceTimersByTimeAsync(1200)
  expect(prepare).not.toHaveBeenCalled()
  expect(document.querySelector('.service-worker-update')).toBeNull()
  expect(get(nativeUpdateState)).toMatchObject({ applying: false, web: { pending: true } })
})
