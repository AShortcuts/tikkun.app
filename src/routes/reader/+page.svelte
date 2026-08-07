<script lang="ts">
  import { resolve } from '$app/paths'
  import ReaderApp from '$lib/components/ReaderApp.svelte'
</script>

<svelte:head>
  <title>Reader — Tikkun Korim</title>
  <meta name="description" content="Practice Torah reading in the Tikkun Korim reader." />
  <meta name="theme-color" content="oklch(98.5% 0 0)" />
</svelte:head>

<ReaderApp aboutHref={resolve('/about/')} />
