import { flushSync, mount, unmount } from 'svelte'
import type { RecordingIssueKind } from '../audio/recording-issues.ts'
import type { MountScope } from '../lifecycle/mount.ts'
import CueAuthoringIssueDialogView from './CueAuthoringIssueDialog.svelte'

export interface CueAuthoringIssueKindOption {
  kind: RecordingIssueKind
  label: string
}

export interface CueAuthoringIssueInput {
  kind: RecordingIssueKind
  note?: string
  readerVisible: boolean
}

export interface CueAuthoringIssueDialog {
  open(): void
  close(): void
  isOpen(): boolean
}

export interface CueAuthoringIssueDialogOptions {
  document: Document
  issueKinds: readonly CueAuthoringIssueKindOption[]
  save(input: CueAuthoringIssueInput): boolean
  closed(): void
}

export interface CueAuthoringIssueDialogComponentProps
  extends Omit<CueAuthoringIssueDialogOptions, 'document'> {
  connect(dialog: CueAuthoringIssueDialog): void
}

export function createCueAuthoringIssueDialog(
  scope: MountScope,
  options: CueAuthoringIssueDialogOptions
): CueAuthoringIssueDialog {
  const target = options.document.querySelector<HTMLElement>(
    '[data-target-id="recording-issue-dialog-root"]'
  )
  if (!target) {
    throw new Error('Cue Authoring Issue Dialog requires its mount root')
  }
  if (target.childNodes.length) {
    throw new Error('Cue Authoring Issue Dialog requires an empty mount root')
  }

  let dialog: CueAuthoringIssueDialog | null = null
  const component = mount(CueAuthoringIssueDialogView, {
    target,
    props: {
      issueKinds: options.issueKinds,
      save: options.save,
      closed: options.closed,
      connect: (connectedDialog: CueAuthoringIssueDialog) => {
        dialog = connectedDialog
      },
    },
  })
  flushSync()

  const connectedDialog = dialog
  if (!connectedDialog) {
    void unmount(component)
    throw new Error(
      'Cue Authoring Issue Dialog did not connect its component interface'
    )
  }

  scope.own(() => {
    void unmount(component).catch((error: unknown) => {
      console.error('Failed to unmount Cue Authoring Issue Dialog', error)
    })
  })

  return connectedDialog
}
