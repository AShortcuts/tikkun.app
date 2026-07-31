import { afterEach, expect, test, vi } from 'vitest'
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

function mountDialog(save: (input: CueAuthoringIssueInput) => boolean) {
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
  expect(document.activeElement).toBe(firstIssue)

  const note = fixture!.querySelector<HTMLInputElement>(
    '[data-target-id="recording-issue-note"]'
  )!
  note.value = '  pronunciation differs  '
  note.dispatchEvent(new InputEvent('input', { bubbles: true }))
  const readerVisible = fixture!.querySelector<HTMLInputElement>(
    '[data-target-id="recording-issue-reader-visible"]'
  )!
  readerVisible.click()

  firstIssue.click()
  expect(save).toHaveBeenLastCalledWith({
    kind: 'mistaken-pronunciation',
    note: 'pronunciation differs',
    readerVisible: false,
  })
  expect(dialog.isOpen()).toBe(true)
  expect(closed).not.toHaveBeenCalled()

  fixture!
    .querySelector<HTMLButtonElement>('[data-issue-kind="other"]')!
    .click()
  expect(dialog.isOpen()).toBe(false)
  expect(closed).toHaveBeenCalledOnce()
})

test('closes from its button and backdrop and resets the form on reopen', () => {
  const { closed, dialog } = mountDialog(() => true)
  dialog.open()

  const note = fixture!.querySelector<HTMLInputElement>(
    '[data-target-id="recording-issue-note"]'
  )!
  note.value = 'temporary'
  note.dispatchEvent(new InputEvent('input', { bubbles: true }))
  fixture!
    .querySelector<HTMLButtonElement>(
      '[data-target-id="recording-issue-close"]'
    )!
    .click()
  expect(dialog.isOpen()).toBe(false)

  dialog.open()
  expect(note.value).toBe('')
  const modal = fixture!.querySelector<HTMLElement>(
    '[data-target-id="recording-issue-modal"]'
  )!
  modal.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
  expect(dialog.isOpen()).toBe(false)
  expect(closed).toHaveBeenCalledTimes(2)
})
