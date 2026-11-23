<script lang="ts">
  import UiIcon from '../../../../app/components/UiIcon.svelte'
  import AliyahStrip from './AliyahStrip.svelte'
  import ImmersiveReader from './ImmersiveReader.svelte'
  import SettingsView from './SettingsView.svelte'
  import { aliyahNames, books, recordedCount, sample, upcoming } from './data.ts'
  import type { Parsha } from './data.ts'

  let { tab = $bindable('space') }: { tab?: 'space' | 'library' | 'settings' } = $props()
  const week = upcoming()
  const all = books.flatMap(book => book.parshiot)
  const byIndex = (index: number) => all.find(p => p.index === index) as Parsha
  const preparing = byIndex(sample.preparing.parshaIndex)
  const preparingDate = week.find(w => w.parsha.index === preparing.index)
  const resume = byIndex(sample.continueReading.parshaIndex)
  const date = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  let reading = $state<Parsha | null>(null)
  let query = $state('')
  let shelf = $state<'torah' | 'holidays' | 'megillot'>('torah')
  const results = $derived(query.trim()
    ? all.filter(p => p.name.toLowerCase().includes(query.trim().toLowerCase()) || p.hebrew.includes(query.trim()))
    : [])
  const tabs = [
    { id: 'space', label: 'My Space', icon: 'houseFilled' },
    { id: 'library', label: 'Library', icon: 'bookText' },
    { id: 'settings', label: 'Settings', icon: 'cog' },
  ] as const
  const titles = { space: 'My Space', library: 'Library', settings: 'Settings' }
</script>

<div class="ledger">
  <nav class="side" aria-label="Main">
    <div class="mark"><span class="mark-letter" aria-hidden="true">ת</span>Tikkun</div>
    {#each tabs as item (item.id)}
      <button type="button" class:active={tab === item.id} aria-current={tab === item.id ? 'page' : undefined} onclick={() => { tab = item.id }}>
        <UiIcon name={item.icon} /><span>{item.label}</span>
      </button>
    {/each}
    <p class="side-foot">v2026.11-r1</p>
  </nav>

  <main class="canvas">
    <h1>{titles[tab]}</h1>

    {#if tab === 'space'}
      <p class="finding">Shabbat {week[0].parsha.name} is in {week[0].daysAway} days · {date.format(week[0].date)}</p>
      <div class="space-grid">
        <section class="block this-week">
          <h2>This week</h2>
          <div class="card">
            <div class="reading-head">
              <div><strong class="he" dir="rtl">{week[0].parsha.hebrew}</strong><span>{week[0].parsha.name} · {date.format(week[0].date)}</span></div>
              <button type="button" class="primary" onclick={() => { reading = week[0].parsha }}><UiIcon name="play" />Listen</button>
            </div>
            <AliyahStrip label="Seven aliyot, all recorded" />
          </div>
        </section>

        <section class="block">
          <h2>Preparing</h2>
          <button type="button" class="card card-button" onclick={() => { reading = preparing }}>
            <div class="reading-head">
              <div><strong class="he" dir="rtl">{preparing.hebrew}</strong><span>{preparing.name} · aliyot {sample.preparing.aliyot[0]}–{sample.preparing.aliyot.at(-1)}{preparingDate ? ` · ${preparingDate.daysAway} days away` : ''}</span></div>
              <span class="pill">New recordings</span>
            </div>
            <AliyahStrip label="Your aliyot, 2 of 4 practiced" mine={sample.preparing.aliyot} done={sample.preparing.practiced} />
            <p class="meta">{sample.preparing.practiced.length} of {sample.preparing.aliyot.length} practiced · Reminders {sample.preparing.reminder}</p>
          </button>
        </section>

        <section class="block">
          <h2>Continue</h2>
          <button type="button" class="card card-button row-card" onclick={() => { reading = resume }}>
            <span><strong>{resume.name}, {aliyahNames[sample.continueReading.aliyah - 1]}</strong><small>{sample.continueReading.position} of {sample.continueReading.length}</small></span>
            <UiIcon name="play" />
          </button>
        </section>

        <section class="block">
          <div class="block-head"><h2>Bookmarks</h2><button type="button" class="link">View all</button></div>
          <ul class="card list">
            {#each sample.bookmarks as mark (mark.label)}<li><UiIcon name="bookmarkFilled" /><span><strong>{mark.label}</strong><small>{mark.note}</small></span></li>{/each}
          </ul>
        </section>

        <section class="block">
          <div class="block-head"><h2>Downloads</h2><button type="button" class="link" onclick={() => { tab = 'settings' }}>Manage</button></div>
          <ul class="card list">
            {#each sample.downloads as item (item.parshaIndex)}<li><UiIcon name="download" /><span><strong>{byIndex(item.parshaIndex).name}</strong><small>7 aliyot</small></span><em>{item.megabytes} MB</em></li>{/each}
          </ul>
        </section>
      </div>

    {:else if tab === 'library'}
      <p class="finding">{recordedCount} of 54 parshiot recorded with highlighting</p>
      <label class="search"><UiIcon name="search" /><input type="search" placeholder="Parsha, holiday or verse" bind:value={query} aria-label="Search the Library" /></label>
      {#if results.length}
        <ul class="card list results">{#each results as p (p.index)}<li><button type="button" onclick={() => { reading = p }}><span><strong>{p.name}</strong></span><span class="he-small" dir="rtl">{p.hebrew}</span></button></li>{/each}</ul>
      {:else}
        <div class="segments" role="tablist" aria-label="Shelf">
          {#each [['torah', 'Torah'], ['holidays', 'Holidays'], ['megillot', 'Megillot']] as [id, label] (id)}
            <button type="button" role="tab" aria-selected={shelf === id} onclick={() => { shelf = id as typeof shelf }}>{label}</button>
          {/each}
        </div>
        {#if shelf === 'torah'}
          {#each books as book (book.name)}
            <section class="book">
              <h2><span>{book.name}</span><span class="he-small" dir="rtl">{book.hebrew}</span></h2>
              <ul class="card list index">
                {#each book.parshiot as p (p.index)}
                  <li><button type="button" onclick={() => { reading = p }}>
                    <span><strong>{p.name}</strong>{#if p.recorded}<small class="rec"><UiIcon name="audioLines" />Recorded</small>{/if}</span>
                    <span class="he-small" dir="rtl">{p.hebrew}</span>
                  </button></li>
                {/each}
              </ul>
            </section>
          {/each}
        {:else}
          <ul class="card list index">
            {#each (shelf === 'holidays' ? ['Rosh Hashanah', 'Yom Kippur', 'Sukkot', 'Simchat Torah', 'Chanukah', 'Purim', 'Pesach', 'Shavuot'] : ['Esther', 'Shir HaShirim', 'Ruth', 'Eicha', 'Kohelet']) as name (name)}
              <li><button type="button"><span><strong>{name}</strong></span><UiIcon name="arrowRight" /></button></li>
            {/each}
          </ul>
        {/if}
      {/if}

    {:else}
      <p class="finding">Changes apply right away.</p>
      <SettingsView layout="grouped" />
    {/if}
  </main>

  <nav class="tabbar" aria-label="Main">
    {#each tabs as item (item.id)}
      <button type="button" class:active={tab === item.id} aria-current={tab === item.id ? 'page' : undefined} onclick={() => { tab = item.id }}>
        <UiIcon name={item.icon} /><span>{item.label}</span>
      </button>
    {/each}
  </nav>

  {#if reading}
    <ImmersiveReader title={reading.name} hebrew={reading.hebrew} back={titles[tab]} onclose={() => { reading = null }} />
  {/if}
</div>

<style>
  .ledger { position: absolute; inset: 0; display: grid; grid-template-rows: 1fr auto; background: var(--ground); color: var(--ink); }
  .side { display: none; }
  .canvas { overflow-y: auto; padding: 20px 16px 32px; }
  h1 { margin: 8px 0 2px; font: 600 30px/1.15 var(--ui); letter-spacing: -0.01em; }
  .finding { margin: 0 0 24px; color: var(--muted); font-size: 15px; }
  h2 { margin: 0; color: var(--muted); font-size: 13px; font-weight: 500; }
  .space-grid { display: grid; gap: 24px; }
  .block { display: grid; gap: 8px; }
  .block-head { display: flex; justify-content: space-between; align-items: baseline; }
  .card { display: grid; gap: 14px; width: 100%; padding: 16px; border-radius: 12px; background: var(--surface); color: var(--ink); text-align: left; }
  .card-button { transition: transform 140ms var(--ease-out), background-color 120ms ease; }
  .card-button:active { transform: scale(0.985); }
  .reading-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
  .reading-head div { display: grid; gap: 2px; }
  /* Room under the letters for nekudot. */
  .he { font: 400 34px/1.4 var(--stam); }
  .reading-head span, .meta, small { color: var(--muted); font-size: 14px; }
  .meta { margin: 0; }
  .primary { display: inline-flex; align-items: center; gap: 6px; min-height: 40px; padding: 0 16px 0 12px; border-radius: 20px; background: var(--ink-strong); color: var(--paper); font-size: 15px; font-weight: 600; transition: transform 140ms var(--ease-out); }
  .primary:active { transform: scale(0.96); }
  .primary :global(.ui-icon) { width: 18px; height: 18px; }
  .pill { flex: none; padding: 3px 8px; border-radius: 10px; background: var(--accent-tint); color: var(--accent-strong) !important; font-size: 12px !important; font-weight: 500; }
  .row-card { grid-template-columns: 1fr auto; align-items: center; }
  .row-card span, .list li span { display: grid; gap: 1px; }
  .row-card :global(.ui-icon) { width: 20px; height: 20px; color: var(--accent); }
  .link { color: var(--accent); font-size: 14px; }
  .list { gap: 0; padding: 0; margin: 0; list-style: none; }
  .list li { display: grid; grid-template-columns: 20px 1fr auto; align-items: center; gap: 12px; min-height: 56px; padding: 0 16px; }
  .list li + li { box-shadow: inset 0 1px 0 var(--rule); }
  .list li :global(.ui-icon) { width: 18px; height: 18px; color: var(--faint); }
  .list li em { color: var(--muted); font-style: normal; font-size: 14px; font-variant-numeric: tabular-nums; }
  .index li, .results li { display: block; padding: 0; }
  .index button, .results button { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 12px; width: 100%; min-height: 52px; padding: 0 16px; color: var(--ink); text-align: left; transition: background-color 120ms ease; }
  @media (hover: hover) { .index button:hover, .results button:hover { background: var(--hover); } }
  .index button:active { background: var(--hover); }
  .index strong, .results strong { font-weight: 500; }
  .rec { display: inline-flex; align-items: center; gap: 4px; color: var(--accent-strong); font-size: 12px; }
  .rec :global(.ui-icon) { width: 14px !important; height: 14px !important; color: var(--accent) !important; }
  .he-small { font: 400 21px/1 var(--stam); color: var(--ink); }
  .search { display: flex; align-items: center; gap: 8px; height: 40px; margin-bottom: 16px; padding: 0 12px; border-radius: 10px; background: var(--surface-strong); color: var(--muted); }
  .search input { flex: 1; border: 0; background: none; color: var(--ink); font: inherit; font-size: 16px; outline: none; }
  .search:focus-within { box-shadow: 0 0 0 2px var(--accent); }
  .search :global(.ui-icon) { width: 18px; height: 18px; }
  .segments { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2px; margin-bottom: 20px; padding: 2px; border-radius: 9px; background: var(--surface-strong); }
  .segments button { min-height: 32px; border-radius: 7px; color: var(--ink); font-size: 14px; }
  .segments [aria-selected='true'] { background: var(--paper); box-shadow: 0 1px 3px #0002; font-weight: 600; }
  .book { display: grid; gap: 8px; margin-bottom: 24px; }
  .book h2 { display: flex; justify-content: space-between; align-items: baseline; padding: 0 4px; }

  .tabbar { display: grid; grid-template-columns: repeat(3, 1fr); padding: 6px 8px max(8px, env(safe-area-inset-bottom)); background: var(--paper); box-shadow: 0 -1px 0 var(--rule); }
  .tabbar button { display: grid; justify-items: center; gap: 2px; min-height: 48px; color: var(--faint); font-size: 11px; font-weight: 500; }
  .tabbar button.active { color: var(--accent); }
  .tabbar :global(.ui-icon) { width: 24px; height: 24px; }

  @container app (min-width: 900px) {
    .ledger { grid-template-columns: 232px 1fr; grid-template-rows: 1fr; }
    .tabbar { display: none; }
    .side { display: flex; flex-direction: column; gap: 2px; padding: 20px 12px; background: var(--ground); box-shadow: 1px 0 0 var(--rule); }
    .mark { display: flex; align-items: center; gap: 10px; margin: 0 8px 20px; font: 600 18px/1 var(--display); }
    .mark-letter { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 8px; background: var(--ink-strong); color: var(--paper); font: 400 20px/1 var(--stam); }
    .side button { display: flex; align-items: center; gap: 10px; min-height: 34px; padding: 0 10px; border-radius: 8px; color: var(--ink); font-size: 14px; }
    .side button.active { background: var(--surface-strong); font-weight: 500; }
    .side :global(.ui-icon) { width: 16px; height: 16px; color: var(--muted); }
    .side-foot { margin: auto 10px 0; color: var(--faint); font-size: 12px; }
    .canvas { padding: 36px 40px 48px; }
    .canvas > * { max-width: 1040px; }
    /* Two balanced columns, so short and tall blocks don't leave holes beside each other. */
    .space-grid { display: block; columns: 2; column-gap: 24px; }
    .space-grid .block { break-inside: avoid; margin-bottom: 24px; }
    .this-week { column-span: all; }
    .this-week .he { font-size: 44px; }
  }
</style>
