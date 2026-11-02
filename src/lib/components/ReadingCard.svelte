<script lang="ts">
  import { resolve } from '$app/paths'
  import type { PublicReading } from '$lib/readings'
  import UiIcon from '../../../app/components/UiIcon.svelte'
  import AliyahBubbles from './AliyahBubbles.svelte'

  let {
    reading,
    table = false,
  }: {
    reading: PublicReading & { parshaSlug: string }
    /** Homepage table presentation: parsha number and an outbound-link icon. */
    table?: boolean
  } = $props()
</script>

<article class="home-reading-card">
  <header class="home-reading-card-header">
    {#if table && reading.number !== null}
      <span class="home-reading-number">{reading.number}</span>
    {/if}
    <a
      class="home-reading-title-link"
      href={resolve(`/reader/#/torah/parsha/${reading.parshaSlug}`)}
    >
      <strong>{reading.parshaName}</strong>
    </a>
    <span class={`home-reading-status mod-${reading.statusKind}`}>
      {reading.statusLabel}
    </span>
  </header>
  <nav class="home-reading-bubbles" aria-label={`${reading.parshaName} aliyot`}>
    <AliyahBubbles
      aliyot={reading.aliyot}
      readingName={reading.parshaName}
      interactive
    />
  </nav>
  <a
    class="home-reading-open"
    href={resolve(`/reader/#/torah/parsha/${reading.parshaSlug}`)}
  >Open full reading{#if table}<UiIcon name="externalLink" />{/if}</a>
</article>
