<script lang="ts">
  import { onMount, tick } from 'svelte'
  import { get } from 'svelte/store'
  import { appStorePreview, appStoreState, checkAppStore, readerShown } from './app-store.ts'
  import { APP_STORE_URL, appStorePromptCopy, appStorePromptDue, postponeAppStorePrompt, type AppStoreState } from './app-store-info.ts'

  // Returns false while audio plays, recording runs, or cues are being edited.
  let { canInterrupt }: { canInterrupt: () => boolean } = $props()
  let dialog = $state<HTMLDialogElement>()
  let shown = $state<AppStoreState | null>(null)
  const copy = $derived(shown?.info && (shown.status === 'available' || shown.status === 'required')
    ? appStorePromptCopy(shown.status, shown.info) : null)

  onMount(() => {
    let active = true
    // Only the launch check can show the prompt; later checks refresh Settings.
    void Promise.all([checkAppStore(), readerShown]).then(async () => {
      const state = get(appStoreState)
      const due = appStorePreview() !== null || appStorePromptDue(state, localStorage, Date.now())
      if (!active || !due || !canInterrupt()) return
      shown = state
      await tick()
      if (!active || !dialog || dialog.open) return
      dialog.showModal()
      // Focus the alert itself, like iOS, so neither button opens with a focus ring.
      dialog.focus()
    })
    return () => { active = false }
  })

  function postpone() {
    if (shown && !appStorePreview()) postponeAppStorePrompt(shown, localStorage, Date.now())
    dialog?.close()
  }
</script>

{#if copy}
  <dialog bind:this={dialog} class="app-store-prompt" aria-labelledby="app-store-prompt-title" tabindex="-1"
    aria-describedby="app-store-prompt-message" onclose={() => { shown = null }}
    oncancel={(event) => { event.preventDefault(); postpone() }}
    onkeydown={(event) => event.stopPropagation()} onkeyup={(event) => event.stopPropagation()}>
    <div class="app-store-prompt-body">
      <h2 id="app-store-prompt-title">{copy.title}</h2>
      <p id="app-store-prompt-message">{copy.message}</p>
    </div>
    <div class="app-store-prompt-actions">
      <button type="button" onclick={postpone}>Later</button>
      <a class="app-store-prompt-update" href={APP_STORE_URL} target="_blank" rel="noopener" onclick={postpone}>Update</a>
    </div>
  </dialog>
{/if}

<style>
  .app-store-prompt {
    width: min(290px, calc(100vw - 48px));
    margin: auto;
    padding: 0;
    border: 0;
    border-radius: 30px;
    overflow: hidden;
    background: color-mix(in srgb, var(--media-surface) 82%, transparent);
    color: var(--media-label);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    text-align: center;
    letter-spacing: 0;
    box-shadow: 0 18px 50px -8px #0006;
    backdrop-filter: blur(30px) saturate(1.6);
    -webkit-backdrop-filter: blur(30px) saturate(1.6);
  }
  .app-store-prompt:focus { outline: none; }
  .app-store-prompt::backdrop { background: #0004; }
  .app-store-prompt-body { padding: 22px 20px 18px; }
  h2 { margin: 0 0 6px; font-size: 17px; line-height: 1.3; font-weight: 600; text-wrap: balance; }
  p { margin: 0; font-size: 14px; line-height: 1.38; text-wrap: pretty; }
  .app-store-prompt-actions { display: flex; gap: 10px; padding: 0 14px 14px; }
  .app-store-prompt-actions > * {
    display: flex; flex: 1; align-items: center; justify-content: center; min-height: 46px; box-sizing: border-box;
    border: 0; border-radius: 23px; padding: 0 12px; background: var(--media-fill); color: var(--media-label);
    font-family: inherit; font-size: 17px; font-weight: 500; line-height: 1; text-decoration: none; cursor: pointer; touch-action: manipulation;
    -webkit-tap-highlight-color: transparent; transition: transform 120ms ease-out, filter 120ms ease-out;
  }
  .app-store-prompt-actions > *:active { transform: scale(0.97); filter: brightness(0.94); }
  .app-store-prompt-actions > *:focus-visible { outline: 2px solid var(--media-tint); outline-offset: 2px; }
  .app-store-prompt-update { background: var(--media-tint); color: var(--media-background); font-weight: 600; }
  @media (prefers-reduced-motion: no-preference) {
    :global(html:not([data-reader-reduced-motion='on'])) .app-store-prompt[open] { animation: app-store-prompt-in 220ms cubic-bezier(0.16, 1, 0.3, 1); }
    @keyframes app-store-prompt-in { from { opacity: 0; transform: scale(1.08); } to { opacity: 1; transform: none; } }
  }
</style>
