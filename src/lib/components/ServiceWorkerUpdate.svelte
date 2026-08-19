<script lang="ts">
  import { base } from '$app/paths'
  import { onMount } from 'svelte'

  let visible = $state(false)
  let waitingWorker: ServiceWorker | null = null
  let reloadingForUpdate = $state(false)
  let updateError = $state<string | null>(null)
  let activationTimer: number | null = null
  const activationTimeoutMs = 10_000

  function clearActivationTimer() {
    if (activationTimer !== null) window.clearTimeout(activationTimer)
    activationTimer = null
  }

  function markUpdateFailed() {
    clearActivationTimer()
    reloadingForUpdate = false
    updateError = 'Update did not finish. Reload the page to try again.'
  }

  function applyUpdate() {
    if (!waitingWorker || reloadingForUpdate) return
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

{#if visible}
  <div
    class="service-worker-update"
    role={updateError ? 'alert' : 'status'}
    aria-live={updateError ? 'assertive' : 'polite'}
    aria-busy={reloadingForUpdate}
  >
    <span>{reloadingForUpdate
        ? 'Applying update…'
        : updateError ?? 'Update available'}</span>
    <button
      class="service-worker-update-action"
      type="button"
      disabled={reloadingForUpdate}
      onclick={updateError ? reloadPage : applyUpdate}
    >{reloadingForUpdate
        ? 'Reloading…'
        : updateError
          ? 'Reload page'
          : 'Reload'}</button>
    <button
      type="button"
      aria-label="Dismiss update"
      disabled={reloadingForUpdate}
      onclick={() => (visible = false)}
    >
      Later
    </button>
  </div>
{/if}

<style>
  .service-worker-update {
    position: fixed;
    z-index: 10000;
    right: max(1rem, env(safe-area-inset-right, 0px));
    bottom: max(1rem, env(safe-area-inset-bottom, 0px));
    display: flex;
    align-items: center;
    gap: 0.75rem;
    max-width: calc(
      100vw - max(1rem, env(safe-area-inset-left, 0px)) -
        max(1rem, env(safe-area-inset-right, 0px))
    );
    border: 1px solid
      var(--site-line-strong, color-mix(in srgb, currentColor 18%, transparent));
    border-radius: 0.9rem;
    padding: 0.75rem 0.9rem;
    background: var(--site-surface, var(--paper-color, #11161d));
    box-shadow: 0 1rem 3rem rgba(0, 0, 0, 0.35);
    color: var(--site-text, var(--text-color, #f5f7fa));
    font: 600 0.875rem/1.2 var(--hebrew-ui-font-family, sans-serif);
  }

  button {
    border: 0;
    min-width: 2.75rem;
    min-height: 2.75rem;
    border-radius: 0.6rem;
    padding: 0.55rem;
    background: transparent;
    color: var(--site-accent-soft, var(--reader-focus-color, #79aaff));
    font: inherit;
    cursor: pointer;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }

  button:focus-visible {
    outline: 2px solid currentColor;
    outline-offset: 2px;
  }

  button:disabled {
    cursor: default;
    opacity: 0.62;
  }

  @media (hover: hover) and (pointer: fine) {
    button:not(:disabled):hover {
      background: color-mix(in srgb, currentColor 10%, transparent);
    }
  }

  @media (max-width: 36rem) {
    .service-worker-update {
      right: max(0.75rem, env(safe-area-inset-right, 0px));
      bottom: max(0.75rem, env(safe-area-inset-bottom, 0px));
      left: max(0.75rem, env(safe-area-inset-left, 0px));
      max-width: none;
      flex-wrap: wrap;
    }
  }

  @media (forced-colors: active) {
    .service-worker-update {
      border-color: CanvasText;
    }

    button:focus-visible {
      outline-color: Highlight;
    }
  }
</style>
