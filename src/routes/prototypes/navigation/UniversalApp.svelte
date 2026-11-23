<script lang="ts">
  import UiIcon from '../../../../app/components/UiIcon.svelte'
  import AliyahStrip from './AliyahStrip.svelte'
  import ImmersiveReader from './ImmersiveReader.svelte'
  import UniversalSettings from './UniversalSettings.svelte'
  import { aliyahNames, books, sample, upcoming } from './data.ts'
  import type { Book, Parsha } from './data.ts'

  let { tab = $bindable('space'), onwhatsnew }: { tab?: 'space' | 'library' | 'settings'; onwhatsnew?: () => void } = $props()
  const week = upcoming()
  const all = books.flatMap(book => book.parshiot)
  const byIndex = (index: number) => all.find(p => p.index === index) as Parsha
  const preparing = byIndex(sample.preparing.parshaIndex)
  const target = week.find(w => w.parsha.index === preparing.index) ?? week[1]
  const resume = byIndex(sample.continueReading.parshaIndex)
  const short = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  const long = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  const narrow = new Intl.DateTimeFormat('en-US', { weekday: 'narrow' })
  const now = new Date()
  // Days from today to the Shabbat you read; reminder days from the sample (Sunday and Wednesday).
  const days = Array.from({ length: target.daysAway + 1 }, (_, i) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i)
    return { date, today: i === 0, reminder: [0, 3].includes(date.getDay()) && i > 0, shabbat: i === target.daysAway }
  })
  let reading = $state<Parsha | null>(null)
  let detail = $state(false)
  let gear = $state(false)
  let book = $state<Book | null>(null)
  let reminders = $state(true)
  const tabs = [
    { id: 'space', label: 'My Space', icon: 'houseFilled' },
    { id: 'library', label: 'Library', icon: 'bookText' },
    { id: 'settings', label: 'Settings', icon: 'cog' },
  ] as const
  const titles = { space: 'My Space', library: 'Library', settings: 'Settings' }
  const megillot = [['Esther', 'אסתר', true], ['Shir HaShirim', 'שיר השירים', false], ['Ruth', 'רות', false], ['Eicha', 'איכה', false], ['Kohelet', 'קהלת', false]] as const
  const holidays = [['Rosh Hashanah', 'ראש השנה'], ['Yom Kippur', 'יום כיפור'], ['Sukkot', 'סוכות'], ['Simchat Torah', 'שמחת תורה'], ['Chanukah', 'חנוכה'], ['Purim', 'פורים'], ['Pesach', 'פסח'], ['Shavuot', 'שבועות']] as const
  function open(p: Parsha) { reading = p }
  function go(next: typeof tab) { tab = next; detail = false; book = null }
</script>

<div class="u">
  <main class="canvas" class:detail>
    {#if tab === 'space' && !detail}
      <h1>My Space</h1>
      <section class="block">
        <h2>This week</h2>
        <div class="card">
          <div class="head">
            <div><strong class="he" dir="rtl">{week[0].parsha.hebrew}</strong><span>{week[0].parsha.name} · {short.format(week[0].date)}</span></div>
            <button type="button" class="primary" onclick={() => open(week[0].parsha)}><UiIcon name="play" />Listen</button>
          </div>
          <AliyahStrip label="Seven aliyot, all recorded" />
        </div>
      </section>
      <section class="block">
        <h2>Preparing</h2>
        <button type="button" class="card tap" onclick={() => { detail = true }}>
          <div class="head">
            <div><strong class="he" dir="rtl">{preparing.hebrew}</strong><span>{preparing.name} · aliyot {sample.preparing.aliyot[0]}–{sample.preparing.aliyot.at(-1)} · {target.daysAway} days</span></div>
            <UiIcon name="chevronLeft" />
          </div>
          <AliyahStrip label="Your aliyot, 2 of 4 practiced" mine={sample.preparing.aliyot} done={sample.preparing.practiced} />
          <p class="meta"><span class="pill">New recordings</span>{sample.preparing.practiced.length} of {sample.preparing.aliyot.length} practiced</p>
        </button>
      </section>
      <section class="block">
        <h2>Continue</h2>
        <button type="button" class="card tap rowcard" onclick={() => open(resume)}>
          <span><strong>{resume.name}, {aliyahNames[sample.continueReading.aliyah - 1]}</strong><small>{sample.continueReading.position} of {sample.continueReading.length}</small></span>
          <UiIcon name="play" />
        </button>
      </section>
      <section class="block">
        <div class="bhead"><h2>Bookmarks</h2><button type="button" class="link">View all</button></div>
        <ul class="card list">
          {#each sample.bookmarks as mark (mark.label)}<li><UiIcon name="bookmarkFilled" /><span><strong>{mark.label}</strong><small>{mark.note}</small></span></li>{/each}
        </ul>
      </section>

    {:else if tab === 'space'}
      <button type="button" class="back" onclick={() => { detail = false }}><UiIcon name="chevronLeft" />My Space</button>
      <div class="detail-head">
        <strong class="he big" dir="rtl">{preparing.hebrew}</strong>
        <h1>{preparing.name}</h1>
        <p class="sub">{long.format(target.date)} · <strong>{target.daysAway} days</strong> to go</p>
      </div>
      <section class="block">
        <h2>Your aliyot</h2>
        <div class="card">
          <AliyahStrip label="Your aliyot, tap to change" mine={sample.preparing.aliyot} done={sample.preparing.practiced} />
          <p class="meta">{aliyahNames[3]} to {aliyahNames[6]} · {sample.preparing.practiced.length} practiced · tap a box to change</p>
          <div class="actions">
            <button type="button" class="primary" onclick={() => open(preparing)}><UiIcon name="play" />Practice {aliyahNames[5]}</button>
            <button type="button" class="secondary" onclick={() => open(preparing)}>Listen to all</button>
          </div>
        </div>
      </section>
      <section class="block">
        <h2>Until you read</h2>
        <div class="card">
          <ol class="days" aria-label="Days until your reading">
            {#each days as day (day.date.getTime())}
              <li class:today={day.today} class:reminder={day.reminder && reminders} class:shabbat={day.shabbat}><small>{narrow.format(day.date)}</small><span>{day.date.getDate()}</span></li>
            {/each}
          </ol>
          <label class="field switch"><span>Practice reminders<small>Sunday and Wednesday at 7:30 pm</small></span><input type="checkbox" bind:checked={reminders} /></label>
        </div>
      </section>
      <section class="block">
        <h2>New since Sunday</h2>
        <ul class="card list">
          <li><UiIcon name="audioLines" /><span><strong>{preparing.name}, {aliyahNames[4]}</strong><small>Recording with highlighting</small></span></li>
          <li><UiIcon name="audioLines" /><span><strong>{preparing.name}, {aliyahNames[5]}</strong><small>Recording with highlighting</small></span></li>
        </ul>
      </section>

    {:else if tab === 'library' && !book}
      <h1>Library</h1>
      <section class="block">
        <h2>Torah</h2>
        <ul class="card list books">
          {#each books as b (b.name)}
            <li><button type="button" onclick={() => { book = b }}>
              <span class="he mid" dir="rtl">{b.hebrew}</span>
              <span><strong>{b.name}</strong><small>{b.parshiot.length} parshiot · {b.parshiot.filter(p => p.recorded).length} recorded</small></span>
              <UiIcon name="chevronLeft" />
            </button></li>
          {/each}
        </ul>
      </section>
      <section class="block">
        <h2>Holidays</h2>
        <ul class="card list books">
          {#each holidays as [name, he] (name)}<li><button type="button"><span class="he mid" dir="rtl">{he}</span><span><strong>{name}</strong></span><UiIcon name="chevronLeft" /></button></li>{/each}
        </ul>
      </section>
      <section class="block">
        <h2>Megillot</h2>
        <ul class="card list books">
          {#each megillot as [name, he, ready] (name)}
            <li class:soon={!ready}><button type="button" disabled={!ready} aria-disabled={!ready}><span class="he mid" dir="rtl">{he}</span><span><strong>{name}</strong>{#if !ready}<small>Text coming</small>{/if}</span>{#if ready}<UiIcon name="chevronLeft" />{/if}</button></li>
          {/each}
        </ul>
      </section>

    {:else if tab === 'library' && book}
      <button type="button" class="back" onclick={() => { book = null }}><UiIcon name="chevronLeft" />Library</button>
      <div class="detail-head">
        <strong class="he big" dir="rtl">{book.hebrew}</strong>
        <h1>{book.name}</h1>
      </div>
      <ul class="card list books">
        {#each book.parshiot as p (p.index)}
          <li><button type="button" onclick={() => open(p)}>
            <span class="he mid" dir="rtl">{p.hebrew}</span>
            <span><strong>{p.name}</strong>{#if p.recorded}<small class="rec"><UiIcon name="audioLines" />Recorded</small>{/if}</span>
            <UiIcon name="chevronLeft" />
          </button></li>
        {/each}
      </ul>

    {:else}
      <h1>Settings</h1>
      <UniversalSettings {onwhatsnew} />
    {/if}
  </main>

  <nav class="pill" aria-label="Main">
    {#each tabs as item (item.id)}
      <button type="button" class:active={tab === item.id} aria-current={tab === item.id ? 'page' : undefined} aria-label={item.label} onclick={() => go(item.id)}>
        <UiIcon name={item.icon} />{#if tab === item.id}<span>{item.label}</span>{/if}
      </button>
    {/each}
  </nav>

  {#if reading}
    <ImmersiveReader title={reading.name} hebrew={reading.hebrew} back={detail ? preparing.name : book ? book.name : titles[tab]} onclose={() => { reading = null; gear = false }} onsettings={() => { gear = true }} />
    {#if gear}
      <button type="button" class="scrim" aria-label="Close reading settings" tabindex="-1" onclick={() => { gear = false }}></button>
      <div class="gear" role="dialog" aria-modal="true" aria-label="Reading settings">
        <div class="grab" aria-hidden="true"></div>
        <UniversalSettings scope="reading" />
      </div>
    {/if}
  {/if}
</div>

<style>
  .u { position: absolute; inset: 0; background: var(--ground); color: var(--ink); font-family: var(--ui); }
  .canvas { position: absolute; inset: 0; overflow-y: auto; padding: 20px 16px 110px; }
  h1 { margin: 6px 0 20px; font: 400 32px/1.1 var(--display); letter-spacing: -0.01em; }
  h2 { margin: 0 2px; font: 400 20px/1.2 var(--display); }
  .block { display: grid; gap: 10px; margin-bottom: 24px; }
  .bhead { display: flex; justify-content: space-between; align-items: baseline; }
  .card { display: grid; gap: 14px; width: 100%; padding: 16px; border-radius: 14px; background: var(--surface); color: var(--ink); text-align: left; }
  .tap { transition: transform 140ms var(--ease-out); }
  .tap:active { transform: scale(0.985); }
  .head { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
  .head div { display: grid; gap: 2px; }
  .head > :global(.ui-icon) { width: 18px; height: 18px; color: var(--faint); transform: scaleX(-1); }
  .he { font: 400 34px/1.4 var(--stam); color: var(--ink-strong); }
  .he.big { font-size: 56px; line-height: 1.25; }
  .he.mid { font-size: 26px; line-height: 1.3; min-width: 92px; }
  .head span, .meta, small, .sub { color: var(--muted); font-size: 14px; }
  .meta { display: flex; align-items: center; gap: 10px; margin: 0; }
  .meta .pill { padding: 3px 8px; border-radius: 8px; background: var(--accent-tint); color: var(--accent-strong); font-size: 12px; font-weight: 500; }
  .primary, .secondary { display: inline-flex; justify-content: center; align-items: center; gap: 6px; min-height: 42px; padding: 0 16px; border-radius: 12px; font-size: 15px; font-weight: 600; white-space: nowrap; transition: transform 140ms var(--ease-out); }
  .primary { background: var(--ink-strong); color: var(--paper); }
  .secondary { background: var(--surface-strong); color: var(--ink); }
  .primary:active, .secondary:active { transform: scale(0.96); }
  .primary :global(.ui-icon) { width: 18px; height: 18px; }
  .actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .rowcard { grid-template-columns: 1fr auto; align-items: center; }
  .rowcard span, .list li > span { display: grid; gap: 1px; }
  .rowcard :global(.ui-icon) { width: 20px; height: 20px; color: var(--accent); }
  .link { color: var(--accent-strong); font-size: 14px; }
  .list { gap: 0; padding: 0; margin: 0; list-style: none; }
  .list li { display: grid; grid-template-columns: 20px 1fr; align-items: center; gap: 12px; min-height: 56px; padding: 0 16px; }
  .list li + li { box-shadow: inset 0 1px 0 var(--rule); }
  .list :global(.ui-icon) { width: 18px; height: 18px; color: var(--faint); }
  .books li { display: block; padding: 0; }
  .books button { display: grid; grid-template-columns: auto 1fr 16px; align-items: center; gap: 14px; width: 100%; min-height: 60px; padding: 8px 16px; color: var(--ink); text-align: left; transition: background-color 120ms ease; }
  .books button > span:not(.he) { display: grid; gap: 2px; }
  .books button:active { background: var(--hover); }
  .books button > :global(.ui-icon) { transform: scaleX(-1); }
  .soon button { cursor: default; }
  .soon .he, .soon strong { color: var(--faint); }
  .rec { display: inline-flex; align-items: center; gap: 4px; color: var(--accent-strong); font-size: 12px; }
  .rec :global(.ui-icon) { width: 14px; height: 14px; color: var(--accent); }
  .back { display: inline-flex; align-items: center; gap: 2px; min-height: 40px; margin-left: -6px; padding: 0 8px 0 2px; color: var(--accent-strong); font-size: 15px; }
  .back :global(.ui-icon) { width: 18px; height: 18px; }
  .detail-head { display: grid; justify-items: start; margin: 4px 0 20px; }
  .detail-head h1 { margin: 0 0 4px; }
  .sub { margin: 0; font-size: 15px; }
  .sub strong { color: var(--ink); }

  .days { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; margin: 0; padding: 0; list-style: none; }
  .days li { display: grid; justify-items: center; gap: 2px; padding: 6px 0; border-radius: 10px; font-variant-numeric: tabular-nums; }
  .days small { font-size: 11px; }
  .days span { width: 26px; line-height: 26px; border-radius: 50%; font-size: 15px; text-align: center; }
  .days .today { background: var(--surface-strong); font-weight: 600; }
  .days .reminder span { box-shadow: inset 0 0 0 1.5px var(--accent); }
  .days .shabbat { background: var(--accent); color: var(--accent-ink); }
  .days .shabbat small { color: var(--accent-ink); }
  .field { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 10px; }
  .field span { display: grid; gap: 1px; font-size: 15px; }
  .switch input { appearance: none; position: relative; width: 44px; height: 26px; margin: 0; border-radius: 13px; background: var(--rule-strong); transition: background-color 160ms ease; cursor: pointer; }
  .switch input::after { content: ''; position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px #0003; transition: transform 200ms var(--ease-out); }
  .switch input:checked { background: var(--ink-strong); }
  .switch input:checked::after { transform: translateX(18px); }

  /* The floating pill: three destinations, the active one carries its label; content scrolls under it. */
  nav.pill {
    position: absolute; left: 50%; bottom: max(18px, env(safe-area-inset-bottom)); z-index: 10; display: flex; gap: 2px; padding: 4px;
    border-radius: 999px; background: color-mix(in srgb, var(--paper) 92%, transparent); box-shadow: 0 8px 28px -8px #0006, 0 0 0 1px var(--rule);
    transform: translateX(-50%); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
  }
  nav.pill button { display: inline-flex; align-items: center; gap: 6px; height: 44px; padding: 0 14px; border-radius: 999px; color: var(--muted); font-size: 14px; font-weight: 500; white-space: nowrap; transition: background-color 160ms ease, color 160ms ease, transform 120ms var(--ease-out); }
  nav.pill button:active { transform: scale(0.95); }
  nav.pill button.active { background: var(--ink-strong); color: var(--paper); padding-right: 16px; }
  nav.pill :global(.ui-icon) { width: 22px; height: 22px; }

  .scrim { position: absolute; inset: 0; z-index: 30; background: #0005; animation: fade 160ms ease-out; }
  .gear { position: absolute; left: 0; right: 0; bottom: 0; z-index: 31; max-height: 78%; overflow-y: auto; padding: 8px 16px max(24px, env(safe-area-inset-bottom)); border-radius: 20px 20px 0 0; background: var(--ground); box-shadow: 0 -12px 40px -16px #0006; animation: rise 300ms var(--ease-drawer); }
  .grab { width: 36px; height: 5px; margin: 0 auto 14px; border-radius: 3px; background: var(--rule-strong); }
  @keyframes rise { from { transform: translateY(100%); } }
  @keyframes fade { from { opacity: 0; } }
  @media (prefers-reduced-motion: reduce) { .gear { animation: fade 160ms ease-out; } }
</style>
