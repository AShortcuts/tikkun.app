import { flushSync, mount, unmount } from 'svelte'
import type { MountScope } from '../lifecycle/mount.ts'
import ReaderControlsView from './ReaderControls.svelte'

export interface ReaderControlsState {
  bookmarkAvailable: boolean
  bookmarked: boolean
  annotationsEnabled: boolean
  aliyahNavigationAvailable: boolean
}

export interface ReaderControlsOptions {
  document: Document
  getState(): ReaderControlsState
  toggleBookmark(): void
  openAliyahNavigation(returnFocus: HTMLElement): void
  showAliyahStarts(): void
  toggleAnnotations(): void
  openSettings(returnFocus: HTMLElement): void
}

export interface ReaderControls {
  close(options?: { restoreFocus?: boolean }): boolean
  sync(): void
}

export interface ReaderControlsComponentProps extends ReaderControlsOptions {
  connect(controls: ReaderControls): void
}

function requiredElement<T extends Element>(
  document: Document,
  selector: string
): T {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`Reader Controls requires ${selector}`)
  return element
}

export function createReaderControls(
  scope: MountScope,
  options: ReaderControlsOptions
): ReaderControls {
  const target = requiredElement<HTMLElement>(
    options.document,
    '[data-target-id="reader-controls-root"]'
  )
  if (target.childNodes.length) {
    throw new Error('Reader Controls requires an empty controls root')
  }

  let controls: ReaderControls | null = null
  const getConnectedControls = () => controls
  const component = mount(ReaderControlsView, {
    target,
    props: {
      ...options,
      connect: (connectedControls: ReaderControls) => {
        controls = connectedControls
      },
    },
  })
  flushSync()

  const connectedControls = getConnectedControls()
  if (!connectedControls) {
    void unmount(component)
    throw new Error('Reader Controls did not connect its component API')
  }

  scope.own(() => {
    connectedControls.close()
    void unmount(component).catch((error: unknown) => {
      console.error('Failed to unmount Reader Controls', error)
    })
  })

  return connectedControls
}
