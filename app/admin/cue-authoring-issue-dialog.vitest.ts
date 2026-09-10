import { afterEach, expect, test, vi } from 'vitest'
import { flushSync } from 'svelte'
import { createMount } from '../lifecycle/mount.ts'
import { createRecordingIssue } from '../audio/recording-issues.ts'
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

test('loads an existing issue for editing and offers removal', () => {
  const save = vi.fn(() => true)
  const remove = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true)
  const { dialog } = mountDialog(save, remove)
  const issue = createRecordingIssue({
    audioId: 'test', tokenKey: '1:0:0:0', kind: 'other', note: 'Saved note',
    visibility: 'authoringOnly', severity: 'low', createdAt: 1, tokenizationVersion: 'v2',
  })
  dialog.open({ issues: [issue], wordLabel: 'Word one' })
  expect(document.activeElement).toBe(fixture!.querySelector('[role="dialog"]'))
  expect(fixture!.querySelector('[data-issue-kind="mistaken-pronunciation"]')?.getAttribute('aria-pressed')).toBe('false')
  const note = fixture!.querySelector<HTMLInputElement>('[data-target-id="recording-issue-note"]')!
  expect(note.value).toBe('Saved note')
  expect(fixture!.querySelector('[data-issue-kind="other"]')?.getAttribute('aria-pressed')).toBe('true')
  expect(fixture!.querySelector<HTMLInputElement>('[data-target-id="recording-issue-reader-visible"]')!.checked).toBe(false)
  note.value = 'Updated note'
  note.dispatchEvent(new InputEvent('input', { bubbles: true }))
  fixture!.querySelector<HTMLButtonElement>('[data-target-id="recording-issue-save"]')!.click()
  expect(save).toHaveBeenCalledWith({ issueId: issue.id, kind: 'other', note: 'Updated note', readerVisible: false })
  dialog.open({ issues: [issue] })
  const removeButton = fixture!.querySelector<HTMLButtonElement>('[data-target-id="recording-issue-remove"]')!
  removeButton.click()
  expect(dialog.isOpen()).toBe(true)
  flushSync()
  expect(fixture!.querySelector('[role="alert"]')?.textContent).toContain('could not be removed')
  removeButton.click()
  expect(remove).toHaveBeenLastCalledWith(issue.id)
  expect(dialog.isOpen()).toBe(false)
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
  expect(fixture!.querySelector<HTMLButtonElement>('[data-target-id="recording-issue-save"]')!.disabled).toBe(true)
  expect(fixture!.querySelector('.settings-field-helper')!.textContent?.trim())
    .toMatch(/^\(Use only.*should know\.\)$/s)
  const modal = fixture!.querySelector<HTMLElement>(
    '[data-target-id="recording-issue-modal"]'
  )!
  modal.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
  expect(dialog.isOpen()).toBe(false)
  expect(closed).toHaveBeenCalledTimes(2)
})
