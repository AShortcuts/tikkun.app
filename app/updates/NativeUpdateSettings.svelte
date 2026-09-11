<script lang="ts">
  import UiIcon from '../components/UiIcon.svelte'
  import { nativeUpdateState, updatesBusy, updateStatusText } from './update-state.ts'
  import { checkNativeUpdates } from './native-updates.ts'
  const busy = $derived(updatesBusy($nativeUpdateState))
  const checkedAt = $derived(Math.max($nativeUpdateState.web.checkedAt ?? 0, $nativeUpdateState.content.checkedAt ?? 0))
</script>

<section class="settings-section" aria-label="App updates">
  <h4 class="settings-section-title">App Updates</h4>
  <div class="update-actions">
    <button type="button" class="settings-offline-button" disabled={busy} onclick={() => void checkNativeUpdates(true)}>
      <UiIcon name="reset" />
      <span>{busy ? ($nativeUpdateState.applying ? 'Applying...' : 'Checking...') : 'Check for Updates'}</span>
    </button>
  </div>
  <p class="update-status" role="status" aria-live="polite">{updateStatusText($nativeUpdateState)}</p>
  {#if checkedAt}
    <p class="update-checked">Last checked {new Date(checkedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</p>
  {/if}
</section>

<style>
  .update-actions { display: flex; flex-wrap: wrap; gap: 0.6rem; }
  .update-actions button { display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem; min-height: 44px; min-width: 0; white-space: normal; }
  .update-status, .update-checked { margin: 0.65rem 0 0; font-size: 0.82rem; line-height: 1.45; overflow-wrap: anywhere; }
  .update-checked { color: var(--light-text-color); font-size: 0.75rem; }
</style>
