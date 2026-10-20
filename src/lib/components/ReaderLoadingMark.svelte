<script lang="ts">
  import { onMount, untrack } from 'svelte'
  import { READER_ALEPH_PATH as aleph } from './reader-loading.ts'
  import { createLoadingFill, type LoadingFill } from './reader-loading-fill.ts'

  // `step` is the size of the next real startup step. Pass a shared `fill` to keep
  // several copies of the mark in lockstep.
  let { progress, step, onfilled, fill: sharedFill }: {
    progress: number
    step: number
    onfilled?: () => void
    fill?: LoadingFill
  } = $props()
  let fillElement: SVGSVGElement | undefined = $state()
  const fill = untrack(() => sharedFill) ?? createLoadingFill()
  const initialEmpty = untrack(() => (1 - progress) * 100)

  $effect.pre(() => fill.set(progress, step))

  onMount(() => {
    if (!fillElement) return
    const detach = fill.attach(fillElement)
    const unsubscribe = onfilled ? fill.onFilled(onfilled) : undefined
    return () => {
      unsubscribe?.()
      detach()
    }
  })
</script>

<div class="reader-loading-mark" aria-hidden="true">
  <svg class="reader-loading-track" viewBox="0 0 16 16" focusable="false">
    <path d={aleph} fill="currentColor" />
  </svg>
  <svg
    class="reader-loading-fill"
    viewBox="0 0 16 16"
    focusable="false"
    bind:this={fillElement}
    style="clip-path: inset(0 0 {initialEmpty}% 0)"
  >
    <path d={aleph} fill="currentColor" />
  </svg>
</div>

<style>
  .reader-loading-mark {
    position: relative;
    width: 6rem;
    height: 6rem;
    color: var(--text-color);
  }

  svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  .reader-loading-track { opacity: 0.09; }

  /* Before the script runs, ease through the rendered document's share and
     settle below the smallest possible creep cap until the script takes over. */
  .reader-loading-fill:not(:global(.live)) {
    animation: reader-fill-start 2.6s cubic-bezier(0.25, 0.6, 0.3, 1) both;
  }

  @keyframes reader-fill-start {
    from { clip-path: inset(0 0 100% 0); }
    to { clip-path: inset(0 0 76% 0); }
  }

  :global(html[data-reader-reduced-motion='on']) .reader-loading-fill {
    animation: none;
  }

  @media (prefers-reduced-motion: reduce) {
    :global(html:not([data-reader-reduced-motion='off'])) .reader-loading-fill {
      animation: none;
    }
  }

  @media (forced-colors: active) {
    .reader-loading-mark { color: CanvasText; }
    .reader-loading-track { opacity: 0.25; }
  }
</style>
