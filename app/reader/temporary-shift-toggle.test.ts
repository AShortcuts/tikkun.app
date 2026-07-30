import { expect, test, vi } from 'vitest'
import {
  createTemporaryShiftToggle,
  type ShiftHoldEvent,
} from './shortcuts.ts'

const event = (
  type: 'down' | 'up',
  overrides: Partial<ShiftHoldEvent> = {}
): ShiftHoldEvent => ({
  key: 'Shift',
  repeat: false,
  metaKey: false,
  ctrlKey: type === 'up',
  altKey: false,
  ...overrides,
})

test.each([true, false])(
  'restores an initial value of %s when Shift is released while Control is held',
  (initialValue) => {
    let value = initialValue
    const setValue = vi.fn((nextValue: boolean) => {
      value = nextValue
    })
    const toggle = createTemporaryShiftToggle({
      getValue: () => value,
      setValue,
      isDisabled: () => false,
    })

    toggle.handleKeyDown(event('down'))
    expect(value).toBe(!initialValue)

    toggle.handleKeyUp(event('up'))
    expect(value).toBe(initialValue)
    expect(setValue).toHaveBeenCalledTimes(2)
  }
)

test('does not start the temporary toggle when another modifier is already held', () => {
  const setValue = vi.fn()
  const toggle = createTemporaryShiftToggle({
    getValue: () => true,
    setValue,
    isDisabled: () => false,
  })

  toggle.handleKeyDown(event('down', { ctrlKey: true }))
  toggle.handleKeyUp(event('up'))

  expect(setValue).not.toHaveBeenCalled()
})
