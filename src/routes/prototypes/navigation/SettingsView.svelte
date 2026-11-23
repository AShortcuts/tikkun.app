<script lang="ts">
  import UiIcon from '../../../../app/components/UiIcon.svelte'
  import { sample } from './data.ts'

  let { layout }: { layout: 'grouped' | 'columns' } = $props()
  let recordings = $state(false)
  let reminders = $state(false)
  const { recordings: used, text: textMb, available } = sample.storageMegabytes
  const total = used + textMb + available
  const sections: { title: string; help: string; rows: [string, string][] }[] = [
    { title: 'Reading', help: 'How the Torah text is laid out.', rows: [['Line layout', 'Match Torah lines'], ['Font size', '100%'], ['Nekudot', 'Shown'], ['Pasuk numbers', 'On']] },
    { title: 'Appearance', help: 'Theme and the current-word highlight.', rows: [['Theme', 'Automatic'], ['Current word', 'Blue fill']] },
    { title: 'Playback', help: 'Recordings and how the text follows them.', rows: [["Ba'al Koreh", 'Yoni Davidov'], ['Speed', '1×'], ['Auto-scroll', 'On']] },
  ]
</script>

<div class="settings" class:columns={layout === 'columns'}>
  {#each sections as section (section.title)}
    <section>
      <div class="label"><h2>{section.title}</h2><p>{section.help}</p></div>
      <div class="panel">
        {#each section.rows as [name, value] (name)}
          <button type="button" class="row"><span>{name}</span><span class="value">{value}</span><UiIcon name="chevronLeft" /></button>
        {/each}
      </div>
    </section>
  {/each}

  <section>
    <div class="label"><h2>Storage</h2><p>Readings saved on this device for offline use.</p></div>
    <div class="panel">
      <div class="storage">
        <div class="storage-bar" role="img" aria-label={`${used} MB recordings, ${textMb} MB Torah text`}>
          <span class="rec" style:width={`${Math.max(used / total * 100, 1.5)}%`}></span>
          <span class="txt" style:width={`${Math.max(textMb / total * 100, 0.8)}%`}></span>
        </div>
        <dl>
          <div><dt><i class="rec"></i>Recordings</dt><dd>{used} MB</dd></div>
          <div><dt><i class="txt"></i>Torah text</dt><dd>{textMb} MB</dd></div>
          <div><dt>Free on this device</dt><dd>{(available / 1000).toFixed(1)} GB</dd></div>
        </dl>
      </div>
      <button type="button" class="row"><span>Manage downloads</span><span class="value">2 readings</span><UiIcon name="chevronLeft" /></button>
    </div>
  </section>

  <section>
    <div class="label"><h2>Notifications</h2><p>Off until you turn them on. Design in progress.</p></div>
    <div class="panel">
      <label class="row switch"><span>New recordings for your readings</span><input type="checkbox" bind:checked={recordings} /></label>
      <label class="row switch"><span>Practice reminders</span><input type="checkbox" bind:checked={reminders} /></label>
    </div>
  </section>

  <section>
    <div class="label"><h2>App</h2><p>Updates install on their own.</p></div>
    <div class="panel">
      <div class="row static"><span>Version</span><span class="value">v2026.11-r1 · Latest</span></div>
      <div class="row static"><span>App Store</span><span class="value">v1.1 · Latest</span></div>
      <button type="button" class="row"><span>What's New</span><span class="value"></span><UiIcon name="chevronLeft" /></button>
      <button type="button" class="row"><span>Privacy and support</span><span class="value"></span><UiIcon name="chevronLeft" /></button>
      <button type="button" class="row"><span>About Tikkun</span><span class="value"></span><UiIcon name="chevronLeft" /></button>
    </div>
  </section>
</div>

<style>
  .settings { display: grid; gap: 28px; }
  section { display: grid; gap: 8px; }
  .label h2 { margin: 0; color: var(--muted); font-size: 13px; font-weight: 500; }
  .label p { display: none; margin: 4px 0 0; color: var(--muted); font-size: 14px; line-height: 1.45; }
  .panel { border-radius: 12px; background: var(--surface); overflow: hidden; }
  .row {
    display: grid; grid-template-columns: 1fr auto 16px; align-items: center; gap: 10px; width: 100%;
    min-height: 48px; padding: 0 16px; color: var(--ink); font-size: 16px; text-align: left;
    transition: background-color 120ms ease;
  }
  .row + .row, .storage + .row { box-shadow: inset 0 1px 0 var(--rule); }
  .row.static, .row.switch { grid-template-columns: 1fr auto; }
  /* iPhone settings rows end in a right chevron; the icon set only has a left one. */
  .row :global(.ui-icon) { width: 16px; height: 16px; color: var(--faint); transform: scaleX(-1); }
  .value { color: var(--muted); font-variant-numeric: tabular-nums; }
  @media (hover: hover) { button.row:hover { background: var(--hover); } }
  button.row:active { background: var(--hover); }
  .switch input { appearance: none; position: relative; width: 44px; height: 26px; margin: 0; border-radius: 13px; background: var(--rule-strong); transition: background-color 160ms ease; cursor: pointer; }
  .switch input::after { content: ''; position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px #0003; transition: transform 200ms var(--ease-out); }
  .switch input:checked { background: var(--ink-strong); }
  .switch input:checked::after { transform: translateX(18px); }
  .switch input:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

  .storage { display: grid; gap: 12px; padding: 16px; }
  .storage-bar { display: flex; height: 8px; border-radius: 4px; background: var(--rule); overflow: hidden; }
  .storage-bar .rec, dt .rec { background: var(--accent); }
  .storage-bar .txt, dt .txt { background: var(--ink); }
  dl { display: grid; gap: 6px; margin: 0; font-size: 14px; }
  dl div { display: flex; justify-content: space-between; }
  dt { display: inline-flex; align-items: center; gap: 8px; color: var(--muted); }
  dt i { width: 8px; height: 8px; border-radius: 2px; }
  dd { margin: 0; font-variant-numeric: tabular-nums; }

  /* Editorial: a label column with the section's help beside its panel, once there is room. */
  @container app (min-width: 760px) {
    .columns { gap: 0; }
    .columns section { grid-template-columns: minmax(180px, 280px) minmax(0, 560px); gap: 40px; padding: 28px 0; box-shadow: inset 0 -1px 0 var(--rule); }
    .columns section:last-child { box-shadow: none; }
    .columns .label h2 { color: var(--ink); font-size: 16px; }
    .columns .label p { display: block; }
  }
</style>
