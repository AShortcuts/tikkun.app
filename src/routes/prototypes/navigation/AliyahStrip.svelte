<script lang="ts">
  // The one element only this app has: a reading's seven aliyot, with yours and your practice marked.
  let { mine = [], done = [], label }: { mine?: number[]; done?: number[]; label: string } = $props()
</script>

<ol class="strip" aria-label={label}>
  {#each [1, 2, 3, 4, 5, 6, 7] as n (n)}
    <li class:mine={mine.length === 0 || mine.includes(n)} class:done={done.includes(n)}><span>{n}</span></li>
  {/each}
</ol>

<style>
  .strip { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; margin: 0; padding: 0; list-style: none; }
  li { display: grid; place-items: center; height: 28px; border-radius: 6px; background: var(--rule); color: var(--faint); font-size: 12px; font-variant-numeric: tabular-nums; }
  li.mine { background: var(--surface-strong); color: var(--muted); box-shadow: inset 0 0 0 1px var(--rule-strong); }
  li.done { background: var(--accent); color: var(--accent-ink); box-shadow: none; }
</style>
