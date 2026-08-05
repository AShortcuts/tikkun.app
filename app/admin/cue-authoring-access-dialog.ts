import { flushSync, mount, unmount } from 'svelte'
import type { MountScope } from '../lifecycle/mount.ts'
import CueAuthoringAccessDialogView from './CueAuthoringAccessDialog.svelte'

export interface CueAuthoringAccessDialog {
  open(): void
  close(): void
  isOpen(): boolean
}

export interface CueAuthoringAccessDialogOptions {
  document: Document
  submit(candidate: string): boolean
}

export interface CueAuthoringAccessDialogComponentProps
  extends CueAuthoringAccessDialogOptions {
  connect(dialog: CueAuthoringAccessDialog): void
}

export function createCueAuthoringAccessDialog(
  scope: MountScope,
  options: CueAuthoringAccessDialogOptions
): CueAuthoringAccessDialog {
  const target = options.document.querySelector<HTMLElement>(
    '[data-target-id="cue-authoring-access-dialog-root"]'
  )
  if (!target) {
    throw new Error('Cue Authoring Access Dialog requires its mount root')
  }
  if (target.childNodes.length) {
    throw new Error('Cue Authoring Access Dialog requires an empty mount root')
  }

  let dialog: CueAuthoringAccessDialog | null = null
  const component = mount(CueAuthoringAccessDialogView, {
    target,
    props: {
      document: options.document,
      submit: options.submit,
      connect: (connectedDialog: CueAuthoringAccessDialog) => {
        dialog = connectedDialog
      },
    },
  })
  flushSync()

  const connectedDialog = dialog
  if (!connectedDialog) {
    void unmount(component)
    throw new Error(
      'Cue Authoring Access Dialog did not connect its component interface'
    )
  }

  scope.own(() => {
    void unmount(component).catch((error: unknown) => {
      console.error('Failed to unmount Cue Authoring Access Dialog', error)
    })
  })

  return connectedDialog
}
