import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import '../../css/master.css'

import { LeiningGenerator } from '../calendar-model/generator.ts'
import type { UserSettings } from '../calendar-model/user-settings.ts'
import { type NavigationAction } from '../navigation/actions.ts'
import ParshaPicker from './ParshaPicker.ts'

const testSettings: UserSettings = {
  ashkenazi: true,
  includeModernHolidays: false,
  israel: false,
}

const mountedPickers: ReturnType<typeof ParshaPicker>[] = []
let compactLibrarySupported = false

beforeEach(() => {
  // Keep double-portion fixtures stable across Hebrew calendar years.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-02-01T12:00:00Z'))
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

afterEach(() => {
  for (const picker of mountedPickers.splice(0)) picker.destroy()
  document.body.replaceChildren()
  vi.restoreAllMocks()
  vi.useRealTimers()
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

test('shows alias context and navigates structured search results', () => {
  const navigate = vi.fn()
  const picker = mountPicker({ navigate })
  const input = picker.querySelector<HTMLInputElement>('.search-input')
  if (!input) throw new Error('Expected the parsha search input')

  expect(input.getAttribute('aria-label')).toBe('Search readings and settings')
  // "Beresheet" is the visible title; only an off-label alias shows "Matched:".
  inputValue(input, 'Bereshit')
  expect(
    picker
      .querySelector('.search-result-alias')
      ?.textContent?.replace(/\s+/g, '')
  ).toBe('Matched:bereshit')

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
  expect(navigate).toHaveBeenLastCalledWith('#/torah/1-6-9')
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
