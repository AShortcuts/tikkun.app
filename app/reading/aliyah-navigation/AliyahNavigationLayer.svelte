<script lang="ts">
  import { audioButtonState } from '../audio-button-state.ts'
  import { flushSync, onMount } from 'svelte'
  import { SvelteSet } from 'svelte/reactivity'
  import UiIcon from '../../components/UiIcon.svelte'
  import {
    ALIYAH_RAIL_AUTO_HIDE_MS,
    aliyahCueAuthoringActionLabel,
    aliyahCueStatusLabel,
    isAliyahCueStatusUnfinished,
    type AliyahCueStatus,
    type AliyahNavigationLayer,
    type AliyahNavigationLayerComponentProps,
    type AliyahNavigationContent,
    type AliyahRailVisibility,
  } from './aliyah-navigation.ts'
  import {
    aliyahNavigationItemResourceKey,
    isSameAliyahNavigationTarget,
    type AliyahNavigationItem,
    type AliyahNavigationPlayback,
    type AliyahNavigationSnapshot,
    type AliyahNavigationTarget,
  } from './model.ts'

  let {
    document: ownerDocument,
    signal,
    toolbar,
    onSelect,
    onPlayCompact,
    onBeforeCompactOpen,
    onAfterNavigate,
    onWideHidden,
    restoreFocus,
    getReaderFocusTarget,
    loadCueStatus,
    onCueStatusChange,
    loadDurationLabel,
    onCueStatusError,
    onDurationError,
    getCompactToggle,
    onCompactOpenChange,
    connect,
  }: AliyahNavigationLayerComponentProps = $props()

  function getAttachedWindow() {
    const attachedWindow = ownerDocument.defaultView
    if (!attachedWindow) {
      throw new Error(
        'Aliyah Navigation requires an attached browser document'
      )
    }
    return attachedWindow
  }
  const view = getAttachedWindow()

  const idlePlayback: AliyahNavigationPlayback = {
    target: null,
    playing: false,
    progressLabel: '',
  }

  let desktopSnapshot = $state<AliyahNavigationSnapshot | null>(null)
  let compactSnapshot = $state<AliyahNavigationSnapshot | null>(null)
  let railVisibility = $state<AliyahRailVisibility>('hidden')
  let compactAvailable = $state(false)
  let authoringEnabled = $state(false)
  let pickerOpen = $state(false)
  let pickerClosing = $state(false)
  let revision = $state(0)
  let cueStatuses = $state<Record<string, AliyahCueStatus>>({})
  let durationLabels = $state<Record<string, string>>({})

  let railElement: HTMLElement
  let pickerElement: HTMLElement
  let closeButton: HTMLButtonElement
  let hideTimer: number | null = null
  let focusSyncTimer: number | null = null
  let closeTimer: number | null = null
  let focusFrame = 0
  let returnFocus: HTMLElement | null = null
  let pointerInside = false
  let focusInside = false
  let destroyed = false
  let playAction = 0

  const pendingCueStatuses = new SvelteSet<string>()
  const pendingDurations = new SvelteSet<string>()

  function cloneSnapshot(snapshot: AliyahNavigationSnapshot | null) {
    return snapshot
      ? {
          ...snapshot,
          items: [...snapshot.items],
          playback: { ...snapshot.playback },
        }
      : null
  }

  function requestKey(item: AliyahNavigationItem, requestRevision = revision) {
    return `${requestRevision}:${authoringEnabled}:${aliyahNavigationItemResourceKey(item)}`
  }

  function isCurrentItem(
    key: string,
    compactOnly = false
  ) {
    const snapshots = compactOnly ? [compactSnapshot] : [desktopSnapshot, compactSnapshot]
    return snapshots.some((snapshot) =>
      snapshot?.items.some((candidate) => requestKey(candidate) === key)
    )
  }

  function queueCueStatusLoads(
    snapshot: AliyahNavigationSnapshot,
    requestRevision = revision
  ) {
    for (const item of snapshot.items) {
      const key = requestKey(item, requestRevision)
      if (cueStatuses[key] !== undefined || pendingCueStatuses.has(key)) {
        continue
      }
      pendingCueStatuses.add(key)
      void loadCueStatus(item)
        .then((status) => {
          pendingCueStatuses.delete(key)
          if (
            destroyed ||
            signal.aborted ||
            !isCurrentItem(key)
          ) {
            return
          }
          flushSync(() => {
            cueStatuses = { ...cueStatuses, [key]: status }
          })
          onCueStatusChange(item, status)
        })
        .catch((error) => {
          pendingCueStatuses.delete(key)
          if (destroyed || signal.aborted || !isCurrentItem(key)) return
          onCueStatusError(error, item)
        })
    }
  }

  function queueDurationLoads(
    snapshot: AliyahNavigationSnapshot,
    requestRevision = revision
  ) {
    for (const item of snapshot.items) {
      if (!item.audioKey) continue
      const key = requestKey(item, requestRevision)
      if (durationLabels[key] !== undefined || pendingDurations.has(key)) {
        continue
      }
      pendingDurations.add(key)
      void loadDurationLabel(item)
        .then((durationLabel) => {
          pendingDurations.delete(key)
          if (
            destroyed ||
            signal.aborted ||
            !isCurrentItem(key, true)
          ) {
            return
          }
          flushSync(() => {
            durationLabels = {
              ...durationLabels,
              [key]: durationLabel,
            }
          })
        })
        .catch((error) => {
          pendingDurations.delete(key)
          if (destroyed || signal.aborted || !isCurrentItem(key, true)) return
          onDurationError(error, item)
          flushSync(() => {
            durationLabels = { ...durationLabels, [key]: 'Available' }
          })
        })
    }
  }

  function syncRailPosition() {
    ownerDocument.documentElement.style.setProperty(
      '--aliyah-rail-top',
      `${toolbar.getBoundingClientRect().bottom}px`
    )
  }

  function applyRailVisibility() {
    const hidden = railVisibility === 'hidden'
    ownerDocument.documentElement.dataset.aliyahRailVisibility =
      railVisibility
    if (hidden) onWideHidden()
  }

  function clearHideTimer() {
    if (hideTimer === null) return
    view.clearTimeout(hideTimer)
    hideTimer = null
  }

  function setRailVisibility(visibility: AliyahRailVisibility) {
    flushSync(() => {
      railVisibility = visibility
    })
    applyRailVisibility()
  }

  function hideWide() {
    clearHideTimer()
    setRailVisibility('hidden')
  }

  function scheduleWideHide(delayMs = ALIYAH_RAIL_AUTO_HIDE_MS) {
    clearHideTimer()
    hideTimer = view.setTimeout(() => {
      hideTimer = null
      if (pointerInside || focusInside) return
      hideWide()
    }, delayMs)
  }

  function revealWide(
    visibility: Exclude<AliyahRailVisibility, 'hidden'> = 'peek',
    { autoHideMs = ALIYAH_RAIL_AUTO_HIDE_MS }: {
      autoHideMs?: number
    } = {}
  ) {
    if (!desktopSnapshot) return
    syncRailPosition()
    setRailVisibility(visibility)
    if (visibility === 'expanded') clearHideTimer()
    else scheduleWideHide(autoHideMs)
  }

  function syncContent(content: AliyahNavigationContent) {
    flushSync(() => {
      desktopSnapshot = cloneSnapshot(content.desktop)
      compactSnapshot = cloneSnapshot(content.compact)
      authoringEnabled = content.authoringEnabled
    })

    if (desktopSnapshot) {
      syncRailPosition()
      applyRailVisibility()
      queueCueStatusLoads(desktopSnapshot)
    } else {
      hideWide()
    }
    if (compactSnapshot) {
      queueCueStatusLoads(compactSnapshot)
      queueDurationLoads(compactSnapshot)
    }
    else closeCompact()
  }

  function clearContent() {
    playAction += 1
    closeCompact()
    flushSync(() => {
      desktopSnapshot = null
      compactSnapshot = null
      authoringEnabled = false
      revision += 1
      cueStatuses = {}
      durationLabels = {}
    })
    pendingCueStatuses.clear()
    pendingDurations.clear()
    hideWide()
  }

  function invalidate() {
    flushSync(() => {
      revision += 1
      cueStatuses = {}
      durationLabels = {}
    })
    pendingCueStatuses.clear()
    pendingDurations.clear()
    if (desktopSnapshot) queueCueStatusLoads(desktopSnapshot)
    if (compactSnapshot) {
      queueCueStatusLoads(compactSnapshot)
      queueDurationLoads(compactSnapshot)
    }
  }

  function setActive(target: AliyahNavigationTarget | null) {
    flushSync(() => {
      if (desktopSnapshot) {
        desktopSnapshot = { ...desktopSnapshot, active: target }
      }
      if (compactSnapshot) {
        compactSnapshot = { ...compactSnapshot, active: target }
      }
    })
  }

  function syncPlayback(playback: AliyahNavigationPlayback) {
    flushSync(() => {
      if (compactSnapshot) {
        compactSnapshot = {
          ...compactSnapshot,
          playback: { ...playback },
        }
      }
    })
  }

  function setCompactAvailable(available: boolean) {
    flushSync(() => {
      compactAvailable = available
    })
    if (!available) closeCompact()
  }

  function isCompactOpen() {
    return pickerOpen && !pickerClosing
  }

  function cancelFocusFrame() {
    if (!focusFrame) return
    view.cancelAnimationFrame(focusFrame)
    focusFrame = 0
  }

  function finishClose() {
    if (closeTimer !== null) view.clearTimeout(closeTimer)
    closeTimer = null
    flushSync(() => {
      pickerClosing = false
    })
  }

  function closeCompact({
    focusTarget,
    restoreFocus: shouldRestoreFocus = true,
  }: {
    focusTarget?: HTMLElement
    restoreFocus?: boolean
  } = {}) {
    if (!pickerOpen || pickerClosing) return

    cancelFocusFrame()
    const nextFocus =
      focusTarget ?? (shouldRestoreFocus ? returnFocus : null)
    returnFocus = null

    const reduceMotion = view.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches
    flushSync(() => {
      pickerOpen = false
      pickerClosing = !reduceMotion
    })
    onCompactOpenChange(false)
    if (nextFocus) restoreFocus(nextFocus)

    if (reduceMotion) {
      finishClose()
      return
    }
    closeTimer = view.setTimeout(finishClose, 180)
  }

  function openCompact(requestedReturnFocus?: HTMLElement) {
    if (!compactAvailable || !compactSnapshot) return
    syncPlayback(onBeforeCompactOpen())

    if (closeTimer !== null) view.clearTimeout(closeTimer)
    closeTimer = null
    cancelFocusFrame()

    const activeElement = ownerDocument.activeElement
    const activeHtmlElement =
      activeElement instanceof view.HTMLElement &&
      activeElement !== ownerDocument.body
        ? activeElement
        : null
    returnFocus =
      requestedReturnFocus ??
      activeHtmlElement ??
      getCompactToggle() ??
      closeButton

    flushSync(() => {
      pickerClosing = false
      pickerOpen = true
    })
    onCompactOpenChange(true)

    focusFrame = view.requestAnimationFrame(() => {
      focusFrame = 0
      if (destroyed || signal.aborted || !pickerOpen) return
      const currentCard = pickerElement.querySelector<HTMLButtonElement>(
        '.mobile-aliyah-card.is-current .mobile-aliyah-card-main'
      )
      ;(currentCard ?? closeButton).focus()
    })
  }

  function cueStatus(item: AliyahNavigationItem) {
    return cueStatuses[requestKey(item)] ?? 'none'
  }

  function resolvedCueStatus(item: AliyahNavigationItem) {
    const key = requestKey(item)
    return Object.prototype.hasOwnProperty.call(cueStatuses, key)
      ? cueStatuses[key] ?? null
      : null
  }

  function itemCueNeedsWork(item: AliyahNavigationItem) {
    if (item.audioState) return item.audioState.problem === 'incomplete-cues'
    const status = resolvedCueStatus(item)
    return Boolean(
      item.recordingKey && status && isAliyahCueStatusUnfinished(status)
    )
  }

  function itemAppearance(item: AliyahNavigationItem) {
    return audioButtonState({ state: item.audioState, available: Boolean(item.audioKey),
      cueIncomplete: itemCueNeedsWork(item), adminMissing: authoringEnabled && !item.recordingKey,
      playing: isPlaying(compactPlayback(), item.target) })
  }

  function durationLabel(item: AliyahNavigationItem) {
    if (item.audioState?.message && !authoringEnabled) {
      if (!item.audioState.canPlay) {
        if (item.audioState.problem === 'missing-audio') return 'Audio unavailable'
        if (item.audioState.problem === 'timing-needed') return 'Timing cues needed'
      }
      return item.audioState.message
    }
    if (authoringEnabled && !item.recordingKey) {
      return 'Record audio + cues'
    }
    if (!item.audioKey) return 'Audio unavailable'
    return durationLabels[requestKey(item)] ?? 'Loading…'
  }

  function isPlaybackTarget(
    playback: AliyahNavigationPlayback,
    target: AliyahNavigationTarget
  ) {
    return isSameAliyahNavigationTarget(playback.target, target)
  }

  function isPlaying(
    playback: AliyahNavigationPlayback,
    target: AliyahNavigationTarget
  ) {
    return playback.playing && isPlaybackTarget(playback, target)
  }

  function compactPlayback() {
    return compactSnapshot?.playback ?? idlePlayback
  }

  function itemStatus(
    item: AliyahNavigationItem,
    playback: AliyahNavigationPlayback
  ) {
    if (isPlaying(playback, item.target)) {
      return `Playing · ${playback.progressLabel}`
    }
    if (isPlaybackTarget(playback, item.target)) {
      return `Paused · ${playback.progressLabel}`
    }
    return durationLabel(item)
  }

  function compactPlayLabel(
    item: AliyahNavigationItem,
    playback: AliyahNavigationPlayback
  ) {
    if (authoringEnabled && !item.recordingKey) {
      return `Select ${item.label} for audio and cue recording`
    }
    const status = resolvedCueStatus(item)
    if (authoringEnabled && itemCueNeedsWork(item) && status) {
      return aliyahCueAuthoringActionLabel({
        label: item.label,
        status,
        playing: isPlaying(playback, item.target),
      })
    }
    return `${isPlaying(playback, item.target) ? 'Pause' : 'Play'} ${item.label}${item.audioState?.message ? ` — ${item.audioState.message}` : ''}`
  }

  function segmentLabel(
    item: AliyahNavigationItem,
    playback: AliyahNavigationPlayback
  ) {
    return isPlaying(playback, item.target)
      ? `${item.label} is playing. Go to aliyah.`
      : `Go to ${item.label}`
  }

  function selectWideItem(target: AliyahNavigationTarget) {
    onSelect(target)
    revealWide('expanded')
    scheduleWideHide()
  }

  function selectCompactSegment(target: AliyahNavigationTarget) {
    setActive(target)
    onSelect(target)
    onAfterNavigate()
  }

  function selectCompactCard(target: AliyahNavigationTarget) {
    closeCompact()
    setActive(target)
    onSelect(target)
    onAfterNavigate()
  }

  async function playCompactItem(target: AliyahNavigationTarget) {
    const item = compactSnapshot?.items.find(item => isSameAliyahNavigationTarget(item.target, target))
    if (!item || itemAppearance(item).actionDisabled) return
    setActive(target)
    closeCompact({ focusTarget: getReaderFocusTarget() })
    const action = ++playAction
    const playback = await onPlayCompact(target)
    if (destroyed || signal.aborted || action !== playAction) return
    syncPlayback(playback)
  }

  function handleRailPointerEnter() {
    pointerInside = true
    revealWide('expanded')
  }

  function handleRailPointerLeave() {
    pointerInside = false
    scheduleWideHide()
  }

  function handleRailFocusIn() {
    focusInside = true
    revealWide('expanded')
  }

  function handleRailFocusOut() {
    if (focusSyncTimer !== null) view.clearTimeout(focusSyncTimer)
    focusSyncTimer = view.setTimeout(() => {
      focusSyncTimer = null
      focusInside = ownerDocument.activeElement
        ? railElement.contains(ownerDocument.activeElement)
        : false
      if (!focusInside) scheduleWideHide()
    }, 0)
  }

  function handlePickerKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeCompact()
      return
    }
    if (event.key !== 'Tab') return

    const focusable = [
      ...pickerElement.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])'
      ),
    ].filter((element) => element.offsetParent !== null)
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (!first || !last) return
    if (event.shiftKey && ownerDocument.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (
      !event.shiftKey &&
      ownerDocument.activeElement === last
    ) {
      event.preventDefault()
      first.focus()
    }
  }

  const layer: AliyahNavigationLayer = {
    syncContent,
    clearContent,
    invalidate,
    setActive,
    syncPlayback,
    setCompactAvailable,
    revealWide,
    revealWideForMovement: () => revealWide('peek'),
    scheduleWideHide,
    openCompact,
    closeCompact,
    isCompactOpen,
  }

  onMount(() => {
    connect(layer)
    view.addEventListener('resize', syncRailPosition)
    view.visualViewport?.addEventListener('resize', syncRailPosition)

    return () => {
      destroyed = true
      playAction += 1
      clearHideTimer()
      if (focusSyncTimer !== null) view.clearTimeout(focusSyncTimer)
      if (closeTimer !== null) view.clearTimeout(closeTimer)
      focusSyncTimer = null
      closeTimer = null
      cancelFocusFrame()
      returnFocus = null
      pointerInside = false
      focusInside = false
      pendingCueStatuses.clear()
      pendingDurations.clear()
      onCompactOpenChange(false)
      onWideHidden()
      ownerDocument.documentElement.style.removeProperty('--aliyah-rail-top')
      delete ownerDocument.documentElement.dataset.aliyahRailVisibility
      view.removeEventListener('resize', syncRailPosition)
      view.visualViewport?.removeEventListener('resize', syncRailPosition)
    }
  })
</script>

<nav
  class="mobile-aliyah-segments"
  class:u-hidden={!compactSnapshot}
  data-target-id="mobile-aliyah-segments"
  aria-label="Aliyah navigation"
>
  {#each compactSnapshot?.items.slice(0, 7) ?? [] as item (item.key)}
    <button
      class="mobile-aliyah-segment"
      class:is-current={isSameAliyahNavigationTarget(
        compactSnapshot?.active,
        item.target
      )}
      class:is-playing={isPlaying(
        compactPlayback(),
        item.target
      )}
      data-run-id={item.target.runId}
      data-aliyah-index={item.target.aliyahIndex}
      data-aliyah-label={item.label}
      type="button"
      title={segmentLabel(
        item,
        compactPlayback()
      )}
      aria-label={segmentLabel(
        item,
        compactPlayback()
      )}
      aria-current={isSameAliyahNavigationTarget(
        compactSnapshot?.active,
        item.target
      )
        ? 'location'
        : undefined}
      onclick={() => selectCompactSegment(item.target)}
    ></button>
  {/each}
</nav>

<nav
  bind:this={railElement}
  class="aliyah-rail"
  class:u-hidden={!desktopSnapshot}
  class:is-peeking={railVisibility === 'peek'}
  class:is-expanded={railVisibility === 'expanded'}
  data-target-id="aliyah-rail"
  data-visibility={railVisibility}
  aria-label="Aliyah navigation"
  aria-hidden={railVisibility === 'hidden'}
  inert={railVisibility === 'hidden'}
  onpointerenter={handleRailPointerEnter}
  onpointerleave={handleRailPointerLeave}
  onfocusin={handleRailFocusIn}
  onfocusout={handleRailFocusOut}
>
  {#if desktopSnapshot}
    <span class="aliyah-rail-caption" aria-hidden="true">Aliyah</span>
    {#each desktopSnapshot.items as item (item.key)}
      <button
        class="aliyah-rail-button"
        class:is-active={isSameAliyahNavigationTarget(
          desktopSnapshot.active,
          item.target
        )}
        data-run-id={item.target.runId}
        data-aliyah-index={item.target.aliyahIndex}
        data-navigation-key={item.key}
      data-cue-status={cueStatus(item)}
      type="button"
      title={`${item.label} · ${aliyahCueStatusLabel(cueStatus(item))}`}
      aria-current={isSameAliyahNavigationTarget(
        desktopSnapshot.active,
        item.target
      )
        ? 'location'
        : undefined}
      onclick={() => selectWideItem(item.target)}
      >
        {item.compactLabel}
      </button>
    {/each}
  {/if}
</nav>

<div
  bind:this={pickerElement}
  class="mobile-aliyah-picker"
  class:u-hidden={!pickerOpen && !pickerClosing}
  class:is-closing={pickerClosing}
  data-target-id="mobile-aliyah-picker"
  id="mobile-aliyah-picker"
  aria-hidden={!pickerOpen}
  inert={!pickerOpen}
  onkeydown={handlePickerKeydown}
>
  <button
    class="mobile-aliyah-picker-backdrop"
    data-target-id="mobile-aliyah-picker-backdrop"
    type="button"
    aria-label="Close aliyah picker"
    tabindex="-1"
    onclick={() => closeCompact()}
  ></button>
  <div
    class="mobile-aliyah-sheet"
    role="dialog"
    aria-modal="true"
    aria-labelledby="mobile-aliyah-picker-title"
  >
    <button
      class="mobile-aliyah-sheet-handle"
      data-target-id="mobile-aliyah-sheet-handle"
      type="button"
      aria-label="Close aliyah picker"
      onclick={() => closeCompact()}
    ></button>
    <header class="mobile-aliyah-sheet-header">
      <div class="mobile-aliyah-sheet-copy">
        <h2 id="mobile-aliyah-picker-title">Choose an aliyah</h2>
        <p>Tap a name to navigate, or play its recording.</p>
      </div>
      <button
        bind:this={closeButton}
        class="mobile-aliyah-sheet-close"
        data-target-id="mobile-aliyah-picker-close"
        type="button"
        aria-label="Close aliyah picker"
        onclick={() => closeCompact()}
      >
        <UiIcon name="x" />
      </button>
    </header>
    <div class="mobile-aliyah-grid" data-target-id="mobile-aliyah-grid">
      {#each compactSnapshot?.items ?? [] as item (item.key)}
        <article
          class="mobile-aliyah-card"
          class:is-current={isSameAliyahNavigationTarget(
            compactSnapshot?.active,
            item.target
          )}
          class:is-unavailable={!item.audioKey && !authoringEnabled}
          class:is-authoring-missing={authoringEnabled && !item.recordingKey}
          class:is-playing={isPlaying(
            compactPlayback(),
            item.target
          )}
          data-run-id={item.target.runId}
          data-aliyah-index={item.target.aliyahIndex}
        >
          <button
            class="mobile-aliyah-card-main"
            data-run-id={item.target.runId}
            data-aliyah-index={item.target.aliyahIndex}
            type="button"
            aria-label={`Go to ${item.label}`}
            aria-current={isSameAliyahNavigationTarget(
              compactSnapshot?.active,
              item.target
            )
              ? 'location'
              : undefined}
            onclick={() => selectCompactCard(item.target)}
          >
            <span class="mobile-aliyah-card-label">{item.label}</span>
            <span
              class="mobile-aliyah-card-status"
              data-audio-key={item.audioKey ?? ''}
              data-duration-label={durationLabel(item)}
              title={itemStatus(
                item,
                compactPlayback()
              )}
            >
              {itemStatus(
                item,
                compactPlayback()
              )}
            </span>
          </button>
          {#if item.target}
            <button
              class="mobile-aliyah-play"
              class:is-missing-audio={authoringEnabled && !item.recordingKey}
              class:is-cue-incomplete={itemCueNeedsWork(item)}
              data-audio-problem={item.audioState?.problem ?? ''}
              data-audio-tone={itemAppearance(item).tone}
              data-audio-dimmed={itemAppearance(item).dimmed}
              data-audio-tooltip={itemAppearance(item).tooltip}
              data-run-id={item.target.runId}
              data-aliyah-index={item.target.aliyahIndex}
              type="button"
              aria-disabled={itemAppearance(item).actionDisabled}
              aria-label={compactPlayLabel(item, compactPlayback())}
              aria-pressed={isPlaying(compactPlayback(), item.target)}
              onclick={() => playCompactItem(item.target)}
            >
              <UiIcon
                name={isPlaying(
                  compactPlayback(),
                  item.target
                )
                  ? 'pause'
                  : 'play'}
              />
            </button>
          {/if}
        </article>
      {/each}
    </div>
  </div>
</div>
