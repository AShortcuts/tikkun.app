<script lang="ts">
  import { resolve } from '$app/paths'
  import UiIcon from '../../../../app/components/UiIcon.svelte'
  import type { PageData } from './$types'

  let { data }: { data: PageData } = $props()
  let theme = $state('dark')
  let active = $state<string | null>(null)
  const options = [
    { id: 'inline', name: 'Inline', description: 'Title and arrow sit together as one centered unit. My pick.' },
    { id: 'centered', name: 'Title-centered', description: 'Titles keep their centerline. The arrow follows each title.' },
    { id: 'joined', name: 'Soft group', description: 'Same close spacing, with a shared surface on hover or focus.' },
  ]
</script>

<svelte:head>
  <title>TOC chevron studies — Tikkun Korim</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<main data-theme={theme}>
  <header>
    <div><h1>Closer to the title.</h1><p>Three TOC treatments. Actual parshas and aliyah links; the live reader is unchanged.</p></div>
    <label>Appearance <select bind:value={theme}><option value="dark">Dark</option><option value="light">Light</option></select></label>
  </header>
  <p class="instruction">Click a title to read. Click its arrow to choose an aliyah. Press Escape to close.</p>
  <div class="studies">
    {#each options as option (option.id)}
      <section class={option.id} aria-label={option.name}>
        <h2>{option.name}</h2>
        <p class="description">{option.description}</p>
        <div class="sample" dir="rtl">
          <h3 lang="he">פרשת השבוע</h3>
          <div class="books">
            {#each [data.books[0], data.books[2]] as book (book[0].id)}
              <ol>
                {#each book.slice(0, 5) as entry, index (entry.id)}
                  {@const key = `${option.id}-${entry.id}`}
                  <li>
                    <div class="row" class:open={active === key}>
                      <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- The reader route is resolved; the catalog supplies its hash. -->
                      <a class:first={index === 0} lang="he" href={`${resolve('/reader/')}${entry.href}`} target="_blank" rel="noreferrer">{entry.label}</a>
                      <button
                        aria-label={`Choose aliyah for ${entry.label}`}
                        aria-expanded={active === key}
                        aria-controls={`${key}-choices`}
                        onclick={() => active = active === key ? null : key}
                        onkeydown={event => { if (event.key === 'Escape') active = null }}
                      ><UiIcon name={active === key ? 'chevronUp' : 'chevronDown'} /></button>
                    </div>
                    {#if active === key}
                      <div class="choices" id={`${key}-choices`}>
                        {#each entry.aliyahGroups as group (group.label)}
                          {#if entry.aliyahGroups.length > 1}<strong>{group.label}</strong>{/if}
                          {#each group.choices as choice (choice.href)}
                            <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- The reader route is resolved; the catalog supplies its hash. -->
                            <a href={`${resolve('/reader/')}${choice.href}`} target="_blank" rel="noreferrer">{choice.label}</a>
                          {/each}
                        {/each}
                      </div>
                    {/if}
                  </li>
                {/each}
              </ol>
            {/each}
          </div>
        </div>
      </section>
    {/each}
  </div>
  <footer>Smaller 14px arrows. Full 44px click targets. Separate title and aliyah actions.</footer>
</main>

<style>
  @font-face { font-family: 'TOC Hebrew'; src: url('/assets/fonts/NotoSansHebrew-Variable.ttf') format('truetype'); font-weight: 100 900; font-display: swap; }
  :global(body) { margin: 0; }
  main { --paper: #222; --ink: #bfbfbf; --muted: #aaa; --line: #414141; --hover: #333; min-height: 100vh; box-sizing: border-box; padding: 48px 32px; background: var(--paper); color: var(--ink); font-family: 'TOC Hebrew', -apple-system, sans-serif; }
  main[data-theme='light'] { --paper: #fafafa; --ink: #4b4b4b; --muted: #707070; --line: #ddd; --hover: #eee; }
  header { display: flex; justify-content: space-between; align-items: center; gap: 24px; }
  h1 { margin: 0 0 12px; font-size: 30px; font-weight: 600; letter-spacing: -0.025em; }
  p { margin: 0; color: var(--muted); font-size: 14px; line-height: 1.6; }
  label { display: flex; align-items: center; gap: 10px; font-size: 13px; }
  select { min-height: 44px; padding: 0 12px; color: var(--ink); background: var(--paper); border: 1px solid var(--line); border-radius: 8px; font: inherit; color-scheme: dark; }
  [data-theme='light'] select { color-scheme: light; }
  .instruction { margin: 26px 0 34px; }
  .studies { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 28px; }
  section { min-width: 0; }
  h2 { margin: 0 0 8px; font-size: 18px; font-weight: 600; }
  .description { min-height: 48px; max-width: 34ch; }
  .sample { margin-top: 20px; padding: 24px 0; border-block: 1px solid var(--line); }
  h3 { margin: 0 12px 24px; padding-bottom: 15px; border-bottom: 1px solid var(--line); font-size: 26px; font-weight: 650; }
  .books { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
  ol { list-style: none; margin: 0; padding: 0; min-width: 0; }
  li { position: relative; }
  .row { display: flex; align-items: center; justify-content: center; width: fit-content; max-width: 100%; min-height: 62px; margin-inline: auto; border-radius: 8px; }
  a { color: inherit; text-decoration: none; }
  .row > a { min-width: 0; padding: 11px 0 11px 2px; font-size: 20px; line-height: 1.45; text-align: center; border-radius: 8px; }
  .row > a.first { font-weight: 700; }
  button { display: grid; place-items: center; flex: 0 0 44px; width: 44px; height: 44px; padding: 0; border: 0; border-radius: 8px; color: var(--muted); background: transparent; cursor: pointer; }
  button :global(.ui-icon) { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
  .centered .row { padding-inline-start: 44px; }
  .joined .row { padding-inline-start: 10px; }
  .joined .row:focus-within, .joined .row.open { background: var(--hover); }
  :is(a, button, select):focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
  button[aria-expanded='true'] { background: var(--hover); color: var(--ink); }
  .choices { position: absolute; inset-inline: 0; top: 100%; z-index: 1; max-height: 260px; overflow: auto; padding: 8px; border: 1px solid var(--line); border-radius: 10px; background: var(--paper); }
  .choices a, .choices strong { display: block; padding: 12px 4px; font-size: 14px; text-align: center; }
  footer { margin-top: 32px; color: var(--muted); font-size: 13px; }
  ::selection { background: var(--ink); color: var(--paper); }
  @media (hover: hover) { .row > a:hover, button:hover, .choices a:hover, .joined .row:hover { background: var(--hover); } }
  @media (max-width: 1000px) { .studies { grid-template-columns: 1fr; gap: 40px; } .sample { max-width: 450px; } .description { min-height: 0; max-width: none; } }
  @media (max-width: 550px) { main { padding: 28px 20px; } header { align-items: start; flex-direction: column; } h1 { font-size: 26px; } .row > a { font-size: 19px; } }
</style>
