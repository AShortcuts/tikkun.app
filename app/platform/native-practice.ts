import { registerPlugin } from '@capacitor/core'
import { isNativeApp } from './native.ts'
import type { LastReadingInput } from '../reading/last-reading.ts'
import type { DeviceFacts, DeviceKind } from '../analytics/context.ts'

interface PracticePlugin {
  update(options: { israel?: boolean; reading?: LastReadingInput }): Promise<void>
  deviceInfo(): Promise<{ device: DeviceKind; os: number; appVersion: string }>
}
let plugin: PracticePlugin | undefined

export function publishNativePractice(options: { israel?: boolean; reading?: LastReadingInput }) {
  if (!isNativeApp()) return
  plugin ??= registerPlugin<PracticePlugin>('TikkunPractice')
  void plugin.update(options).catch(error => console.error('Could not update the Home Screen widget', error))
}

/** Device type from the operating system, so an iPad reports as an iPad and an iPad app on a Mac as a computer. */
export async function nativeDeviceFacts(): Promise<DeviceFacts> {
  plugin ??= registerPlugin<PracticePlugin>('TikkunPractice')
  const info = await plugin.deviceInfo()
  return { device: info.device, os: info.os, app_version: info.appVersion }
}
