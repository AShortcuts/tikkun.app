<script lang="ts">
  import { onMount } from 'svelte'
  import { resolve } from '$app/paths'
  import { CUE_AUTHORING_UNLOCKED_KEY, CUE_AUTHORING_PANEL_OPEN_KEY, readCueAuthoringAccessState, verifyCueAuthoringUnlockCode } from '../../../../app/admin/access.ts'
  import SupportDiagnosticsActions from '../../../../app/support/SupportDiagnosticsActions.svelte'

  const addressKey = 'tikkun-aligner-address'
  let unlocked = $state(false)
  let code = $state('')
  let error = $state('')
  let address = $state('http://127.0.0.1:8768/')
  let savedAddress = $state('http://127.0.0.1:8768/')
  let addressStatus = $state('')

  function validAddress(value: string) {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
      throw new Error('Enter an HTTP or HTTPS address without a username or password.')
    }
    return url.href
  }

  onMount(() => {
    try {
      unlocked = readCueAuthoringAccessState(sessionStorage).unlocked
      const saved = localStorage.getItem(addressKey)
      if (saved) address = savedAddress = validAddress(saved)
    } catch {
      error = 'Browser settings could not be restored. Unlock again or enter the aligner address.'
    }
  })

  function unlock(event: SubmitEvent) {
    event.preventDefault()
    if (!verifyCueAuthoringUnlockCode(code)) { error = 'Incorrect access code.'; return }
    try {
      sessionStorage.setItem(CUE_AUTHORING_UNLOCKED_KEY, '1')
      unlocked = true
      code = ''
      error = ''
    } catch { error = 'Browser storage is unavailable. Allow session storage to unlock admin tools.' }
  }

  function lock() {
    try {
      sessionStorage.removeItem(CUE_AUTHORING_UNLOCKED_KEY)
      sessionStorage.removeItem(CUE_AUTHORING_PANEL_OPEN_KEY)
      unlocked = false
      error = ''
    } catch { error = 'Could not lock this session. Close this tab to end the session.' }
  }

  function openRecording(event: MouseEvent) {
    try { sessionStorage.setItem(CUE_AUTHORING_PANEL_OPEN_KEY, '1') }
    catch { event.preventDefault(); error = 'Could not open recording tools. Allow session storage and try again.' }
  }

  function saveAddress(event: SubmitEvent) {
    event.preventDefault()
    try {
      const next = validAddress(address)
      localStorage.setItem(addressKey, next)
      address = savedAddress = next
      addressStatus = 'Address saved on this browser.'
    } catch { addressStatus = 'Could not save. Enter a valid HTTP or HTTPS address and allow browser storage.' }
  }
</script>

<svelte:head>
  <title>Admin settings — Tikkun Korim</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<main class="site-content-page admin-settings">
  <h1>Admin settings</h1>
  <p>Recording, alignment, and project tools.</p>
  {#if error}<p role="alert">{error}</p>{/if}
  {#if !unlocked}
    <form onsubmit={unlock} class="settings-form">
      <label for="admin-code">Cue Authoring access code</label>
      <div class="settings-controls">
        <input id="admin-code" type="password" bind:value={code} autocomplete="off" required />
        <button class="site-primary-action" type="submit">Unlock</button>
      </div>
    </form>
    <p class="settings-note">This is the reader's local convenience lock, not account authentication.</p>
  {:else}
    <section aria-labelledby="aligner-title">
      <h2 id="aligner-title">Torah Audio Aligner</h2>
      <p>Batch recordings, review flagged timings, and download generated cue files.</p>
      <!-- External HTTP(S) service URL, validated before saving; not a SvelteKit route. -->
      <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
      <a class="site-primary-action" href={savedAddress} target="_blank" rel="noopener noreferrer">Open audio aligner</a>
      <p class="settings-note">The private aligner must be running on your Mac. Opening it does not start alignment jobs.</p>
      <details>
        <summary>Aligner connection</summary>
        <form onsubmit={saveAddress} class="settings-form">
          <label for="aligner-address">Aligner address</label>
          <div class="settings-controls">
            <input id="aligner-address" type="url" bind:value={address} required spellcheck="false" />
            <button class="site-secondary-action" type="submit">Save address</button>
          </div>
          <p role="status">{addressStatus}</p>
        </form>
        <p>Default: cue-flag beta on port 8768. The earlier beta on port 8769 has separate saved work. Select the address containing your recordings.</p>
      </details>
    </section>
    <section aria-labelledby="record-title">
      <h2 id="record-title">Record & review cues</h2>
      <p>Choose an aliyah in the reader, import cues, adjust the waveform timings, and review orange flags.</p>
      <a class="site-secondary-action" href={resolve('/reader/#/next')} onclick={openRecording}>Open recording panel</a>
    </section>
    <section aria-labelledby="project-title">
      <h2 id="project-title">Project tools</h2>
      <div class="site-action-row">
        <a class="site-secondary-action" href={resolve('/reader/#/about/playback-analytics')}>Cue analytics</a>
        <a class="site-secondary-action" href={resolve('/readings/')}>Readings & coverage</a>
        <a class="site-secondary-action" href={resolve('/about/#taskboard-title')}>Taskboard</a>
      </div>
    </section>
    <section aria-labelledby="diagnostics-title">
      <h2 id="diagnostics-title">Diagnostics</h2>
      <SupportDiagnosticsActions variant="site" />
    </section>
    <button class="site-secondary-action" type="button" onclick={lock}>Lock admin tools</button>
  {/if}
</main>

<style>
  .admin-settings { max-width: 60rem; margin-inline: auto; }
  h1 { font-size: clamp(2rem, 5vw, 3rem); }
  section { padding-block: 1.75rem; border-bottom: 1px solid var(--site-border, #38404b); margin-bottom: 1.5rem; }
  h2 { margin: 0 0 .75rem; }
  p { max-width: 65ch; line-height: 1.6; }
  .settings-note { font-size: .9rem; }
  .settings-form { margin-block: 1.5rem; }
  label { display: block; margin-bottom: .5rem; }
  .settings-controls { display: flex; flex-wrap: wrap; gap: .75rem; }
  input { min-width: 0; flex: 1 1 16rem; padding: .75rem; border: 1px solid #66717f; border-radius: .5rem; background: #111820; color: #fff; font: inherit; }
  button, summary { cursor: pointer; }
  summary { padding-block: .75rem; }
  :is(input, button, a, summary):focus-visible { outline: 2px solid #e0ba78; outline-offset: 4px; }
</style>
