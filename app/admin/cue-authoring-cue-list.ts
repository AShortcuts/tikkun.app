import { flushSync, mount, unmount } from 'svelte'
import type { MountScope } from '../lifecycle/mount.ts'
import CueAuthoringCueListView from './CueAuthoringCueList.svelte'

export interface CueAuthoringCueListItem {
  key: string
  tokenLabel: string
  timeStart: number
}

export type CueAuthoringCueListAction =
  | { type: 'select'; index: number }
  | { type: 'move'; delta: -1 | 1 }
  | { type: 'play' }
  | { type: 'trim' }
  | {
      type: 'nudge'
      seconds: -0.25 | -0.05 | 0.05 | 0.25
    }

export interface CueAuthoringCueListSnapshot {
  emptyMessage: string | null
  items: readonly CueAuthoringCueListItem[]
  selectedIndex: number
  currentIndex: number
  followIndex: number | null
}

export interface CueAuthoringCueList {
  sync(snapshot: CueAuthoringCueListSnapshot): void
  setCurrent(index: number): void
  focus(index: number): void
}

export interface CueAuthoringCueListOptions {
  document: Document
  view: Window
  formatTimestamp(seconds: number): string
  action(action: CueAuthoringCueListAction): void
}

export interface CueAuthoringCueListComponentProps
  extends Omit<CueAuthoringCueListOptions, 'document'> {
  connect(cueList: CueAuthoringCueList): void
}

export function createCueAuthoringCueList(
  scope: MountScope,
  options: CueAuthoringCueListOptions
): CueAuthoringCueList {
  const target = options.document.querySelector<HTMLElement>(
    '[data-target-id="admin-cue-list-root"]'
  )
  if (!target) {
    throw new Error('Cue Authoring Cue List requires its mount root')
  }
  if (target.childNodes.length) {
    throw new Error('Cue Authoring Cue List requires an empty mount root')
  }

  let cueList: CueAuthoringCueList | null = null
  const component = mount(CueAuthoringCueListView, {
    target,
    props: {
      view: options.view,
      formatTimestamp: options.formatTimestamp,
      action: options.action,
      connect: (connectedCueList: CueAuthoringCueList) => {
        cueList = connectedCueList
      },
    },
  })
  flushSync()

  const connectedCueList = cueList
  if (!connectedCueList) {
    void unmount(component)
    throw new Error(
      'Cue Authoring Cue List did not connect its component interface'
    )
  }

  scope.own(() => {
    void unmount(component).catch((error: unknown) => {
      console.error('Failed to unmount Cue Authoring Cue List', error)
    })
  })

  return connectedCueList
}
