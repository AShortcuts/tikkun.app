import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { LeiningGenerator } from '../calendar-model/generator.ts'
import type { UserSettings } from '../calendar-model/user-settings.ts'
import ParshaPicker from './ParshaPicker.ts'

const testSettings: UserSettings = {
  ashkenazi: true,
  includeModernHolidays: false,
  israel: false,
}

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

function findDoublePortionTrigger(picker: Element) {
  const trigger = [...picker.querySelectorAll<HTMLElement>('[data-aliyah-choice-id]')]
    .find((candidate) => candidate.textContent?.trim() === 'ויקהל־פקודי')
  if (!trigger) throw new Error('Expected a double-portion trigger')
  return trigger
}

function mountPicker() {
  const generator = new LeiningGenerator(testSettings)
  const picker = ParshaPicker(generator, {
    calendarSettings: { israel: false },
    onCalendarSettingsChange() {},
  }).node
  document.body.appendChild(picker)
  return picker
}
