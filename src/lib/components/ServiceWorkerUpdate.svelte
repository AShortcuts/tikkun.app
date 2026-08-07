<script lang="ts">
  import { base } from '$app/paths'
  import { onMount } from 'svelte'

  let visible = $state(false)
  let waitingWorker: ServiceWorker | null = null
  let reloadingForUpdate = false

  function applyUpdate() {
    if (!waitingWorker) return
    reloadingForUpdate = true
    waitingWorker.postMessage({ type: 'SKIP_WAITING' })
  }

  onMount(() => {
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
      visible = true
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
        if (reloadingForUpdate) window.location.reload()
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
        console.error('Failed to prepare the application service worker', error)
      }
    }

    void prepare()
    return () => listeners.abort()
  })
</script>

{#if visible}
  <div class="service-worker-update" role="status" aria-live="polite">
    <span>Update available</span>
    <button type="button" onclick={applyUpdate}>Reload</button>
    <button type="button" aria-label="Dismiss update" onclick={() => (visible = false)}>
      Later
    </button>
  </div>
{/if}

<style>
  .service-worker-update {
    position: fixed;
    z-index: 10000;
    right: 1rem;
    bottom: 1rem;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 0.9rem;
    padding: 0.75rem 0.9rem;
    background: #11161d;
    box-shadow: 0 1rem 3rem rgba(0, 0, 0, 0.35);
    color: #f5f7fa;
    font: 600 0.875rem/1.2 sans-serif;
  }

  button {
    border: 0;
    padding: 0.3rem;
    background: transparent;
    color: #79aaff;
    font: inherit;
    cursor: pointer;
  }
</style>
