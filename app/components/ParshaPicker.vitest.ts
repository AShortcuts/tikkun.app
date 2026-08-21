import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { tick } from 'svelte'

import { LeiningGenerator } from '../calendar-model/generator.ts'
import type { UserSettings } from '../calendar-model/user-settings.ts'
import { createNavigationAction, type NavigationAction } from '../navigation/actions.ts'
import ParshaPicker from './ParshaPicker.ts'

const testSettings: UserSettings = {
  ashkenazi: true,
  includeModernHolidays: false,
  israel: false,
}

const mountedPickers: ReturnType<typeof ParshaPicker>[] = []
let compactLibrarySupported = false

beforeEach(() => {
  vi.spyOn(window, 'matchMedia')
  compactLibrarySupported = false
  setHoverFlyoutSupport(true)
})

function setHoverFlyoutSupport(supported: boolean) {
  vi.mocked(window.matchMedia).mockImplementation(
    (query) =>
      ({
        matches: query === '(max-width: 550px)'
          ? compactLibrarySupported
          : supported,
        media: query,
        onchange: null,
        addEventListener() {},
        removeEventListener() {},
        addListener() {},
        removeListener() {},
        dispatchEvent: () => true,
      }) as MediaQueryList
  )
}

function setCompactLibrarySupport(supported: boolean) {
  compactLibrarySupported = supported
  setHoverFlyoutSupport(false)
}

afterEach(() => {
  for (const picker of mountedPickers.splice(0)) picker.destroy()
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

test('keeps nested flyouts open while moving backward and closes outside', () => {
  const picker = mountPicker()
  const trigger = findDoublePortionTrigger(picker)

  trigger.dispatchEvent(
    new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' })
  )
  const popup = document.querySelector<HTMLElement>(
    '.aliyah-selection-popup:not(.mod-submenu)'
  )!
  expect(popup.querySelector('.aliyah-selection-heading')?.textContent).toBe(
    'ויקהל־פקודי'
  )
  const group = popup.querySelector<HTMLElement>(
    '.aliyah-selection-option.mod-group'
  )!
  group.dispatchEvent(
    new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' })
  )
  const submenu = document.querySelector<HTMLElement>(
    '.aliyah-selection-popup.mod-submenu'
  )!

  submenu.dispatchEvent(
    new PointerEvent('pointerleave', { relatedTarget: popup })
  )
  expect(popup.isConnected).toBe(true)
  expect(submenu.isConnected).toBe(true)

  popup.dispatchEvent(
    new PointerEvent('pointerleave', { relatedTarget: trigger })
  )
  expect(popup.isConnected).toBe(true)
  expect(submenu.isConnected).toBe(true)

  document.body.dispatchEvent(
    new PointerEvent('pointerdown', { bubbles: true })
  )
  expect(popup.isConnected).toBe(false)
  expect(submenu.isConnected).toBe(false)
})

test('opens a nested aliyah flyout for a double portion', () => {
  const picker = mountPicker()
  const trigger = findDoublePortionTrigger(picker)

  trigger.dispatchEvent(
    new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' })
  )
  const group = document.querySelector<HTMLElement>(
    '.aliyah-selection-option.mod-group'
  )
  if (!group) throw new Error('Expected an aliyah group')

  group.dispatchEvent(
    new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' })
  )

  expect(
    document.querySelectorAll(
      '.aliyah-selection-popup.mod-submenu .aliyah-selection-option'
    )
  ).toHaveLength(8)
  expect(document.querySelector('[role="menu"]')).toBeNull()
  expect(document.querySelector('[role="menuitem"]')).toBeNull()
  expect(trigger.hasAttribute('aria-haspopup')).toBe(false)
  expect(document.querySelectorAll('.aliyah-selection-stack')).toHaveLength(1)
  expect(
    document.querySelectorAll('.aliyah-selection-stack .aliyah-selection-popup')
  ).toHaveLength(2)
})

test('replaces the open child submenu without closing its parent', () => {
  const picker = mountPicker()
  const trigger = findDoublePortionTrigger(picker)

  trigger.dispatchEvent(
    new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' })
  )
  const popup = document.querySelector<HTMLElement>(
    '.aliyah-selection-popup:not(.mod-submenu)'
  )!
  const groups = popup.querySelectorAll<HTMLElement>(
    '.aliyah-selection-option.mod-group'
  )
  expect(groups.length).toBeGreaterThan(1)

  groups[0].dispatchEvent(
    new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' })
  )
  const firstSubmenu = document.querySelector<HTMLElement>(
    '.aliyah-selection-popup.mod-submenu'
  )!

  groups[1].dispatchEvent(
    new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' })
  )
  const secondSubmenu = document.querySelector<HTMLElement>(
    '.aliyah-selection-popup.mod-submenu'
  )!

  expect(popup.isConnected).toBe(true)
  expect(document.querySelectorAll('.aliyah-selection-popup.mod-submenu')).toHaveLength(1)
  expect(firstSubmenu.isConnected).toBe(false)
  expect(secondSubmenu).not.toBe(firstSubmenu)
  expect(groups[0].getAttribute('aria-expanded')).toBe('false')
  expect(groups[1].getAttribute('aria-expanded')).toBe('true')
})

test('returns from a narrow-screen aliyah subview with the Back button', () => {
  setHoverFlyoutSupport(false)
  const picker = mountPicker()
  const trigger = findDoublePortionTrigger(picker)

  trigger.click()
  const popup = document.querySelector<HTMLElement>('.aliyah-selection-popup')!
  const firstGroup = popup.querySelector<HTMLElement>(
    '.aliyah-selection-option.mod-group'
  )!
  firstGroup.click()

  const backButton = popup.querySelector<HTMLButtonElement>(
    '[data-aliyah-subview-back]'
  )
  expect(backButton?.textContent).toContain('Back')
  expect(popup.querySelector('.aliyah-selection-option.mod-group')).toBeNull()

  backButton?.click()

  const restoredGroup = popup.querySelector<HTMLElement>(
    '[data-choice-group-index="0"]'
  )
  expect(popup.querySelector('[data-aliyah-subview-back]')).toBeNull()
  expect(restoredGroup).toBe(document.activeElement)
})

test('renders and changes the Israel calendar setting', () => {
  const onCalendarSettingsChange = vi.fn()
  const picker = mountPicker({ onCalendarSettingsChange })
  const toggle = picker.querySelector<HTMLInputElement>(
    '[data-target-id="calendar-israel-toggle"]'
  )
  if (!toggle) throw new Error('Expected the Israel calendar toggle')

  expect(toggle.checked).toBe(false)
  toggle.checked = true
  toggle.dispatchEvent(new Event('change', { bubbles: true }))

  expect(onCalendarSettingsChange).toHaveBeenCalledWith({ israel: true })
})

test('opens a parsha at its beginning while its chevron owns aliyah choices', () => {
  const navigate = vi.fn()
  const picker = mountPicker({ navigate })
  const link = [...picker.querySelectorAll<HTMLAnchorElement>('.parsha')]
    .find((candidate) => candidate.textContent?.trim() === 'ויקהל־פקודי')
  if (!link) throw new Error('Expected a double-portion link')

  link.click()

  expect(navigate).toHaveBeenCalledOnce()
  expect(navigate).toHaveBeenCalledWith(link.getAttribute('href'))
  expect(document.querySelector('.aliyah-selection-popup')).toBeNull()

  findDoublePortionTrigger(picker).click()
  expect(document.querySelector('.aliyah-selection-popup')).not.toBeNull()
})

test('uses mobile Library depth without a Go button', async () => {
  setCompactLibrarySupport(true)
  const navigate = vi.fn()
  const picker = mountPicker({
    navigate,
    getActions: () => [
      createNavigationAction({
        id: 'resume.last-reading',
        group: 'resume',
        label: 'Resume Vayeitzei, 6th Aliyah',
        href: '#/torah/parsha/vayeitzei/1-31-17',
        run: vi.fn(),
      }),
    ],
  })

  expect(picker.querySelector('.mobile-library-header h1')?.textContent).toBe(
    'Library'
  )
  expect(picker.querySelectorAll('[data-mobile-book]')).toHaveLength(5)
  expect(
    picker.querySelector('[data-mobile-destination="continue"]')?.textContent
  ).toContain('Vayeitzei, 6th Aliyah')
  expect(picker.textContent).toContain('Coming Up')
  expect(picker.textContent).toContain('Holidays')
  expect(picker.textContent).toContain('Megillot')
  expect(picker.textContent).toContain('Torah Reference')
  expect(picker.textContent).toContain('Calendar')

  requiredButton(picker, '[data-mobile-book="3"]').click()
  await tick()
  expect(requiredButton(picker, '.mobile-library-back').textContent).toContain(
    'Books'
  )
  const aliyahToggle = picker.querySelector<HTMLButtonElement>(
    'button[aria-label^="Choose aliyah for תזריע"]'
  )
  if (!aliyahToggle) throw new Error('Expected a mobile double-parsha toggle')
  aliyahToggle.click()
  await tick()
  expect(aliyahToggle.getAttribute('aria-expanded')).toBe('true')
  expect(picker.querySelectorAll('.mobile-aliyah-groups button')).toHaveLength(3)
  expect(picker.querySelectorAll('.mobile-aliyah-links a').length).toBeGreaterThan(6)

  requiredButton(picker, '.mobile-library-back').click()
  await tick()
  requiredButton(picker, '[data-mobile-destination="reference"]').click()
  await tick()
  requiredButton(picker, '[data-mobile-reference-book="1"]').click()
  await tick()
  requiredButton(picker, '[data-mobile-reference-chapter="1"]').click()
  await tick()
  const verse = picker.querySelector<HTMLAnchorElement>(
    '[data-mobile-reference-verse="1"]'
  )
  if (!verse) throw new Error('Expected verse 1 destination')
  verse.click()

  expect(navigate).toHaveBeenLastCalledWith('#/r/1-1-1')
  expect(picker.querySelector('.torah-reference-button')).toBeNull()
})

test('opens and returns from a mobile book with a pointer-only spatial transition', async () => {
  setCompactLibrarySupport(true)
  const picker = mountPicker()
  const book = requiredButton(picker, '[data-mobile-book="2"]')

  if (typeof document.startViewTransition !== 'function') {
    book.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
    await tick()
    expect(picker.querySelector('.mobile-library-header h1')?.textContent).toBe(
      'Shemot'
    )
    expect(
      requiredButton(picker, '.mobile-library-back').getAttribute('aria-label')
    ).toBe('Back to Books')
    return
  }

  const startViewTransition = vi.spyOn(document, 'startViewTransition')
  book.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
  const forward = startViewTransition.mock.results[0]?.value
  expect(
    picker
      .querySelector('.parsha-picker')
      ?.classList.contains('mod-mobile-page-transition')
  ).toBe(true)
  expect(document.documentElement.dataset.mobileLibraryTransition).toBe(
    'forward'
  )
  await forward?.updateCallbackDone

  expect(startViewTransition).toHaveBeenCalledOnce()
  expect(picker.querySelector('.mobile-library-header h1')?.textContent).toBe(
    'Shemot'
  )
  expect(
    requiredButton(picker, '.mobile-library-back').getAttribute('aria-label')
  ).toBe('Back to Books')

  requiredButton(picker, '.mobile-library-back').dispatchEvent(
    new MouseEvent('click', { bubbles: true, detail: 1 })
  )
  const backward = startViewTransition.mock.results[1]?.value
  expect(document.documentElement.dataset.mobileLibraryTransition).toBe('back')
  await backward?.updateCallbackDone
  await backward?.finished
  await tick()

  expect(startViewTransition).toHaveBeenCalledTimes(2)
  expect(picker.querySelector('.mobile-library-header h1')?.textContent).toBe(
    'Library'
  )
  expect(picker.querySelector('[data-mobile-book="2"]')).toBe(
    document.activeElement
  )
  expect(
    picker
      .querySelector('.parsha-picker')
      ?.classList.contains('mod-mobile-page-transition')
  ).toBe(false)
  expect(document.documentElement.dataset.mobileLibraryTransition).toBeUndefined()

  const callsBeforeKeyboard = startViewTransition.mock.calls.length
  requiredButton(picker, '[data-mobile-book="2"]').click()
  await tick()
  expect(startViewTransition).toHaveBeenCalledTimes(callsBeforeKeyboard)
})

test('keeps Quick Access closed until the unified search receives focus', () => {
  const picker = mountPicker({
    getActions: () => [
      createNavigationAction({
        id: 'tools.settings',
        group: 'tools',
        label: 'Reader Settings',
        emptyPriority: 10,
        run: vi.fn(),
      }),
    ],
  })
  const input = picker.querySelector<HTMLInputElement>('.search-input')!

  expect(document.activeElement).not.toBe(input)
  expect(picker.querySelector('[data-target-id="reader-search-results"]')).toBeNull()
  expect(input.getAttribute('aria-expanded')).toBe('false')

  input.focus()
  expect(picker.querySelector('.reader-search-context')?.textContent).toContain(
    'Quick access'
  )
  expect(input.getAttribute('aria-expanded')).toBe('true')

  const result = picker.querySelector<HTMLButtonElement>('[data-action-id]')!
  result.focus()
  expect(picker.querySelector('[data-target-id="reader-search-results"]')).not.toBeNull()

  const outside = document.createElement('button')
  document.body.appendChild(outside)
  outside.focus()
  expect(picker.querySelector('[data-target-id="reader-search-results"]')).toBeNull()
  expect(input.getAttribute('aria-expanded')).toBe('false')

  input.focus()
  expect(picker.querySelector('.reader-search-context')?.textContent).toContain(
    'Quick access'
  )
})

test('Cmd-K follows Escape by clearing before requesting the picker close', () => {
  const requestClose = vi.fn()
  const picker = mountPicker({ requestClose })
  const input = picker.querySelector<HTMLInputElement>('.search-input')!

  input.focus()
  inputValue(input, 'Noach')
  input.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true })
  )
  expect(input.value).toBe('')
  expect(requestClose).not.toHaveBeenCalled()

  input.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true })
  )
  expect(requestClose).toHaveBeenCalledOnce()
})

test('adds TOC entrance motion only when the opener requests it', () => {
  const instantPicker = mountPicker()
  const animatedPicker = mountPicker({ animateOnOpen: true })

  expect(instantPicker.querySelector('.parsha-picker')?.classList).not.toContain(
    'mod-animate-open'
  )
  expect(animatedPicker.querySelector('.parsha-picker')?.classList).toContain(
    'mod-animate-open'
  )
})

test('search keyboard selection does not reuse a cleared result', () => {
  const navigate = vi.fn()
  const picker = mountPicker({ navigate })
  const input = picker.querySelector<HTMLInputElement>('.search-input')
  if (!input) throw new Error('Expected the parsha search input')

  inputValue(input, 'beresheet')
  input.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
  )
  expect(navigate).toHaveBeenCalledOnce()

  inputValue(input, '')
  input.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
  )
  expect(navigate).toHaveBeenCalledOnce()
})

test('shows alias context and navigates structured search results', () => {
  const navigate = vi.fn()
  const picker = mountPicker({ navigate })
  const input = picker.querySelector<HTMLInputElement>('.search-input')
  if (!input) throw new Error('Expected the parsha search input')

  expect(input.getAttribute('aria-label')).toBe('Search readings and commands')
  inputValue(input, 'beresheet')
  expect(
    picker
      .querySelector('.search-result-alias')
      ?.textContent?.replace(/\s+/g, '')
  ).toBe('Matched:beresheet')

  inputValue(input, 'Noach 3')
  const result = picker.querySelector<HTMLElement>(
    '[data-result-source="reading"]'
  )
  expect(
    result?.querySelector('.reader-search-label')?.textContent?.trim()
  ).toBe('Parshat Noach')
  expect(
    result?.querySelector('.reader-search-secondary')?.textContent?.trim()
  ).toBe('Aliyah 3 · נח')
  expect(result?.textContent).not.toMatch(/shacharit|שחרית/i)
  input.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
  )
  expect(navigate).toHaveBeenLastCalledWith(
    '#/torah/parsha/noach/1-7-17'
  )

  inputValue(input, 'Genesis 6:9')
  input.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
  )
  expect(navigate).toHaveBeenLastCalledWith('#/r/1-6-9')
})

test('inherits command behavior and keeps the Cmd-K hint in the search bar', () => {
  const runSettings = vi.fn()
  const picker = mountPicker({
    getActions: () => [
      createNavigationAction({
        id: 'tools.settings',
        group: 'tools',
        label: 'Reader Settings',
        aliases: ['Preferences'],
        run: runSettings,
      }),
    ],
  })
  const input = picker.querySelector<HTMLInputElement>('.search-input')
  if (!input) throw new Error('Expected the unified search input')

  expect(picker.querySelector('.reader-search-shortcut')?.textContent).toBe('⌘K')
  inputValue(input, 'preferences')
  expect(picker.querySelector('[data-action-id="tools.settings"]')).not.toBeNull()
  expect(picker.querySelector('.reader-search-alias strong')?.textContent).toBeTruthy()
  input.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
  )
  expect(runSettings).toHaveBeenCalledOnce()
})

test('tears down search interaction with the picker', () => {
  const navigate = vi.fn()
  const picker = mountPicker({ navigate })
  const input = picker.querySelector<HTMLInputElement>('.search-input')
  if (!input) throw new Error('Expected the parsha search input')
  const mounted = mountedPickers.pop()
  if (!mounted) throw new Error('Expected a mounted picker')

  mounted.destroy()
  inputValue(input, 'Noach 3')
  input.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
  )

  expect(input.isConnected).toBe(false)
  expect(navigate).not.toHaveBeenCalled()
})

test('empty search results tolerate keyboard navigation', () => {
  const navigate = vi.fn()
  const picker = mountPicker({ navigate })
  const input = picker.querySelector<HTMLInputElement>('.search-input')
  if (!input) throw new Error('Expected the parsha search')

  inputValue(input, 'not-a-real-reading-name')
  for (const key of ['ArrowDown', 'ArrowUp', 'Enter']) {
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true })
    )
  }

  expect(navigate).not.toHaveBeenCalled()
  expect(
    picker.querySelectorAll('[data-target-class="list-item"]')
  ).toHaveLength(0)
})

function findDoublePortionTrigger(picker: Element) {
  const trigger = [...picker.querySelectorAll<HTMLElement>('[data-aliyah-choice-id]')]
    .find(
      (candidate) =>
        candidate.getAttribute('aria-label') ===
        'Choose aliyah for ויקהל־פקודי'
    )
  if (!trigger) throw new Error('Expected a double-portion trigger')
  return trigger
}

function requiredButton(root: Element, selector: string) {
  const button = root.querySelector<HTMLButtonElement>(selector)
  if (!button) throw new Error(`Expected button ${selector}`)
  return button
}

function inputValue(input: HTMLInputElement, value: string) {
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function mountPicker({
  navigate = vi.fn(),
  onCalendarSettingsChange = vi.fn(),
  getActions = () => [],
  animateOnOpen = false,
  requestClose = vi.fn(),
}: {
  navigate?: (hash: string) => void
  onCalendarSettingsChange?: (settings: { israel: boolean }) => void
  getActions?: () => NavigationAction[]
  animateOnOpen?: boolean
  requestClose?: () => void
} = {}) {
  const generator = new LeiningGenerator(testSettings)
  const mounted = ParshaPicker(generator, {
    calendarSettings: { israel: false },
    onCalendarSettingsChange,
    navigate,
    getActions,
    animateOnOpen,
    requestClose,
  })
  mountedPickers.push(mounted)
  document.body.appendChild(mounted.node)
  mounted.onMount()
  return mounted.node
}
