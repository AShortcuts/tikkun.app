<script lang="ts">
  import type { Snippet } from 'svelte'
  import UiIcon from '../components/UiIcon.svelte'

  let { children }: { children: Snippet } = $props()
</script>

<span class="print-select">
  {@render children()}
  <UiIcon name="chevronDown" />
</span>

<style>
  .print-select { display: block; position: relative; flex: 1; min-width: 0; width: 100%; }
  .print-select :global(.ui-icon) { position: absolute; right: 12px; top: 50%; width: 16px; height: 16px; translate: 0 -50%; pointer-events: none; }
</style>
