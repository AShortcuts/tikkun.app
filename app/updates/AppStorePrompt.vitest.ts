import { afterEach, expect, test } from 'vitest'
import { page } from 'vitest/browser'
import { mount, unmount } from 'svelte'
import '../../css/master.css'
import AppStorePrompt from './AppStorePrompt.svelte'
import { appStoreState, markReaderShown } from './app-store.ts'

// Outside the iPhone app the App Store check reports nothing, so each test supplies the state.
markReaderShown()
let component: ReturnType<typeof mount> | undefined
afterEach(async () => {
  if (component) await unmount(component)
  document.body.replaceChildren()
  document.documentElement.removeAttribute('data-reader-theme')
  localStorage.clear()
})

test.each(['light', 'dark'] as const)('the %s required prompt offers Update and a Later that waits a day', async theme => {
  document.documentElement.dataset.readerTheme = theme
  document.body.style.cssText = 'margin: 0; min-height: 100vh; background: var(--paper-color); font: 27px/1.75 serif'
  document.body.textContent = 'בְּרֵאשִׁית בָּרָא אֱלֹהִים אֵת הַשָּׁמַיִם וְאֵת הָאָרֶץ '.repeat(30)
  appStoreState.set({ installed: '1.0', status: 'required', info: { latest: '1.2', minimum: '1.1' } })
  await page.viewport(390, 844)
  component = mount(AppStorePrompt, { target: document.body, props: { canInterrupt: () => true } })
  const dialog = page.getByRole('dialog', { name: 'App Update Required' })
  await expect.element(dialog).toBeVisible()
  await expect.element(page.getByRole('link', { name: 'Update' })).toHaveAttribute('href', 'https://apps.apple.com/app/id6810923824')
  await page.screenshot({ path: `../../.vitest-attachments/app-store-prompt-${theme}.png` })
  await page.getByRole('button', { name: 'Later' }).click()
  await expect.element(dialog).not.toBeInTheDocument()
  expect(JSON.parse(localStorage.getItem('tikkun.app-store-prompt')!).id).toBe('required:1.1')
})
