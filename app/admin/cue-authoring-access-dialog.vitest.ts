import { afterEach, expect, test, vi } from 'vitest'
import { createMount } from '../lifecycle/mount.ts'
import {
  createCueAuthoringAccessDialog,
  type CueAuthoringAccessDialog,
} from './cue-authoring-access-dialog.ts'

let fixture: HTMLElement | null = null
let destroy: (() => void) | null = null

afterEach(() => {
  destroy?.()
  destroy = null
  fixture?.remove()
  fixture = null
  vi.restoreAllMocks()
})

function mountDialog(submit: (candidate: string) => boolean) {
  fixture = document.createElement('div')
  fixture.innerHTML = `
    <button data-target-id="return-focus" type="button">Open</button>
    <div data-target-id="cue-authoring-access-dialog-root"></div>
  `
  document.body.appendChild(fixture)
  let dialog!: CueAuthoringAccessDialog

  destroy = createMount()((scope) => {
    dialog = createCueAuthoringAccessDialog(scope, {
      document,
      submit,
    })
  })

  return dialog
}

function required<ElementType extends Element>(selector: string) {
  const element = fixture?.querySelector<ElementType>(selector)
  if (!element) throw new Error(`Missing test element: ${selector}`)
  return element
}

function enterPassword(value: string) {
  const input = required<HTMLInputElement>(
    '[data-target-id="admin-access-password"]'
  )
  input.value = value
  input.dispatchEvent(new InputEvent('input', { bubbles: true }))
  return input
}

test('keeps access locked after a rejected password and clears the secret after success', () => {
  const submit = vi.fn((candidate: string) => candidate === 'admin')
  const dialog = mountDialog(submit)
  const returnFocus = required<HTMLButtonElement>(
    '[data-target-id="return-focus"]'
  )
  returnFocus.focus()

  dialog.open()
  const input = enterPassword('wrong')
  expect(document.activeElement).toBe(input)
  required<HTMLButtonElement>('[data-target-id="admin-access-submit"]').click()

  expect(submit).toHaveBeenLastCalledWith('wrong')
  expect(dialog.isOpen()).toBe(true)
  expect(input.getAttribute('aria-invalid')).toBe('true')
  expect(
    required('[data-target-id="admin-access-error"]').textContent
  ).toContain("password isn't correct")
  expect(document.activeElement).toBe(input)

  enterPassword('admin')
  expect(input.getAttribute('aria-invalid')).toBe('false')
  expect(
    required('[data-target-id="admin-access-error"]').textContent
  ).toBe('')
  required<HTMLButtonElement>('[data-target-id="admin-access-submit"]').click()

  expect(submit).toHaveBeenLastCalledWith('admin')
  expect(dialog.isOpen()).toBe(false)
  expect(input.value).toBe('')
  expect(document.activeElement).toBe(returnFocus)
})

test('traps keyboard focus and supports Escape, Cancel, and backdrop dismissal', () => {
  const dialog = mountDialog(() => true)
  const returnFocus = required<HTMLButtonElement>(
    '[data-target-id="return-focus"]'
  )
  const modal = required<HTMLElement>('[data-target-id="admin-access-dialog"]')
  const input = required<HTMLInputElement>(
    '[data-target-id="admin-access-password"]'
  )
  const cancel = required<HTMLButtonElement>(
    '[data-target-id="admin-access-cancel"]'
  )
  returnFocus.focus()

  dialog.open()
  input.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    })
  )
  expect(document.activeElement).toBe(cancel)

  modal.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    })
  )
  expect(dialog.isOpen()).toBe(false)
  expect(document.activeElement).toBe(returnFocus)

  dialog.open()
  cancel.click()
  expect(dialog.isOpen()).toBe(false)

  dialog.open()
  modal.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
  expect(dialog.isOpen()).toBe(false)
})
