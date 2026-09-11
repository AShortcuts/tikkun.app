import { registerPlugin } from '@capacitor/core'
import { isNativeApp } from './native.ts'
import type { LastReadingInput } from '../reading/last-reading.ts'

interface PracticePlugin {
  update(options: { israel?: boolean; reading?: LastReadingInput }): Promise<void>
}
let plugin: PracticePlugin | undefined

export function publishNativePractice(options: { israel?: boolean; reading?: LastReadingInput }) {
  if (!isNativeApp()) return
  plugin ??= registerPlugin<PracticePlugin>('TikkunPractice')
  void plugin.update(options).catch(error => console.error('Could not update the Home Screen widget', error))
}
