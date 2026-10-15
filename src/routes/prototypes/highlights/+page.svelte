<script lang="ts">
  import { onMount } from 'svelte'
  import Page from '../../../../app/components/Page.ts'
  import { applyReaderPageLayout } from '../../../../app/components/reader-page-layout.ts'
  import { loadPrintPassage, type PassageRange } from '../../../../app/printing/print-model.ts'
  import type { ReaderPagePresentation } from '../../../../app/reader-presentation.ts'
  import { handleAliyahPermalinkClick } from '../../../../app/reader/aliyah-permalink.ts'
  import { ARRIVAL_CUE_DURATION_MS } from '../../../../app/reader/arrival-cue.ts'
  import '../../../../css/master.css'
  import './preview.css'

  const treatments = [
    { id: 'marker', name: 'Soft marker', detail: 'A quiet wash behind the selected words. No underline.' },
    { id: 'outline', name: 'Fine outline', detail: 'A thin frame leaves the text surface clear.' },
    { id: 'underline', name: 'Tint + underline', detail: 'A second visual cue stays distinct when audio overlaps.' },
  ] as const
  let treatment = $state('marker')
  let theme = $state('light')
  let layout = $state<ReaderPagePresentation['layout']>('reading')
  let sides = $state<ReaderPagePresentation['sides']>('two')
  let target = $state('range')
  let audio = $state(true)
  let cleared = $state(false)
  let arrival = $state(false)
  let status = $state('')
  let failure = $state('')
  let data = $state<Awaited<ReturnType<typeof loadPrintPassage>>[]>([])
  let page: HTMLElement
  let book: HTMLDivElement
  let viewport: HTMLDivElement
  type Strip = { left: number; top: number; width: number; height: number }
  let strips = $state<Strip[]>([])
  let arrivalStrips = $state<Strip[]>([])
  let viewportWidth = $state(0)
  let timer: ReturnType<typeof setTimeout>
  let selectionKeys = $state<string[]>([])
  let linkedKeys = $state<string[]>([])
  let previewUrl = $state('')
  let arrivalRun = $state(0)
  const range = (end: number): PassageRange => ({ start: { scroll: 'torah', b: 1, c: 1, v: 6 }, end: { scroll: 'torah', b: 1, c: 1, v: end } })
  const description = $derived(target === 'range' ? 'Beresheet 1:6–8' : target === 'verse' ? 'Beresheet 1:6' : 'Opening phrase · Beresheet 1:6')
  const selectedTreatment = $derived(treatments.find(item => item.id === treatment)!)

  function readSelection() {
    const selection = window.getSelection()
    if (!selection?.rangeCount || selection.isCollapsed) {
      if (!document.activeElement?.closest('.selection-actions')) selectionKeys = []
      return
    }
    const selected = selection.getRangeAt(0)
    if (!page.contains(selected.startContainer) || !page.contains(selected.endContainer)) {
      selectionKeys = []
      return
    }
    selectionKeys = [...new Set([...page.querySelectorAll<HTMLElement>('.word[data-token-key]')]
      .filter(word => word.getClientRects().length && selected.intersectsNode(word))
      .map(word => word.dataset.tokenKey!))]
    previewUrl = `${location.origin}${location.pathname}#preview-words=${selectionKeys.join(',')}`
  }
  function removeHighlight() {
    cleared = true
    history.replaceState(history.state, '', location.pathname + location.search)
    status = 'Highlight removed. Your reading position is unchanged.'
  }
  function chooseHighlight() {
    linkedKeys = []
    cleared = false
    arrival = false
    clearTimeout(timer)
    history.replaceState(history.state, '', location.pathname + location.search)
  }
  function readPreviewLink() {
    const value = new URLSearchParams(location.hash.slice(1)).get('preview-words')
    if (!value) {
      if (linkedKeys.length) cleared = true
      return
    }
    const keys = value.split(',')
    if (!keys.length || keys.some(key => !/^\d+:\d+:\d+:\d+$/.test(key))) {
      status = 'This preview link has an invalid selection.'
      return
    }
    linkedKeys = keys
    cleared = false
    status = 'Opened a highlighted selection from a prototype link.'
  }
  async function copySelection(event: MouseEvent) {
    let failed = false
    await handleAliyahPermalinkClick(event, { onError: () => { failed = true } })
    status = failed ? 'Could not copy the link. Check clipboard permissions and try again.' : 'Prototype link copied. Open it to preview this selection.'
  }

  function measureStrips(selector: string): Strip[] {
    const origin = book.getBoundingClientRect()
    // Temporary measurement groups; only the resulting rectangles are reactive.
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const rows = new Map<Element, { left: number; right: number; top: number; bottom: number }[]>()
    for (const word of page.querySelectorAll<HTMLElement>(selector)) {
      const side = word.closest('.reader-reading-page-side') ?? word.closest('.reader-text-side') ?? page
      const lines = rows.get(side) ?? []
      rows.set(side, lines)
      for (const rect of word.getClientRects()) {
        if (!rect.width || !rect.height) continue
        const row = lines.find(line => Math.abs(line.top - rect.top) < 4)
        if (row) {
          row.left = Math.min(row.left, rect.left); row.right = Math.max(row.right, rect.right)
          row.bottom = Math.max(row.bottom, rect.bottom)
        } else lines.push({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom })
      }
    }
    return [...rows.values()].flat().map(rect => ({ left: rect.left - origin.left - 2, top: rect.top - origin.top - 1, width: rect.right - rect.left + 4, height: rect.bottom - rect.top + 3 }))
  }
  function measure() {
    strips = measureStrips('.destination')
    arrivalStrips = measureStrips('.arrival-word')
  }

  function reveal() {
    const word = page?.querySelector<HTMLElement>('.destination')
    if (!word || !viewport) return
    viewport.scrollTop += word.getBoundingClientRect().top - viewport.getBoundingClientRect().top - 105
  }
  function replayArrival() {
    clearTimeout(timer)
    cleared = true
    arrivalRun += 1
    arrival = true
    status = 'Ordinary link: a quiet arrival cue, then it disappears.'
    reveal()
    const first = page.querySelector<HTMLElement>('.destination')
    const top = first?.getBoundingClientRect().top
    for (const word of page.querySelectorAll<HTMLElement>('.word')) {
      word.classList.toggle('arrival-word', top !== undefined && Math.abs(word.getBoundingClientRect().top - top) < 3)
    }
    measure()
    timer = setTimeout(() => { arrival = false; status = 'Arrival cue cleared. No permanent highlight on an ordinary link.' }, ARRIVAL_CUE_DURATION_MS)
  }

  onMount(() => {
    const previousTheme = document.documentElement.dataset.readerTheme
    const previousOrder = document.documentElement.dataset.readerSideOrder
    document.documentElement.dataset.readerSideOrder = 'tikkun-right'
    readPreviewLink()
    document.addEventListener('selectionchange', readSelection)
    window.addEventListener('hashchange', readPreviewLink)
    let disposed = false
    void Promise.all([loadPrintPassage([range(8)]), loadPrintPassage([range(6)]), document.fonts.load('28px ShlomosemiStam')]).then(([multiple, single]) => {
      if (!disposed) data = [multiple, single]
    }).catch(error => { console.error('Highlight preview could not load', error); failure = 'Could not load the Torah preview. Reload to try again.' })
    const observer = new ResizeObserver(([entry]) => { viewportWidth = entry.contentRect.width })
    observer.observe(viewport)
    return () => {
      disposed = true; observer.disconnect(); clearTimeout(timer)
      document.removeEventListener('selectionchange', readSelection)
      window.removeEventListener('hashchange', readPreviewLink)
      if (previousTheme) document.documentElement.dataset.readerTheme = previousTheme
      else delete document.documentElement.dataset.readerTheme
      if (previousOrder) document.documentElement.dataset.readerSideOrder = previousOrder
      else delete document.documentElement.dataset.readerSideOrder
    }
  })
  $effect(() => { document.documentElement.dataset.readerTheme = theme })
  $effect(() => {
    if (!data.length || !page || !viewportWidth) return
    const presentation = { layout, sides }
    // This empty prototype container is owned by the existing imperative Torah renderer.
    // eslint-disable-next-line svelte/no-dom-manipulating
    page.innerHTML = Page(data[0].pages[0], { presentation, annotationsEnabled: true })
    applyReaderPageLayout(page, presentation)
    const choice = data[target === 'range' ? 0 : 1]
    const phraseKeys = new Set([...data[1].selected].slice(0, 3))
    const phrasePlain = new Set([...data[1].selectedUnannotated].slice(0, 3))
    for (const word of page.querySelectorAll<HTMLElement>('.word')) {
      const plain = layout === 'match' && word.dataset.annotationsMode === 'off'
      const key = word.dataset.tokenKey ?? ''
      const keys = target === 'phrase' ? (plain ? phrasePlain : phraseKeys) : (plain ? choice.selectedUnannotated : choice.selected)
      word.classList.toggle('destination', linkedKeys.length ? linkedKeys.includes(key) : keys.has(key))
      const audioKeys = plain ? [...data[1].selectedUnannotated] : [...data[1].selected]
      word.classList.toggle('is-active-word', audio && key === audioKeys[2])
    }
    requestAnimationFrame(() => { measure(); reveal() })
  })
</script>

<svelte:head><title>Highlight studies — Tikkun Reader</title><meta name="robots" content="noindex, nofollow" /></svelte:head>

<main class="highlight-study">
  <header class="study-header"><div><span class="study-kicker">Tikkun Reader · Design study</span><h1>Finding your place</h1></div><p>Isolated preview · no reader settings are saved</p></header>
  <div class="study-controls">
    <div class="treatment-picker" aria-label="Highlight treatment">{#each treatments as item (item.id)}<button aria-pressed={treatment === item.id} onclick={() => treatment = item.id}>{item.name}</button>{/each}</div>
    <label>Theme<select bind:value={theme}><option value="light">Light</option><option value="sepia">Sepia</option><option value="dark">Dark</option><option value="automatic">System</option></select></label>
    <label>Layout<select bind:value={layout}><option value="reading">Reader</option><option value="match">Match Torah lines</option></select></label>
    <label>Sides<select bind:value={sides}><option value="two">Two Sided</option><option value="one">One Sided</option></select></label>
    <label>Highlight<select bind:value={target} onchange={chooseHighlight}><option value="range">Pesukim 6–8</option><option value="verse">Pasuk 6</option><option value="phrase">Opening phrase</option></select></label>
  </div>
  <div class="study-note"><p>{selectedTreatment.detail}</p><label><input type="checkbox" bind:checked={audio} /> Show audio overlap <small>(visual sample, no sound)</small></label></div>
  <section class="reader-sample" data-treatment={treatment} class:cleared class:arrival>
    <header class="sample-header"><span lang="he" dir="rtl">בראשית · ראשון</span><span>{linkedKeys.length ? 'Linked selection' : description}</span>{#if !cleared}<button onclick={removeHighlight}>Remove highlight</button>{:else}<button onclick={() => { cleared = false }}>Restore highlight</button>{/if}</header>
    <div class="sample-viewport" bind:this={viewport}>
      {#if failure}<p role="alert">{failure}</p>{:else if !data.length}<p role="status">Loading Torah text…</p>{/if}
      <div class="tikkun-book" bind:this={book} data-target-id="tikkun-book" data-reader-layout={layout} data-reader-sides={sides}>
        <div class="highlight-strips" aria-hidden="true">{#each strips as strip, i (i)}<span class="destination-strip" style:left={`${strip.left}px`} style:top={`${strip.top}px`} style:width={`${strip.width}px`} style:height={`${strip.height}px`}></span>{/each}</div>
        {#key arrivalRun}<div class="highlight-strips" aria-hidden="true">{#each arrivalStrips as strip, i (i)}<span class="arrival-strip" style:left={`${strip.left}px`} style:top={`${strip.top}px`} style:width={`${strip.width}px`} style:height={`${strip.height}px`}></span>{/each}</div>{/key}
        <section class="tikkun-page" bind:this={page}></section>
      </div>
    </div>
    <div class="selection-actions">
      {#if selectionKeys.length}<span>{selectionKeys.length} {selectionKeys.length === 1 ? 'word' : 'words'} selected</span><button data-aliyah-link="true" data-aliyah-url={previewUrl} onpointerdown={event => event.preventDefault()} onclick={copySelection}><span data-aliyah-link-icon="link">Copy link to selection</span><span data-aliyah-link-icon="check" hidden>Copied</span></button>{:else}<span>Select Torah text to copy a link to it.</span>{/if}
    </div>
    <footer class="sample-footer"><span><i class="destination-key"></i> Selected passage</span><span><i class="audio-key"></i> Audio word</span><button disabled={!data.length} onclick={replayArrival}>Replay ordinary-link arrival</button></footer>
  </section>
  <p class="arrival-status" aria-live="polite">{status || 'Try an ordinary-link arrival: a faint cue behind the destination line, visible briefly and then gone.'}</p>
  <p class="study-footnote">Copied links reopen this local prototype. Production sharing is not connected yet. Restore highlight is a study control.</p>
</main>
