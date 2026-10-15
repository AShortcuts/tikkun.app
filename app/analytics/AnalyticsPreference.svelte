<script lang="ts">
  import { onMount } from 'svelte'
  import { ANALYTICS_PREFERENCE_EVENT, analyticsAllowed, setAnalyticsAllowed } from './preferences.ts'

  let { variant = 'public' }: { variant?: 'reader' | 'public' } = $props()
  let allowed = $state(false)
  let ready = $state(false)
  let error = $state('')
  onMount(() => {
    const refresh = () => { allowed = analyticsAllowed(window) }
    refresh()
    ready = true
    window.addEventListener('storage', refresh)
    window.addEventListener(ANALYTICS_PREFERENCE_EVENT, refresh)
    return () => { window.removeEventListener('storage', refresh); window.removeEventListener(ANALYTICS_PREFERENCE_EVENT, refresh) }
  })
  function change(event: Event & { currentTarget: HTMLInputElement }) {
    error = ''
    try { setAnalyticsAllowed(window, event.currentTarget.checked) }
    catch { error = 'This choice applies for this session but could not be saved. Allow site storage to keep it.' }
    allowed = analyticsAllowed(window)
  }
</script>

<div class:analytics-public={variant === 'public'}>
  <label class="settings-field mod-checkbox">
    <input type="checkbox" checked={allowed} disabled={!ready} onchange={change} />
    <span class="settings-field-copy">
      <span class="settings-field-label">Privacy-preserving analytics</span>
      <span class="settings-field-helper">Help improve Tikkun with visits, feature use, and error categories. No search text, saved places, or recordings.</span>
    </span>
  </label>
  {#if error}<p role="alert">{error}</p>{/if}
</div>

<style>
  .analytics-public label { display: flex; align-items: flex-start; gap: 0.75rem; cursor: pointer; }
  .analytics-public input { flex: none; margin-top: 0.35rem; accent-color: var(--site-accent, #2164c7); }
  .analytics-public .settings-field-copy { display: grid; gap: 0.35rem; }
  .analytics-public .settings-field-label { font-weight: 600; }
  .analytics-public .settings-field-helper { font-size: 0.9rem; line-height: 1.6; }
</style>
