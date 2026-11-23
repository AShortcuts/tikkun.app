<script lang="ts">
  import { whatsNew } from './data.ts'

  let { open, onclose }: { open: boolean; onclose: () => void } = $props()
</script>

{#if open}
  <button type="button" class="scrim" aria-label="Close What's New" tabindex="-1" onclick={onclose}></button>
  <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="whats-new-title">
    <h2 id="whats-new-title">What's New in v2026.11-r1</h2>
    <ul>
      {#each whatsNew as item (item.title)}<li><strong>{item.title}</strong><span>{item.body}</span></li>{/each}
    </ul>
    <button type="button" class="continue" onclick={onclose}>Continue</button>
  </div>
{/if}

<style>
  .scrim { position: absolute; inset: 0; z-index: 30; background: #0006; animation: fade 200ms ease-out; }
  .sheet {
    position: absolute; left: 0; right: 0; bottom: 0; z-index: 31; display: grid; gap: 20px;
    max-width: 560px; margin: 0 auto; padding: 28px 24px max(24px, env(safe-area-inset-bottom));
    border-radius: 20px 20px 0 0; background: var(--paper); color: var(--ink);
    box-shadow: 0 -12px 40px -16px #0006; animation: rise 320ms var(--ease-drawer);
  }
  h2 { margin: 0; font: 400 26px/1.15 var(--display); text-wrap: balance; }
  ul { display: grid; gap: 16px; margin: 0; padding: 0; list-style: none; }
  li { display: grid; gap: 2px; }
  li strong { font-size: 16px; font-weight: 600; }
  li span { color: var(--muted); font-size: 15px; line-height: 1.45; }
  .continue { min-height: 50px; border-radius: 25px; background: var(--ink-strong); color: var(--paper); font-size: 17px; font-weight: 600; transition: transform 140ms var(--ease-out); }
  .continue:active { transform: scale(0.97); }
  @keyframes rise { from { transform: translateY(100%); } }
  @keyframes fade { from { opacity: 0; } }
  @media (prefers-reduced-motion: reduce) { .sheet { animation: fade 160ms ease-out; } }
</style>
