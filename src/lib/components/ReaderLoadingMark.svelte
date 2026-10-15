<script lang="ts">
  import { READER_ALEPH_PATH as aleph } from './reader-loading.ts'

  let { progress }: { progress: number } = $props()
</script>

<div class="reader-loading-mark" aria-hidden="true">
  <svg class="reader-loading-track" viewBox="0 0 16 16" focusable="false">
    <path d={aleph} fill="currentColor" />
  </svg>
  <div class="reader-loading-entry" class:complete={progress === 1}>
    <svg
      class="reader-loading-fill"
      viewBox="0 0 16 16"
      focusable="false"
      style:--fill-empty="{(1 - progress) * 100}%"
    >
      <path d={aleph} fill="currentColor" />
    </svg>
  </div>
</div>

<style>
  .reader-loading-mark {
    position: relative;
    width: 6rem;
    height: 6rem;
    color: var(--text-color);
  }

  svg, .reader-loading-entry {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  .reader-loading-track { opacity: 0.09; }
  .reader-loading-fill {
    clip-path: inset(0 0 var(--fill-empty) 0);
    transition: clip-path 180ms cubic-bezier(0.23, 1, 0.32, 1);
  }

  /* Entry and progress use separate masks so early updates cannot restart the fill. */
  .reader-loading-entry {
    clip-path: inset(0);
    animation: reader-mark-start 180ms linear;
  }

  .reader-loading-entry.complete {
    animation: none;
  }

  .reader-loading-entry.complete .reader-loading-fill {
    transition: none;
  }

  @keyframes reader-mark-start {
    from { clip-path: inset(0 0 100% 0); }
    to { clip-path: inset(0 0 0% 0); }
  }

  :global(html[data-reader-reduced-motion='on']) :is(.reader-loading-entry, .reader-loading-fill) {
    transition: none;
    animation: none;
  }

  @media (prefers-reduced-motion: reduce) {
    :global(html:not([data-reader-reduced-motion='off'])) :is(.reader-loading-entry, .reader-loading-fill) {
      transition: none;
      animation: none;
    }
  }

  @media (forced-colors: active) {
    .reader-loading-mark { color: CanvasText; }
    .reader-loading-track { opacity: 0.25; }
  }
</style>
