<script lang="ts">
  import UiIcon from '../../../../app/components/UiIcon.svelte'
  import AliyahStrip from './AliyahStrip.svelte'
  import ImmersiveReader from './ImmersiveReader.svelte'
  import SettingsView from './SettingsView.svelte'
  import { aliyahNames, books, sample, upcoming } from './data.ts'
  import type { Parsha } from './data.ts'

  let { tab = $bindable('space') }: { tab?: 'space' | 'library' | 'settings' } = $props()
  const week = upcoming()
  const all = books.flatMap(book => book.parshiot)
  const byIndex = (index: number) => all.find(p => p.index === index) as Parsha
  const preparing = byIndex(sample.preparing.parshaIndex)
  const target = week.find(w => w.parsha.index === preparing.index) ?? week[1]
  const resume = byIndex(sample.continueReading.parshaIndex)
  const long = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  const short = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })
  // Days from today to the Shabbat you read, with your reminder days marked (sample: Sunday and Wednesday).
  const now = new Date()
  const days = Array.from({ length: target.daysAway + 1 }, (_, i) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i)
    return { date, today: i === 0, reminder: [0, 3].includes(date.getDay()) && i > 0, shabbat: i === target.daysAway }
  })
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'narrow' })
  let reading = $state<Parsha | null>(null)
  let book = $state(0)
  const tabs = [
    { id: 'space', label: 'My Space', icon: 'houseFilled' },
    { id: 'library', label: 'Library', icon: 'bookText' },
    { id: 'settings', label: 'Settings', icon: 'cog' },
  ] as const
  const titles = { space: 'My Space', library: 'Library', settings: 'Settings' }
  const weekLabel = week[0].daysAway <= 6 ? 'this Shabbat' : `on ${short.format(week[0].date)}`
</script>

<div class="editorial">
  <header class="top">
    <div class="mark"><span aria-hidden="true">ת</span>Tikkun</div>
    <nav aria-label="Main">
      {#each tabs as item (item.id)}
        <button type="button" class:active={tab === item.id} aria-current={tab === item.id ? 'page' : undefined} onclick={() => { tab = item.id }}>{item.label}</button>
      {/each}
    </nav>
  </header>

  <main class="canvas">
    <div class="column">
      {#if tab === 'space'}
        <h1>{week[0].parsha.name} is {weekLabel}.</h1>
        <p class="sub">{long.format(week[0].date)} · {week[0].daysAway} days away</p>

        <section class="hero" aria-label="This week's reading">
          <button type="button" class="hero-name" dir="rtl" onclick={() => { reading = week[0].parsha }}>{week[0].parsha.hebrew}</button>
          <div class="hero-side">
            <AliyahStrip label="Seven aliyot, all recorded" />
            <button type="button" class="primary" onclick={() => { reading = week[0].parsha }}><UiIcon name="play" />Listen to {week[0].parsha.name}</button>
          </div>
        </section>

        <section class="panel prep">
          <div class="panel-head">
            <h2>Your reading</h2>
            <span class="muted">{preparing.name} {sample.preparing.aliyot[0]}–{sample.preparing.aliyot.at(-1)} · {short.format(target.date)}</span>
          </div>
          <p class="prep-line"><strong>{target.daysAway} days</strong> to go. {sample.preparing.practiced.length} of {sample.preparing.aliyot.length} aliyot practiced; new recordings arrived on Sunday.</p>
          <ol class="days" aria-label="Days until your reading">
            {#each days as day (day.date.getTime())}
              <li class:today={day.today} class:reminder={day.reminder} class:shabbat={day.shabbat}>
                <small>{weekday.format(day.date)}</small><span>{day.date.getDate()}</span>
              </li>
            {/each}
          </ol>
          <div class="legend"><span><i class="ring"></i>Reminder</span><span><i class="fill"></i>You read</span></div>
          <button type="button" class="secondary" onclick={() => { reading = preparing }}>Practice {aliyahNames[sample.preparing.practiced.length + sample.preparing.aliyot[0] - 1]}</button>
        </section>

        <div class="pair">
          <section class="panel">
            <h2>Continue</h2>
            <button type="button" class="resume" onclick={() => { reading = resume }}>
              <span><strong>{resume.name}, {aliyahNames[sample.continueReading.aliyah - 1]}</strong><small>{sample.continueReading.position} of {sample.continueReading.length}</small></span>
              <UiIcon name="play" />
            </button>
            <div class="mini-progress" aria-hidden="true"><span style:width="43%"></span></div>
            <p class="downloads"><UiIcon name="download" />{sample.downloads.length} readings saved for offline · {(sample.downloads.reduce((a, d) => a + d.megabytes, 0)).toFixed(1)} MB <button type="button" onclick={() => { tab = 'settings' }}>Manage</button></p>
          </section>
          <section class="panel">
            <h2>Bookmarks</h2>
            <ul>{#each sample.bookmarks as mark (mark.label)}<li><strong>{mark.label}</strong><small>{mark.note}</small></li>{/each}</ul>
          </section>
        </div>
      {:else if tab === 'library'}
        <div class="lib-head">
          <h1>Library</h1>
          <button type="button" class="icon-button" aria-label="Search the Library"><UiIcon name="search" /></button>
        </div>
        <div class="books" role="tablist" aria-label="Books of the Torah" dir="rtl">
          {#each books as b, i (b.name)}
            <button type="button" role="tab" aria-selected={book === i} onclick={() => { book = i }}>{b.hebrew}<small dir="ltr">{b.name}</small></button>
          {/each}
        </div>
        <ol class="contents">
          {#each books[book].parshiot as p (p.index)}
            <li><button type="button" onclick={() => { reading = p }}>
              <span class="num">{p.index + 1}</span>
              <span class="en">{p.name}{#if p.recorded}<i class="dot" title="Recorded"></i>{/if}</span>
              <span class="he" dir="rtl">{p.hebrew}</span>
            </button></li>
          {/each}
        </ol>
        <div class="more-shelves">
          <section><h2>Holidays</h2><p>Rosh Hashanah · Yom Kippur · Sukkot · Simchat Torah · Chanukah · Purim · Pesach · Shavuot</p></section>
          <section><h2>Megillot</h2><p>Esther · Shir HaShirim · Ruth · Eicha · Kohelet</p></section>
        </div>

      {:else}
        <h1>Settings</h1>
        <p class="sub">Changes apply right away.</p>
        <SettingsView layout="columns" />
      {/if}
    </div>
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
  /* Editorial sits on the paper itself, so its panels take one tone step instead of white. */
  .editorial { --surface: var(--panel); position: absolute; inset: 0; display: grid; grid-template-rows: 1fr auto; background: var(--paper); color: var(--ink); }
  .top { display: none; }
  .canvas { overflow-y: auto; }
  .column { padding: 28px 20px 36px; }
  h1 { margin: 0; font: 400 34px/1.1 var(--display); letter-spacing: -0.015em; text-wrap: balance; }
  .sub { margin: 8px 0 28px; color: var(--muted); font-size: 15px; }
  h2 { margin: 0; font-size: 15px; font-weight: 600; }
  .muted, small { color: var(--muted); font-size: 14px; }

  .hero { display: grid; gap: 16px; margin-bottom: 28px; }
  .hero-name { justify-self: start; font: 400 76px/1 var(--stam); color: var(--ink-strong); transition: transform 160ms var(--ease-out); }
  .hero-name:active { transform: scale(0.98); }
  .hero-side { display: grid; gap: 14px; }
  .primary { display: inline-flex; justify-content: center; align-items: center; gap: 8px; min-height: 48px; border-radius: 24px; background: var(--ink-strong); color: var(--paper); font-size: 16px; font-weight: 600; transition: transform 140ms var(--ease-out); }
  .primary:active, .secondary:active { transform: scale(0.97); }
  .primary :global(.ui-icon) { width: 18px; height: 18px; }
  .secondary { min-height: 44px; border-radius: 22px; background: var(--surface-strong); color: var(--ink); font-size: 15px; font-weight: 600; transition: transform 140ms var(--ease-out); }

  .panel { display: grid; gap: 12px; margin-bottom: 16px; padding: 18px; border-radius: 16px; background: var(--panel); }
  .panel-head { display: grid; gap: 2px; }
  .prep-line { margin: 0; font-size: 16px; line-height: 1.45; }
  .days { display: grid; grid-template-columns: repeat(auto-fit, minmax(30px, 1fr)); gap: 4px; margin: 0; padding: 0; list-style: none; }
  .days li { display: grid; justify-items: center; gap: 2px; padding: 6px 0; border-radius: 10px; font-variant-numeric: tabular-nums; }
  .days small { font-size: 11px; }
  .days span { font-size: 15px; }
  .days .today { background: var(--surface-strong); font-weight: 600; }
  .days .reminder span { box-shadow: 0 0 0 1.5px var(--accent); border-radius: 50%; width: 26px; text-align: center; line-height: 26px; }
  .days .shabbat { background: var(--accent); color: var(--accent-ink); }
  .days .shabbat small { color: var(--accent-ink); }
  .legend { display: flex; gap: 16px; color: var(--muted); font-size: 13px; }
  .legend span { display: inline-flex; align-items: center; gap: 6px; }
  .legend i { width: 10px; height: 10px; border-radius: 50%; }
  .legend .ring { box-shadow: inset 0 0 0 1.5px var(--accent); }
  .legend .fill { background: var(--accent); }

  .pair { display: grid; gap: 16px; }
  .pair .panel { margin: 0; align-content: start; }
  .resume { display: grid; grid-template-columns: 1fr auto; align-items: center; color: var(--ink); text-align: left; }
  .resume span, .pair li { display: grid; gap: 1px; }
  .resume :global(.ui-icon) { width: 22px; height: 22px; color: var(--accent); }
  .mini-progress { height: 3px; border-radius: 2px; background: var(--rule); }
  .mini-progress span { display: block; height: 100%; border-radius: 2px; background: var(--accent); }
  .pair ul { display: grid; gap: 10px; margin: 0; padding: 0; list-style: none; }
  .downloads { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 8px 0 0; padding-top: 14px; box-shadow: inset 0 1px 0 var(--rule); color: var(--muted); font-size: 14px; }
  .downloads :global(.ui-icon) { width: 16px; height: 16px; }
  .downloads button { color: var(--accent); }

  .lib-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
  .icon-button { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 22px; background: var(--surface-strong); color: var(--ink); }
  .icon-button :global(.ui-icon) { width: 20px; height: 20px; }
  .books { display: flex; gap: 6px; margin: 0 -20px 24px; padding: 0 20px; overflow-x: auto; scrollbar-width: none; }
  .books button { display: grid; justify-items: center; gap: 2px; flex: none; min-width: 72px; padding: 10px 12px; border-radius: 14px; color: var(--muted); font: 400 26px/1 var(--stam); transition: background-color 140ms ease, color 140ms ease; }
  .books button small { font: 500 11px/1 var(--ui); }
  .books [aria-selected='true'] { background: var(--surface-strong); color: var(--ink-strong); }
  .contents { display: grid; margin: 0; padding: 0; list-style: none; }
  .contents button { display: grid; grid-template-columns: 28px 1fr auto; align-items: baseline; gap: 10px; width: 100%; min-height: 52px; padding: 12px 4px; color: var(--ink); text-align: left; box-shadow: inset 0 -1px 0 var(--rule); transition: background-color 120ms ease; }
  @media (hover: hover) { .contents button:hover { background: var(--hover); } }
  .num { color: var(--faint); font-size: 13px; font-variant-numeric: tabular-nums; }
  .en { display: inline-flex; align-items: center; gap: 8px; font: 400 18px/1.2 var(--display); }
  .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); }
  .contents .he { font: 400 24px/1 var(--stam); }
  .more-shelves { display: grid; gap: 20px; margin-top: 32px; }
  .more-shelves p { margin: 6px 0 0; color: var(--muted); font: 400 17px/1.6 var(--display); }

  .tabbar { display: grid; grid-template-columns: repeat(3, 1fr); padding: 6px 8px max(8px, env(safe-area-inset-bottom)); background: var(--paper); box-shadow: 0 -1px 0 var(--rule); }
  .tabbar button { display: grid; justify-items: center; gap: 2px; min-height: 48px; color: var(--faint); font-size: 11px; font-weight: 500; }
  .tabbar button.active { color: var(--ink-strong); }
  .tabbar :global(.ui-icon) { width: 24px; height: 24px; }

  @container app (min-width: 900px) {
    .editorial { grid-template-rows: auto 1fr; }
    .tabbar { display: none; }
    .top { display: flex; justify-content: space-between; align-items: center; height: 56px; padding: 0 max(24px, calc((100% - 1040px) / 2)); box-shadow: 0 1px 0 var(--rule); }
    .top nav { display: flex; gap: 4px; }
    .top nav button { min-height: 34px; padding: 0 14px; border-radius: 17px; color: var(--muted); font-size: 14px; }
    .top nav button.active { background: var(--surface-strong); color: var(--ink-strong); font-weight: 500; }
    .mark { display: flex; align-items: center; gap: 10px; font: 400 20px/1 var(--display); }
    .mark span { font: 400 26px/1 var(--stam); color: var(--accent); }
    .column { max-width: 1040px; margin: 0 auto; padding: 56px 24px 64px; }
    h1 { font-size: 48px; }
    .hero { grid-template-columns: 1fr 360px; align-items: end; gap: 40px; }
    .hero-name { font-size: 120px; }
    .pair { grid-template-columns: 1fr 1fr; }
    .books { margin: 0 0 28px; padding: 0; justify-content: flex-start; }
    .contents { grid-template-columns: 1fr 1fr; column-gap: 48px; }
    .more-shelves { grid-template-columns: 1fr 1fr; gap: 48px; }
  }
</style>
