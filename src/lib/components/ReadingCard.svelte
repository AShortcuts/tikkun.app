<script lang="ts">
  import { resolve } from '$app/paths'
  import type { PublicReading } from '$lib/readings'
  import AliyahBubbles from './AliyahBubbles.svelte'

  let {
    reading,
  }: {
    reading: PublicReading & { parshaSlug: string }
  } = $props()
</script>

<article class="home-reading-card">
  <header class="home-reading-card-header">
    <a
      class="home-reading-title-link"
      href={resolve(`/reader/#/torah/parsha/${reading.parshaSlug}`)}
      data-sveltekit-reload
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
    data-sveltekit-reload
  >Open full reading</a>
</article>
