import { flushSync, mount, unmount } from 'svelte'
import type { LeiningGenerator } from '../calendar-model/generator.ts'
import type { MountScope } from '../lifecycle/mount.ts'
import type { NavigationAction } from './actions.ts'
import CommandPaletteView from './CommandPalette.svelte'

export interface CommandPaletteOptions {
  document: Document
  getActions(): NavigationAction[]
  createGenerator?(): LeiningGenerator
  restoreFocus(): void
  isBookmarkAction(action: NavigationAction): boolean
  formatBadge(label: string): string
}

export interface CommandPalette {
  open(): void
  close(): void
  toggle(): void
  isOpen(): boolean
  refresh(): void
}

export interface CommandPaletteComponentProps
  extends Omit<CommandPaletteOptions, 'document'> {
  connect(palette: CommandPalette): void
}

export function createCommandPalette(
  scope: MountScope,
  options: CommandPaletteOptions
): CommandPalette {
  const target = options.document.querySelector<HTMLElement>(
    '[data-target-id="command-palette-root"]'
  )
  if (!target) throw new Error('Command Palette requires its mount root')
  if (target.childNodes.length) {
    throw new Error('Command Palette requires an empty mount root')
  }

  let palette: CommandPalette | null = null
  const getConnectedPalette = () => palette
  const component = mount(CommandPaletteView, {
    target,
    props: {
      getActions: options.getActions,
      createGenerator: options.createGenerator,
      restoreFocus: options.restoreFocus,
      isBookmarkAction: options.isBookmarkAction,
      formatBadge: options.formatBadge,
      connect: (connectedPalette: CommandPalette) => {
        palette = connectedPalette
      },
    },
  })
  flushSync()

  const connectedPalette = getConnectedPalette()
  if (!connectedPalette) {
    void unmount(component)
    throw new Error('Command Palette did not connect its component interface')
  }

  scope.own(() => {
    connectedPalette.close()
    void unmount(component).catch((error: unknown) => {
      console.error('Failed to unmount Command Palette', error)
    })
  })

  return connectedPalette
}
