import { afterEach, beforeEach, expect, test } from 'vitest'
import { get } from 'svelte/store'
import { page } from 'vitest/browser'
import { flushSync, mount, unmount } from 'svelte'
import '../../css/master.css'
import '../../css/reader-settings.css'
import NativeUpdateSettings from './NativeUpdateSettings.svelte'
import { nativeUpdatePromptDismissed, nativeUpdateState, updateChannel } from './update-state.ts'
let fixture: HTMLElement
let component: ReturnType<typeof mount>

beforeEach(() => {
  const channel = { phase: 'idle' as const, pending: false, checkedAt: null }
  nativeUpdateState.set({ web: { ...channel }, content: { ...channel }, applying: false, canCancel: false, applyError: null })
  fixture = document.createElement('div')
  fixture.className = 'settings-category-panel'
  fixture.style.cssText = 'width: min(100%, 380px); box-sizing: border-box; padding: 16px;'
  document.body.append(fixture)
  component = mount(NativeUpdateSettings, { target: fixture })
  flushSync()
})
afterEach(async () => { await unmount(component); fixture.remove() })

test.each([320, 390, 1280])('manual controls fit at %ipx and call the real action entry points', async width => {
  await page.viewport(width, 844)
  nativeUpdatePromptDismissed.set(true)
  await page.getByRole('button', { name: 'Check for Updates' }).click()
  expect(get(nativeUpdatePromptDismissed)).toBe(false)
  await expect.element(page.getByRole('status')).toHaveTextContent('Updates are unavailable in this build.')
  updateChannel('web', { phase: 'ready', pending: true, checkedAt: Date.now() })
  flushSync()
  await expect.element(page.getByRole('status')).toHaveTextContent('Update ready.')
  for (const button of fixture.querySelectorAll('button')) {
    expect(button.scrollWidth).toBeLessThanOrEqual(button.clientWidth)
    // Measure the resting touch target after the press-scale transition settles.
    await expect.poll(() => button.getBoundingClientRect().height).toBeGreaterThanOrEqual(44)
  }
  expect(fixture.scrollWidth).toBeLessThanOrEqual(fixture.clientWidth)
  await page.screenshot({ path: `../../.vitest-attachments/native-updates-${width}.png` })
  expect(fixture.querySelectorAll('button')).toHaveLength(1)
})

test('busy, offline, unpublished and current states stay distinct and accessible', async () => {
  updateChannel('web', { phase: 'checking' })
  flushSync()
  await expect.element(page.getByRole('button', { name: 'Checking...' })).toBeDisabled()
  updateChannel('web', { phase: 'downloading' })
  flushSync()
  await expect.element(page.getByRole('status')).toHaveTextContent('Downloading update...')
  updateChannel('web', { phase: 'error' })
  flushSync()
  await expect.element(page.getByRole('status')).toHaveTextContent('Could not check for updates.')
  await expect.element(page.getByRole('button', { name: 'Check for Updates' })).toBeEnabled()
  updateChannel('web', { phase: 'unpublished' })
  flushSync()
  await expect.element(page.getByRole('status')).toHaveTextContent('No update has been published')
  updateChannel('web', { phase: 'current' })
  updateChannel('content', { phase: 'current' })
  flushSync()
  await expect.element(page.getByRole('status')).toHaveTextContent('Up to date.')
  nativeUpdateState.update(state => ({ ...state, applyError: 'Pause audio before applying the update.' }))
  flushSync()
  await expect.element(page.getByRole('status')).toHaveTextContent('Pause audio')
})
