<script lang="ts">
  import { flushSync, onMount } from 'svelte'
  import UiIcon from '../components/UiIcon.svelte'
  import type { OfflineTorahDownloadSnapshot } from '../offline/torah-download.ts'
  import { getDefaultHighlightPreferences } from '../reader-preferences.ts'
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
  let isOpen = $state(false)
  let returnFocus: HTMLElement | null = null
  let closeButton: HTMLButtonElement
  let focusFrame = 0
  let themeTransitionTimer = 0

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

  function updatePreferences(updates: Parameters<typeof persistPreferences>[0]) {
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
    toggle.setAttribute('aria-expanded', 'true')
    cancelScheduledFocus()
    focusFrame = view.requestAnimationFrame(() => {
      focusFrame = 0
      closeButton.focus({ preventScroll: true })
    })
  }

  function close({ restoreFocus: shouldRestoreFocus = true } = {}) {
    if (!isOpen) return false
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
  }

  const settings: ReaderSettings = { open, close, sync }

  onMount(() => {
    const unsubscribeOffline = offlineTorah.subscribe((nextSnapshot) => {
      offlineSnapshot = nextSnapshot
    })
    void offlineTorah.refresh()

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
      ownerDocument.removeEventListener('pointerdown', handleOutsidePointer)
      cancelScheduledFocus()
      if (themeTransitionTimer) view.clearTimeout(themeTransitionTimer)
      themeTransitionTimer = 0
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
            >Saves every Torah page in this browser. Recordings continue to
            stream separately.</span
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
    </section>

    <section class="settings-section">
      <h3 class="settings-section-title">Page Look</h3>
      <div class="settings-field">
        <span class="settings-field-copy">
          <span class="settings-field-label">Theme</span>
          <span class="settings-field-helper"
            >Changes the page color behind the text.</span
          >
        </span>
        <div
          class="settings-segmented-control"
          data-target-id="settings-theme-mode"
        >
          <button
            class="settings-segmented-option"
            class:is-active={preferences.themeMode === 'automatic'}
            type="button"
            data-theme-mode="automatic"
            aria-pressed={preferences.themeMode === 'automatic'}
            onclick={() => updatePreferences({ themeMode: 'automatic' })}
            >System</button
          >
          <button
            class="settings-segmented-option"
            class:is-active={preferences.themeMode === 'light'}
            type="button"
            data-theme-mode="light"
            aria-pressed={preferences.themeMode === 'light'}
            onclick={() => updatePreferences({ themeMode: 'light' })}
            >Light</button
          >
          <button
            class="settings-segmented-option"
            class:is-active={preferences.themeMode === 'sepia'}
            type="button"
            data-theme-mode="sepia"
            aria-pressed={preferences.themeMode === 'sepia'}
            onclick={() => updatePreferences({ themeMode: 'sepia' })}
            >Sepia</button
          >
          <button
            class="settings-segmented-option"
            class:is-active={preferences.themeMode === 'dark'}
            type="button"
            data-theme-mode="dark"
            aria-pressed={preferences.themeMode === 'dark'}
            onclick={() => updatePreferences({ themeMode: 'dark' })}
            >Dark</button
          >
        </div>
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
  </form>
</div>
