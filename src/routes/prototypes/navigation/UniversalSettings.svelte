<script lang="ts">
  import UiIcon from '../../../../app/components/UiIcon.svelte'
  import { passage, sample } from './data.ts'

  // scope 'reading' is the gear sheet in the reader: the groups that change the page in front of you.
  let { scope = 'all', onwhatsnew }: { scope?: 'all' | 'reading'; onwhatsnew?: () => void } = $props()
  let fontSize = $state(100)
  let layout = $state<'reading' | 'match'>('match')
  let nekudot = $state(true)
  let numbers = $state(true)
  let theme = $state<'auto' | 'light' | 'sepia' | 'dark'>('auto')
  let highlight = $state<'fill' | 'underline' | 'outline'>('fill')
  let speed = $state(1)
  let autoscroll = $state(true)
  let recordings = $state(false)
  let reminders = $state(false)
  // A short sample: the first words of two real lines, so both layouts fit a phone.
  const sampleLines = $derived(passage.slice(0, 2).map(line => line.split(' ').slice(0, 5).join(' '))
    .map(line => nekudot ? line : line.replace(/[\u0591-\u05C7]/g, '')))
  const themes = [['auto', 'Auto'], ['light', 'Light'], ['sepia', 'Sepia'], ['dark', 'Dark']] as const
  const { recordings: used, text: textMb } = sample.storageMegabytes
  const ringTotal = used + textMb
  const ring = `conic-gradient(var(--accent) 0 ${(used / ringTotal) * 100}%, var(--ink) 0)`
</script>

<div class="us" class:sheet={scope === 'reading'}>
  <section>
    <h2>Reading</h2>
    <div class="sample" data-theme={theme} dir="rtl" lang="he" aria-label="Sample of the reading with these settings" style:font-size={`${(fontSize / 100) * 26}px`} class:numbers class:match={layout === 'match'}>
      {#each sampleLines as line, i (i)}
        <p>
          <span class="n">{i + 1}</span>
          {#each line.split(' ') as word, j (j)}
            {#if i === 0 && j === 3}<mark class={highlight}>{word}</mark>{:else}<span>{word}</span>{/if}
          {/each}
        </p>
      {/each}
    </div>
    <div class="panel">
      <div class="field"><span>Font size</span>
        <div class="slider"><button type="button" aria-label="Smaller" onclick={() => { fontSize = Math.max(70, fontSize - 10) }}><UiIcon name="minus" /></button>
          <input type="range" min="70" max="160" step="10" bind:value={fontSize} aria-label="Font size" />
          <button type="button" aria-label="Larger" onclick={() => { fontSize = Math.min(160, fontSize + 10) }}><UiIcon name="plus" /></button><output>{fontSize}%</output></div>
      </div>
      <div class="field"><span>Line layout</span>
        <div class="seg" role="group" aria-label="Line layout">
          <button type="button" aria-pressed={layout === 'reading'} onclick={() => { layout = 'reading' }}>Reading</button>
          <button type="button" aria-pressed={layout === 'match'} onclick={() => { layout = 'match' }}>Match Torah lines</button>
        </div>
      </div>
      <label class="field switch"><span>Nekudot and trop</span><input type="checkbox" bind:checked={nekudot} /></label>
      <label class="field switch"><span>Pasuk numbers</span><input type="checkbox" bind:checked={numbers} /></label>
    </div>
  </section>

  <section>
    <h2>Appearance</h2>
    <div class="panel">
      <div class="field"><span>Theme</span>
        <div class="swatches" role="group" aria-label="Theme">
          {#each themes as [id, label] (id)}<button type="button" class={`sw sw-${id}`} aria-pressed={theme === id} onclick={() => { theme = id }}><i aria-hidden="true">א</i>{label}</button>{/each}
        </div>
      </div>
      <div class="field"><span>Current word</span>
        <div class="seg" role="group" aria-label="Current word">
          {#each [['fill', 'Fill'], ['underline', 'Underline'], ['outline', 'Outline']] as [id, label] (id)}
            <button type="button" aria-pressed={highlight === id} onclick={() => { highlight = id as typeof highlight }}>{label}</button>
          {/each}
        </div>
      </div>
    </div>
  </section>

  <section>
    <h2>Playback</h2>
    <div class="panel">
      <div class="field row"><span>Ba'al Koreh</span><span class="value">Yoni Davidov</span></div>
      <div class="field"><span>Speed</span>
        <div class="stepper"><button type="button" aria-label="Slower" onclick={() => { speed = Math.max(0.5, +(speed - 0.1).toFixed(1)) }}><UiIcon name="minus" /></button><output>{speed.toFixed(1)}×</output><button type="button" aria-label="Faster" onclick={() => { speed = Math.min(2, +(speed + 0.1).toFixed(1)) }}><UiIcon name="plus" /></button></div>
      </div>
      <label class="field switch"><span>Auto-scroll with playback</span><input type="checkbox" bind:checked={autoscroll} /></label>
    </div>
  </section>

  {#if scope === 'all'}
    <section>
      <h2>Storage</h2>
      <div class="panel storage">
        <div class="ring" style:background={ring} role="img" aria-label={`${used} MB recordings and ${textMb} MB Torah text saved on this device`}><span>{ringTotal.toFixed(0)}<small>MB</small></span></div>
        <dl>
          <div><dt><i style:background="var(--accent)"></i>Recordings</dt><dd>{used} MB</dd></div>
          <div><dt><i style:background="var(--ink)"></i>Torah text</dt><dd>{textMb} MB</dd></div>
          <button type="button" class="manage">Manage downloads · {sample.downloads.length} readings</button>
        </dl>
      </div>
    </section>

    <section>
      <h2>Notifications</h2>
      <div class="panel">
        <label class="field switch"><span>New recordings for your readings</span><input type="checkbox" bind:checked={recordings} /></label>
        <label class="field switch"><span>Practice reminders</span><input type="checkbox" bind:checked={reminders} /></label>
      </div>
    </section>

    <section>
      <h2>App</h2>
      <div class="panel">
        <div class="field row"><span>Version</span><span class="value">v2026.11-r1 · Latest</span></div>
        <div class="field row"><span>App Store</span><span class="value">v1.1 · Latest</span></div>
        <button type="button" class="field row link" onclick={onwhatsnew}><span>What's New</span><UiIcon name="chevronLeft" /></button>
        <button type="button" class="field row link"><span>Privacy and support</span><UiIcon name="chevronLeft" /></button>
        <button type="button" class="field row link"><span>About Tikkun</span><UiIcon name="chevronLeft" /></button>
      </div>
    </section>
  {/if}
</div>

<style>
  .us { display: grid; gap: 28px; }
  section { display: grid; gap: 10px; }
  h2 { margin: 0 2px; font: 400 20px/1.2 var(--display); }
  .sheet h2 { font-size: 17px; }
  .panel { display: grid; gap: 4px; padding: 6px 14px; border-radius: 14px; background: var(--surface); }
  .field { display: grid; gap: 10px; padding: 12px 0; }
  .field + .field { box-shadow: inset 0 1px 0 var(--rule); }
  .field > span:first-child { font-size: 15px; }
  .row { grid-template-columns: 1fr auto; align-items: center; min-height: 48px; padding: 0; }
  .value { color: var(--muted); font-size: 15px; font-variant-numeric: tabular-nums; }
  .link { width: 100%; color: var(--ink); text-align: left; }
  .link :global(.ui-icon) { width: 16px; height: 16px; color: var(--faint); transform: scaleX(-1); }

  .sample { display: grid; gap: 2px; padding: 18px 16px 14px; border-radius: 14px; background: var(--paper); color: var(--ink-strong); font-family: var(--stam); line-height: 1.7; text-align: center; box-shadow: inset 0 0 0 1px var(--rule); transition: background-color 160ms ease, color 160ms ease; }
  .sample.match p { white-space: nowrap; }
  .sample:not(.match) { text-align: right; }
  .sample p { margin: 0; }
  .sample p > span, .sample mark { display: inline-block; margin-inline: 0.12em; }
  .sample .n { display: none; }
  .sample.numbers .n { display: inline-block; margin-inline-start: 10px; color: var(--faint); font: 400 0.42em/1 var(--ui); vertical-align: top; }
  mark { color: inherit; background: var(--highlight); border-radius: 0.14em; padding: 0 0.06em; }
  mark.underline { background: none; box-shadow: inset 0 -0.14em 0 var(--accent); }
  mark.outline { background: none; box-shadow: 0 0 0 1.5px var(--accent); }
  .sample[data-theme='light'] { background: #fbfbfa; color: #1a1a1a; }
  .sample[data-theme='sepia'] { background: #ebe3cd; color: #2a2316; }
  .sample[data-theme='dark'] { background: #404040; color: #ededed; }

  .slider { display: grid; grid-template-columns: 36px 1fr 36px 48px; align-items: center; gap: 8px; }
  .slider button, .stepper button { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 10px; background: var(--surface-strong); color: var(--ink); transition: transform 120ms var(--ease-out); }
  .slider button:active, .stepper button:active { transform: scale(0.94); }
  .slider :global(.ui-icon), .stepper :global(.ui-icon) { width: 16px; height: 16px; }
  .slider output, .stepper output { color: var(--muted); font-size: 14px; font-variant-numeric: tabular-nums; text-align: right; }
  input[type='range'] { width: 100%; margin: 0; accent-color: var(--accent); }
  .stepper { display: flex; align-items: center; gap: 12px; }
  .stepper output { min-width: 40px; text-align: center; color: var(--ink); font-size: 16px; }
  .seg { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 2px; padding: 2px; border-radius: 10px; background: var(--surface-strong); }
  .seg button { min-height: 34px; padding: 0 8px; border-radius: 8px; color: var(--muted); font-size: 14px; }
  .seg [aria-pressed='true'] { background: var(--paper); color: var(--ink-strong); box-shadow: 0 1px 2px #0002; font-weight: 600; }
  .swatches { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  .sw { display: grid; justify-items: center; gap: 6px; padding: 8px 4px; border-radius: 12px; color: var(--muted); font-size: 12px; box-shadow: inset 0 0 0 1px var(--rule); }
  .sw[aria-pressed='true'] { box-shadow: inset 0 0 0 2px var(--accent); color: var(--ink); }
  .sw i { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 9px; font: 400 20px/1 var(--stam); font-style: normal; }
  .sw-auto i { background: linear-gradient(135deg, #fbfbfa 50%, #404040 50%); color: #8a8a8a; }
  .sw-light i { background: #fbfbfa; color: #1a1a1a; box-shadow: inset 0 0 0 1px #0001; }
  .sw-sepia i { background: #ebe3cd; color: #2a2316; }
  .sw-dark i { background: #404040; color: #ededed; }

  .switch { grid-template-columns: 1fr auto; align-items: center; }
  .switch input { appearance: none; position: relative; width: 44px; height: 26px; margin: 0; border-radius: 13px; background: var(--rule-strong); transition: background-color 160ms ease; cursor: pointer; }
  .switch input::after { content: ''; position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px #0003; transition: transform 200ms var(--ease-out); }
  .switch input:checked { background: var(--ink-strong); }
  .switch input:checked::after { transform: translateX(18px); }
  .switch input:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

  .storage { grid-template-columns: 96px 1fr; align-items: center; gap: 16px; padding: 16px 14px; }
  .ring { display: grid; place-items: center; width: 96px; height: 96px; border-radius: 50%; }
  .ring span { display: grid; place-items: center; width: 70px; height: 70px; border-radius: 50%; background: var(--surface); font-size: 18px; font-variant-numeric: tabular-nums; }
  .ring small { color: var(--muted); font-size: 11px; }
  dl { display: grid; gap: 8px; margin: 0; font-size: 14px; }
  dl div { display: flex; justify-content: space-between; }
  dt { display: inline-flex; align-items: center; gap: 8px; color: var(--muted); }
  dt i { width: 8px; height: 8px; border-radius: 2px; }
  dd { margin: 0; font-variant-numeric: tabular-nums; }
  .manage { justify-self: start; margin-top: 4px; color: var(--accent-strong); font-size: 14px; }
</style>
