import { flushSync, mount, unmount } from 'svelte'
import type { MountScope } from '../lifecycle/mount.ts'
import FloatingPlayerView from './FloatingPlayer.svelte'

export interface FloatingPlayerPosition {
  left: number
  top: number
}

export interface FloatingPlayerRect extends FloatingPlayerPosition {
  width: number
  height: number
}

export interface FloatingPlayerDownload {
  href: string
  fileName: string
}

export interface FloatingPlayerSnapshot {
  visible: boolean
  untimed: boolean
  playing: boolean
  expanded: boolean
  compact: boolean
  desktopTitle: string
  mobileTitle: string
  subtitle: string
  mobileReading: string
  mode: string
  status: string
  playbackRate: number
  audioDownload: FloatingPlayerDownload | null
  videoDownload: FloatingPlayerDownload | null
}

export interface FloatingPlayerProgress {
  audioRatio: number
  cueRatio: number
  seekValue: number
  seekDisabled: boolean
  seekValueText: string
  currentTime: string
  duration: string
  wordProgress: string
  cueProgress: string
  cueProgressVisible: boolean
  mobileWordProgress: string
  mobileWordProgressVisible: boolean
}

export type FloatingPlayerAction =
  | { type: 'toggle-playback' }
  | { type: 'step'; delta: -1 | 1 }
  | { type: 'restart' }
  | { type: 'seek-commit'; ratio: number }
  | {
      type: 'seek-preview'
      phase: 'start' | 'move'
      pointerId: number
      ratio: number
    }
  | {
      type: 'seek-finish'
      pointerId: number
      ratio: number
    }
  | { type: 'set-rate'; rate: number; snap: boolean }
  | {
      type: 'set-expanded'
      expanded: boolean
      source: 'desktop' | 'mobile' | 'close'
      returnFocus: HTMLElement | null
    }
  | {
      type: 'drag-start'
      pointerId: number
      clientX: number
      clientY: number
      playerRect: FloatingPlayerRect
    }
  | {
      type: 'drag-move'
      pointerId: number
      clientX: number
      clientY: number
    }
  | { type: 'drag-finish'; pointerId: number }
  | { type: 'drag-cancel' }
  | { type: 'drag-reset' }
  | {
      type: 'drag-key'
      direction: readonly [number, number]
      shiftKey: boolean
      playerRect: FloatingPlayerRect
    }
  | { type: 'layout' }

export interface FloatingPlayer {
  sync(snapshot: Partial<FloatingPlayerSnapshot>): void
  syncProgress(progress: Partial<FloatingPlayerProgress>): void
  setPosition(position: FloatingPlayerPosition | null): void
  setDragging(dragging: boolean): void
  closeSpeedPopover(): void
  focusMobileClose(): void
  measure(): FloatingPlayerRect
}

export interface FloatingPlayerOptions {
  document: Document
  view: Window
  action(action: FloatingPlayerAction): void
}

export interface FloatingPlayerComponentProps extends FloatingPlayerOptions {
  connect(player: FloatingPlayer): void
}

export function createFloatingPlayer(
  scope: MountScope,
  options: FloatingPlayerOptions
): FloatingPlayer {
  const target = options.document.querySelector<HTMLElement>(
    '[data-target-id="floating-player-root"]'
  )
  if (!target) {
    throw new Error('Floating Player requires its mount root')
  }
  if (target.childNodes.length) {
    throw new Error('Floating Player requires an empty mount root')
  }

  let player: FloatingPlayer | null = null
  const component = mount(FloatingPlayerView, {
    target,
    props: {
      document: options.document,
      view: options.view,
      action: options.action,
      connect: (connectedPlayer: FloatingPlayer) => {
        player = connectedPlayer
      },
    },
  })
  flushSync()

  const connectedPlayer = player
  if (!connectedPlayer) {
    void unmount(component)
    throw new Error('Floating Player did not connect its interface')
  }

  scope.own(() => {
    void unmount(component).catch((error: unknown) => {
      console.error('Failed to unmount Floating Player', error)
    })
  })

  return connectedPlayer
}
