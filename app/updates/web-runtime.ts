import { isNativeApp } from '../platform/native.ts'
import { readBoundedResponse } from './content-runtime.ts'
import { stageWebRelease, verifyWebRelease } from './web-update.ts'

let ready: Promise<void> | undefined
export function nativeWebReady(): Promise<void> {
  const publicKey = import.meta.env.TIKKUN_UPDATE_PUBLIC_KEY
  if (!publicKey || !isNativeApp()) return Promise.resolve()
  return ready ??= (async () => {
    const { LiveUpdate } = await import('@capawesome/capacitor-live-update')
    await LiveUpdate.ready()
    const { versionCode } = await LiveUpdate.getVersionCode()
    if (!/^\d+$/.test(versionCode)) throw new Error('Invalid native build for web updates')
    const origin = import.meta.env.TIKKUN_NATIVE_MEDIA_ORIGIN
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15_000)
    try {
      const response = await fetch(`${origin}/updates/web/${versionCode}/latest.json`, {
        signal: controller.signal, cache: 'no-store', credentials: 'omit', redirect: 'error',
      })
      if (response.status === 404) return
      const release = await verifyWebRelease(JSON.parse(await readBoundedResponse(response, 16_384)), publicKey)
      const storageKey = 'tikkun.web-update-bucket'
      let bucket = Number(localStorage.getItem(storageKey) ?? NaN)
      if (!Number.isInteger(bucket) || bucket < 0 || bucket > 99) {
        bucket = crypto.getRandomValues(new Uint32Array(1))[0] % 100
        localStorage.setItem(storageKey, String(bucket))
      }
      await stageWebRelease(release, versionCode, bucket, origin, LiveUpdate)
    } finally { clearTimeout(timeout) }
  })().catch((error: unknown) => console.error('Tikkun web update failed; keeping installed version', error instanceof Error ? error.message : String(error)))
}
