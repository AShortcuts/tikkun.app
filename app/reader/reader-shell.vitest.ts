
import { beforeEach, expect, test, vi } from 'vitest'
import { Capacitor } from '@capacitor/core'
import { createMount } from '../lifecycle/mount.ts'
import { createReaderShell } from './reader-shell.ts'

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`Missing test element: ${selector}`)
  return element
}

function installFixture() {
  document.body.innerHTML = `
    <div class="app" data-target-id="app-root">
      <div data-target-id="reader-shell-anchor" hidden></div>
      <div data-external-node="true"></div>
    </div>
  `
}

beforeEach(installFixture)

test('native header opens the reading index without a home entry', () => {
  const native = vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true)
  const openReadings = vi.fn()
  const destroy = createMount()(scope => {
    createReaderShell(scope, {
      document, initialTitle: 'Tikkun', initialAnnotationsEnabled: true,
      onTitleClick: () => {}, onAboutClick: openReadings, onAnnotationsChange: () => {},
    })
  })
  try {
    expect(document.querySelector('[aria-label="Open main page"]')).toBeNull()
    required<HTMLButtonElement>('[aria-label="Open reading index"]').click()
    expect(openReadings).toHaveBeenCalledOnce()
    expect(required('[data-target-id="about-link"]').textContent?.trim()).toBe('Readings')
  } finally {
    destroy()
    native.mockRestore()
  }
})
