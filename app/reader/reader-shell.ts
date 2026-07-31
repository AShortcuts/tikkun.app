import { flushSync, mount, unmount } from 'svelte'
import type { MountScope } from '../lifecycle/mount.ts'
import ReaderShellView from './ReaderShell.svelte'

export type ReaderShellViewName = 'reader' | 'optional'

export interface ReaderShellProgress {
  label: string
  percent: number
}

export interface ReaderShell {
  setView(view: ReaderShellViewName): void
  setPickerOpen(open: boolean): void
  setTitle(title: string): void
  setProgress(progress: Partial<ReaderShellProgress>): void
  setAnnotationsEnabled(enabled: boolean): void
  focusTitle(): void
  isReaderVisible(): boolean
}

export interface ReaderShellOptions {
  document: Document
  initialTitle: string
  initialAnnotationsEnabled: boolean
  onTitleClick(): void
  onAboutClick(): void
  onAnnotationsChange(enabled: boolean): void
}

export interface ReaderShellComponentProps
  extends Omit<ReaderShellOptions, 'document'> {
  connect(shell: ReaderShell): void
}

function requiredElement<T extends Element>(
  document: Document,
  selector: string
): T {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`Reader Shell requires ${selector}`)
  return element
}

export function createReaderShell(
  scope: MountScope,
  options: ReaderShellOptions
): ReaderShell {
  const target = requiredElement<HTMLElement>(
    options.document,
    '[data-target-id="app-root"]'
  )
  const anchor = requiredElement<HTMLElement>(
    options.document,
    '[data-target-id="reader-shell-anchor"]'
  )
  if (anchor.parentElement !== target) {
    throw new Error('Reader Shell anchor must be a direct child of the app root')
  }
  if (target.querySelector('[data-reader-shell-owner="true"]')) {
    throw new Error('Reader Shell is already mounted')
  }

  let shell: ReaderShell | null = null
  const getConnectedShell = () => shell
  const component = mount(ReaderShellView, {
    target,
    anchor,
    props: {
      initialTitle: options.initialTitle,
      initialAnnotationsEnabled: options.initialAnnotationsEnabled,
      onTitleClick: options.onTitleClick,
      onAboutClick: options.onAboutClick,
      onAnnotationsChange: options.onAnnotationsChange,
      connect: (connectedShell: ReaderShell) => {
        shell = connectedShell
      },
    },
  })
  flushSync()

  const connectedShell = getConnectedShell()
  if (!connectedShell) {
    void unmount(component)
    throw new Error('Reader Shell did not connect its component interface')
  }

  scope.own(() => {
    void unmount(component).catch((error: unknown) => {
      console.error('Failed to unmount Reader Shell', error)
    })
  })

  return connectedShell
}
