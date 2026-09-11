import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { page } from '@vitest/browser/context'
import { createMount } from '../lifecycle/mount.ts'
import {
  createReaderControls,
  type ReaderControls,
  type ReaderControlsOptions,
  type ReaderControlsState,
} from './reader-controls.ts'
import '../../css/master.css'

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

  expect(
    fixture.querySelector('[data-target-id="command-palette-open"]')
  ).toBeNull()
  expect(
    fixture.querySelector('[data-toolbar-overflow-action="command"]')
  ).toBeNull()

  const toggle = required<HTMLButtonElement>(
    '[data-target-id="toolbar-overflow-toggle"]'
  )
  const menu = required<HTMLElement>(
    '[data-target-id="toolbar-overflow-menu"]'
  )
  toggle.click()
  expect(toggle.getAttribute('aria-expanded')).toBe('true')
  expect(toggle.hasAttribute('aria-haspopup')).toBe(false)
  expect(menu.getAttribute('role')).toBe('group')
  expect(menu.querySelector('[role="menuitem"]')).toBeNull()
  expect(menu.classList.contains('u-hidden')).toBe(false)
  expect(
    required('[data-target-id="toolbar-overflow-annotations-label"]')
      .textContent
  ).toContain('Hide Nekudot')
  const annotationsAction = required<HTMLButtonElement>(
    '[data-toolbar-overflow-action="annotations"]'
  )
  const annotationsIcon = required(
    '[data-target-id="toolbar-overflow-annotations-icon"]'
  )
  expect(annotationsAction.getAttribute('aria-pressed')).toBe('true')
  expect(getComputedStyle(annotationsIcon).fontFamily).toContain(
    'ShlomosemiStam'
  )
  expect(annotationsIcon.querySelector('.toggle.mod-compact')).not.toBeNull()
  expect(annotationsIcon.querySelector('.toggle-state.mod-off')?.textContent).toBe('א')
  expect(annotationsIcon.querySelector('.toggle-state.mod-on')?.textContent).toBe(
    'אֶ֨'
  )

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
  annotationsAction.click()
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
  ).toContain('Show Nekudot')
  expect(annotationsAction.getAttribute('aria-pressed')).toBe('false')
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
  toggle.click()
  required<HTMLButtonElement>(
    '[data-toolbar-overflow-action="annotations"]'
  ).click()
  expect(firstActions.toggleAnnotations).not.toHaveBeenCalled()
  expect(secondActions.toggleAnnotations).toHaveBeenCalledOnce()

  destroy()
  destroy = null
  expect(
    fixture.querySelector('[data-target-id="toolbar-overflow-toggle"]')
  ).toBeNull()
})

test.each(['light', 'dark', 'custom'])('centers the transparent nekudot icon in both states: %s', async (theme) => {
  const previousTheme = document.documentElement.getAttribute('data-reader-theme')
  await page.viewport(390, 844)
  document.documentElement.setAttribute('data-reader-theme', theme)
  const state: ReaderControlsState = {
    bookmarkAvailable: true,
    bookmarked: false,
    annotationsEnabled: true,
    aliyahNavigationAvailable: true,
  }
  let controls!: ReaderControls
  destroy = createMount()((scope) => {
    controls = createReaderControls(scope, createOptions(state, createActions()))
  })
  required<HTMLButtonElement>('[data-target-id="toolbar-overflow-toggle"]').click()
  await document.fonts.ready
  const icon = required<HTMLElement>('.annotations-toggle-icon')
  const originalBounds = icon.getBoundingClientRect()
  try {
    for (const enabled of [true, false]) {
      state.annotationsEnabled = enabled
      controls.sync()
      const bounds = icon.getBoundingClientRect()
      const glyphs = Array.from(icon.children, glyph => glyph.getBoundingClientRect())
      expect(getComputedStyle(icon).backgroundColor).toBe('rgba(0, 0, 0, 0)')
      expect(bounds.width).toBe(originalBounds.width)
      expect(bounds.height).toBe(originalBounds.height)
      expect(Math.abs((glyphs[0].left + glyphs[1].right) / 2 - (bounds.left + bounds.width / 2))).toBeLessThan(1)
      for (const glyph of glyphs) {
        expect(Math.abs(glyph.top + glyph.height / 2 - (bounds.top + bounds.height / 2))).toBeLessThan(1)
      }
    }
  } finally {
    if (previousTheme === null) document.documentElement.removeAttribute('data-reader-theme')
    else document.documentElement.setAttribute('data-reader-theme', previousTheme)
    await page.viewport(1280, 844)
  }
})

test('shares through the existing menu, prevents duplicate sheets and honors availability', async () => {
  const state: ReaderControlsState = { bookmarkAvailable: true, bookmarked: false, annotationsEnabled: true, aliyahNavigationAvailable: true, shareAvailable: false }
  let finish!: () => void
  const shareReading = vi.fn(() => new Promise<void>(resolve => { finish = resolve }))
  destroy = createMount()((scope) => {
    createReaderControls(scope, { ...createOptions(state, createActions()), shareReading })
  })
  const toggle = required<HTMLButtonElement>('[data-target-id="toolbar-overflow-toggle"]')
  const share = required<HTMLButtonElement>('[data-toolbar-overflow-action="share"]')
  toggle.click()
  expect(share.disabled).toBe(true)
  state.shareAvailable = true
  toggle.click(); toggle.click()
  expect(share.disabled).toBe(false)
  share.click()
  expect(shareReading).toHaveBeenCalledWith(toggle)
  expect(toggle.getAttribute('aria-expanded')).toBe('false')
  toggle.click()
  expect(share.disabled).toBe(true)
  share.click()
  expect(shareReading).toHaveBeenCalledOnce()
  finish()
  await vi.waitFor(() => expect(share.disabled).toBe(false))
  await page.viewport(1280, 844)
  const desktopShare = required<HTMLButtonElement>('[data-target-id="share-current-reading"]')
  desktopShare.click()
  expect(shareReading).toHaveBeenLastCalledWith(desktopShare)
  finish()
  await vi.waitFor(() => expect(desktopShare.disabled).toBe(false))
  expect(document.activeElement).toBe(desktopShare)
})

function createActions() {
  return {
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
