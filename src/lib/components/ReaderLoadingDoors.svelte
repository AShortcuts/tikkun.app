<script lang="ts">
  import { READER_ALEPH_PATH } from './reader-loading.ts'

  let { open, oncomplete }: { open: boolean; oncomplete: () => void } = $props()
  let upperDoor: HTMLDivElement | undefined = $state()

  $effect(() => {
    if (!open || !upperDoor) return
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
  data-target-id="reader-boot-state"
  data-state={open ? 'opening' : 'loading'}
  role="status"
  aria-live="polite"
  aria-hidden={open}
>
  <span class="loading-status">Opening your reading…</span>
  <div class="reader-door northeast" bind:this={upperDoor} aria-hidden="true">
    <div class="door-paper">
      <svg class="aleph" viewBox="0 0 16 16" focusable="false">
        <path d={READER_ALEPH_PATH} fill="currentColor" />
      </svg>
    </div>
  </div>
  <div class="reader-door southwest" aria-hidden="true">
    <div class="door-paper">
      <svg class="aleph" viewBox="0 0 16 16" focusable="false">
        <path d={READER_ALEPH_PATH} fill="currentColor" />
      </svg>
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

  .open .southwest .door-paper {
    --door-tint: color-mix(in srgb, var(--text-color) 3%, transparent);
    background-image: linear-gradient(var(--door-tint), var(--door-tint));
  }

  .aleph {
    position: absolute;
    left: 50%;
    top: 50%;
    width: var(--mark-size);
    height: var(--mark-size);
    transform: translate(-50%, -50%);
    animation: aleph-appear 300ms ease-out;
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

  .open .reader-door {
    will-change: transform;
    animation: door-open 680ms cubic-bezier(0.76, 0, 0.24, 1) both;
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

  @keyframes aleph-appear { from { opacity: 0.55; } to { opacity: 1; } }
  @keyframes caption-appear { from { opacity: 0; } to { opacity: 1; } }
  :global(html[data-reader-reduced-motion='on']) :is(.reader-door, .aleph, .caption) {
    animation: none;
  }

  :global(html[data-reader-reduced-motion='on']) .open { visibility: hidden; }

  @media (prefers-reduced-motion: reduce) {
    :global(html:not([data-reader-reduced-motion='off'])) :is(.reader-door, .aleph, .caption) {
      animation: none;
    }

    :global(html:not([data-reader-reduced-motion='off'])) .open { visibility: hidden; }
  }

  @media (forced-colors: active) {
    .door-paper, .open .southwest .door-paper { background: Canvas; }
    .aleph, .caption { color: CanvasText; }
  }
</style>
