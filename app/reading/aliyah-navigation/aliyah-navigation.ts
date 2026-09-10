import type { PassageAudioState } from '../passage-audio.ts'
import { flushSync, mount, unmount } from 'svelte'
import type { MountScope } from '../../lifecycle/mount.ts'
import AliyahNavigationLayerView from './AliyahNavigationLayer.svelte'
import AliyahToolbarView from './AliyahToolbar.svelte'
import type {
  AliyahNavigationItem,
  AliyahNavigationPlayback,
  AliyahNavigationSnapshot,
  AliyahNavigationTarget,
} from './model.ts'

export const ALIYAH_RAIL_AUTO_HIDE_MS = 4000

export type AliyahCueStatus =
  | 'none'
  | 'published'
  | 'pending'
  | 'local-draft'
  | 'generated-review'

export type AliyahRailVisibility = 'hidden' | 'peek' | 'expanded'

export type MobileAliyahCapsuleState = 'default' | 'loaded' | 'playing'

export type MobileAliyahCapsule = Readonly<{
  visible: boolean
  target: AliyahNavigationTarget | null
  label: string
  playbackState: MobileAliyahCapsuleState
  audioState?: PassageAudioState
  audioAvailable?: boolean
  authoringMissing?: boolean
  cueIncomplete?: boolean
}>

export type AliyahToolbarState = Readonly<{
  current: Readonly<{
    labelVisible: boolean
    label: string
    target: AliyahNavigationTarget | null
    audioState?: PassageAudioState
    audioAvailable: boolean
    authoringAvailable: boolean
    authoringEnabled: boolean
    cueStatus: AliyahCueStatus | null
    playing: boolean
  }>
  compact: MobileAliyahCapsule
}>

export type AliyahNavigationContent = Readonly<{
  desktop: AliyahNavigationSnapshot | null
  compact: AliyahNavigationSnapshot | null
  authoringEnabled: boolean
}>

export interface AliyahNavigation {
  syncContent(content: AliyahNavigationContent): void
  clearContent(): void
  invalidate(): void
  setActive(target: AliyahNavigationTarget | null): void
  syncPlayback(playback: AliyahNavigationPlayback): void
  syncToolbar(state: AliyahToolbarState): void
  revealWide(
    visibility?: Exclude<AliyahRailVisibility, 'hidden'>,
    options?: { autoHideMs?: number }
  ): void
  revealWideForMovement(): void
  scheduleWideHide(delayMs?: number): void
  openCompact(returnFocus?: HTMLElement): void
  closeCompact(options?: {
    focusTarget?: HTMLElement
    restoreFocus?: boolean
  }): void
  isCompactOpen(): boolean
}

export interface AliyahNavigationOptions {
  document: Document
  onSelect(target: AliyahNavigationTarget): void
  onPlayCompact(
    target: AliyahNavigationTarget
  ): Promise<AliyahNavigationPlayback>
  onPlayCurrent(target: AliyahNavigationTarget): Promise<void>
  onBeforeCompactOpen(): AliyahNavigationPlayback
  onAfterNavigate(): void
  onWideHidden(): void
  restoreFocus(target: HTMLElement | null): void
  getReaderFocusTarget(): HTMLElement
  loadCueStatus(item: AliyahNavigationItem): Promise<AliyahCueStatus>
  onCueStatusChange(
    item: AliyahNavigationItem,
    status: AliyahCueStatus
  ): void
  loadDurationLabel(item: AliyahNavigationItem): Promise<string>
  onCueStatusError(error: unknown, item: AliyahNavigationItem): void
  onDurationError(error: unknown, item: AliyahNavigationItem): void
}

export interface AliyahToolbar {
  sync(state: AliyahToolbarState): void
  setCueStatus(
    target: AliyahNavigationTarget,
    status: AliyahCueStatus
  ): void
  invalidateCueStatus(): void
  setCompactOpen(open: boolean): void
  getCompactToggle(): HTMLButtonElement
}

export interface AliyahToolbarComponentProps {
  onToggleCompact(returnFocus: HTMLElement): void
  onPlayCurrent(target: AliyahNavigationTarget): Promise<void>
  connect(toolbar: AliyahToolbar): void
}

export interface AliyahNavigationLayer {
  syncContent(content: AliyahNavigationContent): void
  clearContent(): void
  invalidate(): void
  setActive(target: AliyahNavigationTarget | null): void
  syncPlayback(playback: AliyahNavigationPlayback): void
  setCompactAvailable(available: boolean): void
  revealWide(
    visibility?: Exclude<AliyahRailVisibility, 'hidden'>,
    options?: { autoHideMs?: number }
  ): void
  revealWideForMovement(): void
  scheduleWideHide(delayMs?: number): void
  openCompact(returnFocus?: HTMLElement): void
  closeCompact(options?: {
    focusTarget?: HTMLElement
    restoreFocus?: boolean
  }): void
  isCompactOpen(): boolean
}

export interface AliyahNavigationLayerComponentProps
  extends Omit<AliyahNavigationOptions, 'document' | 'onPlayCurrent'> {
  document: Document
  signal: AbortSignal
  toolbar: HTMLElement
  getCompactToggle(): HTMLElement | null
  onCompactOpenChange(open: boolean): void
  connect(layer: AliyahNavigationLayer): void
}

export function getMobileAliyahCapsuleState({
  loaded,
  playing,
}: {
  loaded: boolean
  playing: boolean
}): MobileAliyahCapsuleState {
  if (loaded && playing) return 'playing'
  if (loaded) return 'loaded'
  return 'default'
}

export function aliyahCueStatusLabel(status: AliyahCueStatus) {
  return {
    none: 'no cues',
    pending: 'partial published cues',
    published: 'complete published cues',
    'local-draft': 'local draft',
    'generated-review': 'generated draft needs review',
  }[status]
}

export function isAliyahCueStatusUnfinished(status: AliyahCueStatus) {
  return status !== 'published'
}

export function aliyahCueAuthoringActionLabel({
  label,
  status,
  playing = false,
}: {
  label: string
  status: AliyahCueStatus
  playing?: boolean
}) {
  if (playing) return `Pause ${label}`
  return status === 'none'
    ? `Start ${label} cue recording`
    : `Resume ${label} cue recording`
}

function requiredEmptyRoot(document: Document, targetId: string) {
  const target = document.querySelector<HTMLElement>(
    `[data-target-id="${targetId}"]`
  )
  if (!target) throw new Error(`Aliyah Navigation requires ${targetId}`)
  if (target.childNodes.length) {
    throw new Error(`Aliyah Navigation requires an empty ${targetId}`)
  }
  return target
}

function requiredElement<T extends Element>(
  document: Document,
  selector: string
): T {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`Aliyah Navigation requires ${selector}`)
  return element
}

export function createAliyahNavigation(
  scope: MountScope,
  options: AliyahNavigationOptions
): AliyahNavigation {
  const toolbarTarget = requiredEmptyRoot(
    options.document,
    'aliyah-toolbar-root'
  )
  const layerTarget = requiredEmptyRoot(
    options.document,
    'aliyah-navigation-layer-root'
  )
  const toolbarElement = requiredElement<HTMLElement>(
    options.document,
    '.app-toolbar'
  )

  let toolbar: AliyahToolbar | null = null
  let layer: AliyahNavigationLayer | null = null

  const layerComponent = mount(AliyahNavigationLayerView, {
    target: layerTarget,
    props: {
      document: options.document,
      signal: scope.signal,
      toolbar: toolbarElement,
      onSelect: options.onSelect,
      onPlayCompact: options.onPlayCompact,
      onBeforeCompactOpen: options.onBeforeCompactOpen,
      onAfterNavigate: options.onAfterNavigate,
      onWideHidden: options.onWideHidden,
      restoreFocus: options.restoreFocus,
      getReaderFocusTarget: options.getReaderFocusTarget,
      loadCueStatus: options.loadCueStatus,
      onCueStatusChange: (
        item: AliyahNavigationItem,
        status: AliyahCueStatus
      ) => {
        toolbar?.setCueStatus(item.target, status)
        options.onCueStatusChange(item, status)
      },
      loadDurationLabel: options.loadDurationLabel,
      onCueStatusError: options.onCueStatusError,
      onDurationError: options.onDurationError,
      getCompactToggle: () => toolbar?.getCompactToggle() ?? null,
      onCompactOpenChange: (open: boolean) => {
        toolbar?.setCompactOpen(open)
      },
      connect: (connectedLayer: AliyahNavigationLayer) => {
        layer = connectedLayer
      },
    },
  })
  flushSync()

  const connectedLayer = layer as AliyahNavigationLayer | null
  if (!connectedLayer) {
    void unmount(layerComponent)
    throw new Error('Aliyah Navigation layer did not connect')
  }

  const toolbarComponent = mount(AliyahToolbarView, {
    target: toolbarTarget,
    props: {
      onToggleCompact: (returnFocus: HTMLElement) => {
        if (layer?.isCompactOpen()) layer.closeCompact()
        else layer?.openCompact(returnFocus)
      },
      onPlayCurrent: options.onPlayCurrent,
      connect: (connectedToolbar: AliyahToolbar) => {
        toolbar = connectedToolbar
      },
    },
  })
  flushSync()

  const connectedToolbar = toolbar as AliyahToolbar | null
  if (!connectedToolbar) {
    void unmount(toolbarComponent)
    void unmount(layerComponent)
    throw new Error('Aliyah Navigation toolbar did not connect')
  }

  scope.own(() => {
    const toolbarUnmount = unmount(toolbarComponent)
    const layerUnmount = unmount(layerComponent)
    void Promise.all([toolbarUnmount, layerUnmount]).catch((error: unknown) => {
      console.error('Failed to unmount Aliyah Navigation', error)
    })
  })

  return {
    syncContent: (content) => connectedLayer.syncContent(content),
    clearContent: () => connectedLayer.clearContent(),
    invalidate: () => {
      connectedToolbar.invalidateCueStatus()
      connectedLayer.invalidate()
    },
    setActive: (target) => connectedLayer.setActive(target),
    syncPlayback: (playback) => connectedLayer.syncPlayback(playback),
    syncToolbar: (state) => {
      connectedToolbar.sync(state)
      connectedLayer.setCompactAvailable(state.compact.visible)
    },
    revealWide: (visibility, revealOptions) =>
      connectedLayer.revealWide(visibility, revealOptions),
    revealWideForMovement: () => connectedLayer.revealWideForMovement(),
    scheduleWideHide: (delayMs) => connectedLayer.scheduleWideHide(delayMs),
    openCompact: (returnFocus) => connectedLayer.openCompact(returnFocus),
    closeCompact: (closeOptions) =>
      connectedLayer.closeCompact(closeOptions),
    isCompactOpen: () => connectedLayer.isCompactOpen(),
  }
}
