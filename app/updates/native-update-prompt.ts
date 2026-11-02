import { mount, unmount } from 'svelte'
import type { MountScope } from '../lifecycle/mount.ts'
import NativeUpdatePrompt from './NativeUpdatePrompt.svelte'
import AppStorePrompt from './AppStorePrompt.svelte'
import { setUpdatePreparation } from './native-updates.ts'

export function createNativeUpdatePrompt(scope: MountScope, document: Document, prepare: () => void | Promise<void>,
  canInterrupt: () => boolean) {
  const target = document.createElement('div')
  document.body.append(target)
  const component = mount(NativeUpdatePrompt, { target, props: { prepare } })
  createAppStorePrompt(scope, target, canInterrupt)
  // Settings applies a ready web update with the same safety checks as the update pill.
  setUpdatePreparation(prepare)
  scope.own(() => {
    setUpdatePreparation(null)
    void unmount(component).catch(error => console.error('Could not close the native update prompt', error))
    target.remove()
  })
}

export function createAppStorePrompt(scope: MountScope, target: HTMLElement, canInterrupt: () => boolean) {
  const component = mount(AppStorePrompt, { target, props: { canInterrupt } })
  scope.own(() => { void unmount(component).catch(error => console.error('Could not close the App Store Update Prompt', error)) })
}
