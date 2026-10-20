<script lang="ts">
  import ReaderLoadingMark from './ReaderLoadingMark.svelte'
  import { createLoadingFill } from './reader-loading-fill.ts'

  let { open, progress, step, oncomplete }: {
    open: boolean
    progress: number
    step: number
    oncomplete: () => void
  } = $props()
  let upperDoor: HTMLDivElement | undefined = $state()
  // The doors part only once the fill has visibly completed, then hold briefly.
  let filled = $state(false)
  const parting = $derived(open && filled)
  // Both halves share one fill, so the aleph stays whole until it splits.
  const fill = createLoadingFill()

  $effect(() => {
    if (!parting || !upperDoor) return
    const animations = upperDoor.getAnimations()
    const complete = oncomplete
    let active = true
    // Reduced motion has no animation; cancellation also releases the decorative cover.
    void Promise.allSettled(animations.map(animation => animation.finished)).then(() => {
      if (active) complete()
    })
    return () => { active = false }
  })
</script>

<section
  class="reader-loading-doors"
  class:open
  class:parting
  data-target-id="reader-boot-state"
  data-state={open ? 'opening' : 'loading'}
  role="status"
  aria-live="polite"
  aria-hidden={open}
>
  <span class="loading-status">Opening your reading…</span>
  <div class="reader-door northeast" bind:this={upperDoor} aria-hidden="true">
    <div class="door-paper">
      <!-- Each door carries the same fill so the full aleph splits along the seam. -->
      <div class="aleph"><ReaderLoadingMark {progress} {step} {fill} onfilled={() => { filled = true }} /></div>
    </div>
  </div>
  <div class="reader-door southwest" aria-hidden="true">
    <div class="door-paper">
      <div class="aleph"><ReaderLoadingMark {progress} {step} {fill} /></div>
      <p class="caption">Opening your reading…</p>
    </div>
  </div>
</section>

<style>
  .reader-loading-doors {
    --door-size: max(100vw, 100vh);
    --door-travel: calc(25vw + 25vh + 2px);
    --mark-size: clamp(144px, 32vmin, 228px);
    position: fixed;
    z-index: 400;
    inset: 0;
    overflow: hidden;
    color: var(--text-color);
  }

  @supports (height: 100dvh) {
    .reader-loading-doors {
      --door-size: max(100vw, 100dvh);
      --door-travel: calc(25vw + 25dvh + 2px);
    }
  }

  .loading-status {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  /* Keep the viewport corners attached to each moving panel, as in the concept. */
  .reader-door { position: absolute; inset: 0; overflow: hidden; }

  /* A centered square keeps the seam at 45 degrees in portrait and landscape. */
  .door-paper {
    position: absolute;
    left: 50%;
    top: 50%;
    width: var(--door-size);
    height: var(--door-size);
    transform: translate(-50%, -50%);
    background: var(--paper-color);
  }

  .northeast .door-paper {
    clip-path: polygon(0 0, 100% 0, 100% calc(100% + 1px));
  }

  .southwest .door-paper {
    clip-path: polygon(0 0, 100% 100%, 0 100%);
  }

  /* The lower door eases into a slightly deeper tone during the hold before it moves.
     Fading its own color keeps the aleph halves in one layer, so no seam line appears.
     The light, sepia and dark text colors are 70% opaque, so the mix forces full
     alpha; otherwise the door turns slightly see-through and the reading shows. */
  .southwest .door-paper {
    transition: background-color 300ms ease;
  }

  .parting .southwest .door-paper {
    background-color: color-mix(in srgb, rgb(from var(--text-color) r g b / 1) 3%, var(--paper-color));
  }

  .aleph {
    position: absolute;
    left: 50%;
    top: 50%;
    width: var(--mark-size);
    height: var(--mark-size);
    transform: translate(-50%, -50%);
  }

  .aleph :global(.reader-loading-mark) {
    width: 100%;
    height: 100%;
  }

  .caption {
    position: absolute;
    top: calc(50% + var(--mark-size) / 2 + 28px);
    left: 0;
    right: 0;
    margin: 0;
    color: var(--light-text-color);
    text-align: center;
    font-family: Lora, serif;
    font-size: clamp(0.9rem, 2.8vmin, 1.25rem);
    line-height: 1.5;
    animation: caption-appear 320ms ease-out;
  }

  .open { pointer-events: none; }

  .parting .reader-door {
    will-change: transform;
    /* A brief hold on the settled, full aleph before the seal breaks. */
    animation: door-open 680ms cubic-bezier(0.76, 0, 0.24, 1) 300ms both;
  }

  .northeast {
    --door-x: var(--door-travel);
    --door-y: calc(-1 * var(--door-travel));
  }

  .southwest {
    --door-x: calc(-1 * var(--door-travel));
    --door-y: var(--door-travel);
  }

  @keyframes door-open {
    from { transform: translate3d(0, 0, 0); }
    to { transform: translate3d(var(--door-x), var(--door-y), 0); }
  }

  @keyframes caption-appear { from { opacity: 0; } to { opacity: 1; } }
  :global(html[data-reader-reduced-motion='on']) :is(.reader-door, .caption) {
    animation: none;
  }

  :global(html[data-reader-reduced-motion='on']) .open { visibility: hidden; }

  @media (prefers-reduced-motion: reduce) {
    :global(html:not([data-reader-reduced-motion='off'])) :is(.reader-door, .caption) {
      animation: none;
    }

    :global(html:not([data-reader-reduced-motion='off'])) .open { visibility: hidden; }
  }

  @media (forced-colors: active) {
    .door-paper, .parting .southwest .door-paper { background: Canvas; transition: none; }
    .caption { color: CanvasText; }
  }
</style>
