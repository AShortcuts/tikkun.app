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
    '[data-target-id="reader-search-input"]'
  )!

  input.value = 'settings'
  input.dispatchEvent(new Event('input', { bubbles: true }))
  expect(
    fixture.querySelectorAll('[data-target-id="reader-search-results"] button')
  ).toHaveLength(1)
  fixture
    .querySelector<HTMLButtonElement>(
      '[data-target-id="reader-search-results"] button'
    )!
    .click()
  expect(runSettings).toHaveBeenCalledOnce()

  destroy()
})

test('repeated open focuses the same control and Cmd-K clears before closing', () => {
  let palette!: ReturnType<typeof createCommandPalette>
  const destroy = createMount()((scope) => {
    palette = createCommandPalette(scope, {
      document,
      getActions: () => [
        createNavigationAction({
          id: 'tools.settings',
          group: 'tools',
          label: 'Reader Settings',
          run: vi.fn(),
        }),
      ],
      restoreFocus: vi.fn(),
      isBookmarkAction: () => false,
      formatBadge: (label) => label,
    })
    palette.open()
  })
  const input = fixture.querySelector<HTMLInputElement>(
    '[data-target-id="reader-search-input"]'
  )!
  input.value = 'settings'
  input.dispatchEvent(new Event('input', { bubbles: true }))

  palette.open()
  expect(palette.isOpen()).toBe(true)
  expect(document.activeElement).toBe(input)
  expect(input.value).toBe('settings')

  input.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true })
  )
  expect(palette.isOpen()).toBe(true)
  expect(input.value).toBe('')
  input.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true })
  )
  expect(palette.isOpen()).toBe(false)
  destroy()
})
