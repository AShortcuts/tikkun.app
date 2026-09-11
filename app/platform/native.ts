import { Capacitor } from '@capacitor/core'

export function isNativeApp() {
  return Capacitor.isNativePlatform()
}

export function getWebServiceWorker(navigator: { readonly serviceWorker?: ServiceWorkerContainer }) {
  return isNativeApp() ? null : navigator.serviceWorker ?? null
}
