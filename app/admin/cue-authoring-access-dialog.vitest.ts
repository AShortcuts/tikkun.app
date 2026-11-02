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

function enterUnlockCode(value: string) {
  const input = required<HTMLInputElement>(
    '[data-target-id="admin-access-password"]'
  )
  input.value = value
  input.dispatchEvent(new InputEvent('input', { bubbles: true }))
  return input
}

test('presents an honest local gate and clears the code after success', () => {
  const submit = vi.fn((candidate: string) => candidate === 'admin')
  const dialog = mountDialog(submit)
  const returnFocus = required<HTMLButtonElement>(
    '[data-target-id="return-focus"]'
  )
  returnFocus.focus()

  dialog.open()
  expect(required('[data-target-id="admin-access-dialog"]').textContent).toContain(
    'local unlock code'
  )
  const input = enterUnlockCode('wrong')
  expect(document.activeElement).toBe(input)
  required<HTMLButtonElement>('[data-target-id="admin-access-submit"]').click()

  expect(submit).toHaveBeenLastCalledWith('wrong')
  expect(dialog.isOpen()).toBe(true)
  expect(input.getAttribute('aria-invalid')).toBe('true')
  expect(
    required('[data-target-id="admin-access-error"]').textContent
  ).toContain("unlock code isn't correct")
  expect(document.activeElement).toBe(input)

  enterUnlockCode('admin')
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
