<script lang="ts">
  import { base } from '$app/paths'
  import { onMount } from 'svelte'
  import { isNativeApp } from '../../../app/platform/native.ts'
  import UpdatePrompt from './UpdatePrompt.svelte'

  let visible = $state(false)
  let waitingWorker: ServiceWorker | null = null
  let reloadingForUpdate = $state(false)
  let updateError = $state<string | null>(null)
  let activationTimer: number | null = null
  const activationTimeoutMs = 10_000
  let preview = $state(false)
  let previewComplete = $state(false)

  function clearActivationTimer() {
    if (activationTimer !== null) window.clearTimeout(activationTimer)
    activationTimer = null
  }

  function markUpdateFailed() {
    clearActivationTimer()
    reloadingForUpdate = false
    updateError = 'Update did not finish. Reload the page to try again.'
  }

  function cancelUpdate() {
    clearActivationTimer()
    reloadingForUpdate = false
    updateError = null
  }

  function applyUpdate() {
    if (preview) {
      if (reloadingForUpdate) return
      if (previewComplete) {
        previewComplete = false
        return
      }
      reloadingForUpdate = true
      activationTimer = window.setTimeout(() => {
        activationTimer = null
        reloadingForUpdate = false
        previewComplete = true
      }, 1200)
      return
    }
    if (!waitingWorker || reloadingForUpdate) return
    // Activation cannot be undone; a later Apply can still reload into that worker.
    if (waitingWorker.state === 'activated' || navigator.serviceWorker.controller === waitingWorker) {
      reloadPage()
      return
    }
    updateError = null
    reloadingForUpdate = true
    try {
      waitingWorker.postMessage({ type: 'SKIP_WAITING' })
      activationTimer = window.setTimeout(markUpdateFailed, activationTimeoutMs)
    } catch {
      markUpdateFailed()
    }
  }

  function reloadPage() {
    window.location.reload()
  }

  onMount(() => {
    // Local UI demonstration only: never touch workers, downloads, or navigation.
    if (import.meta.env.DEV && new URLSearchParams(window.location.search).get('preview-update') === '1') {
      preview = true
      visible = true
      return clearActivationTimer
    }
    if (isNativeApp()) return
    if (!('serviceWorker' in navigator)) return

    const listeners = new AbortController()
    const workerUrl = `${base}/service-worker.js`
    const scope = `${base}/`
    const isLocalDevelopment = [
      'localhost',
      '127.0.0.1',
      '[::1]',
    ].includes(window.location.hostname)

    const showUpdate = (worker: ServiceWorker) => {
      waitingWorker = worker
      updateError = null
      visible = true
      worker.addEventListener(
        'statechange',
        () => {
          if (worker.state === 'redundant' && reloadingForUpdate) {
            markUpdateFailed()
          }
        },
        { signal: listeners.signal }
      )
    }

    const watchInstallingWorker = (worker: ServiceWorker | null) => {
      if (!worker) return
      worker.addEventListener(
        'statechange',
        () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdate(worker)
          }
        },
        { signal: listeners.signal }
      )
    }

    navigator.serviceWorker.addEventListener(
      'controllerchange',
      () => {
        if (reloadingForUpdate) {
          clearActivationTimer()
          window.location.reload()
        }
      },
      { signal: listeners.signal }
    )

    const removeDevelopmentWorker = async () => {
      const hadController = Boolean(navigator.serviceWorker.controller)
      const registrations = await navigator.serviceWorker.getRegistrations()
      await Promise.all(registrations.map((registration) => registration.unregister()))

      if ('caches' in window) {
        const cacheNames = await window.caches.keys()
        await Promise.all(
          cacheNames
            .filter((name) => name.startsWith('tikkun-shell-'))
            .map((name) => window.caches.delete(name))
        )
      }

      if (hadController) window.location.reload()
    }

    const prepare = async () => {
      try {
        const response = await fetch(workerUrl, {
          cache: 'no-store',
          method: 'HEAD',
          signal: listeners.signal,
        })
        const contentType = response.headers.get('content-type') ?? ''
        const hasProductionWorker =
          response.ok && /(?:java|ecma)script/i.test(contentType)
        if (!hasProductionWorker) {
          if (isLocalDevelopment) await removeDevelopmentWorker()
          return
        }

        const registration = await navigator.serviceWorker.register(workerUrl, {
          scope,
        })
        if (registration.waiting) showUpdate(registration.waiting)
        watchInstallingWorker(registration.installing)
        registration.addEventListener(
          'updatefound',
          () => watchInstallingWorker(registration.installing),
          { signal: listeners.signal }
        )

        if (navigator.serviceWorker.controller) await registration.update()
      } catch (error) {
        if (listeners.signal.aborted) return
        console.error('Failed to prepare the application service worker', error)
      }
    }

    if (import.meta.env.DEV && import.meta.env.MODE !== 'test') {
      void removeDevelopmentWorker().catch((error) => {
        console.error('Failed to clear the development service worker', error)
      })
      return () => {
        clearActivationTimer()
        listeners.abort()
      }
    }

    void prepare()
    return () => {
      clearActivationTimer()
      listeners.abort()
    }
  })
</script>

<svelte:head>
  {#if preview}
    <title>Update prompt demo | Tikkun Reader</title>
  {/if}
</svelte:head>

{#if visible}
  <UpdatePrompt
    message={reloadingForUpdate ? 'Applying update…' : previewComplete ? 'Demo complete. Nothing was updated.' : updateError ?? 'Update available'}
    applying={reloadingForUpdate}
    error={Boolean(updateError)}
    label={preview ? 'Web update demo. No changes applied.' : undefined}
    actionLabel={reloadingForUpdate ? 'Cancel' : previewComplete ? 'Show again' : updateError ? 'Reload page' : 'Apply'}
    onaction={reloadingForUpdate ? cancelUpdate : updateError ? reloadPage : applyUpdate}
    ondismiss={() => (visible = false)}
  />
{/if}
