<script lang="ts">
  import { onMount } from 'svelte'
  import { renderPrintDocument } from './print-document.ts'
  import type { PrintOptions } from './print-model.ts'
  import '../../css/page.css'
  import './document.css'

  let root: HTMLDivElement
  let failure = $state('')
  let generation = 0

  onMount(() => {
    const pageStyle = document.createElement('style')
    pageStyle.media = 'print'
    document.head.append(pageStyle)
    async function receive(event: MessageEvent) {
      if (event.source !== parent || event.origin !== location.origin) return
      if (event.data?.kind !== 'tikkun-print-render') return
      const current = ++generation
      const options: PrintOptions = event.data.options
      const request = event.data.request
      failure = ''
      pageStyle.textContent = `@page { size: letter ${options.orientation === 'landscape' ? 'landscape' : 'portrait'}; margin: 0; }`
      try {
        const result = await renderPrintDocument(root, options, () => current === generation)
        if (result && current === generation) parent.postMessage({ kind: 'tikkun-print-result', request, ...result }, location.origin)
      } catch (error) {
        if (current !== generation) return
        console.error('Print preview failed', error)
        failure = error instanceof Error ? error.message : 'The preview could not be prepared.'
        // The shared DOM renderer exclusively owns this empty container.
        // eslint-disable-next-line svelte/no-dom-manipulating
        root.replaceChildren()
        parent.postMessage({ kind: 'tikkun-print-error', request, message: failure }, location.origin)
      }
    }
    window.addEventListener('message', receive)
    function keyboard(event: KeyboardEvent) {
      if (event.key === 'Escape') parent.postMessage({ kind: 'tikkun-print-close' }, location.origin)
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'p') {
        event.preventDefault()
        parent.postMessage({ kind: 'tikkun-print-open' }, location.origin)
      }
    }
    window.addEventListener('keydown', keyboard)
    parent.postMessage({ kind: 'tikkun-print-ready' }, location.origin)
    return () => { generation++; pageStyle.remove(); window.removeEventListener('message', receive); window.removeEventListener('keydown', keyboard) }
  })
</script>

<svelte:head>
  <title>Prepared reading pages</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

{#if failure}<p role="alert">{failure}</p>{/if}
<div bind:this={root} class="print-document"></div>
