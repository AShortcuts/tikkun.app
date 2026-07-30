import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { createMount } from '../lifecycle/mount.ts'
import { createNavigationAction } from './actions.ts'
import { createCommandPalette } from './command-palette.ts'

let fixture: HTMLElement

beforeEach(() => {
  fixture = document.createElement('section')
  fixture.innerHTML = `
    <div class="u-hidden" data-target-id="command-palette">
      <input data-target-id="command-palette-input" />
      <div data-target-id="command-palette-results"></div>
    </div>
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
  input.dispatchEvent(new Event('input'))
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

test('replacement mounts remove the previous input listener', () => {
  const mount = createMount()
  const firstActions = vi.fn(() => [])
  const secondActions = vi.fn(() => [])
  let currentPalette: ReturnType<typeof createCommandPalette> | null = null
  const results = fixture.querySelector<HTMLElement>(
    '[data-target-id="command-palette-results"]'
  )!
  const replaceChildren = vi.spyOn(results, 'replaceChildren')
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
  const rendersBeforeInput = replaceChildren.mock.calls.length
  input.value = 'reader'
  input.dispatchEvent(new Event('input'))

  expect(firstActions).not.toHaveBeenCalled()
  expect(secondActions).toHaveBeenCalledOnce()
  expect(replaceChildren).toHaveBeenCalledTimes(rendersBeforeInput + 1)

  destroy()
  const rendersAfterDestroy = replaceChildren.mock.calls.length
  input.dispatchEvent(new Event('input'))
  expect(secondActions).toHaveBeenCalledOnce()
  expect(replaceChildren).toHaveBeenCalledTimes(rendersAfterDestroy)
})
