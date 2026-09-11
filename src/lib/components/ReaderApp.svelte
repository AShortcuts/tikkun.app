<script lang="ts">
  import { resolve } from '$app/paths'
  import { goto, onNavigate } from '$app/navigation'
  import { getContext, onMount } from 'svelte'
  import { DOWNLOAD_OWNER_CONTEXT, type DownloadOwner } from '../../../app/offline/download-owner.ts'
  import { NATIVE_READING_LINKS_CONTEXT, type NativeReadingLinks } from '../../../app/platform/native-reading-links.ts'
  import type { ReaderAppOptions } from '../../../app/index.ts'
  import '../../../css/master.css'
  import { prepareNativeContent, nativeContentReady, checkNativeContent } from '../../../app/updates/content-runtime.ts'
  import { nativeWebReady } from '../../../app/updates/web-runtime.ts'

  type ReaderAppModule = {
    startApp(options?: ReaderAppOptions): { readonly ready: Promise<void> }
    stopApp(): void
  }

  type ReaderBootState = 'loading' | 'ready' | 'failed'

  const loadDefaultReaderApp = () => import('../../../app/index.ts')
  const downloadOwner = getContext<DownloadOwner | undefined>(DOWNLOAD_OWNER_CONTEXT)
  const nativeLinks = getContext<NativeReadingLinks | null>(NATIVE_READING_LINKS_CONTEXT)

  let {
    aboutHref,
    loadApp = loadDefaultReaderApp,
    reloadPage = () => window.location.reload(),
  }: {
    aboutHref: string
    loadApp?: () => Promise<ReaderAppModule>
    reloadPage?: () => void
  } = $props()

  let bootState = $state<ReaderBootState>('loading')
  let themeColor = $state('oklch(98.5% 0 0)')
  let disposed = false
  let bootRevision = 0
  let stopApp: (() => void) | null = null
  let reloadOnRetry = false

  onNavigate(({ from, to }) => {
    if (from?.route.id === to?.route.id) return
    // Imperative Reader roots must unmount before SvelteKit replaces their DOM.
    bootRevision += 1
    stopApp?.()
    stopApp = null
  })

  function retryReader() {
    // Failed dynamic text imports can remain cached for this document's lifetime.
    if (reloadOnRetry) reloadPage()
    else void bootReader()
  }

  async function bootReader() {
    const revision = ++bootRevision
    bootState = 'loading'
    reloadOnRetry = false

    let app: ReaderAppModule | null = null
    try {
      await nativeLinks?.ready
      await prepareNativeContent()
      if (disposed || revision !== bootRevision) return
      app = await loadApp()
      if (disposed || revision !== bootRevision) return

      // aboutHref is already base-path resolved by the owning route.
      // eslint-disable-next-line svelte/no-navigation-without-resolve
      const reader = app.startApp({ downloadOwner, openAbout: () => goto(aboutHref) })
      if (disposed || revision !== bootRevision) {
        app.stopApp()
        return
      }

      stopApp = () => app?.stopApp()
      reloadOnRetry = true
      await reader.ready
      if (disposed || revision !== bootRevision) return
      bootState = 'ready'
      void nativeContentReady()
      void nativeWebReady()
    } catch (error) {
      if (disposed || revision !== bootRevision) return
      if (app) {
        try {
          app.stopApp()
        } catch (cleanupError) {
          console.error(
            'Failed to clean up the Reader after startup',
            cleanupError
          )
        }
      }
      stopApp = null
      console.error('Failed to start the Reader', error)
      bootState = 'failed'
    }
  }

  onMount(() => {
    if (window.location.hash.split('?', 1)[0] === '#/about') {
      window.location.replace(aboutHref)
      return
    }

    const root = document.documentElement
    const colorScheme = window.matchMedia('(prefers-color-scheme: dark)')
    const syncThemeColor = () => {
      const resolvedPaperColor = getComputedStyle(document.body)
        .getPropertyValue('--paper-color')
        .trim()
      themeColor = resolvedPaperColor || 'oklch(98.5% 0 0)'
    }
    const themeObserver = new MutationObserver(syncThemeColor)
    themeObserver.observe(root, {
      attributes: true,
      attributeFilter: ['data-reader-theme'],
    })
    colorScheme.addEventListener('change', syncThemeColor)
    syncThemeColor()

    void bootReader()
    const checkUpdates = () => { if (document.visibilityState === 'visible') void checkNativeContent() }
    window.addEventListener('online', checkUpdates)
    document.addEventListener('visibilitychange', checkUpdates)

    return () => {
      disposed = true
      window.removeEventListener('online', checkUpdates)
      document.removeEventListener('visibilitychange', checkUpdates)
      bootRevision += 1
      themeObserver.disconnect()
      colorScheme.removeEventListener('change', syncThemeColor)
      stopApp?.()
      stopApp = null
    }
  })
</script>

<svelte:head>
  <meta name="theme-color" content={themeColor} />
</svelte:head>

<div
  class="app"
  data-target-id="app-root"
  data-about-href={aboutHref}
  data-reader-boot-state={bootState}
  aria-busy={bootState === 'loading'}
>
  <div data-target-id="reader-shell-anchor" hidden></div>
  <div data-target-id="cue-authoring-panel-root"></div>
  <div data-target-id="cue-authoring-access-dialog-root"></div>
  <div data-target-id="command-palette-root"></div>
  <div data-target-id="recording-issue-dialog-root"></div>
  <div
    class="reader-issue-toast u-hidden"
    data-target-id="reader-issue-toast"
    role="status"
    aria-live="polite"
  ></div>
  <div
    class="reader-issue-toast u-hidden"
    data-target-id="persistence-toast"
    role="status"
    aria-live="polite"
  ></div>
  <div data-target-id="cue-authoring-export-sheet-root"></div>
  <audio data-target-id="reader-audio"></audio>
  <div id="debug" class="u-hidden">
    <button type="button" data-target-id="debug-focal-measure-toggle">
      Toggle focal measure
    </button>
  </div>
  <div
    class="app-offline-prompt u-hidden"
    data-target-id="app-offline-prompt"
    role="status"
    aria-live="polite"
  >
    <span>
      This recording isn't available offline. It will retry when your connection
      returns.
    </span>
    <button
      class="app-update-dismiss"
      data-target-id="app-offline-dismiss"
      type="button"
      aria-label="Dismiss offline recording prompt"
    >OK</button>
  </div>

  {#if bootState !== 'ready'}
    <section
      class="reader-boot-state"
      data-target-id="reader-boot-state"
      data-state={bootState}
      role={bootState === 'failed' ? 'alert' : 'status'}
      aria-live={bootState === 'failed' ? 'assertive' : 'polite'}
    >
      {#if bootState === 'loading'}
        <p>Opening Reader…</p>
      {:else}
        <div class="reader-boot-panel">
          <h1>Reader couldn’t start</h1>
          <p>Try again, or continue from the reading index.</p>
          <div class="reader-boot-actions">
            <button type="button" onclick={retryReader}>
              Try again
            </button>
            <a href={resolve('/readings/')}>Reading index</a>
            <a href={resolve('/about/')}>About</a>
          </div>
        </div>
      {/if}
    </section>
  {/if}
</div>

<style>
  .reader-boot-state {
    position: fixed;
    z-index: 400;
    inset: 0;
    display: grid;
    place-items: center;
    padding:
      max(1.25rem, env(safe-area-inset-top, 0px))
      max(1.25rem, env(safe-area-inset-right, 0px))
      max(1.25rem, env(safe-area-inset-bottom, 0px))
      max(1.25rem, env(safe-area-inset-left, 0px));
    background: var(--paper-color);
    color: var(--text-color);
    text-align: center;
  }

  .reader-boot-panel {
    display: grid;
    gap: 0.85rem;
    width: min(28rem, 100%);
  }

  .reader-boot-panel h1 {
    font-size: clamp(1.35rem, 5vw, 1.8rem);
    line-height: 1.15;
  }

  .reader-boot-panel p,
  .reader-boot-state > p {
    color: var(--light-text-color);
    line-height: 1.5;
  }

  .reader-boot-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.55rem;
    margin-top: 0.25rem;
  }

  .reader-boot-actions button,
  .reader-boot-actions a {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 2.75rem;
    border: 1px solid color-mix(in srgb, var(--text-color) 16%, transparent);
    border-radius: var(--button-border-radius);
    padding: 0.62rem 0.85rem;
    background: var(--light-accent-color);
    color: var(--text-color);
    cursor: pointer;
    font: inherit;
    text-decoration: none;
    touch-action: manipulation;
  }

  .reader-boot-actions button {
    background: var(--text-color);
    color: var(--paper-color);
  }

  .reader-boot-actions button:focus-visible,
  .reader-boot-actions a:focus-visible {
    outline: 2px solid var(--reader-focus-color);
    outline-offset: 2px;
  }

  @media (forced-colors: active) {
    .reader-boot-actions button:focus-visible,
    .reader-boot-actions a:focus-visible {
      outline-color: Highlight;
    }
  }
</style>
