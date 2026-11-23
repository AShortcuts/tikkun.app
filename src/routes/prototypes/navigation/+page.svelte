<script lang="ts">
  import EditorialApp from './EditorialApp.svelte'
  import LedgerApp from './LedgerApp.svelte'
  import UniversalApp from './UniversalApp.svelte'
  import WhatsNewSheet from './WhatsNewSheet.svelte'

  let prototype = $state<'ledger' | 'editorial' | 'universal'>('universal')
  let device = $state<'phone' | 'desktop'>('phone')
  let theme = $state<'light' | 'dark'>('light')
  let tab = $state<'space' | 'library' | 'settings'>('space')
  let whatsNew = $state(false)
  const options = [
    ['Prototype', [['ledger', 'A · Ledger'], ['editorial', 'B · Editorial'], ['universal', 'C · Ledger 2']]],
    ['Device', [['phone', 'Phone'], ['desktop', 'Desktop']]],
    ['Theme', [['light', 'Light'], ['dark', 'Dark']]],
  ] as const
  function choose(group: string, value: string) {
    if (group === 'Prototype') prototype = value as typeof prototype
    if (group === 'Device') device = value as typeof device
    if (group === 'Theme') theme = value as typeof theme
  }
  const current = (group: string) => group === 'Prototype' ? prototype : group === 'Device' ? device : theme
</script>

<svelte:head><title>Navigation prototypes | Tikkun Reader</title></svelte:head>

<div class="stage" data-theme={theme}>
  <header class="switcher" aria-label="Prototype controls">
    {#each options as [group, values] (group)}
      <div class="seg" role="group" aria-label={group}>
        {#each values as [value, label] (value)}
          <button type="button" aria-pressed={current(group) === value} onclick={() => choose(group, value)}>{label}</button>
        {/each}
      </div>
    {/each}
    <button type="button" class="plain" onclick={() => { whatsNew = true }}>Show What's New</button>
  </header>

  <div class="frame" class:phone={device === 'phone'} data-prototype={prototype}>
    {#key prototype}
      {#if prototype === 'ledger'}<LedgerApp bind:tab />
      {:else if prototype === 'editorial'}<EditorialApp bind:tab />
      {:else}<UniversalApp bind:tab onwhatsnew={() => { whatsNew = true }} />{/if}
    {/key}
    <WhatsNewSheet open={whatsNew} onclose={() => { whatsNew = false }} />
  </div>
  <p class="note">Prototype only. Readings, dates and recordings are real; your readings, bookmarks, progress and downloads are sample data. Nothing here changes the app.</p>
</div>

<style>
  @font-face { font-family: 'Proto Stam'; src: url('/assets/fonts/ShlomosemiStam.woff2') format('woff2'); font-display: block; }
  @font-face { font-family: 'Proto Lora'; src: url('/assets/fonts/Lora-Regular.woff2') format('woff2'); font-display: swap; }
  @font-face { font-family: 'Proto Noto'; src: url('/assets/fonts/NotoSansHebrew-Variable.woff2') format('woff2'); font-weight: 100 900; unicode-range: U+0590-05FF, U+FB1D-FB4F; }

  .stage {
    --stam: 'Proto Stam', serif;
    --display: 'Proto Lora', Georgia, serif;
    --ui: 'Proto Noto', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
    --ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);
    /* Light: the reader's paper with one ground step; the one hue is the app's blue. */
    --paper: #fafaf9; --ground: #f2f2f0; --surface: #ffffff; --surface-strong: #e9e9e6;
    --ink: #1d2025; --ink-strong: #111317; --muted: #5f6268; --faint: #8e9096;
    --accent: #1d5fbf; --accent-strong: #1a4f9c; --accent-tint: #e6edf9; --accent-ink: #ffffff;
    --rule: #e5e5e1; --rule-strong: #d2d2cd; --hover: #0000000a; --panel: #f1f1ee;
    --highlight: #d6e4fa; --highlight-ink: #0d1a2e;
    min-height: 100vh; margin: 0; background: #e4e4e0; font-family: var(--ui); color: var(--ink);
  }
  /* Dark: the website's near-black and its blue. */
  .stage[data-theme='dark'] {
    --paper: #0b0d10; --ground: #0b0d10; --surface: #15181d; --surface-strong: #20242b;
    --ink: #e6eaf0; --ink-strong: #f5f7fa; --muted: #a4abb6; --faint: #6f7682;
    --accent: #3984ff; --accent-strong: #79aaff; --accent-tint: #3984ff26; --accent-ink: #ffffff;
    --rule: #ffffff14; --rule-strong: #ffffff26; --hover: #ffffff0a; --panel: #15181d;
    --highlight: #3984ff47; --highlight-ink: #ffffff;
    background: #000;
  }
  /* C on dark: the warm accent is the reader's own gold, so nothing blue sits under the text. */
  .stage[data-theme='dark'] .frame[data-prototype='universal'] {
    --accent: #e3b64b; --accent-strong: #f5c542; --accent-tint: #f5c54226; --accent-ink: #1c1504;
    --highlight: #f5c5423d; --highlight-ink: #ffffff;
  }
  .stage :global(*) { box-sizing: border-box; }
  /* Zero-specificity reset, so every component's own button styles win. */
  :global(:where(.stage) :where(button)) { margin: 0; padding: 0; border: 0; background: none; color: inherit; font: inherit; cursor: pointer; -webkit-tap-highlight-color: transparent; }
  .stage :global(button:focus-visible), .stage :global(select:focus-visible) { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 8px; }
  .stage :global(.ui-icon) { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 1.75; stroke-linecap: round; stroke-linejoin: round; flex: none; }
  .stage :global(.visually-hidden) { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .stage :global(::selection) { background: var(--highlight); color: var(--highlight-ink); }

  .switcher { position: sticky; top: 0; z-index: 50; display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 8px 12px; padding: 10px 16px; background: #1b1d21; color: #e8eaee; font-size: 13px; }
  .seg { display: flex; padding: 2px; border-radius: 8px; background: #2b2e34; }
  .seg button { min-height: 28px; padding: 0 10px; border-radius: 6px; color: #b9bdc5; }
  .seg button[aria-pressed='true'] { background: #e8eaee; color: #111; font-weight: 600; }
  .plain { min-height: 32px; padding: 0 10px; border-radius: 8px; color: #8fb6ff !important; }

  .frame { container: app / inline-size; position: relative; overflow: hidden; height: calc(100vh - 52px); background: var(--paper); }
  .frame.phone { width: 390px; height: 844px; max-height: calc(100vh - 120px); margin: 24px auto 0; border-radius: 44px; box-shadow: 0 0 0 10px #111, 0 30px 60px -20px #0008; }
  .note { max-width: 560px; margin: 24px auto; padding: 0 16px 32px; color: #6b6e74; font-size: 13px; line-height: 1.5; text-align: center; }
  .stage[data-theme='dark'] .note { color: #8a8f98; }
  .frame:not(.phone) + .note { display: none; }
</style>
