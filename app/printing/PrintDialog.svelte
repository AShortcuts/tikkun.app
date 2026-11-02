<script lang="ts">
  import { flushSync, onMount } from 'svelte'
  import { trackAnalytics } from '../analytics/client.ts'
  import { resolve } from '$app/paths'
  import UiIcon from '../components/UiIcon.svelte'
  import { listTorahBooks } from '../components/torah-reference.ts'
  import { listScrollChapters, listScrollVerses } from '../location.ts'
  import { validateRanges, normalizeRanges, passageTitle, paperSize, type PassageRange, type PrintOptions } from './print-model.ts'
  import type { PrintContext } from './print-context.ts'
  import { printDetailsAliyot } from './print-details.ts'
  import type { UpcomingPrintReading } from './upcoming-print-readings.ts'
  import PrintSelect from './PrintSelect.svelte'
  import { isNativeApp } from '../platform/native.ts'
  import { nativePrintErrorMessage, printNatively } from '../platform/native-print.ts'
  import { createPrintSnapshot } from './print-snapshot.ts'
  import { preparePrintFonts, printPreparedPages, removePrintOutput } from './print-output.ts'
  import './print.css'

  let { context, upcoming = [], onclose, initialScope = 'current', initialRange }: { context: PrintContext; upcoming?: UpcomingPrintReading[]; onclose(): void; initialScope?: Scope; initialRange?: PassageRange } = $props()
  const initialContext = () => context
  const initial = initialContext().aliyot.find(aliyah => aliyah.key === initialContext().currentKey) ?? initialContext().aliyot[0]
  const customRange = () => initialRange ?? initial
  const startingScope = () => initialScope
  let dialog: HTMLDialogElement
  type Scope = 'current' | 'several' | 'whole' | 'custom'
  let scope = $state<Scope>(startingScope())
  let book = $state(customRange().start.b)
  let endBook = $state(customRange().end.b)
  let startChapter = $state(customRange().start.c)
  let startVerse = $state(customRange().start.v)
  let endChapter = $state(customRange().end.c)
  let endVerse = $state(customRange().end.v)
  let layout = $state<PrintOptions['layout']>('match')
  let sides = $state<PrintOptions['sides']>('two')
  let form = $state<PrintOptions['form']>('tikkun')
  let surrounding = $state(true)
  let removeCredits = $state(false)
  let pageNumbers = $state(false)
  let detailsPage = $state(false)
  let replaceDivineNames = $state(true)
  let orientation = $state<PrintOptions['orientation']>('portrait')
  let scaling = $state(100)
  let overflow = $state<PrintOptions['overflow']>('shrink')
  let passageOpen = $state(true)
  let appearanceOpen = $state(true)
  let pageOpen = $state(false)
  let advancedOpen = $state(false)
  let selectedAliyot = $state([initialContext().currentKey])
  let selectedReading = $state<string | null>(null)
  let upcomingOpen = $state(false)
  let upcomingToggle = $state<HTMLButtonElement>()
  const activeReading = $derived(upcoming.find(reading => reading.id === selectedReading))
  const activeContext = $derived(activeReading?.context ?? context)
  const currentAliyah = $derived(activeContext.aliyot.find(aliyah => aliyah.key === activeContext.currentKey) ?? activeContext.aliyot[0])
  const scroll = $derived(currentAliyah.start.scroll)
  const isEsther = $derived(scroll === 'esther')
  const books = $derived(isEsther ? [{ number: 1, label: 'Esther', hebrew: 'אסתר' }] : listTorahBooks())
  const scopes = $derived<{ id: Scope; label: string }[]>(isEsther
    ? [{ id: 'whole', label: 'Whole Megillah' }, { id: 'custom', label: 'Custom range' }]
    : [{ id: 'current', label: selectedReading ? 'First aliyah' : 'Current aliyah' }, { id: 'several', label: 'Several aliyot' }, { id: 'whole', label: activeContext.isParsha ? 'Whole parsha' : 'Whole reading' }, { id: 'custom', label: 'Custom range' }])
  const dateLabel = (date: Date) => date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
  let frame: HTMLIFrameElement
  let preview: HTMLDivElement
  let previewScroller: HTMLDivElement
  let documentWrap: HTMLDivElement
  let frameReady = $state(false)
  let busy = $state(true)
  let failure = $state('')
  let pageCount = $state(0)
  let exceedsWidth = $state(false)
  let printing = $state(false)
  let printError = $state('')
  let documentHeight = $state(1056)
  let previewWidth = $state(800)
  let previewHeight = $state(800)
  let request = 0
  const paper = $derived(paperSize(orientation))
  const fitScale = $derived(Math.min(1, Math.max(0.2, (previewWidth - 56) / paper.width), Math.max(0.2, (previewHeight - 62) / paper.height)))
  // Pinching zooms the preview itself, up to 3x actual paper size.
  let previewZoom = $state(1)
  const maxPreviewZoom = $derived(Math.max(1, 3 / fitScale))
  const previewScale = $derived(fitScale * Math.min(previewZoom, maxPreviewZoom))
  const chapters = $derived(listScrollChapters(scroll, book))
  const startVerses = $derived(listScrollVerses(scroll, book, startChapter))
  const endChapters = $derived(listScrollChapters(scroll, endBook))
  const endVerses = $derived(listScrollVerses(scroll, endBook, endChapter))
  const ranges = $derived.by((): PassageRange[] => {
    if (scope === 'custom') return [{ start: { scroll, b: book, c: startChapter, v: startVerse }, end: { scroll, b: endBook, c: endChapter, v: endVerse } }]
    return normalizeRanges(activeContext.aliyot.filter(aliyah => scope === 'whole' || (scope === 'current' ? aliyah.key === activeContext.currentKey : selectedAliyot.includes(aliyah.key))).map(({ start, end }) => ({ start, end })))
  })
  const aliyahLabels = $derived(printDetailsAliyot(ranges, activeContext,
    scope === 'current' ? [activeContext.currentKey] : scope === 'several' ? selectedAliyot : scope === 'whole' ? [] : undefined))
  const options = $derived<PrintOptions>({ ranges, layout, sides, form, surrounding: layout === 'match' && surrounding, orientation, scaling, overflow, removeCredits, pageNumbers, detailsPage, aliyahLabels, replaceDivineNames })

  function changeBook(event: Event & { currentTarget: HTMLSelectElement }) { book = Number(event.currentTarget.value); endBook = book; startChapter = 1; startVerse = 1; endChapter = 1; endVerse = Math.min(13, listScrollVerses(scroll, book, 1).length) }
  function toggleAliyah(index: string) { selectedAliyot = selectedAliyot.includes(index) ? selectedAliyot.filter(value => value !== index) : [...selectedAliyot, index].sort() }
  function chooseReading(reading: UpcomingPrintReading | null) {
    selectedReading = reading?.id ?? null
    const next = reading?.context ?? context
    const aliyah = next.aliyot.find(aliyah => aliyah.key === next.currentKey) ?? next.aliyot[0]
    selectedAliyot = [next.currentKey]
    book = aliyah.start.b; startChapter = aliyah.start.c; startVerse = aliyah.start.v
    endBook = aliyah.end.b; endChapter = aliyah.end.c; endVerse = aliyah.end.v
    scope = reading || aliyah.start.scroll === 'esther' ? 'whole' : 'current'
    upcomingToggle?.focus()
    upcomingOpen = false
  }
  async function print(event: MouseEvent & { currentTarget: HTMLButtonElement }) {
    if (busy || failure || !pageCount || scaling <= 0 || exceedsWidth || printing || !frame.contentWindow) return
    trackAnalytics('print_requested', { layout, sides, form, pages: pageCount })
    if (!isNativeApp()) {
      try { printPreparedPages(frame.contentDocument!, orientation) }
      catch (error) {
        console.error('Print failed', error)
        trackAnalytics('print_error')
        printError = error instanceof Error ? error.message : 'Printing could not start. Try again.'
      }
      return
    }
    // WKWebView ignores window.print(), so the app prints a copy of the prepared pages natively.
    const { x, y, width, height } = event.currentTarget.getBoundingClientRect()
    const request = { width: paper.width, height: paper.height, pages: pageCount, title: passageTitle(ranges, 'en'), anchor: { x, y, width, height } }
    printing = true
    printError = ''
    try {
      if (!frame.contentDocument) throw new Error('The prepared pages are not available. Close Print and try again.')
      await printNatively({ ...request, html: await createPrintSnapshot(frame.contentDocument) })
    } catch (error) {
      console.error('Native print failed', error)
      trackAnalytics('print_error')
      printError = nativePrintErrorMessage(error)
    } finally {
      printing = false
    }
  }

  function attachPinchZoom(scroller: HTMLElement) {
    let gesture: { distance: number; zoom: number; x: number; y: number } | null = null
    const distance = (touches: TouchList) => Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY)
    const midpoint = (touches: TouchList) => ({ x: (touches[0].clientX + touches[1].clientX) / 2, y: (touches[0].clientY + touches[1].clientY) / 2 })
    function start(event: TouchEvent) {
      if (event.touches.length !== 2) return
      const point = midpoint(event.touches)
      const wrap = documentWrap.getBoundingClientRect()
      // Remember which spot on the paper sits under the fingers.
      gesture = { distance: distance(event.touches), zoom: Math.min(previewZoom, maxPreviewZoom), x: (point.x - wrap.left) / wrap.width, y: (point.y - wrap.top) / wrap.height }
    }
    function move(event: TouchEvent) {
      if (!gesture || event.touches.length !== 2) return
      event.preventDefault()
      const point = midpoint(event.touches)
      previewZoom = Math.min(maxPreviewZoom, Math.max(1, gesture.zoom * distance(event.touches) / gesture.distance))
      flushSync()
      // Keep that spot under the fingers so pinching also pans.
      const wrap = documentWrap.getBoundingClientRect()
      scroller.scrollLeft += wrap.left + gesture.x * wrap.width - point.x
      scroller.scrollTop += wrap.top + gesture.y * wrap.height - point.y
    }
    function end(event: TouchEvent) { if (event.touches.length < 2) gesture = null }
    // Safari's own pinch would zoom the whole dialog instead of the paper.
    const blockPageZoom = (event: Event) => event.preventDefault()
    scroller.addEventListener('touchstart', start, { passive: true })
    scroller.addEventListener('touchmove', move, { passive: false })
    scroller.addEventListener('touchend', end)
    scroller.addEventListener('touchcancel', end)
    scroller.addEventListener('gesturestart', blockPageZoom)
    scroller.addEventListener('gesturechange', blockPageZoom)
    return () => {
      scroller.removeEventListener('touchstart', start)
      scroller.removeEventListener('touchmove', move)
      scroller.removeEventListener('touchend', end)
      scroller.removeEventListener('touchcancel', end)
      scroller.removeEventListener('gesturestart', blockPageZoom)
      scroller.removeEventListener('gesturechange', blockPageZoom)
    }
  }

  onMount(() => {
    dialog.showModal()
    trackAnalytics('print_open')
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // Fit once so native browser zoom can enlarge the paper instead of
    // triggering a resize that immediately shrinks it back into view.
    const fitPreview = () => { previewWidth = preview.clientWidth; previewHeight = preview.clientHeight }
    fitPreview()
    // Rotating a phone changes the available space; refit then too.
    const orientation = window.matchMedia('(orientation: portrait)')
    const refit = () => requestAnimationFrame(fitPreview)
    orientation.addEventListener('change', refit)
    const detachPinchZoom = attachPinchZoom(previewScroller)
    const readyTimer = window.setTimeout(() => {
      if (frameReady) return
      console.error('Print document did not become ready')
      trackAnalytics('print_error')
      failure = 'The print document could not load. Close Print and try again.'
      busy = false
    }, 15000)
    function receive(event: MessageEvent) {
      if (event.source !== frame?.contentWindow || event.origin !== location.origin) return
      if (event.data?.kind === 'tikkun-print-ready') { window.clearTimeout(readyTimer); frameReady = true; return }
      if (event.data?.kind === 'tikkun-print-open') return
      if (event.data?.kind === 'tikkun-print-close') { dialog.close(); return }
      if (event.data?.request !== request) return
      if (event.data.kind === 'tikkun-print-result') {
        pageCount = event.data.pageCount; documentHeight = event.data.height; exceedsWidth = event.data.exceedsWidth; busy = false; failure = ''
        if (!isNativeApp() && frame.contentDocument) void preparePrintFonts(frame.contentDocument).catch(error => console.error('Could not load print fonts', error))
      } else if (event.data.kind === 'tikkun-print-error') { trackAnalytics('print_error'); failure = event.data.message; busy = false; pageCount = 0 }
    }
    function keyboard(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'p') { event.preventDefault(); event.stopPropagation() }
    }
    window.addEventListener('message', receive)
    window.addEventListener('keydown', keyboard)
    return () => { window.clearTimeout(readyTimer); document.body.style.overflow = previousOverflow; orientation.removeEventListener('change', refit); detachPinchZoom(); removePrintOutput(); window.removeEventListener('message', receive); window.removeEventListener('keydown', keyboard) }
  })

  $effect(() => {
    const next = $state.snapshot(options)
    if (!frameReady) return
    const current = ++request
    busy = true
    failure = ''
    try { validateRanges(next.ranges) }
    catch (error) { failure = error instanceof Error ? error.message : 'Check the selected passage.'; busy = false; pageCount = 0; return }
    const timer = window.setTimeout(() => {
      const target = frame.contentWindow
      if (!target) return
      // Use the sender's method: WebKit can attribute the optional chained
      // cross-window call to the recipient, failing its parent-window guard.
      window.postMessage.call(target, { kind: 'tikkun-print-render', options: next, request: current }, { targetOrigin: location.origin })
    }, 100)
    return () => clearTimeout(timer)
  })
</script>

<dialog bind:this={dialog} class="print-workspace" aria-label="Tikkun print setup" onclose={onclose} onkeydown={event => event.stopPropagation()}>
  <section class="print-dialog">
    <header class="dialog-header"><h1>Print</h1><button class="icon-button" aria-label="Close print dialog" onclick={() => dialog.close()}><UiIcon name="x" /></button></header>
    <div class="dialog-body">
      <div class="preview-region" bind:this={preview} aria-busy={busy}>
        <div class="preview-scroll" bind:this={previewScroller}>
          <div class="preview-status" aria-live="polite">{#if failure}<span role="alert">{failure}</span>{:else if busy}Preparing pages…{:else if scaling === 0}0% · Increase Scaling to print{:else if exceedsWidth}<span role="alert">Content exceeds the paper width. Reduce Scaling or choose One Sided.</span>{:else}{pageCount} {pageCount === 1 ? 'page' : 'pages'} · Scaling {scaling}%{/if}</div>
          <div class="document-wrap" bind:this={documentWrap} class:unavailable={Boolean(failure)} style:width={`${paper.width * previewScale}px`} style:height={`${documentHeight * previewScale}px`}>
            <iframe bind:this={frame} title={isEsther ? 'Live printable Esther preview' : 'Live printable Torah preview'} src={resolve('/print/document/')} style:width={`${paper.width}px`} style:height={`${documentHeight}px`} style:transform={`scale(${previewScale})`}></iframe>
          </div>
        </div>
      </div>
      <aside class="print-settings-pane" aria-label="Print options">
        <section class="settings-group">
          <button class="group-title" aria-expanded={passageOpen} onclick={() => passageOpen = !passageOpen}>Passage<UiIcon name={passageOpen ? 'chevronUp' : 'chevronDown'} /></button>
          {#if passageOpen}
            {#if upcoming.length}
              <button bind:this={upcomingToggle} class="upcoming-toggle" aria-expanded={upcomingOpen} aria-controls="print-upcoming-readings" onclick={() => upcomingOpen = !upcomingOpen}>Upcoming readings<UiIcon name={upcomingOpen ? 'chevronUp' : 'chevronDown'} /></button>
              {#if upcomingOpen}
                <div id="print-upcoming-readings" class="upcoming-readings" aria-label="Upcoming readings">
                  <button class="reading-choice" aria-pressed={selectedReading === null} onclick={() => chooseReading(null)}><small>Current reader passage</small><span dir="auto">{context.title}</span></button>
                  {#each upcoming as reading (reading.id)}
                    <button class="reading-choice upcoming-reading" aria-pressed={selectedReading === reading.id} onclick={() => chooseReading(reading)}>
                      <time datetime={reading.id.split(':')[0]}>{dateLabel(reading.date)}</time>
                      <span dir="auto">{reading.context.title}</span>
                      <small dir="rtl">{reading.rangeLabel}</small>
                    </button>
                  {/each}
                </div>
              {/if}
            {/if}
            <div class="scope-controls segmented" aria-label="Passage selection">
              {#each scopes as item (item.id)}<button aria-pressed={scope === item.id} onclick={() => scope = item.id}>{item.label}</button>{/each}
            </div>
            {#if scope === 'custom'}
              <label class="field">Sefer<PrintSelect><select bind:value={book} onchange={changeBook}>{#each books as item (item.number)}<option value={item.number}>{item.label} ({item.hebrew})</option>{/each}</select></PrintSelect></label>
              {#if endBook !== book}<label class="field">Ending sefer<PrintSelect><select bind:value={endBook} onchange={() => { endChapter = 1; endVerse = 1 }}>{#each books as item (item.number)}<option value={item.number}>{item.label} ({item.hebrew})</option>{/each}</select></PrintSelect></label>{/if}
              <div class="range-fields">
                <fieldset><legend>From</legend><div><PrintSelect><select aria-label="Starting chapter" bind:value={startChapter} onchange={event => startVerse = Math.min(startVerse, listScrollVerses(scroll, book, Number(event.currentTarget.value)).length)}>{#each chapters as chapter (chapter)}<option value={chapter}>{chapter}</option>{/each}</select></PrintSelect><span>:</span><PrintSelect><select aria-label="Starting pasuk" bind:value={startVerse}>{#each startVerses as verse (verse)}<option value={verse}>{verse}</option>{/each}</select></PrintSelect></div></fieldset>
                <fieldset><legend>To</legend><div><PrintSelect><select aria-label="Ending chapter" bind:value={endChapter} onchange={event => endVerse = Math.min(endVerse, listScrollVerses(scroll, endBook, Number(event.currentTarget.value)).length)}>{#each endChapters as chapter (chapter)}<option value={chapter}>{chapter}</option>{/each}</select></PrintSelect><span>:</span><PrintSelect><select aria-label="Ending pasuk" bind:value={endVerse}>{#each endVerses as verse (verse)}<option value={verse}>{verse}</option>{/each}</select></PrintSelect></div></fieldset>
              </div>
            {:else}
              <p class="sample-reading"><span dir="auto">{activeContext.title}</span>{#if activeReading}<small>{dateLabel(activeReading.date)}</small>{/if}</p>
              {#if scope === 'several'}<div class="aliyah-choices" aria-label="Aliyot to print">{#each activeContext.aliyot as aliyah (aliyah.key)}<button aria-pressed={selectedAliyot.includes(aliyah.key)} onclick={() => toggleAliyah(aliyah.key)}>{aliyah.label}</button>{/each}</div>{:else}<p class="hint" dir="auto">{scope === 'current' ? `${currentAliyah.label} · ${passageTitle(ranges)}` : passageTitle(ranges)}</p>{/if}
            {/if}
          {/if}
        </section>
        <section class="settings-group">
          <button class="group-title" aria-expanded={appearanceOpen} onclick={() => appearanceOpen = !appearanceOpen}>Reading appearance<UiIcon name={appearanceOpen ? 'chevronUp' : 'chevronDown'} /></button>
          {#if appearanceOpen}
            <div class="field"><span>Line layout</span><div class="segmented"><button aria-pressed={layout === 'reading'} onclick={() => layout = 'reading'}>Reader<small>Natural</small></button><button aria-pressed={layout === 'match'} onclick={() => layout = 'match'}>Match<small>{isEsther ? 'Megillah lines' : 'Torah lines'}</small></button></div></div>
            <div class="field"><span>Sides</span><div class="segmented"><button aria-pressed={sides === 'one'} onclick={() => sides = 'one'}>One Sided</button><button aria-pressed={sides === 'two'} onclick={() => sides = 'two'}>Two Sided</button></div></div>
            {#if sides === 'one'}<div class="field"><span>Text</span><div class="segmented"><button aria-pressed={form === 'tikkun'} onclick={() => form = 'tikkun'}>Tikkun<small>Nekudot &amp; taamim</small></button><button aria-pressed={form === 'torah'} onclick={() => form = 'torah'}>{isEsther ? 'Megillah' : 'Torah'}<small>Without marks</small></button></div></div>{/if}
            {#if layout === 'match'}<label class="toggle-row"><span>Show surrounding text</span><input type="checkbox" role="switch" bind:checked={surrounding} /></label><p class="hint">Keep the full column; fade unselected text.</p>{/if}
          {/if}
        </section>
        <section class="settings-group page-group">
          <button class="group-title" aria-expanded={pageOpen} onclick={() => pageOpen = !pageOpen}>Page setup<UiIcon name={pageOpen ? 'chevronUp' : 'chevronDown'} /></button>
          {#if !pageOpen}<p class="page-summary">{orientation === 'portrait' ? 'Portrait' : 'Landscape'} · {scaling}%{#if layout === 'match'} · {overflow === 'shrink' ? 'Shrink to fit' : 'Continue onto next page'}{/if}</p>{/if}
          {#if pageOpen}
            <div class="field"><span>Orientation</span><div class="segmented"><button aria-pressed={orientation === 'portrait'} onclick={() => orientation = 'portrait'}>Portrait</button><button aria-pressed={orientation === 'landscape'} onclick={() => orientation = 'landscape'}>Landscape</button></div></div>
            <label class="field">Scaling<div class="scaling-control"><div class="scaling-range"><input type="range" min="0" max="200" step="5" bind:value={scaling} aria-label="Scaling" aria-valuetext={`${scaling}%`} /><span class="scaling-stops" aria-hidden="true"><span>0%</span><span>100%</span><span>200%</span></span></div><output>{scaling}%</output></div></label>
            {#if layout === 'match'}<label class="field">Column overflow<PrintSelect><select bind:value={overflow}><option value="shrink">Shrink to fit</option><option value="continue">Continue onto next page</option></select></PrintSelect></label>{/if}
            <label class="toggle-row page-numbers-option"><span>Page numbers</span><input type="checkbox" role="switch" bind:checked={pageNumbers} /></label>
            <label class="toggle-row details-page-option"><span>Include details page</span><input type="checkbox" role="switch" bind:checked={detailsPage} aria-describedby="print-details-hint" /></label>
            <p class="hint" id="print-details-hint">Adds a separate page with {isEsther ? 'the Megillah name' : 'parsha and applicable aliyah names'}, verse range, and original column numbers.</p>
          {/if}
        </section>
        <section class="settings-group advanced-group">
          <button class="group-title" aria-expanded={advancedOpen} aria-controls="print-advanced-options" onclick={() => advancedOpen = !advancedOpen}>Advanced<UiIcon name={advancedOpen ? 'chevronUp' : 'chevronDown'} /></button>
          {#if advancedOpen}
            <div id="print-advanced-options">
              <label class="toggle-row divine-names-option"><span>Use substitute spellings</span><input type="checkbox" role="switch" bind:checked={replaceDivineNames} aria-describedby="print-divine-names-hint" /></label>
              <p class="hint" id="print-divine-names-hint">Uses <bdi lang="he">ידוה</bdi> and <bdi lang="he">אלקים</bdi> forms for Hashem's names.</p>
              <label class="toggle-row credits-option"><span>Remove Credits</span><input type="checkbox" role="switch" bind:checked={removeCredits} /></label>
            </div>
          {/if}
        </section>
      </aside>
    </div>
    <footer class="dialog-footer">
      {#if printError}<p class="print-error" role="alert">{printError}</p>{:else}<p aria-live="polite">{printing ? 'Preparing pages for printing…' : 'Choose your printer in the next dialog.'}</p>{/if}
      <div><button onclick={() => dialog.close()}>Cancel</button><button class="primary" aria-busy={printing} disabled={busy || printing || Boolean(failure) || !pageCount || scaling === 0 || exceedsWidth} onclick={print}>Print…</button></div>
    </footer>
  </section>
</dialog>
