import { flushSync, mount, unmount } from 'svelte'
import type { MountScope } from '../lifecycle/mount.ts'
import CueAuthoringPanelView from './CueAuthoringPanel.svelte'

export type CueAuthoringPanelAction =
  | { type: 'close' }
  | { type: 'retry-cue-data' }
  | { type: 'export-unsaved-draft' }
  | { type: 'capture-audio'; requested: boolean }
  | { type: 'record' }
  | { type: 'step-back' }
  | { type: 'undo' }
  | { type: 'mark-issue' }
  | { type: 'reset' }
  | { type: 'resume' }
  | { type: 'export' }
  | { type: 'import'; file: File }

export type CueAuthoringCaptureTone =
  | 'normal'
  | 'error'
  | 'confirm'
  | 'recording'

export type CueAuthoringRecordMode =
  | 'idle'
  | 'timing'
  | 'audio'
  | 'confirm'

export interface CueAuthoringPanelProblem {
  id: string
  tone: 'warning' | 'error'
  title: string
  message: string
  details: string[]
  action: {
    type: 'retry-cue-data' | 'export-unsaved-draft'
    label: string
    pendingLabel: string
    pending: boolean
  } | null
}

export interface CueAuthoringPanelSnapshot {
  visible: boolean
  cueCountText: string
  statusText: string
  problems: CueAuthoringPanelProblem[]
  draftStatusText: string
  syncNoteVisible: boolean
  captureAudio: {
    requested: boolean
    disabled: boolean
    statusText: string
    tone: CueAuthoringCaptureTone
  }
  record: {
    disabled: boolean
    mode: CueAuthoringRecordMode
  }
  canStepBack: boolean
  canUndo: boolean
  canMarkIssue: boolean
  canReset: boolean
  canExport: boolean
  canImport?: boolean
  exportChanged: boolean
  resumeWord: number | null
}

export interface CueAuthoringPanelProgress {
  wordLabel: string
  durationLabel: string
  audioRatio: number
  cueRatio: number
}

export interface CueAuthoringPanel {
  sync(snapshot: CueAuthoringPanelSnapshot): void
  syncProgress(progress: CueAuthoringPanelProgress): void
}

export interface CueAuthoringPanelOptions {
  document: Document
  action(action: CueAuthoringPanelAction): void
}

export interface CueAuthoringPanelComponentProps
  extends Omit<CueAuthoringPanelOptions, 'document'> {
  connect(panel: CueAuthoringPanel): void
}

export function createCueAuthoringPanel(
  scope: MountScope,
  options: CueAuthoringPanelOptions
): CueAuthoringPanel {
  const target = options.document.querySelector<HTMLElement>(
    '[data-target-id="cue-authoring-panel-root"]'
  )
  if (!target) {
    throw new Error('Cue Authoring Panel requires its mount root')
  }
  if (target.childNodes.length) {
    throw new Error('Cue Authoring Panel requires an empty mount root')
  }

  let panel: CueAuthoringPanel | null = null
  const component = mount(CueAuthoringPanelView, {
    target,
    props: {
      action: options.action,
      connect: (connectedPanel: CueAuthoringPanel) => {
        panel = connectedPanel
      },
    },
  })
  flushSync()

  const connectedPanel = panel
  if (!connectedPanel) {
    void unmount(component)
    throw new Error('Cue Authoring Panel did not connect its interface')
  }

  scope.own(() => {
    void unmount(component).catch((error: unknown) => {
      console.error('Failed to unmount Cue Authoring Panel', error)
    })
  })

  return connectedPanel
}
