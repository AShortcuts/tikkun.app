<script lang="ts">
  import { onDestroy } from 'svelte'
  import UiIcon from '../../../../app/components/UiIcon.svelte'
  import { aliyahNames, passage } from './data.ts'

  let { title, hebrew, back, onclose, onsettings }: {
    title: string; hebrew: string; back: string; onclose: () => void; onsettings?: () => void
  } = $props()

  const words = passage.map(line => line.split(' '))
  const total = words.flat().length
  let chrome = $state(true)
  let playing = $state(false)
  let current = $state(-1)
  let aliyah = $state(0)
  let timer: ReturnType<typeof setInterval> | undefined
  let hide: ReturnType<typeof setTimeout> | undefined

  // While listening the text has the whole screen; controls come back on a tap.
  function scheduleHide() {
    clearTimeout(hide)
    if (playing) hide = setTimeout(() => { chrome = false }, 2200)
  }
  function toggleChrome(event: MouseEvent) {
    // Taps on the controls themselves never hide them.
    if (event.target instanceof Element && event.target.closest('.reader-top, .reader-bottom')) return
    chrome = !chrome
    scheduleHide()
  }
  function togglePlay(event: Event) {
    event.stopPropagation()
    playing = !playing
    clearInterval(timer)
    if (playing) {
      timer = setInterval(() => { current = current + 1 >= total ? 0 : current + 1 }, 420)
      if (current < 0) current = 0
    }
    scheduleHide()
  }
  onDestroy(() => { clearInterval(timer); clearTimeout(hide) })
  let offset = 0
  const indexed = words.map(line => line.map(word => ({ word, index: offset++ })))
</script>

<div class="reader" class:chrome-hidden={!chrome} role="presentation" onclick={toggleChrome}>
  <header class="reader-top" aria-hidden={!chrome}>
    <button type="button" class="reader-back" onclick={(event) => { event.stopPropagation(); onclose() }}>
      <UiIcon name="chevronLeft" /><span>{back}</span>
    </button>
    <div class="reader-title">
      <strong dir="rtl">{hebrew}</strong>
      <span>{title} · {aliyahNames[aliyah]}</span>
    </div>
    <button type="button" class="reader-icon" aria-label="Reading settings" onclick={(event) => { event.stopPropagation(); onsettings?.() }}>
      <span class="reader-aa" aria-hidden="true">Aa</span>
    </button>
  </header>

  <main class="reader-text" dir="rtl" lang="he" aria-label={`${title} text`}>
    {#each indexed as line, l (l)}
      <p>
        {#each line as item (item.index)}
          <span class="word" class:current={item.index === current}>{item.word}</span>
        {/each}
      </p>
    {/each}
  </main>

  <footer class="reader-bottom" aria-hidden={!chrome}>
    <div class="reader-progress" aria-hidden="true"><span style:transform={`scaleX(${Math.max(current, 0) / total})`}></span></div>
    <div class="reader-controls">
      <label class="reader-aliyah">
        <span class="visually-hidden">Aliyah</span>
        <select bind:value={aliyah}>
          {#each aliyahNames as name, index (name)}<option value={index}>{name}</option>{/each}
        </select>
        <UiIcon name="chevronDown" />
      </label>
      <button type="button" class="reader-play" aria-label={playing ? 'Pause' : 'Play'} onclick={togglePlay}>
        <UiIcon name={playing ? 'pause' : 'play'} />
      </button>
      <button type="button" class="reader-icon" aria-label="Bookmark" onclick={(event) => event.stopPropagation()}>
        <UiIcon name="bookmark" />
      </button>
    </div>
  </footer>
</div>

<style>
  .reader {
    position: absolute; inset: 0; z-index: 20; display: grid; grid-template-rows: auto 1fr auto;
    background: var(--paper); color: var(--ink); overflow: hidden;
  }
  .reader-top, .reader-bottom {
    position: absolute; left: 0; right: 0; z-index: 2; background: var(--paper);
    transition: opacity 180ms var(--ease-out), transform 220ms var(--ease-out);
  }
  .reader-top {
    top: 0; display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 8px;
    padding: max(12px, env(safe-area-inset-top)) 12px 10px; box-shadow: 0 1px 0 var(--rule);
  }
  .reader-bottom { bottom: 0; padding: 0 16px max(16px, env(safe-area-inset-bottom)); box-shadow: 0 -1px 0 var(--rule); }
  .chrome-hidden .reader-top { opacity: 0; transform: translateY(-8px); pointer-events: none; }
  .chrome-hidden .reader-bottom { opacity: 0; transform: translateY(8px); pointer-events: none; }

  .reader-back { justify-self: start; display: inline-flex; align-items: center; gap: 2px; min-height: 44px; padding: 0 8px 0 2px; color: var(--accent); font-size: 16px; }
  .reader-title { display: grid; justify-items: center; line-height: 1.2; }
  .reader-title strong { font: 400 22px/1.1 var(--stam); }
  .reader-title span { color: var(--muted); font-size: 12px; }
  .reader-icon { justify-self: end; display: grid; place-items: center; width: 44px; height: 44px; border-radius: 22px; color: var(--ink); }
  .reader-aa { font: 500 17px/1 var(--display); }

  .reader-text {
    grid-row: 1 / -1; overflow-y: auto; padding: 96px clamp(20px, 6vw, 72px) 132px;
    font: 400 clamp(26px, 6.6cqi, 40px)/1.75 var(--stam); text-align: center;
  }
  .reader-text p { max-width: 34ch; margin: 0 auto; }
  /* Svelte drops the whitespace between the word spans, so the word gap is a margin. */
  .word { display: inline-block; margin-inline: 0.14em; padding-inline: 0.04em; border-radius: 6px; transition: background-color 120ms ease, color 120ms ease; }
  .word.current { background: var(--highlight); color: var(--highlight-ink); }

  .reader-progress { height: 2px; margin: 0 -16px 10px; background: var(--rule); overflow: hidden; }
  .reader-progress span { display: block; height: 100%; background: var(--accent); transform-origin: left; transition: transform 400ms linear; }
  .reader-controls { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; }
  .reader-aliyah { position: relative; justify-self: start; display: inline-flex; align-items: center; gap: 4px; min-height: 44px; color: var(--ink); font-size: 15px; }
  .reader-aliyah select { appearance: none; border: 0; background: none; color: inherit; font: inherit; padding-right: 20px; }
  .reader-aliyah :global(.ui-icon) { position: absolute; right: 0; width: 16px; height: 16px; pointer-events: none; }
  .reader-play {
    display: grid; place-items: center; width: 56px; height: 56px; border-radius: 28px;
    background: var(--ink-strong); color: var(--paper); transition: transform 140ms var(--ease-out);
  }
  .reader-play:active { transform: scale(0.95); }
  .reader-play :global(.ui-icon) { width: 24px; height: 24px; }

  @media (prefers-reduced-motion: reduce) {
    .reader-top, .reader-bottom { transition: opacity 120ms linear; transform: none !important; }
    .reader-progress span { transition: none; }
  }
</style>
