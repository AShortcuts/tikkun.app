<script lang="ts">
  import { resolve } from '$app/paths'
  import { onMount } from 'svelte'
  import UiIcon from '../../../../app/components/UiIcon.svelte'
  import beshalach from '../../../../text/pages/torah/77.json'
  import haazinu from '../../../../text/pages/torah/242.json'

  const directions = [
    { id: 'soft', name: 'Soft', idea: 'One consistent family of gently raised buttons.', cost: 'Clearest touch targets; a little more chrome.' },
    { id: 'grouped', name: 'Grouped', idea: 'Shared surfaces bring related controls together.', cost: 'Fewer outlines; individual actions feel less separate.' },
    { id: 'quiet', name: 'Quiet', idea: 'Utility icons recede. Reading and audio lead.', cost: 'Least visual noise; subtler button affordances.' },
  ] as const
  type Direction = typeof directions[number]['id']
  let theme = $state('dark')
  let scene = $state('beshalach')
  let width = $state('390')
  let ready = $state(false)
  onMount(() => { ready = true })
  let notice = $state('Style previews only. No navigation, playback, or saved reader settings are changed.')
  let playing = $state<Record<Direction, boolean>>({ soft: false, grouped: false, quiet: false })
  let bookmarked = $state<Record<Direction, boolean>>({ soft: false, grouped: false, quiet: false })
  const available = $derived(scene === 'haazinu')
  const parsha = $derived(available ? 'האזינו' : 'בשלח')
  const aliyah = $derived(available ? 'ראשון' : 'רביעי')
  const verse = $derived(available ? 'א' : 'כו')
  const passage = $derived.by(() => {
    const lines = available ? haazinu : beshalach
    const start = lines.findIndex(line => line.verses.some(ref =>
      available ? ref.chapter === 32 && ref.verse === 1 : ref.chapter === 14 && ref.verse === 26))
    return lines.slice(start).flatMap(line => line.text.flat()).join(' ').split('׃')[0] + '׃'
  })

  function preview(action: string) {
    notice = `${action} · styling preview. The real reader is unchanged.`
  }
  function play(id: Direction) {
    playing[id] = !playing[id]
    preview(playing[id] ? 'Playing appearance' : 'Paused appearance')
  }
  function bookmark(id: Direction) {
    bookmarked[id] = !bookmarked[id]
    preview(bookmarked[id] ? 'Bookmarked appearance' : 'Bookmark removed appearance')
  }
</script>

<svelte:head>
  <title>Reader header styles — Tikkun Korim</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

{#snippet audioControl(id: Direction, canPlay = available, compact = false)}
  <div class="audio-capsule" class:unavailable={!canPlay} class:playing={canPlay && playing[id]} class:compact>
    <button class="play" disabled={!canPlay}
      aria-label={canPlay ? `${playing[id] ? 'Pause' : 'Play'} preview` : 'Recording unavailable'}
      title={canPlay ? 'Preview playback appearance; no sound' : 'Recording unavailable'}
      onclick={() => play(id)}>
      <UiIcon name={canPlay && playing[id] ? 'pause' : 'play'} />
      {#if !compact}<span lang="he" dir="rtl">{canPlay ? 'ראשון' : 'רביעי'}</span>{/if}
    </button>
    {#if !compact}
      <button class="choose" aria-label="Choose aliyah preview" title="Choose aliyah" onclick={() => preview('Aliyah picker')}>
        <UiIcon name="chevronDown" />
      </button>
    {/if}
  </div>
{/snippet}

{#snippet tools(id: Direction, desktop = false)}
  <button class="tool bookmark" aria-label="Bookmark preview" title="Bookmark" aria-pressed={bookmarked[id]} onclick={() => bookmark(id)}>
    <UiIcon name={bookmarked[id] ? 'bookmarkFilled' : 'bookmark'} />
  </button>
  {#if desktop}
    <button class="tool" aria-label="Reader settings preview" title="Reader Settings" onclick={() => preview('Reader Settings')}><UiIcon name="settings2" /></button>
  {/if}
{/snippet}

{#snippet titleButton(id: Direction)}
  <button class="title-button" aria-label="Choose Parsha preview" title="Choose Parsha" onclick={() => preview('Parsha library')}>
    <span lang="he" dir="rtl">{parsha}</span>
    {#if id === 'quiet'}<UiIcon name="chevronDown" />{/if}
  </button>
{/snippet}

<main data-preview-ready={ready} data-theme={theme} class:wide-phones={width === '550'} style:--preview-width={`${width}px`}>
  <div class="studio">
    <div class="intro">
      <div><h1>Reader header styles</h1><p>Same controls. Three ways to make them feel at home.</p></div>
      <a class="reader-link" href={resolve('/reader/')} target="_blank" rel="noreferrer">Open actual reader <span aria-hidden="true">↗</span></a>
    </div>

    <form class="preview-options" onsubmit={event => event.preventDefault()}>
      <label>Appearance<select aria-label="Appearance" bind:value={theme}><option value="dark">Dark</option><option value="light">Light</option></select></label>
      <label>Reading<select aria-label="Reading" bind:value={scene} onchange={() => { playing = { soft: false, grouped: false, quiet: false } }}>
        <option value="beshalach">Beshalach · no audio</option><option value="haazinu">Haazinu · audio available</option>
      </select></label>
      <label>Phone width<select aria-label="Phone width" bind:value={width}><option>320</option><option>390</option><option>550</option></select></label>
      <p>Click a bookmark or playable capsule to try its state.</p>
    </form>

    <section class="mobile-studies" aria-label="Mobile header variants">
      {#each directions as direction (direction.id)}
        <article data-variant={direction.id}>
          <h2>{direction.name}</h2><p class="idea">{direction.idea}</p>
          <div class="phone screen">
            <header class="reader-header mobile">
              <div class="left cluster">
                <button class="tool home" aria-label="Library preview" title="Library" onclick={() => preview('Library')}><UiIcon name="houseFilled" /></button>
                {@render tools(direction.id)}
              </div>
              {@render titleButton(direction.id)}
              <div class="right cluster">
                {@render audioControl(direction.id)}
                <button class="tool settings" aria-label="Reader controls preview" title="Reader controls" onclick={() => preview('Reader controls')}><UiIcon name="cog" /></button>
              </div>
            </header>
            <div class="reading-context" lang="he" dir="rtl"><span class="verse">{verse}</span><p>{passage}</p></div>
            <div class="context-caption">Header styling only · actual Torah text</div>
          </div>
          <div class="states" aria-label={`${direction.name} audio states`}>
            <div><span>Available</span>{@render audioControl(direction.id, true)}</div>
            <div><span>No audio</span>{@render audioControl(direction.id, false)}</div>
          </div>
          <p class="cost">{direction.cost}</p>
        </article>
      {/each}
    </section>

    <section class="desktop-studies" aria-label="Desktop header variants">
      <h2>Desktop counterparts</h2>
      <p class="desktop-note">Same visual language. No extra header player.</p>
      {#each directions as direction (direction.id)}
        <article data-variant={direction.id}>
          <h3>{direction.name}</h3>
          <div class="screen desktop-screen">
            <header class="reader-header desktop">
              <div class="left cluster"><button class="about tool" onclick={() => preview('About')}>About</button></div>
              {@render titleButton(direction.id)}
              <div class="right cluster">{@render tools(direction.id, true)}</div>
            </header>
            <div class="desktop-context" dir="rtl" lang="he"><span>{passage}</span><div class="side-audio"><span>{aliyah}</span>{@render audioControl(direction.id, available, true)}</div></div>
          </div>
        </article>
      {/each}
    </section>
    <p class="notice" role="status">{notice}</p>
    <p class="motion-note">140 ms press feedback. No entrance animation. Keyboard and reduced-motion actions stay immediate.</p>
  </div>
</main>

<style>
  @font-face { font-family: 'Noto Hebrew'; src: url('/assets/fonts/NotoSansHebrew-Variable.ttf'); font-weight: 100 900; }
  @font-face { font-family: 'Torah'; src: url('/assets/fonts/ShlomosemiStam.ttf'); }
  @font-face { font-family: 'Lora'; src: url('/assets/fonts/Lora-Regular.ttf'); }
  :global(body) { margin: 0; }
  main { --paper: #222; --ink: #cdcdcd; --muted: #a6a6a6; --control: #2d2d2d; --border: #444; --blue: #0a84ff; --blue-ink: #62b3ff; --blue-surface: #203349; --gold: #f5c542; --studio: #171717; --press: #3b3b3b; background: var(--studio); color: var(--ink); min-height: 100vh; font: 14px/1.5 'Noto Hebrew', -apple-system, sans-serif; color-scheme: dark; }
  main[data-theme='light'] { --paper: #fafafa; --ink: #303030; --muted: #686868; --control: #f1f1f1; --border: #dadada; --blue-ink: #006bc7; --blue-surface: #e3f0ff; --studio: #efefec; --press: #e4e4e4; color-scheme: light; }
  main :global(*) { box-sizing: border-box; }
  .studio { max-width: 1380px; margin: auto; padding: 48px 32px 30px; }
  .intro { display: flex; justify-content: space-between; align-items: center; gap: 24px; }
  h1 { font: 32px/1.2 Lora, serif; margin: 0 0 10px; letter-spacing: -.02em; }
  h2 { font-size: 20px; letter-spacing: -.015em; margin: 0; font-weight: 650; }
  h3 { font-size: 14px; font-weight: 600; margin: 0 0 10px; }
  p { margin: 0; }
  .intro p, .idea, .cost, .desktop-note, .motion-note { color: var(--muted); }
  a { color: inherit; text-underline-offset: 4px; }
  .reader-link { white-space: nowrap; font-size: 12px; }
  .preview-options { display: flex; align-items: end; gap: 20px; margin: 32px 0 42px; padding: 22px 0; border-block: 1px solid var(--border); }
  label { display: grid; gap: 8px; font-size: 12px; color: var(--muted); }
  select { min-height: 40px; padding: 7px 34px 7px 12px; background: var(--control); border: 1px solid var(--border); border-radius: 8px; color: var(--ink); font: inherit; font-size: 13px; cursor: pointer; }
  .preview-options p { color: var(--muted); margin: 0 0 9px auto; font-size: 12px; }
  .mobile-studies { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 32px; }
  .wide-phones .mobile-studies { grid-template-columns: 1fr; }
  .wide-phones .mobile-studies article { max-width: 550px; width: 100%; margin-inline: auto; }
  .idea { min-height: 48px; font-size: 13px; margin: 7px 0 20px; max-width: 32ch; }
  .screen { background: var(--paper); border: 1px solid var(--border); overflow: hidden; }
  .phone { width: min(100%,var(--preview-width)); border-radius: 20px; container-type: inline-size; }
  .reader-header { display: grid; align-items: center; position: relative; }
  .mobile { grid-template-columns: 126px minmax(0,1fr) 126px; gap: 4px; padding: 12px 6px; }
  .cluster { display: flex; align-items: center; gap: 5px; }
  .left { justify-self: start; }
  .right { justify-self: end; }
  button { color: inherit; font: inherit; cursor: pointer; border: 0; background: transparent; padding: 0; touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
  button:disabled { cursor: default; }
  .reader-header button, .audio-capsule button { transition: transform 140ms cubic-bezier(.23,1,.32,1); }
  :global([data-header-pointer]) .reader-header button:not(:disabled):active, :global([data-header-pointer]) .audio-capsule button:not(:disabled):active { transform: scale(.97); }
  button:focus-visible, select:focus-visible, a:focus-visible { outline: 2px solid var(--blue); outline-offset: 3px; }
  main :global(.ui-icon) { width: 20px; height: 20px; display: block; flex: none; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
  .tool { width: 44px; height: 44px; display: inline-flex; align-items: center; justify-content: center; flex: none; }
  .title-button { display: flex; align-items: center; justify-content: center; justify-self: center; min-width: 0; max-width: 100%; height: 44px; padding: 0 13px; font-size: 22px; font-weight: 720; line-height: 1; white-space: nowrap; }
  .title-button :global(.ui-icon) { width: 11px; height: 11px; margin-inline-start: 4px; }
  .audio-capsule { display: flex; flex: none; align-items: center; width: 77px; height: 44px; background: var(--blue-surface); color: var(--blue-ink); border-radius: 16px; overflow: hidden; direction: ltr; }
  .audio-capsule.unavailable { color: var(--muted); background: var(--control); }
  .audio-capsule.playing { background: var(--gold); color: #242018; }
  .audio-capsule button { display: flex; height: 100%; align-items: center; justify-content: center; }
  .audio-capsule .play { flex: 1; min-width: 0; gap: 3px; padding-left: 5px; font-size: 12px; font-weight: 700; }
  .audio-capsule .play :global(.ui-icon) { width: 12px; height: 12px; }
  .audio-capsule .choose { width: 20px; border-left: 1px solid color-mix(in srgb, currentColor 20%, transparent); }
  .audio-capsule .choose :global(.ui-icon) { width: 11px; height: 11px; }
  .reading-context { position: relative; padding: 38px 24px 0 18px; min-height: 186px; border-top: 1px solid color-mix(in srgb, var(--border) 60%, transparent); }
  .reading-context p { font: 23px/1.8 Torah, serif; text-align: right; }
  .verse { position: absolute; right: 9px; top: 44px; font-size: 10px; color: var(--muted); }
  .context-caption { text-align: center; color: var(--muted); font-size: 10px; padding: 14px 0 16px; }
  .states { display: flex; gap: 24px; margin-top: 22px; }
  .states > div { display: grid; gap: 8px; }
  .states > div > span { color: var(--muted); font-size: 11px; }
  .cost { font-size: 12px; margin: 16px 0 0; max-width: 36ch; }
  .desktop-studies { margin-top: 56px; }
  .desktop-note { margin: 5px 0 26px; font-size: 13px; }
  .desktop-studies article { margin-bottom: 24px; }
  .desktop-screen { border-radius: 12px; }
  .desktop { grid-template-columns: 1fr auto 1fr; padding: 10px max(20px, calc((100% - 680px) / 2)); min-height: 64px; gap: 50px; }
  .desktop .title-button { min-width: 140px; font-size: 21px; height: 40px; }
  .desktop .tool { height: 36px; min-width: 40px; }
  .desktop .about { width: auto; padding: 0 17px; font-size: 12px; }
  .desktop-context { display: flex; align-items: center; flex-direction: row-reverse; gap: 32px; max-width: 950px; margin: auto; padding: 25px 24px 28px; border-top: 1px solid color-mix(in srgb, var(--border) 60%, transparent); }
  .desktop-context > span { flex: 1; font: 24px/1.6 Torah, serif; text-align: right; }
  .side-audio { display: flex; align-items: center; gap: 9px; font-size: 14px; }
  .compact { width: 32px; height: 30px; border-radius: 999px; }
  .compact .play { padding: 0; }
  .notice { border-top: 1px solid var(--border); padding-top: 20px; font-size: 12px; margin-top: 30px; }
  .motion-note { margin-top: 7px; font-size: 11px; }

  [data-variant='soft'] .tool, [data-variant='soft'] .title-button { background: var(--control); border-radius: 14px; box-shadow: inset 0 1px 0 color-mix(in srgb, var(--ink) 8%, transparent), 0 2px 3px #00000010; }
  [data-variant='soft'] .title-button { border-radius: 16px; }
  [data-variant='grouped'] .cluster { gap: 0; background: var(--control); border: 1px solid color-mix(in srgb, var(--border) 80%, transparent); border-radius: 999px; overflow: hidden; }
  [data-variant='grouped'] .cluster .tool + .tool { border-left: 1px solid var(--border); }
  [data-variant='grouped'] .mobile .cluster .tool { width: 43px; }
  [data-variant='grouped'] .right.cluster > .tool { border-left: 1px solid var(--border); }
  [data-variant='grouped'] .audio-capsule { border-radius: 999px; }
  [data-variant='grouped'] .cluster .audio-capsule { border-radius: 0; }
  [data-variant='grouped'] .title-button { border: 1px solid var(--border); border-radius: 999px; padding-inline: 12px; }
  [data-variant='quiet'] .tool { border-radius: 999px; }
  [data-variant='quiet'] .bookmark { color: var(--muted); }
  [data-variant='quiet'] .title-button { position: relative; min-width: 0; padding-inline: 0; font-size: 21px; }
  [data-variant='quiet'] .title-button :global(.ui-icon) { position: absolute; left: calc(100% + 3px); margin: 0; }
  [data-variant='quiet'] .audio-capsule { border-radius: 999px; }
  [data-variant='quiet'] .audio-capsule.unavailable { background: transparent; outline: 1px solid var(--border); outline-offset: -1px; }
  .bookmark[aria-pressed='true'] { color: var(--ink); }
  @media (hover:hover) and (pointer:fine) {
    .tool:not(:disabled):hover, .title-button:hover { background: var(--press); }
    .audio-capsule button:not(:disabled):hover { background: color-mix(in srgb,currentColor 10%,transparent); }
  }
  @container (max-width: 350px) {
    .mobile { grid-template-columns: 113px minmax(0,1fr) 113px; padding-inline: 4px; gap: 2px; }
    .mobile .cluster { gap: 1px; }
    .mobile .audio-capsule { width: 68px; }
    .mobile .audio-capsule .play { font-size: 10px; gap: 2px; padding-left: 3px; }
    .mobile .audio-capsule .choose { width: 18px; }
    .mobile .title-button { font-size: 18px; padding-inline: 5px; }
    [data-variant='quiet'] .mobile .title-button { font-size: 17px; padding-inline: 0; }
    [data-variant='grouped'] .mobile .cluster .tool { width: 42px; }
  }
  @media (max-width: 1150px) { .mobile-studies { grid-template-columns: 1fr; gap: 40px; } .mobile-studies article { max-width: 550px; margin-inline: auto; width: 100%; } .idea { min-height: 0; max-width: none; } .phone { margin-inline: auto; } .preview-options { flex-wrap: wrap; } .preview-options p { width: 100%; margin: 0; } }
  @media (max-width: 650px) { .studio { padding: 28px 12px; } .intro { display: block; } h1 { font-size: 27px; } .reader-link { display: inline-block; margin-top: 14px; } .preview-options { gap: 12px; margin-block: 24px 32px; } .desktop-studies { display: none; } }
  @media (prefers-reduced-motion: reduce) { .reader-header button, .audio-capsule button { transition: none; transform: none !important; } }
</style>

<svelte:document
  onpointerdown={() => document.documentElement.setAttribute('data-header-pointer', '')}
  onkeydown={() => document.documentElement.removeAttribute('data-header-pointer')}
/>
