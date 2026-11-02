<script lang="ts">
  import { onDestroy, onMount, setContext } from 'svelte'
  import { afterNavigate, goto } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { isNativeApp } from '../../app/platform/native.ts'
  import { publishNativePractice } from '../../app/platform/native-practice.ts'
  import { loadCalendarSettings } from '../../app/calendar-settings.ts'
  import { createNativeReadingLinks, NATIVE_READING_LINKS_CONTEXT } from '../../app/platform/native-reading-links.ts'
  import { createDownloadOwner, DOWNLOAD_OWNER_CONTEXT } from '../../app/offline/download-owner.ts'
  import ServiceWorkerUpdate from '$lib/components/ServiceWorkerUpdate.svelte'
  import { createAnalyticsClient, installAnalytics, type AnalyticsClient } from '../../app/analytics/client.ts'
  import { analyticsTransport } from '../../app/analytics/transport.ts'
  import { currentAnalyticsConfig } from '../../app/analytics/config.ts'
  import { isHomeScreenApp, osMajorFromUserAgent, webDeviceKind } from '../../app/analytics/context.ts'
  import { nativeDeviceFacts } from '../../app/platform/native-practice.ts'

  let analytics: AnalyticsClient | undefined
  afterNavigate(() => {
    analytics?.page()
    if (isNativeApp() && window.location.pathname === resolve('/')) {
      void goto(resolve('/reader/'), { replaceState: true }).catch(error => {
        console.error('Could not return to the native reader', error)
      })
    }
  })

  const downloads = setContext(DOWNLOAD_OWNER_CONTEXT, createDownloadOwner())
  const nativeLinks = setContext(NATIVE_READING_LINKS_CONTEXT,
    import.meta.env.TIKKUN_NATIVE_MEDIA_ORIGIN && isNativeApp()
      ? createNativeReadingLinks({
        // A reload of an explicit reading must not replay an old native launch URL.
        readLaunchUrl: window.location.pathname === resolve('/reader/') && !window.location.hash,
        // Capacitor proxies expose `then`; never return a bare plugin from async code.
        loadApp: async () => ({ app: (await import('@capacitor/app')).App }),
        navigate: async (hash) => {
          const readerPath = resolve('/reader/')
          if (window.location.pathname === readerPath) window.location.hash = hash
          else {
            // The path is base-resolved; the validated hash belongs to Reader Route.
            // eslint-disable-next-line svelte/no-navigation-without-resolve
            await goto(`${readerPath}${hash}`)
          }
        },
        reportError: (error) => console.error('Could not open native reading link', error),
      })
      : null)
  onMount(() => {
    const native = isNativeApp()
    const config = currentAnalyticsConfig()
    const homeScreen = !native && isHomeScreenApp(window)
    analytics = createAnalyticsClient({ view: window, config, native,
      enabled: !import.meta.env.DEV && window.top === window && !navigator.webdriver,
      send: analyticsTransport(config, native),
      appSurface: native || homeScreen,
      deviceFacts: native
        ? nativeDeviceFacts
        : async () => ({ device: webDeviceKind(navigator.userAgent), os: osMajorFromUserAgent(navigator.userAgent), app_version: 'web' }) })
    const stopAnalytics = installAnalytics(analytics)
    analytics.page()
    publishNativePractice({ israel: loadCalendarSettings().israel })
    document.documentElement.dataset.appHydrated = 'true'
    void nativeLinks?.start()
    return () => {
      stopAnalytics()
      analytics = undefined
      delete document.documentElement.dataset.appHydrated
      nativeLinks?.destroy()
    }
  })
  onDestroy(() => downloads.destroy())
  let { children } = $props()
</script>

{@render children()}
<ServiceWorkerUpdate />
