import { afterEach, beforeEach, expect, test } from 'vitest'
import { get } from 'svelte/store'
import { page } from 'vitest/browser'
import { flushSync, mount, unmount } from 'svelte'
import '../../css/master.css'
import '../../css/reader-settings.css'
import NativeUpdateSettings from './NativeUpdateSettings.svelte'
import { nativeUpdatePromptDismissed, nativeUpdateState, updateChannel } from './update-state.ts'
import { appStoreState } from './app-store.ts'
let fixture: HTMLElement
let component: ReturnType<typeof mount>
const info = { latest: '1.2', minimum: '1.1' }
const version = () => page.getByRole('status')

beforeEach(() => {
  const channel = { phase: 'idle' as const, pending: false, checkedAt: null }
  nativeUpdateState.set({ web: { ...channel }, content: { ...channel }, applying: false, canCancel: false, applyError: null })
  appStoreState.set({ installed: null, status: null, info: null })
  fixture = document.createElement('div')
  fixture.className = 'settings-category-panel'
  fixture.style.cssText = 'width: min(100%, 380px); box-sizing: border-box; padding: 16px;'
  document.body.append(fixture)
  component = mount(NativeUpdateSettings, { target: fixture })
  flushSync()
})
afterEach(async () => { await unmount(component); fixture.remove() })

test.each([320])('versions and update actions fit at %ipx and call the real action entry points', async width => {
  await page.viewport(width, 844)
  nativeUpdatePromptDismissed.set(true)
  await page.getByRole('button', { name: 'Check for Updates' }).click()
  expect(get(nativeUpdatePromptDismissed)).toBe(false)
  updateChannel('web', { phase: 'ready', pending: true, checkedAt: Date.now() })
  appStoreState.set({ installed: '1.1', status: 'available', info })
  flushSync()
  await expect.element(version()).toHaveTextContent('Development build · Update ready')
  await expect.element(page.getByRole('button', { name: 'Apply Update' })).toBeEnabled()
  await expect.element(page.getByRole('link', { name: 'Update in the App Store' })).toHaveAttribute('href', 'https://apps.apple.com/app/id6810923824')
  expect(fixture.textContent?.replace(/\s+/g, ' ')).toContain('v1.1 · Update in the App Store')
  for (const button of fixture.querySelectorAll('button')) {
    expect(button.scrollWidth).toBeLessThanOrEqual(button.clientWidth)
    // Measure the resting touch target after the press-scale transition settles.
    await expect.poll(() => button.getBoundingClientRect().height).toBeGreaterThanOrEqual(44)
  }
  expect(fixture.scrollWidth).toBeLessThanOrEqual(fixture.clientWidth)
  await page.screenshot({ path: `../../.vitest-attachments/native-updates-${width}.png` })
  expect(fixture.querySelectorAll('button')).toHaveLength(2)
})

test('busy, offline, current, failed and below-minimum states stay distinct and accessible', async () => {
  updateChannel('web', { phase: 'checking' })
  flushSync()
  await expect.element(page.getByRole('button', { name: 'Checking...' })).toBeDisabled()
  updateChannel('web', { phase: 'downloading' })
  flushSync()
  await expect.element(version()).toHaveTextContent('Downloading...')
  updateChannel('web', { phase: 'error' })
  flushSync()
  await expect.element(version()).toHaveTextContent('Could not check')
  await expect.element(page.getByRole('button', { name: 'Check for Updates' })).toBeEnabled()
  updateChannel('web', { phase: 'unpublished' })
  // Website content made for newer Torah text is not something this version can install.
  updateChannel('content', { phase: 'unpublished' })
  appStoreState.set({ installed: '1.2', status: 'latest', info })
  flushSync()
  await expect.element(version()).toHaveTextContent('· Latest')
  expect(fixture.textContent?.replace(/\s+/g, ' ')).toContain('v1.2 · Latest')
  updateChannel('content', { phase: 'ready', pending: true })
  flushSync()
  await expect.element(version()).toHaveTextContent('Update ready')
  nativeUpdateState.update(state => ({ ...state, applyError: 'Pause audio before applying the update.' }))
  flushSync()
  await expect.element(page.getByRole('alert')).toHaveTextContent('Pause audio')
  appStoreState.set({ installed: '1.0', status: 'required', info })
  flushSync()
  await expect.element(version()).toHaveTextContent(/^Development build$/)
  await expect.element(page.getByRole('link', { name: 'Update required' })).toBeVisible()
})
