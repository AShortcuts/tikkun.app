<script lang="ts">
  import { resolve } from '$app/paths'
  import ReaderApp from '$lib/components/ReaderApp.svelte'
</script>

<svelte:head>
  <title>Reader — Tikkun Korim</title>
  <meta name="description" content="Practice Torah reading in the Tikkun Korim reader." />
</svelte:head>

<ReaderApp aboutHref={resolve('/')} />
