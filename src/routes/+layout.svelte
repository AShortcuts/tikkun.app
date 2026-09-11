<script lang="ts">
  import { onDestroy, onMount, setContext } from 'svelte'
  import { goto } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { isNativeApp } from '../../app/platform/native.ts'
  import { publishNativePractice } from '../../app/platform/native-practice.ts'
  import { loadCalendarSettings } from '../../app/calendar-settings.ts'
  import { createNativeReadingLinks, NATIVE_READING_LINKS_CONTEXT } from '../../app/platform/native-reading-links.ts'
  import { createDownloadOwner, DOWNLOAD_OWNER_CONTEXT } from '../../app/offline/download-owner.ts'
  import ServiceWorkerUpdate from '$lib/components/ServiceWorkerUpdate.svelte'

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
    publishNativePractice({ israel: loadCalendarSettings().israel })
    document.documentElement.dataset.appHydrated = 'true'
    void nativeLinks?.start()
    return () => {
      delete document.documentElement.dataset.appHydrated
      nativeLinks?.destroy()
    }
  })
  onDestroy(() => downloads.destroy())
  let { children } = $props()
</script>

{@render children()}
<ServiceWorkerUpdate />
