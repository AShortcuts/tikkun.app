import { registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import type { RecordingDescriptor } from '../offline/recording-download.ts'

export interface NativeMediaPlugin {
  inventory(): Promise<unknown>
  preflight(options: { assets: readonly RecordingDescriptor[] }): Promise<void>
  download(options: { requestId: string; asset: RecordingDescriptor }): Promise<unknown>
  cancelDownload(options: { requestId: string }): Promise<void>
  remove(options: { asset: RecordingDescriptor }): Promise<void>
  resolve(options: { asset: RecordingDescriptor }): Promise<unknown>
  metrics(): Promise<unknown>
  clearTemporary(): Promise<void>
  readIntent(): Promise<unknown>
  updateIntent(options: { add: readonly string[]; remove: readonly string[] }): Promise<void>
  addListener(event: 'progress', callback: (value: unknown) => void): Promise<PluginListenerHandle>
}

let plugin: NativeMediaPlugin | undefined
export function getNativeMedia(): NativeMediaPlugin {
  return plugin ??= registerPlugin<NativeMediaPlugin>('TikkunMedia')
}
