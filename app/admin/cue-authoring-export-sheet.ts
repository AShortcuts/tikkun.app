import { flushSync, mount, unmount } from 'svelte'
import type { MountScope } from '../lifecycle/mount.ts'
import CueAuthoringExportSheetView from './CueAuthoringExportSheet.svelte'

export interface CueAuthoringExportDownload {
  href: string
  fileName: string
}

export interface CueAuthoringAudioExportDownload
  extends CueAuthoringExportDownload {
  statusText: string
}

export interface CueAuthoringExportSheetContent {
  cueDownload: CueAuthoringExportDownload
  audioDownload: CueAuthoringAudioExportDownload | null
  targetPath: string
  serialized: string
}

export interface CueAuthoringExportSheet {
  open(content: CueAuthoringExportSheetContent): void
  setCopyStatus(message: string): void
  clearDownloads(): void
  close(): void
}

export interface CueAuthoringExportSheetOptions {
  document: Document
  view: Window
  closeRequested(): void
}

export interface CueAuthoringExportSheetComponentProps
  extends Omit<CueAuthoringExportSheetOptions, 'document'> {
  connect(sheet: CueAuthoringExportSheet): void
}

export function createCueAuthoringExportSheet(
  scope: MountScope,
  options: CueAuthoringExportSheetOptions
): CueAuthoringExportSheet {
  const target = options.document.querySelector<HTMLElement>(
    '[data-target-id="cue-authoring-export-sheet-root"]'
  )
  if (!target) {
    throw new Error('Cue Authoring Export Sheet requires its mount root')
  }
  if (target.childNodes.length) {
    throw new Error('Cue Authoring Export Sheet requires an empty mount root')
  }

  let sheet: CueAuthoringExportSheet | null = null
  const component = mount(CueAuthoringExportSheetView, {
    target,
    props: {
      view: options.view,
      closeRequested: options.closeRequested,
      connect: (connectedSheet: CueAuthoringExportSheet) => {
        sheet = connectedSheet
      },
    },
  })
  flushSync()

  const connectedSheet = sheet
  if (!connectedSheet) {
    void unmount(component)
    throw new Error('Cue Authoring Export Sheet did not connect its interface')
  }

  scope.own(() => {
    void unmount(component).catch((error: unknown) => {
      console.error('Failed to unmount Cue Authoring Export Sheet', error)
    })
  })

  return connectedSheet
}
