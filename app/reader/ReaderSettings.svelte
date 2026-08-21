<script lang="ts">
  import { flushSync, onMount } from 'svelte'
  import UiIcon from '../components/UiIcon.svelte'
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

  const customThemePresets = [
    { label: 'Parchment', background: '#eee6d6', text: '#3b3026' },
    { label: 'Paper', background: '#fcfcfd', text: '#191c22' },
    { label: 'Night', background: '#191c22', text: '#f8f7f3' },
  ] as const

  const customBackgroundHsl = $derived(
    hexToHsl(preferences.customBackgroundColor)
  )
  const customTextHsl = $derived(hexToHsl(preferences.customTextColor))
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

  const offlineStatusText = $derived.by(() => {
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
        return 'Offline recording downloads are not available in this browser.'
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
        return `${offlineRecordingSnapshot.storedCount} offline recording ${copies} ${formatByteCount(offlineRecordingSnapshot.storedBytes)} in this browser. Start an aliyah to manage one recording.`
      }
      return 'Start an aliyah to choose a recording.'
    }
    if (phase === 'unavailable') {
      return (
        errorMessage ??
        'Offline recording downloads are not available in this browser.'
      )
    }
    if (phase === 'checking') {
      return `Checking ${recordingTitle ?? 'the current recording'}…`
    }
    if (phase === 'downloading') {
      return `Saving ${recordingTitle ?? 'the current recording'} for offline playback.`
    }
    if (phase === 'complete') {
      return `${recordingTitle ?? 'This recording'} is available offline in this browser.`
    }
    if (phase === 'removing') {
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
          ? 'Removing recording…'
          : offlineRecordingSnapshot.exactStored
            ? 'Remove offline recording'
          : offlineRecordingSnapshot.phase === 'error'
            ? 'Try recording download again'
            : 'Download current recording'
  )

  const otherOfflineRecordingStatusText = $derived.by(() => {
    const { otherCount, otherBytes } = offlineRecordingSnapshot
    const copies = otherCount === 1 ? 'copy' : 'copies'
    return `${otherCount} other offline recording ${copies} use ${formatByteCount(otherBytes)} in this browser.`
  })

  function toggleOfflineRecording() {
    const expectedRecordingId = offlineRecordingSnapshot.recordingId
    if (offlineRecordingSnapshot.exactStored) {
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
    channel: 'hue' | 'tone',
    rawValue: string
  ) {
    const value = Number.parseFloat(rawValue)
    if (!Number.isFinite(value)) return
    const current = target === 'background'
      ? customBackgroundHsl
      : customTextHsl
    const hue = channel === 'hue' ? value : current.hue
    const saturation = channel === 'hue'
      ? Math.max(current.saturation, target === 'background' ? 18 : 24)
      : current.saturation
    const lightness = channel === 'tone' ? value : current.lightness
    const color = hslToHex(hue, saturation, lightness)
    previewCustomTheme(
      target === 'background'
        ? { customBackgroundColor: color }
        : { customTextColor: color }
    )
  }

  function applyCustomThemePreset(background: string, text: string) {
    updatePreferences({
      themeMode: 'custom',
      customBackgroundColor: background,
      customTextColor: text,
    })
  }

  function hueGradient(color: { saturation: number; lightness: number }) {
    const saturation = Math.max(color.saturation, 18)
    return `linear-gradient(to right, hsl(0 ${saturation}% ${color.lightness}%), hsl(60 ${saturation}% ${color.lightness}%), hsl(120 ${saturation}% ${color.lightness}%), hsl(180 ${saturation}% ${color.lightness}%), hsl(240 ${saturation}% ${color.lightness}%), hsl(300 ${saturation}% ${color.lightness}%), hsl(360 ${saturation}% ${color.lightness}%))`
  }

  function toneGradient(color: { hue: number; saturation: number }) {
    return `linear-gradient(to right, #050505, hsl(${color.hue} ${color.saturation}% 50%), #fafafa)`
  }

  function hexToHsl(color: string) {
    const channels = [1, 3, 5].map(
      (offset) => Number.parseInt(color.slice(offset, offset + 2), 16) / 255
    )
    const [red, green, blue] = channels
    const maximum = Math.max(red, green, blue)
    const minimum = Math.min(red, green, blue)
    const delta = maximum - minimum
    const lightness = (maximum + minimum) / 2
    let hue = 0
    if (delta) {
      if (maximum === red) hue = ((green - blue) / delta) % 6
      else if (maximum === green) hue = (blue - red) / delta + 2
      else hue = (red - green) / delta + 4
      hue = (hue * 60 + 360) % 360
    }
    const saturation = delta
      ? delta / (1 - Math.abs(2 * lightness - 1))
      : 0
    return {
      hue: Math.round(hue),
      saturation: Math.round(saturation * 100),
      lightness: Math.round(lightness * 100),
    }
  }

  function hslToHex(hue: number, saturation: number, lightness: number) {
    const normalizedHue = ((hue % 360) + 360) % 360
    const normalizedSaturation = Math.max(0, Math.min(100, saturation)) / 100
    const normalizedLightness = Math.max(0, Math.min(100, lightness)) / 100
    const chroma =
      (1 - Math.abs(2 * normalizedLightness - 1)) * normalizedSaturation
    const segment = normalizedHue / 60
    const secondary = chroma * (1 - Math.abs((segment % 2) - 1))
    const [red, green, blue] = segment < 1
      ? [chroma, secondary, 0]
      : segment < 2
        ? [secondary, chroma, 0]
        : segment < 3
          ? [0, chroma, secondary]
          : segment < 4
            ? [0, secondary, chroma]
            : segment < 5
              ? [secondary, 0, chroma]
              : [chroma, 0, secondary]
    const match = normalizedLightness - chroma / 2
    return `#${[red, green, blue]
      .map((channel) => Math.round((channel + match) * 255)
        .toString(16)
        .padStart(2, '0'))
      .join('')}`
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

    return () => {
      unsubscribeOffline()
      unsubscribeOfflineRecording()
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
  class="settings-pane"
  class:u-hidden={!isOpen}
  data-target-id="settings-pane"
  id="reader-settings-pane"
  role="dialog"
  aria-labelledby="reader-settings-title"
  aria-hidden={!isOpen}
>
  <div class="settings-pane-header">
    <h2 id="reader-settings-title">Reader Settings</h2>
    <div class="settings-pane-header-actions">
      <button
        class="toolbar-button mod-icon-label"
        type="button"
        data-target-id="settings-reset-highlight"
        aria-label="Reset highlight settings"
        title="Reset highlight settings"
        onclick={() => updatePreferences(getDefaultHighlightPreferences())}
      >
        <UiIcon name="replay" />
      </button>
      <button
        bind:this={closeButton}
        class="toolbar-button mod-icon-label"
        type="button"
        data-target-id="settings-close"
        aria-label="Close reader settings"
        title="Close reader settings"
        onclick={() => close()}
      >
        <UiIcon name="x" />
      </button>
    </div>
  </div>

  <form class="settings-form" data-target-id="settings-form">
    <section class="settings-section">
      <h3 class="settings-section-title">Reading</h3>
      <label class="settings-field">
        <span class="settings-field-copy">
          <span class="settings-field-label">Ba'al Koreh</span>
          <span class="settings-field-helper"
            >Chooses whose recording the play buttons use.</span
          >
        </span>
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

      <label class="settings-field mod-inline-compact">
        <span class="settings-field-copy">
          <span class="settings-field-label">Playback speed</span>
          <span class="settings-field-helper"
            >Makes the recording play slower or faster.</span
          >
        </span>
        <div class="settings-number-input">
          <input
            data-target-id="settings-playback-rate"
            type="number"
            min="0.5"
            max="3"
            step="0.05"
            inputmode="decimal"
            value={Number(preferences.playbackRate.toFixed(2))}
            onchange={(event) => applyPlaybackRate(event.currentTarget.value)}
            onblur={(event) => applyPlaybackRate(event.currentTarget.value)}
          />
          <span>x</span>
        </div>
      </label>
    </section>

    <section class="settings-section">
      <h3 class="settings-section-title">Offline</h3>
      <div class="settings-field settings-offline-field">
        <span class="settings-field-copy">
          <span class="settings-field-label">Torah pages</span>
          <span class="settings-field-helper"
            >Saves every Torah page in this browser. Recordings are downloaded
            separately below.</span
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
        <button
          class="settings-offline-button"
          type="button"
          data-target-id="settings-offline-download"
          aria-describedby="settings-offline-status"
          disabled={offlineSnapshot.phase === 'checking' ||
            offlineSnapshot.phase === 'downloading' ||
            offlineSnapshot.phase === 'complete' ||
            offlineSnapshot.phase === 'unavailable'}
          onclick={() => void offlineTorah.download()}
        >{offlineButtonLabel}</button>
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

    <section class="settings-section">
      <h3 class="settings-section-title">Page Look</h3>
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
            <span>Aa</span>
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
            <span>Aa</span>
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
            <span>Aa</span>
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
            <span>Aa</span>
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
            <span>Aa</span>
            <small>Custom</small>
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

            <div class="settings-custom-color">
              <div class="settings-custom-color-heading">
                <span>Background</span>
                <output>{preferences.customBackgroundColor.toUpperCase()}</output>
              </div>
              <label>
                <span class="u-visually-hidden">Background hue</span>
                <input
                  type="range"
                  data-target-id="settings-custom-background-hue"
                  min="0"
                  max="360"
                  step="1"
                  value={customBackgroundHsl.hue}
                  aria-label="Background hue"
                  style={`--settings-slider-gradient: ${hueGradient(customBackgroundHsl)}`}
                  oninput={(event) =>
                    updateCustomColor('background', 'hue', event.currentTarget.value)}
                  onchange={commitCustomThemeUpdates}
                />
              </label>
              <label class="settings-custom-tone">
                <span>Tone</span>
                <input
                  type="range"
                  data-target-id="settings-custom-background-tone"
                  min="0"
                  max="100"
                  step="1"
                  value={customBackgroundHsl.lightness}
                  aria-label="Background tone"
                  style={`--settings-slider-gradient: ${toneGradient(customBackgroundHsl)}`}
                  oninput={(event) =>
                    updateCustomColor('background', 'tone', event.currentTarget.value)}
                  onchange={commitCustomThemeUpdates}
                />
              </label>
            </div>

            <div class="settings-custom-color">
              <div class="settings-custom-color-heading">
                <span>Text</span>
                <output>{preferences.customTextColor.toUpperCase()}</output>
              </div>
              <label>
                <span class="u-visually-hidden">Text hue</span>
                <input
                  type="range"
                  data-target-id="settings-custom-text-hue"
                  min="0"
                  max="360"
                  step="1"
                  value={customTextHsl.hue}
                  aria-label="Text hue"
                  style={`--settings-slider-gradient: ${hueGradient(customTextHsl)}`}
                  oninput={(event) =>
                    updateCustomColor('text', 'hue', event.currentTarget.value)}
                  onchange={commitCustomThemeUpdates}
                />
              </label>
              <label class="settings-custom-tone">
                <span>Tone</span>
                <input
                  type="range"
                  data-target-id="settings-custom-text-tone"
                  min="0"
                  max="100"
                  step="1"
                  value={customTextHsl.lightness}
                  aria-label="Text tone"
                  style={`--settings-slider-gradient: ${toneGradient(customTextHsl)}`}
                  oninput={(event) =>
                    updateCustomColor('text', 'tone', event.currentTarget.value)}
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
      <h3 class="settings-section-title">Current Word</h3>
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

    <section class="settings-section">
      <h3 class="settings-section-title">Behavior</h3>
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

      <label class="settings-field mod-checkbox">
        <input
          data-target-id="settings-disable-shift-hide"
          type="checkbox"
          checked={preferences.disableShiftNekudotHide}
          onchange={(event) =>
            updatePreferences({
              disableShiftNekudotHide: event.currentTarget.checked,
            })}
        />
        <span class="settings-field-copy">
          <span class="settings-field-label"
            >Disable Shift key for Nekudot hiding</span
          >
          <span class="settings-field-helper"
            >Hold Shift to temporarily switch between nikkud and plain
            text.</span
          >
        </span>
      </label>

      <div class="settings-field">
        <span class="settings-field-copy">
          <span class="settings-field-label">Reading position</span>
          <span class="settings-field-helper"
            >Controls where the current word is centered while loading and
            auto-scrolling.</span
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
            onclick={() => updatePreferences({ focalPointMode: 'reader' })}
          >
            <span>Reader</span>
            <small>Symmetrical and original</small>
          </button>
          <button
            class="settings-segmented-option"
            class:is-active={preferences.focalPointMode === 'browser'}
            type="button"
            data-focal-point-mode="browser"
            aria-pressed={preferences.focalPointMode === 'browser'}
            onclick={() => updatePreferences({ focalPointMode: 'browser' })}
          >
            <span>Browser</span>
            <small>Pushes text higher up</small>
          </button>
        </div>
        <button
          type="button"
          class="toolbar-button mod-icon-label"
          data-target-id="debug-focal-measure-toggle">Focal Measure</button
        >
      </div>
    </section>

    <section class="settings-section">
      <h3 class="settings-section-title">Support</h3>
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
  </form>
</div>
