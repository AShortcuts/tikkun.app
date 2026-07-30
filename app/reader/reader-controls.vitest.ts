import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { createMount } from '../lifecycle/mount.ts'
import {
  createReaderControls,
  type ReaderControls,
  type ReaderControlsOptions,
  type ReaderControlsState,
} from './reader-controls.ts'

let fixture: HTMLElement
let destroy: (() => void) | null = null

beforeEach(() => {
  fixture = document.createElement('section')
  fixture.innerHTML = `
    <div data-target-id="reader-controls-root"></div>
    <button data-test-id="outside">Outside</button>
  `
  document.body.appendChild(fixture)
})

afterEach(() => {
  destroy?.()
  destroy = null
  fixture.remove()
  vi.restoreAllMocks()
})

test('synchronizes wide and compact controls through one action interface', () => {
  const state: ReaderControlsState = {
    bookmarkAvailable: true,
    bookmarked: false,
    annotationsEnabled: true,
    aliyahNavigationAvailable: true,
  }
  const actions = createActions()
  let controls: ReaderControls | null = null

  destroy = createMount()((scope) => {
    controls = createReaderControls(scope, createOptions(state, actions))
  })

  const bookmark = required<HTMLButtonElement>(
    '[data-target-id="bookmark-current"]'
  )
  expect(bookmark.disabled).toBe(false)
  expect(bookmark.getAttribute('aria-pressed')).toBe('false')
  expect(bookmark.title).toBe('Bookmark current word')
  bookmark.click()
  expect(actions.toggleBookmark).toHaveBeenCalledOnce()

  required<HTMLButtonElement>(
    '[data-target-id="command-palette-open"]'
  ).click()
  expect(actions.openCommandPalette).toHaveBeenCalledOnce()

  const toggle = required<HTMLButtonElement>(
    '[data-target-id="toolbar-overflow-toggle"]'
  )
  const menu = required<HTMLElement>(
    '[data-target-id="toolbar-overflow-menu"]'
  )
  toggle.click()
  expect(toggle.getAttribute('aria-expanded')).toBe('true')
  expect(menu.classList.contains('u-hidden')).toBe(false)
  expect(
    required('[data-target-id="toolbar-overflow-annotations-label"]')
      .textContent
  ).toContain('Hide Vowels')

  required<HTMLButtonElement>(
    '[data-toolbar-overflow-action="aliyah-rail"]'
  ).click()
  expect(actions.openAliyahNavigation).toHaveBeenLastCalledWith(toggle)
  expect(menu.classList.contains('u-hidden')).toBe(true)

  toggle.click()
  required<HTMLButtonElement>(
    '[data-toolbar-overflow-action="aliyah-starts"]'
  ).click()
  expect(actions.showAliyahStarts).toHaveBeenCalledOnce()

  toggle.click()
  required<HTMLButtonElement>(
    '[data-toolbar-overflow-action="annotations"]'
  ).click()
  expect(actions.toggleAnnotations).toHaveBeenCalledOnce()

  toggle.click()
  required<HTMLButtonElement>(
    '[data-toolbar-overflow-action="settings"]'
  ).click()
  expect(actions.openSettings).toHaveBeenLastCalledWith(toggle)

  Object.assign(state, {
    bookmarkAvailable: false,
    bookmarked: true,
    annotationsEnabled: false,
    aliyahNavigationAvailable: false,
  })
  controls!.sync()
  expect(bookmark.disabled).toBe(true)
  expect(bookmark.getAttribute('aria-pressed')).toBe('true')
  expect(bookmark.title).toBe('Remove bookmark')
  expect(
    required('[data-target-id="toolbar-overflow-bookmark-label"]').textContent
  ).toContain('Remove Bookmark')
  expect(
    required<HTMLButtonElement>(
      '[data-toolbar-overflow-action="aliyah-rail"]'
    ).disabled
  ).toBe(true)
  expect(
    required('[data-target-id="toolbar-overflow-annotations-label"]')
      .textContent
  ).toContain('Show Vowels')
})

test('owns menu focus, outside dismissal, and replacement cleanup', () => {
  const mount = createMount()
  const state: ReaderControlsState = {
    bookmarkAvailable: true,
    bookmarked: false,
    annotationsEnabled: true,
    aliyahNavigationAvailable: true,
  }
  const firstActions = createActions()
  const secondActions = createActions()

  const staleDestroy = mount((scope) => {
    createReaderControls(scope, createOptions(state, firstActions))
  })
  destroy = mount((scope) => {
    createReaderControls(scope, createOptions(state, secondActions))
  })

  const toggle = required<HTMLButtonElement>(
    '[data-target-id="toolbar-overflow-toggle"]'
  )
  const menu = required<HTMLElement>(
    '[data-target-id="toolbar-overflow-menu"]'
  )
  toggle.click()
  document.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
  )
  expect(menu.classList.contains('u-hidden')).toBe(true)
  expect(document.activeElement).toBe(toggle)

  toggle.click()
  required<HTMLButtonElement>('[data-test-id="outside"]').dispatchEvent(
    new PointerEvent('pointerdown', { bubbles: true })
  )
  expect(menu.classList.contains('u-hidden')).toBe(true)

  staleDestroy()
  required<HTMLButtonElement>(
    '[data-target-id="command-palette-open"]'
  ).click()
  expect(firstActions.openCommandPalette).not.toHaveBeenCalled()
  expect(secondActions.openCommandPalette).toHaveBeenCalledOnce()

  destroy()
  destroy = null
  expect(
    fixture.querySelector('[data-target-id="toolbar-overflow-toggle"]')
  ).toBeNull()
})

function createActions() {
  return {
    openCommandPalette: vi.fn(),
    toggleBookmark: vi.fn(),
    openAliyahNavigation: vi.fn(),
    showAliyahStarts: vi.fn(),
    toggleAnnotations: vi.fn(),
    openSettings: vi.fn(),
  }
}

function createOptions(
  state: ReaderControlsState,
  actions: ReturnType<typeof createActions>
): ReaderControlsOptions {
  return {
    document,
    getState: () => state,
    ...actions,
  }
}

function required<T extends Element = HTMLElement>(selector: string): T {
  const element = fixture.querySelector<T>(selector)
  if (!element) throw new Error(`Missing fixture element: ${selector}`)
  return element
}
