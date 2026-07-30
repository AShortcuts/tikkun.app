import { flushSync, mount, unmount } from 'svelte'
import type { AudioNarrator } from '../audio/types.ts'
import { iconMarkup } from '../components/icons.ts'
import type { MountScope } from '../lifecycle/mount.ts'
import type { ReaderPreferences } from '../reader-preferences.ts'
import ReaderSettingsPane from './ReaderSettings.svelte'

export interface ReaderSettingsOptions {
  document: Document
  view: Window
  narrators: readonly AudioNarrator[]
  getPreferences(): ReaderPreferences
  updatePreferences(updates: Partial<ReaderPreferences>): void
  setPlaybackRate(rate: number): void
  restoreFocus(target: HTMLElement | null): void
  animateThemeChanges: boolean
}

export interface ReaderSettings {
  open(options?: { returnFocus?: HTMLElement }): void
  close(options?: { restoreFocus?: boolean }): boolean
  sync(): void
}

export interface ReaderSettingsComponentProps extends ReaderSettingsOptions {
  toggle: HTMLButtonElement
  connect(settings: ReaderSettings): void
}

function requiredElement<T extends Element>(
  document: Document,
  selector: string
): T {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`Reader Settings requires ${selector}`)
  return element
}

export function createReaderSettings(
  scope: MountScope,
  options: ReaderSettingsOptions
): ReaderSettings {
  const target = requiredElement<HTMLElement>(
    options.document,
    '[data-target-id="settings-root"]'
  )
  const toggle = requiredElement<HTMLButtonElement>(
    options.document,
    '[data-target-id="settings-toggle"]'
  )
  if (target.childNodes.length) {
    throw new Error('Reader Settings requires an empty settings root')
  }

  toggle.innerHTML = iconMarkup('settings2')
  let settings: ReaderSettings | null = null
  const getConnectedSettings = () => settings
  const component = mount(ReaderSettingsPane, {
    target,
    props: {
      ...options,
      toggle,
      connect: (connectedSettings: ReaderSettings) => {
        settings = connectedSettings
      },
    },
  })
  flushSync()

  const connectedSettings = getConnectedSettings()
  if (!connectedSettings) {
    void unmount(component)
    throw new Error('Reader Settings did not connect its component API')
  }

  scope.own(() => {
    connectedSettings.close({ restoreFocus: false })
    void unmount(component).catch((error: unknown) => {
      console.error('Failed to unmount Reader Settings', error)
    })
  })

  return connectedSettings
}
