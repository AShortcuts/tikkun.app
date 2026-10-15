<script lang="ts">
  import PrintDialog from '../../../../app/printing/PrintDialog.svelte'
  import { sampleAliyot } from './sample-reading.ts'
  import type { PrintContext } from '../../../../app/printing/print-context.ts'
  import { aliyahLabel } from '../../../../app/calendar-model/aliyah-label.ts'
  import { resolve } from '$app/paths'

  let open = $state(true)
  const context: PrintContext = {
    title: 'Sample reading · Beresheet', isParsha: true, currentKey: '1',
    aliyot: sampleAliyot().map(aliyah => ({ ...aliyah, key: `${aliyah.index}`, label: aliyahLabel(aliyah.index, undefined, 'en'), hebrewLabel: aliyahLabel(aliyah.index) })),
  }
</script>

<svelte:head><title>Print dialog prototype — Tikkun</title><meta name="robots" content="noindex, nofollow" /></svelte:head>
<main><button onclick={() => open = true}>Open print dialog</button><a href={resolve('/reader/')}>Return to reader</a></main>
{#if open}
  <PrintDialog {context} initialScope="custom" initialRange={{ start: { scroll: 'torah', b: 1, c: 1, v: 6 }, end: { scroll: 'torah', b: 1, c: 1, v: 13 } }} onclose={() => open = false} />
{/if}
