import { get, writable } from 'svelte/store'
import { isNativeApp } from '../platform/native.ts'
import { readBoundedResponse } from './download-response.ts'
import { validReleaseVersion } from './release-identity.ts'
import { APP_STORE_INFO_PATH, appStoreStatus, parseAppStoreInfo, type AppStoreState, type AppStoreStatus } from './app-store-info.ts'

export const appStoreState = writable<AppStoreState>({ installed: null, status: null, info: null })
let checking: Promise<AppStoreStatus | null> | undefined
let lastCheck = 0
let showReader = () => {}
// Resolves once the reader is on screen, after any opening animation, so the prompt never covers loading.
export const readerShown = new Promise<void>(resolve => { showReader = resolve })
export function markReaderShown() { showReader() }

// Development server only: /reader/?preview-app-store=available or =required shows the
// real prompt with sample App Store info, every time, without saving Later.
export function appStorePreview(): Exclude<AppStoreStatus, 'latest'> | null {
  if (!import.meta.env.DEV || typeof location === 'undefined') return null
  const value = new URLSearchParams(location.search).get('preview-app-store')
  return value === 'available' || value === 'required' ? value : null
}

// Resolves to this phone's status, or null when it is unknown (website, offline, or nothing published).
export function checkAppStore(force = false): Promise<AppStoreStatus | null> {
  const preview = appStorePreview()
  if (preview) {
    appStoreState.set({ installed: preview === 'required' ? '1.0' : '1.1', status: preview, info: { latest: '1.2', minimum: '1.1' } })
    return Promise.resolve(preview)
  }
  if (!isNativeApp()) return Promise.resolve(null)
  if (checking) return checking
  if (!force && Date.now() - lastCheck < 15 * 60_000) return Promise.resolve(get(appStoreState).status)
  return checking = (async () => {
    const { App } = await import('@capacitor/app')
    const installed = (await App.getInfo()).version
    if (!validReleaseVersion(installed)) throw new Error(`Unexpected App Store Version ${installed}`)
    appStoreState.update(state => ({ ...state, installed }))
    const response = await fetch(`${import.meta.env.TIKKUN_NATIVE_MEDIA_ORIGIN}/${APP_STORE_INFO_PATH}`, {
      cache: 'no-store', credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(15_000),
    })
    lastCheck = Date.now()
    if (response.status === 404) {
      await response.body?.cancel()
      appStoreState.set({ installed, status: null, info: null })
      return null
    }
    const info = parseAppStoreInfo(JSON.parse(await readBoundedResponse(response, 4096)))
    const status = appStoreStatus(installed, info)
    appStoreState.set({ installed, status, info })
    return status
  })().catch((error: unknown) => {
    console.error('Could not check the App Store version', error instanceof Error ? error.message : String(error))
    return get(appStoreState).status
  }).finally(() => { checking = undefined })
}
