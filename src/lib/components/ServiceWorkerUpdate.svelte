<script lang="ts">
  import { base } from '$app/paths'
  import { onMount } from 'svelte'
  import { isNativeApp } from '../../../app/platform/native.ts'

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
  <div
    class="service-worker-update"
    role={updateError ? 'alert' : 'status'}
    aria-label={preview ? 'Web update demo. No changes applied.' : undefined}
    aria-live={updateError ? 'assertive' : 'polite'}
    aria-busy={reloadingForUpdate}
  >
    <span>{reloadingForUpdate
        ? 'Applying update…'
        : previewComplete
          ? 'Demo complete. Nothing was updated.'
          : updateError ?? 'Update available'}</span>
    <button
      class="service-worker-update-action"
      class:canceling={reloadingForUpdate}
      type="button"
      onclick={reloadingForUpdate ? cancelUpdate : updateError ? reloadPage : applyUpdate}
    >{reloadingForUpdate
        ? 'Cancel'
        : previewComplete
          ? 'Show again'
          : updateError
            ? 'Reload page'
            : 'Apply'}</button>
    {#if !reloadingForUpdate}
      <button
        type="button"
        aria-label="Dismiss update"
        onclick={() => (visible = false)}
      >
        Later
      </button>
    {/if}
  </div>
{/if}

<style>
  .service-worker-update {
    --update-ink: var(--text-color, var(--site-text, #f5f7fa));
    --update-paper: var(--paper-color, var(--site-surface, #11161d));
    position: fixed;
    z-index: 10000;
    left: 50%;
    bottom: calc(1rem + env(safe-area-inset-bottom, 0px));
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.45rem;
    box-sizing: border-box;
    width: max-content;
    max-width: calc(
      100vw - max(1rem, env(safe-area-inset-left, 0px)) -
        max(1rem, env(safe-area-inset-right, 0px))
    );
    border: 1px solid color-mix(in srgb, var(--update-ink) 12%, transparent);
    border-radius: 999px;
    padding: 0.45rem 0.5rem 0.45rem 0.75rem;
    background: color-mix(in srgb, var(--update-paper) 94%, transparent);
    box-shadow: 0 16px 36px -28px black;
    color: var(--update-ink);
    font: 400 0.86rem/1.4 var(--hebrew-ui-font-family, sans-serif);
    transform: translateX(-50%);
    backdrop-filter: blur(18px);
  }

  span {
    overflow-wrap: anywhere;
  }

  button {
    border: 0;
    flex-shrink: 0;
    border-radius: 999px;
    padding: 0.32rem 0.45rem;
    background: transparent;
    color: var(--light-text-color, var(--update-ink));
    font: inherit;
    cursor: pointer;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }

  .service-worker-update-action {
    padding: 0.32rem 0.62rem;
    background: color-mix(in srgb, var(--update-ink) 80%, white);
    color: var(--update-paper);
    font-weight: 500;
  }

  .service-worker-update-action.canceling {
    background: #8b2040;
    color: #ffffff;
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
      opacity: 0.8;
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
