import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { createMount } from '../lifecycle/mount.ts'
import { createNavigationAction } from './actions.ts'
import { createCommandPalette } from './command-palette.ts'

let fixture: HTMLElement

beforeEach(() => {
  fixture = document.createElement('section')
  fixture.innerHTML = `
    <div data-target-id="command-palette-root"></div>
  `
  document.body.appendChild(fixture)
})

afterEach(() => {
  fixture.remove()
})

test('filters actions and runs the selected result', () => {
  const runSettings = vi.fn()
  const destroy = createMount()((scope) => {
    createCommandPalette(scope, {
      document,
      getActions: () => [
        createNavigationAction({
          id: 'tools.settings',
          group: 'tools',
          label: 'Reader Settings',
          run: runSettings,
        }),
        createNavigationAction({
          id: 'reading.next',
          group: 'reading',
          label: 'Next Reading',
          run: vi.fn(),
        }),
      ],
      restoreFocus: vi.fn(),
      isBookmarkAction: () => false,
      formatBadge: (label) => label,
    }).open()
  })
  const input = fixture.querySelector<HTMLInputElement>(
    '[data-target-id="command-palette-input"]'
  )!

  input.value = 'settings'
  input.dispatchEvent(new Event('input', { bubbles: true }))
  expect(
    fixture.querySelectorAll('[data-target-id="command-palette-results"] button')
  ).toHaveLength(1)
  fixture
    .querySelector<HTMLButtonElement>(
      '[data-target-id="command-palette-results"] button'
    )!
    .click()
  expect(runSettings).toHaveBeenCalledOnce()

  destroy()
})

test('replacement mounts remove the previous Svelte instance', () => {
  const mount = createMount()
  const firstActions = vi.fn(() => [])
  const secondActions = vi.fn(() => [])
  let currentPalette: ReturnType<typeof createCommandPalette> | null = null
  const options = {
    document,
    restoreFocus: vi.fn(),
    isBookmarkAction: () => false,
    formatBadge: (label: string) => label,
  }

  mount((scope) => {
    createCommandPalette(scope, { ...options, getActions: firstActions })
  })
  const destroy = mount((scope) => {
    currentPalette = createCommandPalette(scope, {
      ...options,
      getActions: secondActions,
    })
  })
  currentPalette!.open()
  const input = fixture.querySelector<HTMLInputElement>(
    '[data-target-id="command-palette-input"]'
  )!
  input.value = 'reader'
  input.dispatchEvent(new Event('input', { bubbles: true }))

  expect(firstActions).not.toHaveBeenCalled()
  expect(secondActions).toHaveBeenCalledOnce()

  destroy()
  expect(input.isConnected).toBe(false)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  expect(secondActions).toHaveBeenCalledOnce()
})
