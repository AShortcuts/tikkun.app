import { isNativeApp } from '../platform/native.ts'
import { readBoundedResponse } from './content-runtime.ts'
import { stageWebRelease, verifyWebRelease } from './web-update.ts'
import { updateChannel } from './update-state.ts'

let ready: Promise<void> | undefined
let checking: Promise<void> | undefined
let lastCheck = 0
const supported = () => Boolean(import.meta.env.TIKKUN_UPDATE_PUBLIC_KEY) && isNativeApp()

async function markReady() {
  return ready ??= (async () => {
    const { LiveUpdate } = await import('@capawesome/capacitor-live-update')
    await LiveUpdate.ready()
    const current = await LiveUpdate.getCurrentBundle()
    const next = await LiveUpdate.getNextBundle()
    const pending = next.bundleId !== null && next.bundleId !== current.bundleId
    updateChannel('web', { pending, phase: pending ? 'ready' : 'idle' })
  })().catch(error => { ready = undefined; throw error })
}

export async function nativeWebReady(): Promise<void> {
  await checkNativeWeb()
}

export function checkNativeWeb(force = false): Promise<void> {
  if (!supported()) { updateChannel('web', { phase: 'disabled' }); return Promise.resolve() }
  if (checking) return checking
  if (!force && Date.now() - lastCheck < 15 * 60_000) return Promise.resolve()
  return checking = (async () => {
    await markReady()
    updateChannel('web', { phase: 'checking' })
    const { LiveUpdate } = await import('@capawesome/capacitor-live-update')
    const { versionCode } = await LiveUpdate.getVersionCode()
    if (!/^\d+$/.test(versionCode)) throw new Error('Invalid native build for web updates')
    const origin = import.meta.env.TIKKUN_NATIVE_MEDIA_ORIGIN
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15_000)
    try {
      const response = await fetch(`${origin}/updates/web/${versionCode}/latest.json`, {
        signal: controller.signal, cache: 'no-store', credentials: 'omit', redirect: 'error',
      })
      if (response.status === 404) {
        lastCheck = Date.now()
        updateChannel('web', { phase: 'unpublished', checkedAt: lastCheck })
        return
      }
      const release = await verifyWebRelease(JSON.parse(await readBoundedResponse(response, 16_384)), import.meta.env.TIKKUN_UPDATE_PUBLIC_KEY)
      const storageKey = 'tikkun.web-update-bucket'
      let bucket = Number(localStorage.getItem(storageKey) ?? NaN)
      if (!Number.isInteger(bucket) || bucket < 0 || bucket > 99) {
        bucket = crypto.getRandomValues(new Uint32Array(1))[0] % 100
        localStorage.setItem(storageKey, String(bucket))
      }
      updateChannel('web', { phase: 'downloading' })
      const result = await stageWebRelease(release, versionCode, bucket, origin, LiveUpdate)
      lastCheck = Date.now()
      updateChannel('web', { phase: result === 'ready' ? 'ready' : 'current', checkedAt: lastCheck,
        ...(result === 'ready' ? { pending: true } : {}) })
    } finally { clearTimeout(timeout) }
  })().catch((error: unknown) => {
    updateChannel('web', { phase: 'error' })
    console.error('Tikkun web update failed; keeping installed version', error instanceof Error ? error.message : String(error))
  }).finally(() => { checking = undefined })
}
