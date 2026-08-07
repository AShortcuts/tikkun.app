<script lang="ts">
  import { aliyahLetters } from '$lib/readings'

  let {
    availableAliyot,
  }: {
    availableAliyot: readonly number[]
  } = $props()
</script>

{#each aliyahLetters as letter, index (letter)}
  {@const aliyah = index + 1}
  {@const available = availableAliyot.includes(aliyah)}
  <span
    class="home-aliyah-bubble"
    class:is-available={available}
    aria-label={`Aliyah ${aliyah}${available ? ' available' : ' not yet available'}`}
  >{letter}</span>
{/each}
