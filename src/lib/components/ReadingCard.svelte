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

<a
  class="home-reading-card"
  href={resolve(`/reader/#/torah/parsha/${reading.parshaSlug}`)}
  data-sveltekit-reload
>
  <span class="home-reading-card-header">
    <strong>{reading.parshaName}</strong>
    <span class={`home-reading-status mod-${reading.statusKind}`}>
      {reading.statusLabel}
    </span>
  </span>
  <span class="home-reading-bubbles">
    <AliyahBubbles availableAliyot={reading.availableAliyot} />
  </span>
  <span class="home-reading-open">
    Open reading
    <span aria-hidden="true">→</span>
  </span>
</a>
