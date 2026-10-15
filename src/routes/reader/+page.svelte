<script lang="ts">
  import { resolve } from '$app/paths'
  import ReaderApp from '$lib/components/ReaderApp.svelte'
  import { onMount } from 'svelte'
  import { READER_APP_BANNER_CONTENT, updateReaderAppBanner } from '../../../app/platform/smart-app-banner.ts'

  onMount(() => updateReaderAppBanner(document, window.location))
</script>

<svelte:head>
  <meta name="apple-itunes-app" content={READER_APP_BANNER_CONTENT} />
  <title>Reader — Tikkun Reader</title>
  <meta name="description" content="Practice Torah reading with Tikkun Reader." />
</svelte:head>

<ReaderApp aboutHref={resolve('/')} />
