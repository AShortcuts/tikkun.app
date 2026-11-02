import { afterEach, expect, test, vi } from 'vitest'
import { flushSync } from 'svelte'
import { createMount } from '../lifecycle/mount.ts'
import {
  createCueAuthoringIssueDialog,
  type CueAuthoringIssueDialog,
  type CueAuthoringIssueInput,
} from './cue-authoring-issue-dialog.ts'

let fixture: HTMLElement | null = null
let destroy: (() => void) | null = null

afterEach(() => {
  destroy?.()
  destroy = null
  fixture?.remove()
  fixture = null
  vi.restoreAllMocks()
})

function mountDialog(save: (input: CueAuthoringIssueInput) => boolean, remove: (id: string) => boolean = () => true) {
  fixture = document.createElement('div')
  fixture.innerHTML = '<div data-target-id="recording-issue-dialog-root"></div>'
  document.body.appendChild(fixture)
  const closed = vi.fn()
  let dialog!: CueAuthoringIssueDialog

  destroy = createMount()((scope) => {
    dialog = createCueAuthoringIssueDialog(scope, {
      document,
      issueKinds: [
        { kind: 'mistaken-pronunciation', label: 'Misread word' },
        { kind: 'other', label: 'Other note' },
      ],
      save,
      remove,
      closed,
    })
  })

  return { closed, dialog }
}

test('owns form state and stays open when TypeScript rejects a save', () => {
  const save = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true)
  const { closed, dialog } = mountDialog(save)

  dialog.open()
  const firstIssue = fixture!.querySelector<HTMLButtonElement>(
    '[data-issue-kind="mistaken-pronunciation"]'
  )!
  expect(document.activeElement).toBe(fixture!.querySelector('[role="dialog"]'))
  expect(firstIssue.getAttribute('aria-pressed')).toBe('false')
  const saveButton = fixture!.querySelector<HTMLButtonElement>('[data-target-id="recording-issue-save"]')!
  expect(saveButton.disabled).toBe(true)

  const note = fixture!.querySelector<HTMLInputElement>(
    '[data-target-id="recording-issue-note"]'
  )!
  note.value = '  pronunciation differs  '
  note.dispatchEvent(new InputEvent('input', { bubbles: true }))
  const readerVisible = fixture!.querySelector<HTMLInputElement>(
    '[data-target-id="recording-issue-reader-visible"]'
  )!
  readerVisible.click()

  flushSync(() => firstIssue.click())
  expect(firstIssue.getAttribute('aria-pressed')).toBe('true')
  expect(saveButton.disabled).toBe(false)
  expect(save).not.toHaveBeenCalled()
  saveButton.click()
  expect(save).toHaveBeenLastCalledWith({
    kind: 'mistaken-pronunciation',
    note: 'pronunciation differs',
    readerVisible: false,
  })
  expect(dialog.isOpen()).toBe(true)
  flushSync()
  expect(fixture!.querySelector('[role="alert"]')?.textContent).toContain('could not be saved')
  expect(closed).not.toHaveBeenCalled()

  flushSync(() => fixture!
    .querySelector<HTMLButtonElement>('[data-issue-kind="other"]')!
    .click())
  expect(save).toHaveBeenCalledTimes(1)
  saveButton.click()
  expect(dialog.isOpen()).toBe(false)
  expect(closed).toHaveBeenCalledOnce()
})
