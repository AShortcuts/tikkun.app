<script lang="ts">
  import UiIcon from '../components/UiIcon.svelte'
  import { nativeUpdateState, releaseStatus, updatesBusy } from './update-state.ts'
  import { applyPreparedUpdate, checkNativeUpdates } from './native-updates.ts'
  import { appStoreState } from './app-store.ts'
  import { APP_STORE_URL } from './app-store-info.ts'
  import { releaseLabel } from './release-identity.ts'
  import { RELEASE_LABEL } from './release-version.ts'

  const version = RELEASE_LABEL ?? 'Development build'
  const busy = $derived(updatesBusy($nativeUpdateState))
  // Below the Minimum App Store Version, web updates wait for the App Store update.
  const status = $derived($appStoreState.status === 'required' ? null : releaseStatus($nativeUpdateState))
  const checkedAt = $derived(Math.max($nativeUpdateState.web.checkedAt ?? 0, $nativeUpdateState.content.checkedAt ?? 0) || null)
</script>

<section class="settings-section" aria-label="App updates">
  <h4 class="settings-section-title">App Updates</h4>
  <dl class="update-versions">
    <div>
      <dt>Version</dt>
      <dd role="status" aria-live="polite">{version}{#if status}<span class="update-state">&nbsp;· {status}</span>{/if}</dd>
    </div>
    {#if $appStoreState.installed}
      <div>
        <dt>App Store</dt>
        <dd>{releaseLabel($appStoreState.installed)}{#if $appStoreState.status === 'latest'}<span class="update-state">&nbsp;· Latest</span>{:else if $appStoreState.status}<span class="update-state">&nbsp;·&nbsp;</span><a href={APP_STORE_URL} target="_blank" rel="noopener">{$appStoreState.status === 'required' ? 'Update required' : 'Update in the App Store'}</a>{/if}</dd>
      </div>
    {/if}
  </dl>
  <div class="update-actions">
    {#if status === 'Update ready'}
      <button type="button" class="settings-offline-button" disabled={busy} onclick={() => void applyPreparedUpdate()}>Apply Update</button>
    {/if}
    <button type="button" class="settings-offline-button" disabled={busy} onclick={() => void checkNativeUpdates(true)}>
      <UiIcon name="reset" />
      <span>{busy ? ($nativeUpdateState.applying ? 'Applying...' : 'Checking...') : 'Check for Updates'}</span>
    </button>
  </div>
  {#if $nativeUpdateState.applyError}
    <p class="update-error" role="alert">{$nativeUpdateState.applyError}</p>
  {/if}
  {#if checkedAt}
    <p class="update-checked">Last checked {new Date(checkedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</p>
  {/if}
</section>

<style>
  .update-versions { display: grid; gap: 0.4rem; margin: 0 0 0.85rem; font-size: 0.82rem; line-height: 1.45; }
  .update-versions div { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 0.25rem 0.75rem; }
  .update-versions dt { color: var(--light-text-color); }
  .update-versions dd { margin: 0; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
  .update-state { color: var(--light-text-color); }
  .update-versions a { color: inherit; text-decoration-thickness: 1px; text-underline-offset: 0.18em; }
  .update-actions { display: flex; flex-wrap: wrap; gap: 0.6rem; }
  .update-actions button { display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem; min-height: 44px; min-width: 0; white-space: normal; }
  .update-error, .update-checked { margin: 0.65rem 0 0; font-size: 0.82rem; line-height: 1.45; overflow-wrap: anywhere; }
  .update-checked { color: var(--light-text-color); font-size: 0.75rem; }
</style>
