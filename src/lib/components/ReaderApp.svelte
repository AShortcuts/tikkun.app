<script lang="ts">
  import { resolve } from '$app/paths'
  import { goto, onNavigate } from '$app/navigation'
  import { getContext, onMount } from 'svelte'
  import { DOWNLOAD_OWNER_CONTEXT, type DownloadOwner } from '../../../app/offline/download-owner.ts'
  import { NATIVE_READING_LINKS_CONTEXT, type NativeReadingLinks } from '../../../app/platform/native-reading-links.ts'
  import type { ReaderAppOptions } from '../../../app/index.ts'
  import '../../../css/master.css'
  import readerTheme from '../../../css/reader-theme.css?raw'
  import { prepareNativeContent, nativeContentReady } from '../../../app/updates/content-runtime.ts'
  import { nativeWebReady } from '../../../app/updates/web-runtime.ts'
  import { checkNativeUpdates } from '../../../app/updates/native-updates.ts'
  import { isNativeApp } from '../../../app/platform/native.ts'
  import ReaderLoadingMark from './ReaderLoadingMark.svelte'
  import ReaderLoadingDoors from './ReaderLoadingDoors.svelte'
  import { READER_LOADING_ANIMATION, type ReaderLoadingAnimation } from './reader-loading.ts'

  type ReaderAppModule = {
    startApp(options?: ReaderAppOptions): { readonly ready: Promise<void> }
    stopApp(): void
  }

  type ReaderBootState = 'loading' | 'ready' | 'failed'

  const documentProgress = 0.2
  const readerThemeStyle = `<style data-reader-theme-critical>${readerTheme}</style>`
  const loadDefaultReaderApp = () => import('../../../app/index.ts')
  const downloadOwner = getContext<DownloadOwner | undefined>(DOWNLOAD_OWNER_CONTEXT)
  const nativeLinks = getContext<NativeReadingLinks | null>(NATIVE_READING_LINKS_CONTEXT)

  let {
    aboutHref,
    loadApp = loadDefaultReaderApp,
    reloadPage = () => window.location.reload(),
    loadingAnimation = READER_LOADING_ANIMATION,
  }: {
    aboutHref: string
    loadApp?: () => Promise<ReaderAppModule>
    reloadPage?: () => void
    loadingAnimation?: ReaderLoadingAnimation
  } = $props()

  let bootState = $state<ReaderBootState>('loading')
  let bootProgress = $state(documentProgress)
  let doorsVisible = $state(true)
  let themeColor = $state(typeof document === 'undefined' ? ''
    : getComputedStyle(document.documentElement).getPropertyValue('--paper-color').trim())
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
    bootProgress = documentProgress
    doorsVisible = true
    reloadOnRetry = false

    const hasNativeContent = Boolean(import.meta.env.TIKKUN_NATIVE_MEDIA_ORIGIN && isNativeApp())
    // The rendered document is the first completed step, before hydration or app import.
    const totalSteps = 4 + Number(Boolean(nativeLinks)) + Number(hasNativeContent)
    const completedSteps: string[] = []
    const completeStep = (step: string) => {
      if (disposed || revision !== bootRevision || bootState !== 'loading' || completedSteps.includes(step)) return
      completedSteps.push(step)
      bootProgress = documentProgress + (1 - documentProgress) * completedSteps.length / totalSteps
    }

    let app: ReaderAppModule | null = null
    try {
      await nativeLinks?.ready
      if (disposed || revision !== bootRevision) return
      if (nativeLinks) completeStep('launch')
      await prepareNativeContent()
      if (disposed || revision !== bootRevision) return
      if (hasNativeContent) completeStep('content')
      app = await loadApp()
      if (disposed || revision !== bootRevision) return
      completeStep('module')

      const reader = app.startApp({
        downloadOwner,
        // aboutHref is already base-path resolved by the owning route.
        // eslint-disable-next-line svelte/no-navigation-without-resolve
        openAbout: () => goto(aboutHref),
        onStartupProgress: completeStep,
      })
      if (disposed || revision !== bootRevision) {
        app.stopApp()
        return
      }

      stopApp = () => app?.stopApp()
      reloadOnRetry = true
      await reader.ready
      if (disposed || revision !== bootRevision) return
      bootProgress = 1
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
    if (!isNativeApp() && window.location.hash.split('?', 1)[0] === '#/about') {
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
      attributeFilter: ['data-reader-theme', 'style'],
    })
    colorScheme.addEventListener('change', syncThemeColor)
    syncThemeColor()

    void bootReader()
    const checkUpdates = () => { if (bootState === 'ready' && document.visibilityState === 'visible') void checkNativeUpdates() }
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
  <!-- eslint-disable-next-line svelte/no-at-html-tags -- Trusted local CSS must paint before the reader bundle loads. -->
  {@html readerThemeStyle}
  <meta id="reader-theme-color" name="theme-color" content={themeColor} />
</svelte:head>

<div
  class="app"
  data-target-id="app-root"
  data-about-href={aboutHref}
  data-reader-boot-state={bootState}
  data-reader-boot-progress={bootProgress}
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

  {#if loadingAnimation === 'doors' && doorsVisible && bootState !== 'failed'}
    <ReaderLoadingDoors open={bootState === 'ready'} oncomplete={() => { doorsVisible = false }} />
  {:else if bootState !== 'ready'}
    <section
      class="reader-boot-state"
      data-target-id="reader-boot-state"
      data-state={bootState}
      role={bootState === 'failed' ? 'alert' : 'status'}
      aria-live={bootState === 'failed' ? 'assertive' : 'polite'}
    >
      {#if bootState === 'loading'}
        <div class="reader-boot-loading">
          <ReaderLoadingMark progress={bootProgress} />
          <p>Opening your reading…</p>
        </div>
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

  .reader-boot-loading {
    display: grid;
    justify-items: center;
    gap: 1.7rem;
  }

  .reader-boot-loading p {
    margin: 0;
    color: var(--light-text-color);
    font-size: 0.8125rem;
    line-height: 1.5;
  }

  .reader-boot-panel h1 {
    font-size: clamp(1.35rem, 5vw, 1.8rem);
    line-height: 1.15;
  }

  .reader-boot-panel p {
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
