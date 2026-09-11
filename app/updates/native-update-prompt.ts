import { mount, unmount } from 'svelte'
import type { MountScope } from '../lifecycle/mount.ts'
import NativeUpdatePrompt from './NativeUpdatePrompt.svelte'

export function createNativeUpdatePrompt(scope: MountScope, document: Document, prepare: () => void | Promise<void>) {
  const target = document.createElement('div')
  document.body.append(target)
  const component = mount(NativeUpdatePrompt, { target, props: { prepare } })
  scope.own(() => {
    void unmount(component).catch(error => console.error('Could not close the native update prompt', error))
    target.remove()
  })
}
