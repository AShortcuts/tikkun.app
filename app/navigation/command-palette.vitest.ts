import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { LeiningGenerator } from '../calendar-model/generator.ts'
import type { UserSettings } from '../calendar-model/user-settings.ts'
import { createMount } from '../lifecycle/mount.ts'
import { createNavigationAction } from './actions.ts'
import { createCommandPalette } from './command-palette.ts'

let fixture: HTMLElement

const settings: UserSettings = {
  ashkenazi: true,
  includeModernHolidays: false,
  israel: false,
}

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

test('uses the same reading and reference engine in the overlay host', () => {
  const destroy = createMount()((scope) => {
    createCommandPalette(scope, {
      document,
      createGenerator: () => new LeiningGenerator(settings),
      getActions: () => [],
      restoreFocus: vi.fn(),
      isBookmarkAction: () => false,
      formatBadge: (label) => label,
    }).open()
  })
  const input = fixture.querySelector<HTMLInputElement>(
    '[data-target-id="reader-search-input"]'
  )!

  expect(
    fixture.querySelector('[data-search-presentation="overlay"]')
  ).not.toBeNull()
  expect(fixture.querySelector('.reader-search-shortcut')?.textContent).toBe('⌘K')
  input.value = 'Genesis 6:9'
  input.dispatchEvent(new Event('input', { bubbles: true }))

  const result = fixture.querySelector<HTMLAnchorElement>(
    '[data-result-source="reading"] a'
  )
  expect(result?.getAttribute('href')).toBe('#/r/1-6-9')
  expect(result?.textContent).toContain('Genesis 6:9')
  destroy()
})

test('keeps one action index across keystrokes and rebuilds it on refresh', () => {
  let actions = [
    createNavigationAction({
      id: 'tools.settings',
      group: 'tools',
      label: 'Reader Settings',
      run: vi.fn(),
    }),
  ]
  const getActions = vi.fn(() => actions)
  let palette!: ReturnType<typeof createCommandPalette>
  const destroy = createMount()((scope) => {
    palette = createCommandPalette(scope, {
      document,
      getActions,
      restoreFocus: vi.fn(),
      isBookmarkAction: () => false,
      formatBadge: (label) => label,
    })
    palette.open()
  })
  const input = fixture.querySelector<HTMLInputElement>(
    '[data-target-id="reader-search-input"]'
  )!

  input.value = 'reader'
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.value = 'settings'
  input.dispatchEvent(new Event('input', { bubbles: true }))
  expect(getActions).toHaveBeenCalledOnce()

  actions = [
    createNavigationAction({
      id: 'tools.advanced-settings',
      group: 'tools',
      label: 'Advanced Settings',
      run: vi.fn(),
    }),
  ]
  palette.refresh()

  expect(getActions).toHaveBeenCalledTimes(2)
  expect(
    fixture.querySelector<HTMLButtonElement>('[data-action-id="tools.advanced-settings"]')
  ).not.toBeNull()

  destroy()
})

test('uses explicit empty priorities and keyboard selection', () => {
  const runFirst = vi.fn()
  const runSecond = vi.fn()
  const destroy = createMount()((scope) => {
    createCommandPalette(scope, {
      document,
      getActions: () => [
        createNavigationAction({
          id: 'second',
          group: 'tools',
          label: 'Second',
          emptyPriority: 10,
          run: runSecond,
        }),
        createNavigationAction({
          id: 'first',
          group: 'reading',
          label: 'First',
          emptyPriority: 20,
          run: runFirst,
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

  expect(
    [...fixture.querySelectorAll<HTMLButtonElement>('[data-action-id]')].map(
      ({ dataset }) => dataset.actionId
    )
  ).toEqual(['first', 'second'])
  input.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })
  )
  input.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
  )

  expect(runFirst).not.toHaveBeenCalled()
  expect(runSecond).toHaveBeenCalledOnce()
  destroy()
})

test('exposes match metadata and bold alias context', () => {
  const destroy = createMount()((scope) => {
    createCommandPalette(scope, {
      document,
      getActions: () => [
        createNavigationAction({
          id: 'tools.analytics',
          group: 'tools',
          label: 'Cue Analytics',
          aliases: ['Playback Analytics'],
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

  input.value = 'Playback Analytics'
  input.dispatchEvent(new Event('input', { bubbles: true }))
  const result = fixture.querySelector<HTMLElement>(
    '[data-action-id="tools.analytics"]'
  )!

  expect(result.dataset.matchBand).toBe('exact-alias')
  expect(result.dataset.matchField).toBe('alias')
  expect(result.textContent).toContain('Cue Analytics')
  expect(result.textContent?.replace(/\s+/g, '')).toContain(
    'Matched:PlaybackAnalytics'
  )
  expect(result.querySelectorAll('.reader-search-alias strong')).not.toHaveLength(0)
  destroy()
})

test('restores focus on Escape', () => {
  const returnTarget = document.createElement('button')
  fixture.prepend(returnTarget)
  const restoreFocus = vi.fn(() => returnTarget.focus())
  const destroy = createMount()((scope) => {
    createCommandPalette(scope, {
      document,
      getActions: () => [],
      restoreFocus,
      isBookmarkAction: () => false,
      formatBadge: (label) => label,
    }).open()
  })
  const input = fixture.querySelector<HTMLInputElement>(
    '[data-target-id="reader-search-input"]'
  )!

  input.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
  )

  expect(restoreFocus).toHaveBeenCalledOnce()
  expect(document.activeElement).toBe(returnTarget)
  destroy()
})

test('preserves native Home and End editing in the search input', () => {
  let palette!: ReturnType<typeof createCommandPalette>
  const destroy = createMount()((scope) => {
    palette = createCommandPalette(scope, {
      document,
      getActions: () => [],
      restoreFocus: vi.fn(),
      isBookmarkAction: () => false,
      formatBadge: (label) => label,
    })
  })
  palette.open()
  const input = fixture.querySelector<HTMLInputElement>(
    '[data-target-id="reader-search-input"]'
  )!
  input.value = 'beresheet'
  input.dispatchEvent(new Event('input', { bubbles: true }))

  for (const key of ['Home', 'End']) {
    const event = new KeyboardEvent('keydown', {
      key,
      bubbles: true,
      cancelable: true,
    })
    expect(input.dispatchEvent(event)).toBe(true)
    expect(event.defaultPrevented).toBe(false)
  }
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
    '[data-target-id="reader-search-input"]'
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
