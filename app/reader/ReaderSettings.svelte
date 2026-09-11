<script lang="ts">
  import { flushSync, onMount } from 'svelte'
  import UiIcon from '../components/UiIcon.svelte'
  import type { IconName } from '../components/icons.ts'
  import type {
    OfflineRecordingDownloadSnapshot,
    OfflineRecordingRemovalResult,
  } from '../offline/recording-download.ts'
  import type { OfflineTorahDownloadSnapshot } from '../offline/torah-download.ts'
  import {
    applyReaderPreferences,
    colorContrastRatio,
    getDefaultHighlightPreferences,
    mergeReaderPreferences,
    recommendedThemeTextColor,
    type ReaderPreferences,
  } from '../reader-preferences.ts'
  import SupportDiagnosticsActions from '../support/SupportDiagnosticsActions.svelte'
  import { COMPACT_READER_QUERY } from '../adaptive/reader-viewport.ts'
  import { hexToOklch, oklchToHex, oklchGradient, editorChromaMax, type OklchColor } from './oklch-color.ts'
  import type {
    ReaderSettings,
    ReaderSettingsComponentProps,
  } from './reader-settings.ts'

  let {
    document: ownerDocument,
    view,
    narrators,
    getPreferences,
    updatePreferences: persistPreferences,
    setPlaybackRate,
    restoreFocus,
    animateThemeChanges,
    offlineTorah,
    offlineRecording,
    openMedia,
    toggle,
    connect,
  }: ReaderSettingsComponentProps = $props()

  function readPreferences() {
    return { ...getPreferences() }
  }

  let preferences = $state(readPreferences())
  let offlineSnapshot = $state<OfflineTorahDownloadSnapshot>({
    supported: false,
    phase: 'checking',
    downloaded: 0,
    total: 0,
    errorMessage: null,
  })
  let offlineRecordingSnapshot = $state<OfflineRecordingDownloadSnapshot>({
    supported: false,
    phase: 'no-recording',
    recordingId: null,
    recordingTitle: null,
    exactStored: false,
    downloadedBytes: 0,
    totalBytes: 0,
    otherCount: 0,
    otherBytes: 0,
    storedCount: 0,
    storedBytes: 0,
    inventoryPhase: 'checking',
    inventoryErrorMessage: null,
    errorMessage: null,
  })
  let offlineRecordingAnnouncement = $state('')
  let isOpen = $state(false)
  let returnFocus: HTMLElement | null = null
  let closeButton: HTMLButtonElement
  let focusFrame = 0
  let themeTransitionTimer = 0
  let customThemeTimer = 0
  let pendingCustomThemeUpdates: Partial<ReaderPreferences> | null = null
  let compactViewportMedia: MediaQueryList | null = null
  let compactViewport = $state(false)
  let paneElement: HTMLDivElement
  let panePosition = $state<{ left: number; top: number } | null>(null)
  let defaultPanePosition: { left: number; top: number } | null = null
  let paneDrag = $state<{
    pointerId: number
    clientX: number
    clientY: number
    left: number
    top: number
  } | null>(null)

  function movePane(left: number, top: number) {
    const rect = paneElement.getBoundingClientRect()
    const margin = 8
    panePosition = {
      left: Math.max(
        margin,
        Math.min(left, view.innerWidth - rect.width - margin)
      ),
      top: Math.max(
        margin,
        Math.min(top, view.innerHeight - rect.height - margin)
      ),
    }
  }

  function resetPanePosition() {
    paneDrag = null
    panePosition = null
    defaultPanePosition = null
  }

  function onPaneDragStart(
    event: PointerEvent & { currentTarget: HTMLButtonElement }
  ) {
    if (compactViewport || event.button !== 0) return
    event.preventDefault()
    event.currentTarget.focus({ preventScroll: true })
    const rect = paneElement.getBoundingClientRect()
    if (!panePosition) defaultPanePosition = { left: rect.left, top: rect.top }
    paneDrag = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      left: rect.left,
      top: rect.top,
    }
  }

  function onPaneDragKey(event: KeyboardEvent) {
    if (compactViewport) return
    if (event.key === 'Home') {
      event.preventDefault()
      event.stopPropagation()
      resetPanePosition()
      return
    }
    let dx = 0
    let dy = 0
    switch (event.key) {
      case 'ArrowLeft':
        dx = -1
        break
      case 'ArrowRight':
        dx = 1
        break
      case 'ArrowUp':
        dy = -1
        break
      case 'ArrowDown':
        dy = 1
        break
      default:
        return
    }
    event.preventDefault()
    event.stopPropagation()
    const rect = paneElement.getBoundingClientRect()
    if (!panePosition) defaultPanePosition = { left: rect.left, top: rect.top }
    const distance = event.shiftKey ? 40 : 12
    movePane(rect.left + dx * distance, rect.top + dy * distance)
  }

  function keepPaneInViewport() {
    if (isOpen && !compactViewport && panePosition) {
      movePane(panePosition.left, panePosition.top)
    }
  }
  type SettingsCategory = 'reading' | 'appearance' | 'playback' | 'more'
  let activeCategory = $state<SettingsCategory>('reading')

  const settingsCategories: readonly {
    id: SettingsCategory
    label: string
    icon: IconName
  }[] = [
    { id: 'reading', label: 'Reading', icon: 'bookText' },
    { id: 'appearance', label: 'Appearance', icon: 'settings2' },
    { id: 'playback', label: 'Playback', icon: 'playOutline' },
    { id: 'more', label: 'More', icon: 'circleEllipsis' },
  ]

  const customThemePresets = [
    { label: 'Parchment', background: '#eee6d6', text: '#3b3026' },
    { label: 'Paper', background: '#fcfcfd', text: '#191c22' },
    { label: 'Night', background: '#191c22', text: '#f8f7f3' },
    { label: 'Sage', background: '#e6ede5', text: '#233a2c' },
    { label: 'Slate', background: '#233344', text: '#e5edf4' },
    { label: 'Rose', background: '#f2e5e2', text: '#563a3e' },
  ] as const

  type ColorEditor = { hex: string; color: OklchColor }
  function readColorEditor(hex: string, previous?: ColorEditor): ColorEditor {
    if (previous?.hex.toLowerCase() === hex.toLowerCase()) return previous
    const color = hexToOklch(hex)
    if (color.chroma === 0 && previous) color.hue = previous.color.hue
    return { hex, color }
  }
  let backgroundEditor = $state(readColorEditor(readPreferences().customBackgroundColor))
  let textEditor = $state(readColorEditor(readPreferences().customTextColor))
  const customBackgroundOklch = $derived(backgroundEditor.color)
  const customTextOklch = $derived(textEditor.color)

  function syncColorEditors() {
    backgroundEditor = readColorEditor(preferences.customBackgroundColor, backgroundEditor)
    textEditor = readColorEditor(preferences.customTextColor, textEditor)
  }
  const customContrast = $derived(
    colorContrastRatio(
      preferences.customBackgroundColor,
      preferences.customTextColor
    )
  )
  const customContrastMessage = $derived(
    customContrast >= 7
      ? 'Strong contrast.'
      : customContrast >= 4.5
        ? 'Comfortable contrast.'
        : customContrast >= 3
          ? 'Contrast is a little soft. Current colors remain allowed.'
          : 'Low contrast may be difficult to read. Current colors remain allowed.'
  )

  const deviceDownloads = $derived(offlineRecordingSnapshot.storageLocation === 'device')
  const downloadLocationText = $derived(deviceDownloads ? 'on this device' : 'in this browser')
  const offlineStatusText = $derived.by(() => {
    if (deviceDownloads) return 'Core Torah pages are included in this app.'
    const { phase, downloaded, total, errorMessage } = offlineSnapshot
    if (phase === 'checking') return 'Checking offline availability…'
    if (phase === 'unavailable') {
      return 'Offline Torah download is not available in this browser.'
    }
    if (phase === 'complete') {
      return `All ${total} Torah pages are available offline.`
    }
    if (phase === 'downloading') {
      return `Saving Torah pages: ${downloaded} of ${total}.`
    }
    if (phase === 'error') {
      return errorMessage ?? 'The download paused. You can try again.'
    }
    return `${downloaded} of ${total} Torah pages are saved.`
  })

  const offlineButtonLabel = $derived(
    offlineSnapshot.phase === 'complete'
      ? 'Torah available offline'
      : offlineSnapshot.phase === 'downloading'
        ? 'Downloading Torah…'
        : offlineSnapshot.phase === 'error'
          ? 'Try download again'
          : 'Download Torah for offline use'
  )

  function formatByteCount(bytes: number) {
    if (bytes <= 0) return 'Unknown size'
    const megabytes = bytes / (1024 * 1024)
    return megabytes >= 10
      ? `${Math.round(megabytes)} MB`
      : `${megabytes.toFixed(1)} MB`
  }

  const offlineRecordingStatusText = $derived.by(() => {
    const {
      phase,
      totalBytes,
      errorMessage,
      recordingTitle,
    } = offlineRecordingSnapshot
    if (phase === 'no-recording') {
      if (offlineRecordingSnapshot.inventoryPhase === 'checking') {
        return 'Checking saved offline recordings…'
      }
      if (offlineRecordingSnapshot.inventoryPhase === 'unavailable') {
        return `Offline recording downloads are not available ${downloadLocationText}.`
      }
      if (offlineRecordingSnapshot.inventoryPhase === 'removing') {
        return 'Removing saved offline recordings…'
      }
      if (offlineRecordingSnapshot.inventoryPhase === 'error') {
        return (
          offlineRecordingSnapshot.inventoryErrorMessage ??
          'The offline recording inventory could not be checked.'
        )
      }
      if (offlineRecordingSnapshot.storedCount > 0) {
        const copies =
          offlineRecordingSnapshot.storedCount === 1 ? 'copy uses' : 'copies use'
        return `${offlineRecordingSnapshot.storedCount} offline recording ${copies} ${formatByteCount(offlineRecordingSnapshot.storedBytes)} ${downloadLocationText}. Start an aliyah to manage one recording.`
      }
      return 'Start an aliyah to choose a recording.'
    }
    if (phase === 'unavailable') {
      return (
        errorMessage ??
        `Offline recording downloads are not available ${downloadLocationText}.`
      )
    }
    if (phase === 'checking') {
      return `Checking ${recordingTitle ?? 'the current recording'}…`
    }
    if (phase === 'downloading') {
      return `Saving ${recordingTitle ?? 'the current recording'} for offline playback.`
    }
    if (phase === 'complete') {
      return `${recordingTitle ?? 'This recording'} is available offline ${downloadLocationText}.`
    }
    if (phase === 'removing') {
      if (offlineRecordingSnapshot.removalPending) return 'Removal pending until playback releases this recording.'
      return `Removing ${recordingTitle ?? 'the recording'}…`
    }
    if (phase === 'error') {
      const message = errorMessage ?? 'The download paused. You can try again.'
      if (offlineRecordingSnapshot.exactStored) {
        return `${message} ${recordingTitle ?? 'The current recording'} remains available offline.`
      }
      return message
    }
    return `${formatByteCount(totalBytes)}. Saved only when you request it.`
  })

  const offlineRecordingButtonLabel = $derived(
    offlineRecordingSnapshot.phase === 'downloading'
        ? 'Downloading recording…'
        : offlineRecordingSnapshot.phase === 'removing'
          ? offlineRecordingSnapshot.removalPending ? 'Removal pending' : 'Removing recording…'
          : offlineRecordingSnapshot.requiresDependencyRepair
            ? 'Repair offline download'
          : offlineRecordingSnapshot.exactStored
            ? 'Remove offline recording'
          : offlineRecordingSnapshot.phase === 'error'
            ? 'Try recording download again'
            : 'Download current recording'
  )

  const otherOfflineRecordingStatusText = $derived.by(() => {
    const { otherCount, otherBytes } = offlineRecordingSnapshot
    const copies = otherCount === 1 ? 'copy' : 'copies'
    return `${otherCount} other offline recording ${copies} use ${formatByteCount(otherBytes)} ${downloadLocationText}.`
  })

  function toggleOfflineRecording() {
    const expectedRecordingId = offlineRecordingSnapshot.recordingId
    if (offlineRecordingSnapshot.exactStored && !offlineRecordingSnapshot.requiresDependencyRepair) {
      const successMessage = `${offlineRecordingSnapshot.recordingTitle ?? 'The recording'} was removed from offline storage.`
      void announceOfflineRecordingRemoval(
        offlineRecording.remove(expectedRecordingId),
        successMessage
      )
      return
    }
    void offlineRecording.download(expectedRecordingId)
  }

  function removeOtherOfflineRecordings() {
    const count = offlineRecordingSnapshot.otherCount
    const successMessage = `${count} other offline recording${count === 1 ? '' : 's'} ${count === 1 ? 'was' : 'were'} removed.`
    void announceOfflineRecordingRemoval(
      offlineRecording.removeOthers(offlineRecordingSnapshot.recordingId),
      successMessage
    )
  }

  function removeAllOfflineRecordings() {
    const count = offlineRecordingSnapshot.storedCount
    const successMessage = `${count} offline recording${count === 1 ? '' : 's'} ${count === 1 ? 'was' : 'were'} removed.`
    void announceOfflineRecordingRemoval(
      offlineRecording.removeAll(),
      successMessage
    )
  }

  async function announceOfflineRecordingRemoval(
    operation: Promise<OfflineRecordingRemovalResult>,
    successMessage: string
  ) {
    const result = await operation
    if (result.status === 'skipped') return
    offlineRecordingAnnouncement =
      result.status === 'completed'
        ? successMessage
        : result.status === 'pending'
          ? 'Recordings still in use will be removed when playback releases them.'
        : (result.errorMessage ?? 'The offline recording removal paused.')
  }

  function announcementForOfflineRecordingSnapshot(
    nextSnapshot: OfflineRecordingDownloadSnapshot
  ) {
    const { phase, recordingTitle, errorMessage } = nextSnapshot
    const title = recordingTitle ?? 'The current recording'
    if (phase === 'checking') {
      return `Checking ${title}…`
    }
    if (
      phase === 'no-recording' &&
      nextSnapshot.inventoryPhase === 'checking'
    ) {
      return ''
    }
    if (phase === 'downloading') {
      return `Saving ${title} for offline playback.`
    }
    if (phase === 'complete') {
      return `${title} is available offline.`
    }
    if (phase === 'removing' || nextSnapshot.inventoryPhase === 'removing') {
      if (nextSnapshot.removalPending) return 'Removal pending until playback releases this recording.'
      return 'Removing offline recordings…'
    }
    if (phase === 'error') {
      return errorMessage ?? 'The offline recording operation paused.'
    }
    if (nextSnapshot.inventoryPhase === 'error') {
      return (
        nextSnapshot.inventoryErrorMessage ??
        'The offline recording inventory could not be checked.'
      )
    }
    return ''
  }

  function refreshPreferences() {
    flushSync(() => {
      preferences = readPreferences()
      syncColorEditors()
    })
  }

  function cancelScheduledFocus() {
    if (!focusFrame) return
    view.cancelAnimationFrame(focusFrame)
    focusFrame = 0
  }

  function scheduleThemeTransitionEnd() {
    if (themeTransitionTimer) view.clearTimeout(themeTransitionTimer)
    themeTransitionTimer = view.setTimeout(() => {
      themeTransitionTimer = 0
      ownerDocument.documentElement.classList.remove('mod-theme-transition')
    }, 220)
  }

  function commitCustomThemeUpdates() {
    if (customThemeTimer) {
      view.clearTimeout(customThemeTimer)
      customThemeTimer = 0
    }
    const updates = pendingCustomThemeUpdates
    pendingCustomThemeUpdates = null
    if (!updates) return
    persistPreferences(updates)
    refreshPreferences()
  }

  function previewCustomTheme(updates: Partial<ReaderPreferences>) {
    const nextUpdates = { themeMode: 'custom' as const, ...updates }
    preferences = mergeReaderPreferences(preferences, nextUpdates)
    syncColorEditors()
    applyReaderPreferences(preferences)
    pendingCustomThemeUpdates = {
      ...pendingCustomThemeUpdates,
      ...nextUpdates,
    }
    if (customThemeTimer) view.clearTimeout(customThemeTimer)
    customThemeTimer = view.setTimeout(commitCustomThemeUpdates, 80)
  }

  function updatePreferences(updates: Parameters<typeof persistPreferences>[0]) {
    commitCustomThemeUpdates()
    const currentPreferences = getPreferences()
    const shouldFadeTheme =
      updates.themeMode !== undefined &&
      updates.themeMode !== currentPreferences.themeMode &&
      animateThemeChanges &&
      !view.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (shouldFadeTheme) {
      ownerDocument.documentElement.classList.add('mod-theme-transition')
    }
    persistPreferences(updates)
    if (shouldFadeTheme) scheduleThemeTransitionEnd()
    refreshPreferences()
  }

  function updateCustomColor(
    target: 'background' | 'text',
    channel: keyof OklchColor,
    rawValue: string
  ) {
    const value = Number.parseFloat(rawValue)
    if (!Number.isFinite(value)) return
    const current = target === 'background'
      ? customBackgroundOklch
      : customTextOklch
    const color = { ...current, [channel]: channel === 'lightness' ? value / 100 : value }
    const hex = oklchToHex(color)
    // Retain editing coordinates through grayscale, gamut fitting and hex rounding.
    if (target === 'background') backgroundEditor = { hex, color }
    else textEditor = { hex, color }
    previewCustomTheme(
      target === 'background'
        ? { customBackgroundColor: hex }
        : { customTextColor: hex }
    )
  }

  function applyCustomThemePreset(background: string, text: string) {
    updatePreferences({
      themeMode: 'custom',
      customBackgroundColor: background,
      customTextColor: text,
    })
  }

  function updateFiniteNumber(
    rawValue: string,
    apply: (nextValue: number) => void
  ) {
    const nextValue = Number.parseFloat(rawValue)
    if (Number.isFinite(nextValue)) apply(nextValue)
  }

  function applyPlaybackRate(rawValue: string) {
    updateFiniteNumber(rawValue, (nextRate) => {
      setPlaybackRate(nextRate)
      refreshPreferences()
    })
  }

  function adjustPlaybackRate(delta: number) {
    const nextRate = Math.min(
      3,
      Math.max(0.5, Number((preferences.playbackRate + delta).toFixed(2)))
    )
    setPlaybackRate(nextRate)
    refreshPreferences()
  }

  function open({
    returnFocus: requestedReturnFocus,
  }: { returnFocus?: HTMLElement } = {}) {
    const activeElement =
      ownerDocument.activeElement instanceof HTMLElement &&
      ownerDocument.activeElement !== ownerDocument.body
        ? ownerDocument.activeElement
        : null
    returnFocus = requestedReturnFocus ?? activeElement ?? toggle
    flushSync(() => {
      isOpen = true
    })
    keepPaneInViewport()
    void offlineTorah.refresh()
    void offlineRecording.refresh()
    toggle.setAttribute('aria-expanded', 'true')
    cancelScheduledFocus()
    focusFrame = view.requestAnimationFrame(() => {
      focusFrame = 0
      closeButton.focus({ preventScroll: true })
    })
  }

  function close({ restoreFocus: shouldRestoreFocus = true } = {}) {
    if (!isOpen) return false
    paneDrag = null
    commitCustomThemeUpdates()
    cancelScheduledFocus()
    flushSync(() => {
      isOpen = false
    })
    toggle.setAttribute('aria-expanded', 'false')
    const focusTarget = shouldRestoreFocus ? returnFocus : null
    returnFocus = null
    if (focusTarget) restoreFocus(focusTarget)
    return true
  }

  function sync() {
    refreshPreferences()
    if (isOpen) void offlineRecording.refresh()
  }

  const settings: ReaderSettings = { open, close, sync }

  onMount(() => {
    compactViewportMedia = view.matchMedia(COMPACT_READER_QUERY)
    compactViewport = compactViewportMedia.matches
    const handleCompactViewportChange = (event: MediaQueryListEvent) => {
      compactViewport = event.matches
      paneDrag = null
    }
    if (typeof compactViewportMedia.addEventListener === 'function') {
      compactViewportMedia.addEventListener(
        'change',
        handleCompactViewportChange
      )
    } else if (typeof compactViewportMedia.addListener === 'function') {
      compactViewportMedia.addListener(handleCompactViewportChange)
    }
    const unsubscribeOffline = offlineTorah.subscribe((nextSnapshot) => {
      offlineSnapshot = nextSnapshot
    })
    const unsubscribeOfflineRecording = offlineRecording.subscribe(
      (nextSnapshot) => {
        offlineRecordingAnnouncement =
          announcementForOfflineRecordingSnapshot(nextSnapshot)
        offlineRecordingSnapshot = nextSnapshot
      }
    )
    void offlineTorah.refresh()
    void offlineRecording.refresh()

    const handleOutsidePointer = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Element) || !isOpen) return
      if (target.closest('[data-target-id="settings-pane"]')) return
      if (target.closest('[data-target-id="settings-toggle"]')) return
      close({ restoreFocus: false })
    }

    connect(settings)
    ownerDocument.addEventListener('pointerdown', handleOutsidePointer)

    const handlePaneDragMove = (event: PointerEvent) => {
      if (!paneDrag || event.pointerId !== paneDrag.pointerId) return
      movePane(
        paneDrag.left + event.clientX - paneDrag.clientX,
        paneDrag.top + event.clientY - paneDrag.clientY
      )
    }
    const handlePaneDragFinish = (event: PointerEvent) => {
      if (!paneDrag || event.pointerId !== paneDrag.pointerId) return
      paneDrag = null
      if (
        panePosition &&
        defaultPanePosition &&
        Math.hypot(
          panePosition.left - defaultPanePosition.left,
          panePosition.top - defaultPanePosition.top
        ) <= 56
      ) resetPanePosition()
    }
    const cancelPaneDrag = () => {
      paneDrag = null
    }
    view.addEventListener('pointermove', handlePaneDragMove)
    view.addEventListener('pointerup', handlePaneDragFinish)
    view.addEventListener('pointercancel', cancelPaneDrag)
    view.addEventListener('blur', cancelPaneDrag)
    view.addEventListener('resize', keepPaneInViewport)
    const paneResizeObserver = new ResizeObserver(keepPaneInViewport)
    paneResizeObserver.observe(paneElement)

    return () => {
      paneResizeObserver.disconnect()
      view.removeEventListener('pointermove', handlePaneDragMove)
      view.removeEventListener('pointerup', handlePaneDragFinish)
      view.removeEventListener('pointercancel', cancelPaneDrag)
      view.removeEventListener('blur', cancelPaneDrag)
      view.removeEventListener('resize', keepPaneInViewport)
      unsubscribeOffline()
      unsubscribeOfflineRecording()
      if (typeof compactViewportMedia?.removeEventListener === 'function') {
        compactViewportMedia.removeEventListener(
          'change',
          handleCompactViewportChange
        )
      } else if (typeof compactViewportMedia?.removeListener === 'function') {
        compactViewportMedia.removeListener(handleCompactViewportChange)
      }
      ownerDocument.removeEventListener('pointerdown', handleOutsidePointer)
      cancelScheduledFocus()
      if (themeTransitionTimer) view.clearTimeout(themeTransitionTimer)
      if (customThemeTimer) view.clearTimeout(customThemeTimer)
      themeTransitionTimer = 0
      customThemeTimer = 0
      pendingCustomThemeUpdates = null
      ownerDocument.documentElement.classList.remove('mod-theme-transition')
      returnFocus = null
      toggle.setAttribute('aria-expanded', 'false')
    }
  })
</script>

<div
  bind:this={paneElement}
  class="settings-pane"
  class:u-hidden={!isOpen}
  class:is-positioned={!compactViewport && panePosition !== null}
  class:is-dragging={paneDrag !== null}
  style:left={!compactViewport && panePosition
    ? `${panePosition.left}px`
    : undefined}
  style:top={!compactViewport && panePosition
    ? `${panePosition.top}px`
    : undefined}
  data-target-id="settings-pane"
  id="reader-settings-pane"
  role="dialog"
  aria-labelledby="reader-settings-title"
  aria-hidden={!isOpen}
>
  <button
    class="settings-drag-handle"
    type="button"
    data-target-id="settings-drag-handle"
    aria-label="Move reader settings"
    title="Drag to move reader settings. Double-click or press Home to reset. Arrow keys move; Shift moves farther."
    hidden={compactViewport}
    onpointerdown={onPaneDragStart}
    onkeydown={onPaneDragKey}
    ondblclick={resetPanePosition}
  >
    <UiIcon name="grip" />
  </button>
  <header class="settings-pane-header">
    <div class="settings-pane-title">
      <h2 id="reader-settings-title">Reader Settings</h2>
    </div>
    <div class="settings-pane-header-actions">
      <button
        class="toolbar-button mod-icon-label settings-header-action"
        type="button"
        data-target-id="settings-reset-highlight"
        aria-label="Reset current-word highlight"
        title="Reset current-word highlight"
        onclick={() => updatePreferences(getDefaultHighlightPreferences())}
      >
        <UiIcon name="replay" />
      </button>
      <button
        bind:this={closeButton}
        class="toolbar-button mod-icon-label settings-header-action"
        type="button"
        data-target-id="settings-close"
        aria-label="Close reader settings"
        title="Close reader settings"
        onclick={() => close()}
      >
        <UiIcon name="x" />
      </button>
    </div>
  </header>

  <div class="settings-pane-body">
    <nav class="settings-category-nav" aria-label="Reader settings categories">
      {#each settingsCategories as category (category.id)}
        <button
          class="settings-category-tab"
          class:is-active={activeCategory === category.id}
          type="button"
          data-settings-category={category.id}
          aria-label={category.label}
          title={category.label}
          aria-pressed={activeCategory === category.id}
          aria-controls={`reader-settings-${category.id}-panel`}
          onclick={() => (activeCategory = category.id)}
        >
          <UiIcon name={category.icon} />
        </button>
      {/each}
    </nav>

    <form class="settings-form" data-target-id="settings-form">
      <div
        class="settings-category-panel mod-reading"
        data-settings-panel="reading"
        id="reader-settings-reading-panel"
        hidden={activeCategory !== 'reading'}
        aria-label="Reading settings"
      >
        <h3 class="settings-panel-title">Reading</h3>
        <section class="settings-section">
          <h4 class="settings-section-title">Layout</h4>
          <div
            class="settings-reader-presentation"
            data-target-id="settings-reader-presentation"
          >
            <div class="settings-reader-choice">
              <span class="settings-field-label">Line layout</span>
          <div
            class="settings-segmented-control"
            data-target-id="settings-reader-text-layout"
          >
            <button
              class="settings-segmented-option"
              class:is-active={preferences.readerTextLayout === 'reading'}
              type="button"
              data-reader-text-layout="reading"
              aria-pressed={preferences.readerTextLayout === 'reading'}
              onclick={() =>
                updatePreferences({ readerTextLayout: 'reading' })}
            >
              <span>Reading</span>
              <small>Natural</small>
            </button>
            <button
              class="settings-segmented-option"
              class:is-active={preferences.readerTextLayout === 'match'}
              type="button"
              data-reader-text-layout="match"
              aria-pressed={preferences.readerTextLayout === 'match'}
              onclick={() =>
                updatePreferences({ readerTextLayout: 'match' })}
            >
              <span>Match</span>
              <small>Torah lines</small>
            </button>
          </div>
            </div>

            <div class="settings-reader-choice">
              <span class="settings-field-label">Sides</span>
          <div
            class="settings-segmented-control"
            data-target-id="settings-reader-side-mode"
          >
            <button
              class="settings-segmented-option"
              class:is-active={preferences.readerSideMode === 'one'}
              type="button"
              data-reader-side-mode="one"
              aria-pressed={preferences.readerSideMode === 'one'}
              onclick={() => updatePreferences({ readerSideMode: 'one' })}
            >
              <span>One Side</span>
              <small>Tap text on mobile</small>
            </button>
            <button
              class="settings-segmented-option"
              class:is-active={preferences.readerSideMode === 'two'}
              type="button"
              data-reader-side-mode="two"
              aria-pressed={preferences.readerSideMode === 'two'}
              disabled={compactViewport}
              title={compactViewport
                ? 'Rotate to landscape for Two Sided'
                : 'Show Torah and Tikkun together'}
              onclick={() => updatePreferences({ readerSideMode: 'two' })}
            >
              <span>Two Sided</span>
              <small class="settings-landscape-label">
                {#if compactViewport}<UiIcon name="phoneRotate" />{/if}
                {compactViewport ? 'Landscape' : 'Mirrored'}
              </small>
            </button>
          </div>
            </div>
          </div>
        </section>

        <section class="settings-section">
          <h4 class="settings-section-title">Reader</h4>
          <div class="settings-field mod-reader-controls">
            <div class="settings-reader-choice mod-position">
              <span class="settings-field-copy">
                <span class="settings-field-label">Reading center</span>
                <span class="settings-field-helper"
                  >Where the active word sits.</span
                >
              </span>
              <div
                class="settings-segmented-control"
                data-target-id="settings-focal-point-mode"
              >
                <button
                  class="settings-segmented-option"
                  class:is-active={preferences.focalPointMode === 'reader'}
                  type="button"
                  data-focal-point-mode="reader"
                  aria-pressed={preferences.focalPointMode === 'reader'}
                  onclick={() =>
                    updatePreferences({ focalPointMode: 'reader' })}
                >
                  <span>Reader</span>
                  <small>Symmetrical</small>
                </button>
                <button
                  class="settings-segmented-option"
                  class:is-active={preferences.focalPointMode === 'browser'}
                  type="button"
                  data-focal-point-mode="browser"
                  aria-pressed={preferences.focalPointMode === 'browser'}
                  onclick={() =>
                    updatePreferences({ focalPointMode: 'browser' })}
                >
                  <span>Browser</span>
                  <small>Pushes higher</small>
                </button>
              </div>
            </div>
            <div class="settings-reader-tool">
              <span class="settings-field-label">Focal Measure</span>
              <button
                type="button"
                class="settings-secondary-action"
                data-target-id="debug-focal-measure-toggle">Focal Measure</button
              >
            </div>
          </div>

          <label class="settings-field mod-checkbox mod-card mod-switch">
            <span class="settings-field-copy">
              <span class="settings-field-label">Disable Shift for Nekudot</span>
              <span class="settings-field-helper"
                >Keep Shift from hiding vowels.</span
              >
            </span>
            <input
              data-target-id="settings-disable-shift-hide"
              type="checkbox"
              role="switch"
              checked={preferences.disableShiftNekudotHide}
              onchange={(event) =>
                updatePreferences({
                  disableShiftNekudotHide: event.currentTarget.checked,
                })}
            />
          </label>
        </section>
      </div>

      <div
        class="settings-category-panel"
        data-settings-panel="more"
        id="reader-settings-more-panel"
        hidden={activeCategory !== 'more'}
        aria-label="More settings"
      >
        <h3 class="settings-panel-title">More</h3>

        <section class="settings-section">
      <h4 class="settings-section-title">Offline</h4>
      {#if openMedia}
        <button class="settings-offline-button" type="button" onclick={() => { close({ restoreFocus: false }); openMedia?.() }}>Media &amp; Storage</button>
      {/if}
      <div class="settings-field settings-offline-field">
        <span class="settings-field-copy">
          <span class="settings-field-label">Torah pages</span>
          <span class="settings-field-helper"
            >{deviceDownloads ? 'Available offline without an additional download.' : 'Saves every Torah page in this browser. Recordings are downloaded separately below.'}</span
          >
        </span>
        {#if offlineSnapshot.total > 0}
          <progress
            class="settings-offline-progress"
            max={offlineSnapshot.total}
            value={offlineSnapshot.downloaded}
            aria-label="Offline Torah download progress"
          ></progress>
        {/if}
        <span
          class="settings-offline-status"
          id="settings-offline-status"
          data-target-id="settings-offline-status"
          aria-live="polite">{offlineStatusText}</span
        >
        {#if !deviceDownloads}<button
          class="settings-offline-button"
          type="button"
          data-target-id="settings-offline-download"
          aria-describedby="settings-offline-status"
          disabled={offlineSnapshot.phase === 'checking' ||
            offlineSnapshot.phase === 'downloading' ||
            offlineSnapshot.phase === 'complete' ||
            offlineSnapshot.phase === 'unavailable'}
          onclick={() => void offlineTorah.download()}
        >{offlineButtonLabel}</button>{/if}
      </div>
      <div class="settings-field settings-offline-field">
        <span class="settings-field-copy">
          <span class="settings-field-label"
            >{offlineRecordingSnapshot.recordingTitle ?? 'Current recording'}</span
          >
          <span class="settings-field-helper"
            >Keeps one explicit local copy for offline playback. Nothing is
            downloaded automatically.</span
          >
        </span>
        {#if offlineRecordingSnapshot.totalBytes > 0 &&
        (offlineRecordingSnapshot.phase === 'downloading' ||
          offlineRecordingSnapshot.phase === 'complete')}
          <progress
            class="settings-offline-progress"
            max={offlineRecordingSnapshot.totalBytes}
            value={offlineRecordingSnapshot.downloadedBytes}
            aria-label="Offline recording download progress"
            aria-valuetext={`${formatByteCount(offlineRecordingSnapshot.downloadedBytes)} of ${formatByteCount(offlineRecordingSnapshot.totalBytes)}`}
          ></progress>
        {/if}
        <span
          class="settings-offline-status"
          id="settings-offline-recording-status"
          data-target-id="settings-offline-recording-status"
          >{offlineRecordingStatusText}</span
        >
        <span
          class="u-visually-hidden"
          data-target-id="settings-offline-recording-announcement"
          aria-live="polite"
          aria-atomic="true">{offlineRecordingAnnouncement}</span
        >
        <button
          class="settings-offline-button"
          type="button"
          data-target-id="settings-offline-recording-download"
          aria-describedby="settings-offline-recording-status"
          disabled={offlineRecordingSnapshot.phase === 'no-recording' ||
            offlineRecordingSnapshot.recordingId === null ||
            offlineRecordingSnapshot.phase === 'checking' ||
            offlineRecordingSnapshot.phase === 'downloading' ||
            offlineRecordingSnapshot.phase === 'removing' ||
            offlineRecordingSnapshot.phase === 'unavailable'}
          onclick={toggleOfflineRecording}
        >{offlineRecordingButtonLabel}</button>
        {#if offlineRecordingSnapshot.otherCount > 0}
          <span
            class="settings-offline-status"
            id="settings-offline-recording-other-status"
            data-target-id="settings-offline-recording-other-status"
            >{otherOfflineRecordingStatusText}</span
          >
          <button
            class="settings-offline-button"
            type="button"
            data-target-id="settings-offline-recording-remove-others"
            aria-describedby="settings-offline-recording-other-status"
            disabled={offlineRecordingSnapshot.phase === 'checking' ||
              offlineRecordingSnapshot.phase === 'downloading' ||
              offlineRecordingSnapshot.phase === 'removing' ||
              offlineRecordingSnapshot.phase === 'unavailable'}
            onclick={removeOtherOfflineRecordings}
            >Remove other offline recordings</button
          >
        {/if}
        {#if offlineRecordingSnapshot.recordingId === null &&
        offlineRecordingSnapshot.storedCount > 0}
          <button
            class="settings-offline-button"
            type="button"
            data-target-id="settings-offline-recording-remove-all"
            aria-describedby="settings-offline-recording-status"
            disabled={offlineRecordingSnapshot.inventoryPhase === 'checking' ||
              offlineRecordingSnapshot.inventoryPhase === 'removing' ||
              offlineRecordingSnapshot.inventoryPhase === 'unavailable'}
            onclick={removeAllOfflineRecordings}
            >Remove saved offline recordings</button
          >
        {/if}
      </div>
        </section>
      </div>

      <div
        class="settings-category-panel"
        data-settings-panel="appearance"
        id="reader-settings-appearance-panel"
        hidden={activeCategory !== 'appearance'}
        aria-label="Appearance settings"
      >
        <h3 class="settings-panel-title">Appearance</h3>
        <section class="settings-section">
      <h4 class="settings-section-title">Page Look</h4>
      <div class="settings-field settings-theme-field">
        <span class="settings-field-copy">
          <span class="settings-field-label">Theme</span>
          <span class="settings-field-helper"
            >Changes page and text colors.</span
          >
        </span>
        <div
          class="settings-segmented-control mod-themes"
          data-target-id="settings-theme-mode"
        >
          <button
            class="settings-segmented-option"
            class:is-active={preferences.themeMode === 'automatic'}
            type="button"
            data-theme-mode="automatic"
            aria-pressed={preferences.themeMode === 'automatic'}
            onclick={() => updatePreferences({ themeMode: 'automatic' })}
          >
            <span lang="he" dir="rtl" aria-hidden="true">אָב</span>
            <small>System</small>
          </button
          >
          <button
            class="settings-segmented-option"
            class:is-active={preferences.themeMode === 'light'}
            type="button"
            data-theme-mode="light"
            aria-pressed={preferences.themeMode === 'light'}
            onclick={() => updatePreferences({ themeMode: 'light' })}
          >
            <span lang="he" dir="rtl" aria-hidden="true">אָב</span>
            <small>Light</small>
          </button
          >
          <button
            class="settings-segmented-option"
            class:is-active={preferences.themeMode === 'sepia'}
            type="button"
            data-theme-mode="sepia"
            aria-pressed={preferences.themeMode === 'sepia'}
            onclick={() => updatePreferences({ themeMode: 'sepia' })}
          >
            <span lang="he" dir="rtl" aria-hidden="true">אָב</span>
            <small>Sepia</small>
          </button
          >
          <button
            class="settings-segmented-option"
            class:is-active={preferences.themeMode === 'dark'}
            type="button"
            data-theme-mode="dark"
            aria-pressed={preferences.themeMode === 'dark'}
            onclick={() => updatePreferences({ themeMode: 'dark' })}
          >
            <span lang="he" dir="rtl" aria-hidden="true">אָב</span>
            <small>Dark</small>
          </button
          >
          <button
            class="settings-segmented-option"
            class:is-active={preferences.themeMode === 'custom'}
            type="button"
            data-theme-mode="custom"
            aria-pressed={preferences.themeMode === 'custom'}
            style:background-color={preferences.customBackgroundColor}
            style:color={preferences.customTextColor}
            onclick={() => updatePreferences({ themeMode: 'custom' })}
          >
            <span lang="he" dir="rtl" aria-hidden="true">אָב</span>
            <small style:color={recommendedThemeTextColor(preferences.customBackgroundColor)}>Custom</small>
          </button
          >
        </div>
        {#if preferences.themeMode === 'custom'}
          <div
            class="settings-custom-theme"
            data-target-id="settings-custom-theme"
          >
            <div
              class="settings-custom-theme-preview"
              dir="rtl"
              style:background-color={preferences.customBackgroundColor}
              style:color={preferences.customTextColor}
              aria-label="Custom theme preview"
            >
              בְּרֵאשִׁית בָּרָא אֱלֹהִים
            </div>
            <span class="settings-field-helper" id="custom-oklch-help">
              Chroma is color intensity. Colors fit to sRGB when needed.
            </span>

            <div class="settings-custom-color">
              <div class="settings-custom-color-heading">
                <span>Background</span>
                <div class="settings-custom-color-value">
                  <output>{preferences.customBackgroundColor.toUpperCase()}</output>
                  <input
                    type="color"
                    aria-label="Background color"
                    value={preferences.customBackgroundColor}
                    oninput={(event) => previewCustomTheme({ customBackgroundColor: event.currentTarget.value })}
                    onchange={commitCustomThemeUpdates}
                  />
                </div>
              </div>
              <label class="settings-custom-tone">
                <span>Hue</span>
                <input
                  type="range"
                  data-target-id="settings-custom-background-hue"
                  min="0"
                  max="360"
                  step="1"
                  value={customBackgroundOklch.hue}
                  aria-label="Background hue"
                  aria-valuetext={`${Math.round(customBackgroundOklch.hue)} degrees`}
                  style={`--settings-slider-gradient: ${oklchGradient(customBackgroundOklch, 'hue')}`}
                  oninput={(event) =>
                    updateCustomColor('background', 'hue', event.currentTarget.value)}
                  onchange={commitCustomThemeUpdates}
                />
              </label>
              <label class="settings-custom-tone">
                <span>Chroma</span>
                <input
                  type="range"
                  data-target-id="settings-custom-background-chroma"
                  min="0"
                  max={editorChromaMax(customBackgroundOklch)}
                  step="0.001"
                  value={customBackgroundOklch.chroma}
                  aria-label="Background chroma"
                  aria-describedby="custom-oklch-help"
                  aria-valuetext={`${customBackgroundOklch.chroma.toFixed(3)} chroma`}
                  style={`--settings-slider-gradient: ${oklchGradient(customBackgroundOklch, 'chroma')}`}
                  oninput={(event) => updateCustomColor('background', 'chroma', event.currentTarget.value)}
                  onchange={commitCustomThemeUpdates}
                />
              </label>
              <label class="settings-custom-tone">
                <span>Lightness</span>
                <input
                  type="range"
                  data-target-id="settings-custom-background-tone"
                  min="0"
                  max="100"
                  step="0.1"
                  value={customBackgroundOklch.lightness * 100}
                  aria-label="Background lightness"
                  aria-valuetext={`${(customBackgroundOklch.lightness * 100).toFixed(1)} percent lightness`}
                  style={`--settings-slider-gradient: ${oklchGradient(customBackgroundOklch, 'lightness')}`}
                  oninput={(event) =>
                    updateCustomColor('background', 'lightness', event.currentTarget.value)}
                  onchange={commitCustomThemeUpdates}
                />
              </label>
            </div>

            <div class="settings-custom-color">
              <div class="settings-custom-color-heading">
                <span>Text</span>
                <div class="settings-custom-color-value">
                  <output>{preferences.customTextColor.toUpperCase()}</output>
                  <input
                    type="color"
                    aria-label="Text color"
                    value={preferences.customTextColor}
                    oninput={(event) => previewCustomTheme({ customTextColor: event.currentTarget.value })}
                    onchange={commitCustomThemeUpdates}
                  />
                </div>
              </div>
              <label class="settings-custom-tone">
                <span>Hue</span>
                <input
                  type="range"
                  data-target-id="settings-custom-text-hue"
                  min="0"
                  max="360"
                  step="1"
                  value={customTextOklch.hue}
                  aria-label="Text hue"
                  aria-valuetext={`${Math.round(customTextOklch.hue)} degrees`}
                  style={`--settings-slider-gradient: ${oklchGradient(customTextOklch, 'hue')}`}
                  oninput={(event) =>
                    updateCustomColor('text', 'hue', event.currentTarget.value)}
                  onchange={commitCustomThemeUpdates}
                />
              </label>
              <label class="settings-custom-tone">
                <span>Chroma</span>
                <input
                  type="range"
                  data-target-id="settings-custom-text-chroma"
                  min="0"
                  max={editorChromaMax(customTextOklch)}
                  step="0.001"
                  value={customTextOklch.chroma}
                  aria-label="Text chroma"
                  aria-describedby="custom-oklch-help"
                  aria-valuetext={`${customTextOklch.chroma.toFixed(3)} chroma`}
                  style={`--settings-slider-gradient: ${oklchGradient(customTextOklch, 'chroma')}`}
                  oninput={(event) => updateCustomColor('text', 'chroma', event.currentTarget.value)}
                  onchange={commitCustomThemeUpdates}
                />
              </label>
              <label class="settings-custom-tone">
                <span>Lightness</span>
                <input
                  type="range"
                  data-target-id="settings-custom-text-tone"
                  min="0"
                  max="100"
                  step="0.1"
                  value={customTextOklch.lightness * 100}
                  aria-label="Text lightness"
                  aria-valuetext={`${(customTextOklch.lightness * 100).toFixed(1)} percent lightness`}
                  style={`--settings-slider-gradient: ${oklchGradient(customTextOklch, 'lightness')}`}
                  oninput={(event) =>
                    updateCustomColor('text', 'lightness', event.currentTarget.value)}
                  onchange={commitCustomThemeUpdates}
                />
              </label>
            </div>

            <div class="settings-custom-presets" aria-label="Theme patterns">
              {#each customThemePresets as preset (preset.label)}
                <button
                  class:is-active={preferences.customBackgroundColor ===
                    preset.background &&
                    preferences.customTextColor === preset.text}
                  type="button"
                  data-custom-theme-preset={preset.label.toLowerCase()}
                  style:background-color={preset.background}
                  style:color={preset.text}
                  onclick={() =>
                    applyCustomThemePreset(preset.background, preset.text)}
                >{preset.label}</button>
              {/each}
            </div>

            <div
              class="settings-custom-contrast"
              class:mod-soft={customContrast < 4.5}
              data-target-id="settings-custom-contrast"
              role="status"
            >
              <span>
                <strong>{customContrastMessage}</strong>
                <small>{customContrast.toFixed(1)}:1</small>
              </span>
              {#if customContrast < 4.5}
                <button
                  type="button"
                  onclick={() =>
                    updatePreferences({
                      customTextColor: recommendedThemeTextColor(
                        preferences.customBackgroundColor
                      ),
                    })}
                >Adjust text</button>
              {/if}
            </div>
          </div>
        {/if}
      </div>
    </section>

        <section class="settings-section">
      <h4 class="settings-section-title">Current Word</h4>
      <label class="settings-field mod-inline-compact">
        <span class="settings-field-copy">
          <span class="settings-field-label">Fill color</span>
          <span class="settings-field-helper"
            >Changes the color washed behind the current word.</span
          >
        </span>
        <input
          data-target-id="settings-highlight-fill"
          type="color"
          value={preferences.highlightFill}
          oninput={(event) =>
            updatePreferences({ highlightFill: event.currentTarget.value })}
        />
      </label>

      <label class="settings-field">
        <span class="settings-field-copy">
          <span class="settings-field-label">Fill strength</span>
          <span class="settings-field-helper"
            >Makes the color behind the word lighter or stronger.</span
          >
        </span>
        <div class="settings-range-input">
          <input
            data-target-id="settings-highlight-opacity"
            type="range"
            min="0.05"
            max="0.45"
            step="0.01"
            value={preferences.highlightOpacity}
            oninput={(event) =>
              updateFiniteNumber(event.currentTarget.value, (highlightOpacity) =>
                updatePreferences({ highlightOpacity }))}
          />
          <input
            data-target-id="settings-highlight-opacity-value"
            type="number"
            min="0.05"
            max="0.45"
            step="0.01"
            inputmode="decimal"
            value={preferences.highlightOpacity}
            oninput={(event) =>
              updateFiniteNumber(event.currentTarget.value, (highlightOpacity) =>
                updatePreferences({ highlightOpacity }))}
            onchange={(event) =>
              updateFiniteNumber(event.currentTarget.value, (highlightOpacity) =>
                updatePreferences({ highlightOpacity }))}
          />
        </div>
      </label>

      <label class="settings-field mod-inline-compact">
        <span class="settings-field-copy">
          <span class="settings-field-label">Border color</span>
          <span class="settings-field-helper"
            >Changes the line color around the current word.</span
          >
        </span>
        <input
          data-target-id="settings-outline-color"
          type="color"
          value={preferences.outlineColor}
          oninput={(event) =>
            updatePreferences({ outlineColor: event.currentTarget.value })}
        />
      </label>

      <label class="settings-field">
        <span class="settings-field-copy">
          <span class="settings-field-label">Border thickness</span>
          <span class="settings-field-helper"
            >Makes the line around the word thinner or thicker.</span
          >
        </span>
        <div class="settings-range-input">
          <input
            data-target-id="settings-outline-width"
            type="range"
            min="1"
            max="6"
            step="1"
            value={preferences.outlineWidth}
            oninput={(event) =>
              updateFiniteNumber(event.currentTarget.value, (outlineWidth) =>
                updatePreferences({ outlineWidth }))}
          />
          <input
            data-target-id="settings-outline-width-value"
            type="number"
            min="1"
            max="6"
            step="1"
            inputmode="decimal"
            value={preferences.outlineWidth}
            oninput={(event) =>
              updateFiniteNumber(event.currentTarget.value, (outlineWidth) =>
                updatePreferences({ outlineWidth }))}
            onchange={(event) =>
              updateFiniteNumber(event.currentTarget.value, (outlineWidth) =>
                updatePreferences({ outlineWidth }))}
          />
        </div>
      </label>

      <label class="settings-field">
        <span class="settings-field-copy">
          <span class="settings-field-label">Breathing room</span>
          <span class="settings-field-helper"
            >Moves the border closer to or farther from the word.</span
          >
        </span>
        <div class="settings-range-input">
          <input
            data-target-id="settings-outline-offset"
            type="range"
            min="0"
            max="10"
            step="0.5"
            value={preferences.outlineOffset}
            oninput={(event) =>
              updateFiniteNumber(event.currentTarget.value, (outlineOffset) =>
                updatePreferences({ outlineOffset }))}
          />
          <input
            data-target-id="settings-outline-offset-value"
            type="number"
            min="0"
            max="10"
            step="0.5"
            inputmode="decimal"
            value={preferences.outlineOffset}
            oninput={(event) =>
              updateFiniteNumber(event.currentTarget.value, (outlineOffset) =>
                updatePreferences({ outlineOffset }))}
            onchange={(event) =>
              updateFiniteNumber(event.currentTarget.value, (outlineOffset) =>
                updatePreferences({ outlineOffset }))}
          />
        </div>
      </label>

      <label class="settings-field">
        <span class="settings-field-copy">
          <span class="settings-field-label">Corner shape</span>
          <span class="settings-field-helper"
            >Squares off or rounds the highlight corners.</span
          >
        </span>
        <div class="settings-range-input">
          <input
            data-target-id="settings-radius"
            type="range"
            min="0"
            max="16"
            step="1"
            value={preferences.radius}
            oninput={(event) =>
              updateFiniteNumber(event.currentTarget.value, (radius) =>
                updatePreferences({ radius }))}
          />
          <input
            data-target-id="settings-radius-value"
            type="number"
            min="0"
            max="16"
            step="1"
            inputmode="decimal"
            value={preferences.radius}
            oninput={(event) =>
              updateFiniteNumber(event.currentTarget.value, (radius) =>
                updatePreferences({ radius }))}
            onchange={(event) =>
              updateFiniteNumber(event.currentTarget.value, (radius) =>
                updatePreferences({ radius }))}
          />
        </div>
      </label>

      <label class="settings-field">
        <span class="settings-field-copy">
          <span class="settings-field-label">Halo</span>
          <span class="settings-field-helper"
            >Adjust the soft glow around the highlight border.</span
          >
        </span>
        <div class="settings-range-input">
          <input
            data-target-id="settings-glow"
            type="range"
            min="0"
            max="8"
            step="0.5"
            value={preferences.glow}
            oninput={(event) =>
              updateFiniteNumber(event.currentTarget.value, (glow) =>
                updatePreferences({ glow }))}
          />
          <input
            data-target-id="settings-glow-value"
            type="number"
            min="0"
            max="8"
            step="0.5"
            inputmode="decimal"
            value={preferences.glow}
            oninput={(event) =>
              updateFiniteNumber(event.currentTarget.value, (glow) =>
                updatePreferences({ glow }))}
            onchange={(event) =>
              updateFiniteNumber(event.currentTarget.value, (glow) =>
                updatePreferences({ glow }))}
          />
        </div>
      </label>
        </section>
      </div>

      <div
        class="settings-category-panel"
        data-settings-panel="playback"
        id="reader-settings-playback-panel"
        hidden={activeCategory !== 'playback'}
        aria-label="Playback settings"
      >
        <h3 class="settings-panel-title">Playback</h3>
        <section class="settings-section">
          <h4 class="settings-section-title">Motion</h4>
          <label class="settings-field mod-control-row">
            <span class="settings-field-label">Reduced motion</span>
            <select value={preferences.reducedMotion} onchange={(event) => {
              const value = event.currentTarget.value
              if (value === 'automatic' || value === 'on' || value === 'off') updatePreferences({ reducedMotion: value })
            }}>
              <option value="automatic">Use device setting</option>
              <option value="on">On</option>
              <option value="off">Off</option>
            </select>
          </label>
          <p>Instant highlights without glow. Smooth scrolling and audio timing stay the same.</p>
        </section>
        <section class="settings-section">
          <h4 class="settings-section-title">Audio</h4>
          <label class="settings-field mod-control-row">
            <span class="settings-field-label">Ba'al Koreh</span>
            <select
              data-target-id="settings-narrator"
              value={preferences.narratorId}
              onchange={(event) =>
                updatePreferences({ narratorId: event.currentTarget.value })}
            >
              {#each narrators as narrator (narrator.id)}
                <option value={narrator.id}>{narrator.displayName}</option>
              {/each}
            </select>
          </label>

          <label class="settings-field mod-control-row">
            <span class="settings-field-label">Playback speed</span>
            <div class="settings-playback-stepper">
              <button
                type="button"
                aria-label="Decrease playback speed"
                disabled={preferences.playbackRate <= 0.5}
                onclick={() => adjustPlaybackRate(-0.05)}
              >
                <UiIcon name="minus" />
              </button>
              <input
                data-target-id="settings-playback-rate"
                type="number"
                min="0.5"
                max="3"
                step="0.05"
                inputmode="decimal"
                aria-label="Playback speed"
                value={Number(preferences.playbackRate.toFixed(2))}
                onchange={(event) => applyPlaybackRate(event.currentTarget.value)}
                onblur={(event) => applyPlaybackRate(event.currentTarget.value)}
              />
              <span aria-hidden="true">x</span>
              <button
                type="button"
                aria-label="Increase playback speed"
                disabled={preferences.playbackRate >= 3}
                onclick={() => adjustPlaybackRate(0.05)}
              >
                <UiIcon name="plus" />
              </button>
            </div>
          </label>
        </section>

        <section class="settings-section">
          <h4 class="settings-section-title">Behavior</h4>
          <label class="settings-field mod-checkbox">
            <input
              data-target-id="settings-auto-scroll"
              type="checkbox"
              checked={preferences.autoScrollWithPlayback}
              onchange={(event) =>
                updatePreferences({
                  autoScrollWithPlayback: event.currentTarget.checked,
                })}
            />
            <span class="settings-field-copy">
              <span class="settings-field-label">Auto-scroll with playback</span>
              <span class="settings-field-helper"
                >Keeps the current word in view while audio plays.</span
              >
            </span>
          </label>
        </section>
      </div>

      <div
        class="settings-category-panel mod-continuation"
        hidden={activeCategory !== 'more'}
        aria-label="Support settings"
      >
        <section class="settings-section">
      <h4 class="settings-section-title">Support</h4>
      <div class="settings-field">
        <span class="settings-field-copy">
          <span class="settings-field-label">Diagnostic report</span>
          <span class="settings-field-helper"
            >Includes this build, coarse browser details, and recent error
            categories. It stays in memory until you choose to copy or
            download it.</span
          >
        </span>
        <SupportDiagnosticsActions variant="reader" />
      </div>
        </section>
      </div>
    </form>
  </div>
</div>
