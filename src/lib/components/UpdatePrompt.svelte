<script lang="ts">
  let {
    message = 'Update available', applying = false, error = false,
    actionLabel = 'Apply', actionDisabled = false,
    label, onaction, ondismiss,
  }: {
    message?: string
    applying?: boolean
    error?: boolean
    actionLabel?: string
    actionDisabled?: boolean
    label?: string
    onaction: () => void
    ondismiss: () => void
  } = $props()
</script>

<div
  class="service-worker-update"
  role={error ? 'alert' : 'status'}
  aria-label={label}
  aria-live={error ? 'assertive' : 'polite'}
  aria-busy={applying}
>
  <span>{message}</span>
  <button
    class="service-worker-update-action"
    class:canceling={applying}
    type="button"
    disabled={actionDisabled}
    onclick={onaction}
  >{actionLabel}</button>
  {#if !applying}
    <button type="button" aria-label="Dismiss update" onclick={ondismiss}>Later</button>
  {/if}
</div>

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

  span { overflow-wrap: anywhere; }

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

  button:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
  button:disabled { cursor: default; opacity: 0.62; }

  @media (hover: hover) and (pointer: fine) {
    button:not(:disabled):hover { opacity: 0.8; }
  }

  @media (forced-colors: active) {
    .service-worker-update { border-color: CanvasText; }
    button:focus-visible { outline-color: Highlight; }
  }
</style>
