<script lang="ts">
  import { iconMarkup, type IconName } from './icons.ts'

  let { name }: { name: IconName } = $props()
</script>

<!-- eslint-disable-next-line svelte/no-at-html-tags -- iconMarkup only accepts trusted local IconName values. -->
{@html iconMarkup(name)}
