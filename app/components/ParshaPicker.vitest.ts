import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { LeiningGenerator } from '../calendar-model/generator.ts'
import type { UserSettings } from '../calendar-model/user-settings.ts'
import ParshaPicker from './ParshaPicker.ts'

const testSettings: UserSettings = {
  ashkenazi: true,
  includeModernHolidays: false,
  israel: false,
}

const mountedPickers: ReturnType<typeof ParshaPicker>[] = []

beforeEach(() => {
  vi.spyOn(window, 'matchMedia')
  setHoverFlyoutSupport(true)
})

function setHoverFlyoutSupport(supported: boolean) {
  vi.mocked(window.matchMedia).mockImplementation(
    (query) =>
      ({
        matches: supported,
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
  const trigger = [...picker.querySelectorAll<HTMLElement>('[data-aliyah-choice-id]')]
    .find((candidate) => candidate.textContent?.trim() === 'ויקהל־פקודי')
  if (!trigger) throw new Error('Expected a double-portion trigger')

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
      '.aliyah-selection-popup.mod-submenu [role="menuitem"]'
    )
  ).toHaveLength(8)
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
    .find((candidate) => candidate.textContent?.trim() === 'ויקהל־פקודי')
  if (!trigger) throw new Error('Expected a double-portion trigger')
  return trigger
}

function inputValue(input: HTMLInputElement, value: string) {
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function mountPicker({
  navigate = vi.fn(),
  onCalendarSettingsChange = vi.fn(),
}: {
  navigate?: (hash: string) => void
  onCalendarSettingsChange?: (settings: { israel: boolean }) => void
} = {}) {
  const generator = new LeiningGenerator(testSettings)
  const mounted = ParshaPicker(generator, {
    calendarSettings: { israel: false },
    onCalendarSettingsChange,
    navigate,
  })
  mountedPickers.push(mounted)
  document.body.appendChild(mounted.node)
  mounted.onMount()
  return mounted.node
}
