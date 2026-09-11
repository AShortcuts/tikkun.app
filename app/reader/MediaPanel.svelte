<script lang="ts">
  import { onMount, tick, untrack } from 'svelte'
  import UiIcon from '../components/UiIcon.svelte'
  import type { AudioNarrator, AudioRecording } from '../audio/types.ts'
  import type { DownloadLibrary } from '../offline/download-library.ts'
  import { formatMediaBytes as bytes, isActiveDownload, mediaRows, mediaSearchMatches, type MediaReading } from '../offline/media-catalog.ts'
  import { recordingAssetKey } from '../offline/recording-storage.ts'
  import type { StorageMeter, StorageMetrics } from '../offline/storage-metrics.ts'
  import type { MediaPanelApi } from './media-panel.ts'

  let { library, readings, recordings, narrators, initialNarrator, baseUrl, meter, connect }: {
    library: DownloadLibrary
    readings: readonly MediaReading[]
    recordings: readonly AudioRecording[]
    narrators: readonly AudioNarrator[]
    initialNarrator: string
    baseUrl: string
    meter: StorageMeter
    connect: (api: MediaPanelApi) => void
  } = $props()
  let snapshot = $state(untrack(() => library.snapshot()))
  let narrator = $state(untrack(() => initialNarrator))
  let tab = $state<'media' | 'storage'>('media')
  let open = $state(false)
  let dialog: HTMLDialogElement
  let returnFocus: HTMLElement | null = null
  let query = $state('')
  let filter = $state('all')
  let expanded = $state<string[]>([])
  let selected = $state<string[]>([])
  let storageNarrator = $state('all')
  let storageReading = $state('all')
  let sort = $state('reading')
  let error = $state('')
  let notice = $state('')
  let metrics = $state<StorageMetrics | null>(null)
  let measuring = $state(false)
  let metricsError = $state('')
  let busy = $state(false)
  let confirmation = $state<{ title: string; detail: string; action: () => Promise<void>; label: string } | null>(null)
  let cancelButton = $state<HTMLButtonElement>()
  let actionReturnFocus: HTMLElement | null = null
  let measureRevision = 0
  const rows = $derived(mediaRows(readings, recordings, narrator, snapshot, baseUrl))
  const visibleRows = $derived(rows.filter((row) => mediaSearchMatches(row, query) && (filter !== 'downloaded' || row.saved)))
  const groups = $derived([...new Set(visibleRows.map((row) => row.group))])
  const inventoryKeys = $derived(new Set(snapshot.inventory.map(recordingAssetKey)))
  const inventorySignature = $derived(snapshot.inventory.map(recordingAssetKey).sort().join('\n'))
  const selectedEntries = $derived(snapshot.entries.filter((entry) => selected.includes(entry.key) && inventoryKeys.has(entry.key)))
  const selectedBytes = $derived(selectedEntries.reduce((sum, entry) => sum + entry.asset.byteLength, 0))
  const aliases = $derived(new Map(snapshot.entries.map((entry) => [entry.key, recordings.filter((recording) => new URL(recording.playSrc, baseUrl).href === entry.asset.url)])))
  const storedEntries = $derived(snapshot.entries.filter((entry) => inventoryKeys.has(entry.key) &&
    (storageNarrator === 'all' || aliases.get(entry.key)?.some((recording) => recording.narratorId === storageNarrator)) &&
    (storageReading === 'all' || aliases.get(entry.key)?.some((recording) => recording.reading.id === storageReading)))
    .sort((a, b) => sort === 'size' ? b.asset.byteLength - a.asset.byteLength :
      readings.findIndex((reading) => reading.id === aliases.get(a.key)?.[0]?.reading.id) - readings.findIndex((reading) => reading.id === aliases.get(b.key)?.[0]?.reading.id) ||
      (aliases.get(a.key)?.[0]?.aliyah ?? 0) - (aliases.get(b.key)?.[0]?.aliyah ?? 0)))
  const total = $derived(metrics?.categories.reduce((sum, category) => sum + category.bytes, 0) ?? 0)
  const colors = ['#28756e', '#b64d67', '#797a28', '#5979a4', '#8666a0']
  const chart = $derived.by(() => {
    if (!total || !metrics) return 'var(--media-rule)'
    let start = 0
    return `conic-gradient(${metrics.categories.map((category, index) => {
      const end = start + category.bytes / total * 100
      const stop = `${colors[index % colors.length]} ${start}% ${end}%`
      start = end
      return stop
    }).join(',')})`
  })

  async function run(action: () => Promise<void>) {
    error = ''; notice = ''; busy = true
    try { await action() }
    catch (failure) { error = failure instanceof Error ? failure.message : 'The operation failed. Try again.' }
    finally { busy = false }
  }
  async function refreshMetrics() {
    const revision = ++measureRevision
    measuring = true; metricsError = ''
    try {
      const result = await meter.measure(library.snapshot())
      if (revision === measureRevision) metrics = result
    } catch (failure) {
      if (revision === measureRevision) { metrics = null; metricsError = failure instanceof Error ? failure.message : 'Storage measurement failed.' }
    } finally { if (revision === measureRevision) measuring = false }
  }
  $effect(() => {
    if (open && tab === 'storage') {
      void inventorySignature
      void snapshot.phase
      untrack(() => { void refreshMetrics() })
    }
  })
  async function ask(title: string, detail: string, label: string, action: () => Promise<void>) {
    actionReturnFocus = dialog.ownerDocument.activeElement instanceof HTMLElement ? dialog.ownerDocument.activeElement : null
    confirmation = { title, detail, label, action }
    await tick()
    cancelButton?.focus()
  }
  function dismissConfirmation() {
    confirmation = null
    void tick().then(() => actionReturnFocus?.isConnected && actionReturnFocus.focus({ preventScroll: true }))
  }
  function queue(keys: readonly string[]) { return library.enqueue(keys) }
  function downloadLibrary() {
    const remaining = [...new Map(rows.flatMap((row) => row.remaining).filter((entry) => !isActiveDownload(entry)).map((entry) => [entry.key, entry])).values()]
    const size = remaining.reduce((sum, entry) => sum + (inventoryKeys.has(entry.key) ? 0 : entry.asset.byteLength), 0)
    void ask('Download library?', `${narrators.find((item) => item.id === narrator)?.displayName ?? narrator}: ${remaining.length} recordings, ${bytes(size)} of audio plus required offline text and timings.`, 'Download', () => queue(remaining.map((entry) => entry.key)))
  }
  function removeSelected() {
    const keys = selectedEntries.map((entry) => entry.key)
    void ask('Remove downloads?', `${keys.length} audio files, ${bytes(selectedBytes)}. Files in the current playback session will be removed when released. Personal data is kept.`, 'Remove downloads', async () => {
      await library.remove(keys)
      selected = selected.filter((key) => !keys.includes(key))
      notice = library.snapshot().entries.some((entry) => keys.includes(entry.key) && entry.phase === 'removal-pending')
        ? 'Removal pending for audio in the current playback session.' : 'Downloads removed.'
    })
  }
  function close() { confirmation = null; dialog.close() }
  function onClose() { open = false; returnFocus?.focus({ preventScroll: true }) }
  function changeTab(next: 'media' | 'storage') { tab = next; confirmation = null }
  function tabKey(event: KeyboardEvent) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    changeTab(event.key === 'Home' ? 'media' : event.key === 'End' ? 'storage' : tab === 'media' ? 'storage' : 'media')
    dialog.querySelector<HTMLButtonElement>(`#media-tab-${tab}`)?.focus()
  }
  onMount(() => {
    const unsubscribe = library.subscribe((next) => { snapshot = next })
    connect({ open(options = {}) {
      returnFocus = options.returnFocus ?? null
      tab = options.tab ?? 'media'
      narrator = options.narratorId ?? narrator
      open = true
      if (!dialog.open) dialog.showModal()
      void run(() => library.refresh())
    }, close })
    return () => { measureRevision++; unsubscribe(); dialog.close() }
  })
</script>

<dialog bind:this={dialog} class="media-panel" aria-labelledby="media-title" onclose={onClose}
  onkeydown={(event) => event.stopPropagation()} onkeyup={(event) => event.stopPropagation()}
  oncancel={(event) => { if (confirmation) { event.preventDefault(); dismissConfirmation() } }}>
  <header class="media-header">
    <h2 id="media-title">Media &amp; Storage</h2>
    <button class="media-icon media-close" type="button" title="Close Media" aria-label="Close Media" onclick={close}><UiIcon name="x" /></button>
  </header>
  <div class="media-tabs" role="tablist" aria-label="Media and storage">
    {#each ['media', 'storage'] as id (id)}
      <button type="button" role="tab" id={`media-tab-${id}`} aria-controls={`media-view-${id}`} aria-selected={tab === id}
        tabindex={tab === id ? 0 : -1} onkeydown={tabKey} onclick={() => changeTab(id === 'media' ? 'media' : 'storage')}>{id === 'media' ? 'Media' : 'Storage'}</button>
    {/each}
  </div>
  <div class="media-body">
    {#if error || snapshot.error || snapshot.persistenceError}<p role="alert" class="media-error">{error || snapshot.error || snapshot.persistenceError}</p>{/if}
    {#if notice}<p role="status">{notice}</p>{/if}
    {#if !snapshot.supported}<p role="status">Offline downloads are unavailable in this browser.</p>{/if}
    {#if confirmation}
      <section class="media-confirm" aria-labelledby="media-confirm-title">
        <h3 id="media-confirm-title">{confirmation.title}</h3><p>{confirmation.detail}</p>
        <div class="media-actions">
          <button bind:this={cancelButton} type="button" onclick={dismissConfirmation}>Cancel</button>
          <button class:media-destructive={confirmation.label === 'Remove downloads'} type="button" disabled={busy} onclick={() => { const action = confirmation?.action; dismissConfirmation(); if (action) void run(action) }}>{confirmation.label}</button>
        </div>
      </section>
    {/if}
    <div id="media-view-media" role="tabpanel" tabindex="0" aria-labelledby="media-tab-media" hidden={tab !== 'media' || Boolean(confirmation)}>
      <div class="media-search"><UiIcon name="search" /><input type="search" aria-label="Search parshiot" placeholder="Search parshiot" bind:value={query} /></div>
      {#if narrators.length > 1}<label class="media-picker media-narrator"><span>Narrator</span><select aria-label="Narrator" bind:value={narrator}>{#each narrators as item (item.id)}<option value={item.id}>{item.displayName}</option>{/each}</select></label>{/if}
      <div class="media-filters media-library-tools">
        <select aria-label="Download filter" bind:value={filter}><option value="all">All parshiot</option><option value="downloaded">Downloaded</option></select>
        <button class="media-icon" type="button" title="Download library" aria-label="Download library" disabled={!snapshot.supported || busy || !rows.some((row) => row.remaining.some((entry) => !isActiveDownload(entry)))} onclick={downloadLibrary}><UiIcon name="fileDown" /></button>
        <button class="media-icon" type="button" title="Refresh downloads" aria-label="Refresh downloads" disabled={busy} onclick={() => run(() => library.refresh())}><UiIcon name="reset" /></button>
      </div>
      {#if snapshot.phase === 'checking'}<p role="status">Checking downloads...</p>{/if}
      {#if !visibleRows.length}<p>No {filter === 'downloaded' ? 'downloaded ' : ''}readings{query ? ' match this search' : ''}.</p>{/if}
      {#each groups as group (group)}
        <h3 class="media-group">{group}</h3>
        {#each visibleRows.filter((row) => row.group === group) as row (row.id)}
          <div class="media-reading">
            <div class="media-reading-row">
              <button class="media-disclosure" type="button" aria-expanded={expanded.includes(row.id)} aria-controls={expanded.includes(row.id) ? `media-aliyot-${row.id}` : undefined} onclick={() => expanded = expanded.includes(row.id) ? expanded.filter((id) => id !== row.id) : [...expanded, row.id]}>
                <span><strong>{row.name}</strong><span class="media-hebrew" lang="he" dir="rtl">{row.hebrew}</span><small>{row.available ? row.available < row.aliyot.length ? `${row.available} of ${row.aliyot.length} available` : row.missingBytes ? `${bytes(row.missingBytes)} remaining` : 'Audio saved' : 'Audio unavailable'}</small></span>
                <UiIcon name={expanded.includes(row.id) ? 'chevronUp' : 'chevronDown'} />
              </button>
              <button class="media-download" type="button" class:is-complete={row.complete}
                disabled={!snapshot.supported || busy || !row.available || row.complete || row.active.length > 0 || row.assets.some((entry) => ['removing', 'removal-pending'].includes(entry.phase))}
                aria-label={!row.available ? `${row.name}: Audio unavailable` : row.complete ? `${row.name}: ${row.label}` : `Download remaining ${row.available - row.ready} aliyot for ${row.name}`}
                onclick={() => run(() => queue(row.remaining.map((entry) => entry.key)))}><UiIcon name={row.complete ? 'check' : 'download'} /><span>{row.label}</span></button>
            </div>
            {#if row.active.length}
              <div class="media-progress"><progress max={row.totalBytes || 1} value={row.progressBytes} aria-label={`${row.name} download progress`}></progress><button type="button" class="media-icon" aria-label={`Cancel ${row.name} downloads`} title="Cancel downloads" onclick={() => run(() => library.cancel(row.active.map((entry) => entry.key)))}><UiIcon name="x" /></button></div>
            {/if}
            {#if row.errors.length}<p class="media-error">{row.errors[0].error}</p>{/if}
            {#if expanded.includes(row.id)}
              <div class="media-aliyot" id={`media-aliyot-${row.id}`}>
                {#each row.aliyot as aliyah (aliyah.number)}
                  <div class="media-aliyah"><span><strong>{aliyah.title}</strong><small>{!aliyah.entry ? 'Audio unavailable' : aliyah.entry.phase === 'removal-pending' ? 'Removal pending' : aliyah.entry.phase === 'paused' ? aliyah.saved ? 'Offline support needs repair' : 'Paused' : aliyah.entry.readiness === 'audio-only' && aliyah.ready ? 'Audio only' : bytes(aliyah.entry.asset.byteLength)}</small></span>
                    <button class="media-icon" type="button" title={aliyah.ready ? 'Downloaded' : aliyah.entry && isActiveDownload(aliyah.entry) ? 'Cancel download' : aliyah.saved ? 'Repair offline download' : 'Download'}
                      aria-label={`${aliyah.ready ? 'Downloaded' : aliyah.entry && isActiveDownload(aliyah.entry) ? 'Cancel download of' : aliyah.saved ? 'Repair' : 'Download'} ${aliyah.title}`}
                      disabled={!snapshot.supported || busy || !aliyah.entry || aliyah.ready || ['removing', 'removal-pending'].includes(aliyah.entry.phase)}
                      onclick={() => { const entry = aliyah.entry; if (entry) void run(() => isActiveDownload(entry) ? library.cancel([entry.key]) : queue([entry.key])) }}><UiIcon name={aliyah.ready ? 'check' : aliyah.entry && isActiveDownload(aliyah.entry) ? 'x' : 'download'} /></button>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/each}
      {/each}
    </div>
    <div id="media-view-storage" role="tabpanel" tabindex="0" aria-labelledby="media-tab-storage" hidden={tab !== 'storage' || Boolean(confirmation)}>
      <div class="media-storage-heading"><h3>On this {snapshot.location === 'device' ? 'device' : 'browser'}</h3><button class="media-icon" type="button" aria-label="Refresh storage" title="Refresh storage" disabled={measuring || busy} onclick={() => run(async () => { await library.refresh(); await refreshMetrics() })}><UiIcon name="reset" /></button></div>
      {#if measuring}<p role="status">Measuring storage...</p>{/if}
      {#if metricsError}<p role="alert" class="media-error">{metricsError}</p>{/if}
      {#if metrics}
        <div class="media-storage-summary">
          <div class="media-storage-ring" style:background={chart} role="img" aria-label={`Measured storage: ${bytes(total)}`}><div aria-hidden="true"><strong>{bytes(total)}</strong><small>Measured storage</small></div></div>
          <dl>{#each metrics.categories as category, index (category.id)}<div><dt><i style:background={colors[index % colors.length]}></i>{category.label}</dt><dd>{bytes(category.bytes)}</dd></div>{/each}</dl>
        </div>
        <p class="media-capacity"><span>{metrics.availableLabel}:</span> <strong>{metrics.availableBytes === null ? 'Unavailable' : bytes(metrics.availableBytes)}</strong></p>
        {#if metrics.availableBytes !== null && metrics.availableBytes < 32 * 1024 ** 2}<p role="status" class="media-error">Storage is low. Remove downloads before saving more audio.</p>{/if}
        <p class="media-note">{metrics.note}</p>
        {#if metrics.originUsageBytes !== undefined}<p class="media-note">Total origin usage (browser estimate, including unclassified data): {metrics.originUsageBytes === null ? 'Unavailable' : bytes(metrics.originUsageBytes)}</p>{/if}
        {#if meter.clearTemporary}<button class="media-clear" type="button" disabled={busy || !metrics.categories.some((category) => category.id === 'temporary' && category.bytes > 0)} onclick={() => run(async () => { await meter.clearTemporary?.(); await refreshMetrics() })}>Clear temporary files</button>{/if}
      {/if}
      <h3 class="media-group">Audio downloads</h3>
      <div class="media-storage-filters">
        <label class="media-picker"><span>Narrator</span><select aria-label="Storage narrator" bind:value={storageNarrator}><option value="all">All narrators</option>{#each narrators as item (item.id)}<option value={item.id}>{item.displayName}</option>{/each}</select></label>
        <label class="media-picker"><span>Parsha</span><select aria-label="Storage reading" bind:value={storageReading}><option value="all">All readings</option>{#each readings as reading (reading.id)}<option value={reading.id}>{reading.name}</option>{/each}</select></label>
        <label class="media-picker"><span>Sort by</span><select aria-label="Sort downloads" bind:value={sort}><option value="reading">Reading order</option><option value="size">Largest first</option></select></label>
      </div>
      {#if storedEntries.length}
        <label class="media-select-all"><input type="checkbox" aria-label="Select visible downloads" checked={storedEntries.every((entry) => selected.includes(entry.key))} onchange={(event) => selected = event.currentTarget.checked ? [...new Set([...selected, ...storedEntries.map((entry) => entry.key)])] : selected.filter((key) => !storedEntries.some((entry) => entry.key === key))} /> Select visible downloads</label>
        {#each storedEntries as entry (entry.key)}
          <label class="media-stored"><input type="checkbox" aria-label={`Select ${entry.asset.title}`} checked={selected.includes(entry.key)} onchange={(event) => selected = event.currentTarget.checked ? [...selected, entry.key] : selected.filter((key) => key !== entry.key)} /><span><strong>{entry.asset.title}</strong><small>{entry.phase === 'removal-pending' ? 'Removal pending: current playback session' : entry.phase === 'removing' ? 'Removing...' : entry.error || aliases.get(entry.key)?.map((recording) => narrators.find((item) => item.id === recording.narratorId)?.displayName).filter((name, index, names) => name && names.indexOf(name) === index).join(', ') || 'Previous catalog version'}</small></span><span>{bytes(entry.asset.byteLength)}</span></label>
        {/each}
      {:else}<p>No audio downloads{storageNarrator !== 'all' || storageReading !== 'all' ? ' for this selection' : ''}.</p>{/if}
      {#if selectedEntries.length}<div class="media-remove-bar"><span>{selectedEntries.length} selected · {bytes(selectedBytes)}</span><button class="media-destructive" type="button" disabled={busy} onclick={removeSelected}>Remove downloads</button></div>{/if}
    </div>
  </div>
</dialog>

<style>
  .media-panel {
    position: fixed; inset: 0 0 0 auto; margin: 0; width: min(680px, 100%); max-width: 100%; height: 100dvh; max-height: 100dvh;
    padding: 0; border: 0; border-radius: 0; background: var(--media-background); color: var(--media-label);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 17px; line-height: 1.4; letter-spacing: 0;
    box-shadow: -12px 0 40px -24px #0007; overflow: hidden;
  }
  .media-panel[open] { display: grid; grid-template-rows: auto auto minmax(0, 1fr); }
  .media-panel::backdrop { background: #0005; }
  .media-header { display: grid; grid-template-columns: 44px minmax(0, 1fr) 44px; align-items: center; gap: 8px; padding: max(8px, env(safe-area-inset-top)) max(20px, env(safe-area-inset-right)) 8px max(20px, env(safe-area-inset-left)); }
  h2 { grid-column: 2; margin: 0; text-align: center; font-size: 17px; line-height: 1.3; font-weight: 650; } h3 { font-size: 17px; margin: 0; } p { line-height: 1.5; }
  .media-tabs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); margin: 0 max(20px, env(safe-area-inset-right)) 16px max(20px, env(safe-area-inset-left)); padding: 3px; border-radius: 8px; background: var(--media-fill); }
  .media-tabs button { border: 0; border-radius: 6px; background: transparent; padding: 8px; color: var(--media-label); font-size: 15px; }
  .media-tabs [aria-selected=true] { background: var(--media-surface); box-shadow: 0 2px 5px -2px #0005; font-weight: 650; }
  .media-body { overflow-y: auto; overscroll-behavior: contain; padding: 0 max(20px, env(safe-area-inset-right)) max(20px, env(safe-area-inset-bottom)) max(20px, env(safe-area-inset-left)); scrollbar-color: var(--media-rule) transparent; }
  [hidden] { display: none !important; }
  button, input, select { font: inherit; color: inherit; letter-spacing: 0; }
  button { display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-height: 44px; padding: 8px 12px; border: 0; border-radius: 6px; background: transparent; color: var(--media-tint); cursor: pointer; }
  button:disabled { cursor: default; color: var(--media-secondary); }
  button:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid var(--media-tint); outline-offset: 2px; }
  input, select { min-width: 0; min-height: 44px; border: 0; background: var(--media-surface); border-radius: 6px; padding: 8px 10px; caret-color: var(--media-tint); }
  select { height: 44px; }
  input::placeholder { color: var(--media-secondary); opacity: 1; }
  input[type=checkbox] { min-height: 22px; width: 22px; height: 22px; margin: 0; accent-color: var(--media-tint); flex-shrink: 0; }
  .media-panel ::selection { background: var(--media-tint); color: var(--media-background); }
  .media-panel :global(.ui-icon) { width: 20px; height: 20px; flex-shrink: 0; }
  .media-icon { width: 44px; height: 44px; padding: 0; flex-shrink: 0; }
  .media-close { border-radius: 50%; background: var(--media-fill); color: var(--media-secondary); }
  .media-search { display: flex; align-items: center; gap: 8px; padding-inline: 12px 4px; background: var(--media-fill); border-radius: 8px; color: var(--media-secondary); }
  .media-search input { flex: 1; width: 0; background: transparent; padding-inline: 0; }
  .media-search:focus-within { outline: 2px solid var(--media-tint); outline-offset: 2px; }
  .media-search input:focus-visible { outline: none; }
  .media-filters { display: flex; flex-wrap: wrap; gap: 8px; } .media-filters select { max-width: 100%; flex: 1 1 120px; }
  .media-library-tools { margin-top: 8px; }
  .media-library-tools select { background: transparent; color: var(--media-tint); padding-left: 0; }
  .media-picker { display: flex; align-items: center; gap: 12px; min-height: 48px; background: var(--media-surface); padding-inline: 16px 8px; font-size: 16px; }
  .media-picker > span { flex-shrink: 0; }
  .media-picker select { flex: 1; width: 0; text-align: right; text-align-last: right; color: var(--media-secondary); padding-right: 0; }
  .media-picker + .media-picker { border-top: 1px solid var(--media-rule); }
  .media-narrator { margin-top: 12px; }
  .media-group { margin: 24px 0 8px; color: var(--media-secondary); font-size: 13px; font-weight: 500; }
  .media-reading { background: var(--media-surface); margin-inline: -20px; padding-inline: 20px; }
  .media-reading + .media-reading .media-reading-row { border-top: 1px solid var(--media-rule); }
  .media-reading-row { display: grid; grid-template-columns: minmax(0, 1fr) 132px; align-items: center; gap: 12px; padding: 12px 0; }
  .media-disclosure { justify-content: space-between; text-align: start; padding: 4px 0; border: 0; gap: 10px; color: var(--media-label); }
  .media-disclosure :global(.ui-icon) { width: 16px; height: 16px; color: var(--media-secondary); }
  .media-disclosure > span, .media-aliyah > span, .media-stored > span { min-width: 0; overflow-wrap: anywhere; }
  strong { font-weight: 600; } small { display: block; font-size: 12px; margin-top: 4px; line-height: 1.4; color: var(--media-secondary); }
  .media-hebrew { display: block; font-size: 16px; margin-top: 3px; }
  .media-download { width: 132px; height: 44px; white-space: nowrap; font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums; padding: 4px 6px; background: color-mix(in srgb, var(--media-tint) 9%, var(--media-surface)); }
  .media-download.is-complete { background: transparent; font-weight: 400; }
  .media-progress { display: flex; align-items: center; gap: 12px; padding-bottom: 8px; } progress { width: 100%; height: 6px; accent-color: var(--media-tint); }
  .media-aliyot { padding: 0 0 8px 16px; } .media-aliyah { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 0; border-top: 1px solid var(--media-rule); font-size: 15px; }
  .media-aliyah strong { font-weight: 400; }
  .media-error { color: var(--media-danger); padding: 8px 0; font-weight: 600; overflow-wrap: anywhere; }
  .media-storage-heading { display: flex; justify-content: space-between; align-items: center; }
  .media-storage-summary { display: grid; grid-template-columns: 200px minmax(0, 1fr); align-items: center; gap: 28px; margin: 24px 0 0; }
  .media-storage-ring { aspect-ratio: 1; border-radius: 50%; padding: 18px; box-sizing: border-box; display: grid; }
  .media-storage-ring > div { display: flex; flex-direction: column; justify-content: center; text-align: center; background: var(--media-background); border-radius: 50%; } .media-storage-ring strong { font-size: 26px; font-variant-numeric: tabular-nums; }
  dl { margin: 0; background: var(--media-surface); padding-inline: 16px; } dl > div { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 44px; padding-block: 10px; box-sizing: border-box; font-size: 15px; } dl > div + div { border-top: 1px solid var(--media-rule); } dt { display: flex; align-items: baseline; gap: 10px; } dt i { display: inline-block; width: 9px; height: 9px; flex-shrink: 0; border-radius: 50%; } dd { margin: 0; white-space: nowrap; color: var(--media-secondary); font-variant-numeric: tabular-nums; }
  .media-note { font-size: 12px; color: var(--media-secondary); margin-block: 8px; }
  .media-capacity { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; font-size: 13px; margin-block: 16px; } .media-capacity strong { white-space: nowrap; font-variant-numeric: tabular-nums; }
  .media-clear { width: 100%; justify-content: start; background: var(--media-surface); margin-top: 12px; }
  .media-storage-filters { margin-bottom: 12px; }
  .media-stored { display: flex; align-items: center; gap: 12px; min-height: 60px; padding: 12px 16px; box-sizing: border-box; border-bottom: 1px solid var(--media-rule); background: var(--media-surface); font-size: 15px; cursor: pointer; } .media-stored > span:nth-child(2) { flex: 1; } .media-stored > span:last-child { flex-shrink: 0; font-size: 12px; color: var(--media-secondary); font-variant-numeric: tabular-nums; }
  .media-select-all { display: flex; align-items: center; gap: 12px; min-height: 48px; padding-inline: 16px; cursor: pointer; font-size: 15px; color: var(--media-tint); }
  .media-remove-bar { position: sticky; bottom: 0; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; padding: 12px 0; background: var(--media-background); border-top: 1px solid var(--media-rule); font-size: 13px; }
  .media-actions { display: flex; flex-direction: column-reverse; gap: 4px; margin-top: 20px; } .media-actions button { border-top: 1px solid var(--media-rule); border-radius: 0; }
  .media-confirm { max-width: 360px; margin: 32px auto; padding: 24px 20px 8px; background: var(--media-surface); border-radius: 8px; text-align: center; } .media-confirm p { font-size: 15px; color: var(--media-secondary); }
  .media-destructive { color: var(--media-danger); }
  @media (hover: hover) { button:not(:disabled):hover { background: color-mix(in srgb, var(--media-label) 6%, var(--media-surface)); } }
  @media (prefers-reduced-motion: no-preference) { .media-panel[open] { animation: media-appear 180ms ease-out; } @keyframes media-appear { from { transform: translateY(12px); } to { transform: translateY(0); } } }
  @media (max-width: 600px) {
    .media-header { padding-inline: max(16px, env(safe-area-inset-left)) max(16px, env(safe-area-inset-right)); }
    .media-tabs { margin-inline: max(16px, env(safe-area-inset-left)) max(16px, env(safe-area-inset-right)); }
    .media-body { padding-inline: max(16px, env(safe-area-inset-left)) max(16px, env(safe-area-inset-right)); }
    .media-reading { margin-inline: -16px; padding-inline: 16px; }
    .media-storage-summary { grid-template-columns: 1fr; gap: 24px; margin-top: 12px; }
    .media-storage-ring { width: 208px; margin-inline: auto; }
    .media-remove-bar { flex-direction: column; align-items: stretch; text-align: center; }
    .media-remove-bar button { background: var(--media-surface); }
  }
</style>
