<script lang="ts">
  import { flushSync, onMount } from 'svelte'
  import UiIcon from '../components/UiIcon.svelte'
  import type {
    FloatingPlayer,
    FloatingPlayerAction,
    FloatingPlayerComponentProps,
    FloatingPlayerPosition,
    FloatingPlayerProgress,
    FloatingPlayerRect,
    FloatingPlayerSnapshot,
  } from './floating-player.ts'

  let {
    document,
    view,
    action,
    connect,
  }: FloatingPlayerComponentProps = $props()

  let snapshot = $state<FloatingPlayerSnapshot>({
    visible: false,
    untimed: true,
    playing: false,
    expanded: false,
    compact: false,
    desktopTitle: '—',
    mobileTitle: '—',
    subtitle: 'Audio',
    mobileReading: '—',
    mode: 'No cues',
    status: '',
    playbackRate: 1,
    audioDownload: null,
    videoDownload: null,
  })
  let progress = $state<FloatingPlayerProgress>({
    audioRatio: 0,
    cueRatio: 0,
    seekValue: 0,
    seekDisabled: true,
    seekValueText: '0:00 of --:--',
    currentTime: '0:00',
    duration: '--:--',
    wordProgress: '0 / 0',
    cueProgress: 'Cue 0 / 0',
    cueProgressVisible: false,
    mobileWordProgress: 'Word 0 of 0',
    mobileWordProgressVisible: false,
  })
  let position = $state<FloatingPlayerPosition | null>(null)
  let dragging = $state(false)
  let speedPopoverOpen = $state(false)
  let playerElement: HTMLElement | null = null
  let mobileClose: HTMLButtonElement | null = null
  let mobileExpand: HTMLButtonElement | null = null
  let seek: HTMLInputElement | null = null
  let speedControl: HTMLElement | null = null
  let speedSlider: HTMLInputElement | null = null
  let dragPointerId: number | null = null
  let seekPointerId: number | null = null
  let speedPointerId: number | null = null

  const playbackRateLabel = $derived(formatPlaybackRate(snapshot.playbackRate))
  const playLabel = $derived(snapshot.playing ? 'Pause' : 'Play')
  const previousLabel = $derived(
    snapshot.untimed ? 'Back 10 seconds' : 'Previous Word'
  )
  const nextLabel = $derived(
    snapshot.untimed ? 'Forward 10 seconds' : 'Next Word'
  )
  const expandLabel = $derived(
    snapshot.expanded ? 'Collapse player' : 'Expand player'
  )

  function requireElement<ElementType extends Element>(
    element: ElementType | null,
    name: string
  ): ElementType {
    if (!element) throw new Error(`Floating Player is missing ${name}`)
    return element
  }

  function rectOf(element: Element): FloatingPlayerRect {
    const rect = element.getBoundingClientRect()
    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    }
  }

  function sync(nextSnapshot: Partial<FloatingPlayerSnapshot>) {
    flushSync(() => {
      snapshot = { ...snapshot, ...nextSnapshot }
    })
    document.documentElement.toggleAttribute(
      'data-mobile-player-expanded',
      snapshot.expanded && snapshot.compact
    )
  }

  function syncProgress(nextProgress: Partial<FloatingPlayerProgress>) {
    flushSync(() => {
      progress = { ...progress, ...nextProgress }
    })
  }

  function setPosition(nextPosition: FloatingPlayerPosition | null) {
    flushSync(() => {
      position = nextPosition
    })
  }

  function setDragging(nextDragging: boolean) {
    flushSync(() => {
      dragging = nextDragging
    })
  }

  function closeSpeedPopover() {
    if (!speedPopoverOpen) return
    flushSync(() => {
      speedPopoverOpen = false
    })
  }

  function focusMobileClose() {
    requireElement(mobileClose, 'its mobile close button').focus({
      preventScroll: true,
    })
  }

  function measure() {
    return rectOf(requireElement(playerElement, 'its player element'))
  }

  const player: FloatingPlayer = {
    sync,
    syncProgress,
    setPosition,
    setDragging,
    closeSpeedPopover,
    focusMobileClose,
    measure,
  }

  function send(nextAction: FloatingPlayerAction) {
    action(nextAction)
  }

  function setExpanded(
    expanded: boolean,
    source: 'desktop' | 'mobile' | 'close',
    returnFocus: HTMLElement | null = null
  ) {
    send({ type: 'set-expanded', expanded, source, returnFocus })
  }

  function toggleSpeedPopover() {
    flushSync(() => {
      speedPopoverOpen = !speedPopoverOpen
    })
    if (speedPopoverOpen) {
      requireElement(speedSlider, 'its speed slider').focus({
        preventScroll: true,
      })
    }
  }

  function seekRatioFromPointer(clientX: number) {
    const rect = requireElement(seek, 'its seek control').getBoundingClientRect()
    if (rect.width <= 0) return null
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
  }

  function setLocalSeekRatio(ratio: number) {
    progress.seekValue = Math.round(ratio * 1000)
  }

  function onSeekInput(event: Event) {
    const ratio = Number.parseFloat((event.currentTarget as HTMLInputElement).value) / 1000
    setLocalSeekRatio(ratio)
    if (seekPointerId === null) send({ type: 'seek-commit', ratio })
  }

  function onSeekPointerDown(event: PointerEvent) {
    if (event.button !== 0 || progress.seekDisabled || seekPointerId !== null) {
      return
    }
    const ratio = seekRatioFromPointer(event.clientX)
    if (ratio === null) return
    event.preventDefault()
    seekPointerId = event.pointerId
    const seekElement = requireElement(seek, 'its seek control')
    seekElement.focus({ preventScroll: true })
    seekElement.setPointerCapture(event.pointerId)
    setLocalSeekRatio(ratio)
    send({
      type: 'seek-preview',
      phase: 'start',
      pointerId: event.pointerId,
      ratio,
    })
  }

  function onSeekPointerMove(event: PointerEvent) {
    if (event.pointerId !== seekPointerId) return
    const ratio = seekRatioFromPointer(event.clientX)
    if (ratio === null) return
    setLocalSeekRatio(ratio)
    send({
      type: 'seek-preview',
      phase: 'move',
      pointerId: event.pointerId,
      ratio,
    })
  }

  function finishSeek(event: PointerEvent, includePointerPosition: boolean) {
    if (event.pointerId !== seekPointerId) return
    const seekElement = requireElement(seek, 'its seek control')
    const pointerRatio = includePointerPosition
      ? seekRatioFromPointer(event.clientX)
      : null
    const ratio = pointerRatio ?? progress.seekValue / 1000
    setLocalSeekRatio(ratio)
    send({ type: 'seek-finish', pointerId: event.pointerId, ratio })
    seekPointerId = null
    if (seekElement.hasPointerCapture(event.pointerId)) {
      seekElement.releasePointerCapture(event.pointerId)
    }
  }

  function onSeekLostPointerCapture() {
    if (seekPointerId === null) return
    const pointerId = seekPointerId
    seekPointerId = null
    send({
      type: 'seek-finish',
      pointerId,
      ratio: progress.seekValue / 1000,
    })
  }

  function playbackRateFromPointer(clientX: number) {
    const rect = requireElement(
      speedSlider,
      'its speed slider'
    ).getBoundingClientRect()
    const ratio = Math.max(
      0,
      Math.min(1, (clientX - rect.left) / Math.max(rect.width, 1))
    )
    return 0.5 + ratio * 2.5
  }

  function onSpeedInput(event: Event) {
    if (speedPointerId !== null) return
    send({
      type: 'set-rate',
      rate: Number.parseFloat((event.currentTarget as HTMLInputElement).value),
      snap: true,
    })
  }

  function onSpeedPointerDown(event: PointerEvent) {
    event.preventDefault()
    speedPointerId = event.pointerId
    const slider = requireElement(speedSlider, 'its speed slider')
    slider.setPointerCapture(event.pointerId)
    send({
      type: 'set-rate',
      rate: playbackRateFromPointer(event.clientX),
      snap: true,
    })
  }

  function onSpeedPointerMove(event: PointerEvent) {
    if (event.pointerId !== speedPointerId) return
    send({
      type: 'set-rate',
      rate: playbackRateFromPointer(event.clientX),
      snap: true,
    })
  }

  function finishSpeedPointer(event: PointerEvent, updateRate: boolean) {
    if (event.pointerId !== speedPointerId) return
    const slider = requireElement(speedSlider, 'its speed slider')
    if (updateRate) {
      send({
        type: 'set-rate',
        rate: playbackRateFromPointer(event.clientX),
        snap: true,
      })
    }
    speedPointerId = null
    if (slider.hasPointerCapture(event.pointerId)) {
      slider.releasePointerCapture(event.pointerId)
    }
  }

  function onDragPointerDown(event: PointerEvent) {
    if (snapshot.compact || event.button !== 0) return
    event.preventDefault()
    dragPointerId = event.pointerId
    send({
      type: 'drag-start',
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      playerRect: measure(),
    })
  }

  function onDragKeyDown(event: KeyboardEvent) {
    if (snapshot.compact) return
    if (event.key === 'Home') {
      event.preventDefault()
      send({ type: 'drag-reset' })
      return
    }
    const direction = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    }[event.key] as readonly [number, number] | undefined
    if (!direction) return
    event.preventDefault()
    send({
      type: 'drag-key',
      direction,
      shiftKey: event.shiftKey,
      playerRect: measure(),
    })
  }

  function formatPlaybackRate(rate: number) {
    const rounded = Math.round(rate * 100) / 100
    return `${rounded.toFixed(2).replace(/\.?0+$/, '')}x`
  }

  onMount(() => {
    connect(player)

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerId !== dragPointerId) return
      send({
        type: 'drag-move',
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
      })
    }
    const onPointerFinish = (event: PointerEvent) => {
      if (event.pointerId !== dragPointerId) return
      dragPointerId = null
      send({ type: 'drag-finish', pointerId: event.pointerId })
    }
    const onWindowBlur = () => {
      if (dragPointerId === null) return
      dragPointerId = null
      send({ type: 'drag-cancel' })
    }
    const onDocumentPointerDown = (event: PointerEvent) => {
      if (!speedPopoverOpen) return
      const target = event.target
      if (target instanceof Node && speedControl?.contains(target)) return
      closeSpeedPopover()
    }
    const onLayout = () => send({ type: 'layout' })

    view.addEventListener('pointermove', onPointerMove)
    view.addEventListener('pointerup', onPointerFinish)
    view.addEventListener('pointercancel', onPointerFinish)
    view.addEventListener('blur', onWindowBlur)
    view.addEventListener('resize', onLayout)
    document.addEventListener('pointerdown', onDocumentPointerDown)
    const resizeObserver = new ResizeObserver(onLayout)
    resizeObserver.observe(requireElement(playerElement, 'its player element'))

    return () => {
      resizeObserver.disconnect()
      document.removeEventListener('pointerdown', onDocumentPointerDown)
      view.removeEventListener('resize', onLayout)
      view.removeEventListener('blur', onWindowBlur)
      view.removeEventListener('pointercancel', onPointerFinish)
      view.removeEventListener('pointerup', onPointerFinish)
      view.removeEventListener('pointermove', onPointerMove)
      document.documentElement.removeAttribute('data-mobile-player-expanded')
    }
  })
</script>

<div
  bind:this={playerElement}
  class="floating-player"
  class:u-hidden={!snapshot.visible}
  class:mod-untimed={snapshot.untimed}
  class:is-playing={snapshot.playing}
  class:is-expanded={snapshot.expanded}
  class:mod-expandable={snapshot.visible}
  class:is-dragging={dragging}
  data-target-id="floating-player"
  data-cue-mode={snapshot.untimed ? 'untimed' : 'timed'}
  id="floating-player"
  role="region"
  aria-label={snapshot.expanded && snapshot.compact
    ? 'Expanded audio player'
    : 'Audio player'}
  style:--audio-progress-ratio={`${progress.audioRatio}`}
  style:--cue-progress-ratio={`${progress.cueRatio}`}
  style:left={position ? `${position.left}px` : undefined}
  style:top={position ? `${position.top}px` : undefined}
>
  <div class="floating-player-sheet-handle" aria-hidden="true"></div>
  <header class="floating-player-header">
    <button
      class="floating-player-drag-handle"
      data-target-id="floating-drag-handle"
      type="button"
      title="Drag to move the audio player"
      aria-label="Move audio player"
      onpointerdown={onDragPointerDown}
      ondblclick={() => send({ type: 'drag-reset' })}
      onkeydown={onDragKeyDown}
    >
      <UiIcon name="grip" />
    </button>
    <div class="floating-player-heading">
      <strong
        class="floating-player-title mod-desktop"
        data-target-id="floating-player-title-desktop">{snapshot.desktopTitle}</strong
      >
      <strong
        class="floating-player-title mod-mobile"
        data-target-id="floating-player-title-mobile">{snapshot.mobileTitle}</strong
      >
      <span
        class="floating-player-subtitle mod-desktop"
        data-target-id="floating-player-subtitle">{snapshot.subtitle}</span
      >
      <span
        class="floating-player-subtitle mod-mobile"
        data-target-id="floating-player-parsha">{snapshot.mobileReading}</span
      >
    </div>
    <span class="floating-player-mode-group">
      <span
        class="floating-player-mode"
        data-target-id="floating-player-mode">{snapshot.mode}</span
      >
      <span
        class="floating-player-cue-progress"
        class:u-hidden={!progress.cueProgressVisible}
        data-target-id="floating-player-cue-progress">{progress.cueProgress}</span
      >
    </span>
    <button
      class="floating-player-button mod-expand"
      data-target-id="floating-expand-toggle"
      type="button"
      title={expandLabel}
      aria-label={expandLabel}
      aria-expanded={snapshot.expanded}
      disabled={!snapshot.visible}
      onclick={() =>
        setExpanded(!snapshot.expanded, 'desktop', document.activeElement as HTMLElement)}
    >
      <UiIcon name={snapshot.expanded ? 'minimize2' : 'expand'} />
    </button>
    <button
      bind:this={mobileClose}
      class="floating-player-mobile-close"
      data-target-id="floating-mobile-close"
      type="button"
      aria-label="Close expanded player"
      onclick={() => setExpanded(false, 'close')}
    >
      <UiIcon name="x" />
    </button>
  </header>

  <div class="floating-player-controls">
    <button
      class="floating-player-button"
      data-target-id="floating-replay"
      type="button"
      title="Restart recording"
      aria-label="Restart recording"
      disabled={!snapshot.visible}
      onclick={() => send({ type: 'restart' })}
    >
      <span
        class="floating-player-tool-icon"
        data-target-id="floating-replay-icon"
      >
        <UiIcon name="replay" />
      </span>
    </button>
    <button
      class="floating-player-button"
      data-target-id="floating-prev"
      type="button"
      title={previousLabel}
      aria-label={previousLabel}
      disabled={!snapshot.visible}
      onclick={() => send({ type: 'step', delta: -1 })}
    >
      <UiIcon name={snapshot.untimed ? 'rewind10' : 'arrowRight'} />
    </button>
    <button
      class="floating-player-button"
      data-target-id="floating-play"
      type="button"
      title={playLabel}
      aria-label={playLabel}
      disabled={!snapshot.visible}
      onclick={() => send({ type: 'toggle-playback' })}
    >
      <UiIcon name={snapshot.playing ? 'pause' : 'play'} />
    </button>
    <button
      class="floating-player-button"
      data-target-id="floating-next"
      type="button"
      title={nextLabel}
      aria-label={nextLabel}
      disabled={!snapshot.visible}
      onclick={() => send({ type: 'step', delta: 1 })}
    >
      <UiIcon name={snapshot.untimed ? 'forward10' : 'arrowLeft'} />
    </button>
    <div bind:this={speedControl} class="floating-speed-control">
      <button
        class="floating-player-button mod-speed"
        data-target-id="floating-speed-toggle"
        type="button"
        title={`Playback speed, ${playbackRateLabel}`}
        aria-label={`Playback speed, ${playbackRateLabel}`}
        aria-expanded={speedPopoverOpen}
        onclick={toggleSpeedPopover}
      >
        <span
          class="floating-player-tool-icon"
          data-target-id="floating-speed-icon"
        >
          <UiIcon name="gauge" />
        </span>
        <span
          class="floating-player-tool-label"
          data-target-id="floating-speed-label">{playbackRateLabel} speed</span
        >
        <span
          class="floating-player-tool-label mod-compact"
          data-target-id="floating-speed-compact-label"
          aria-hidden="true">{playbackRateLabel}</span
        >
      </button>
      <div
        class="floating-speed-popover"
        class:u-hidden={!speedPopoverOpen}
        data-target-id="floating-speed-popover"
      >
        <input
          bind:this={speedSlider}
          class="floating-speed-slider"
          data-target-id="floating-speed-slider"
          type="range"
          min="0.5"
          max="3"
          step="0.05"
          value={snapshot.playbackRate}
          list="floating-speed-marks"
          aria-label="Playback speed"
          oninput={onSpeedInput}
          onpointerdown={onSpeedPointerDown}
          onpointermove={onSpeedPointerMove}
          onpointerup={(event) => finishSpeedPointer(event, true)}
          onpointercancel={(event) => finishSpeedPointer(event, false)}
          onchange={onSpeedInput}
        />
        <datalist id="floating-speed-marks">
          <option value="0.5" label="0.5x"></option>
          <option value="1" label="1x"></option>
          <option value="1.5" label="1.5x"></option>
          <option value="2" label="2x"></option>
          <option value="3" label="3x"></option>
        </datalist>
        <div class="floating-speed-ticks" aria-hidden="true">
          <span style="--speed-tick-position: 0%">0.5x</span>
          <span style="--speed-tick-position: 20%">1x</span>
          <span style="--speed-tick-position: 40%">1.5x</span>
          <span style="--speed-tick-position: 60%">2x</span>
          <span style="--speed-tick-position: 100%">3x</span>
        </div>
      </div>
    </div>
  </div>

  <div class="mobile-player-timeline">
    <span
      class="mobile-player-word-progress"
      class:u-hidden={!progress.mobileWordProgressVisible}
      data-target-id="mobile-player-word-progress">{progress.mobileWordProgress}</span
    >
    <span
      class="mobile-player-time"
      data-target-id="mobile-player-current-time">{progress.currentTime}</span
    >
    <input
      bind:this={seek}
      class="mobile-player-seek"
      data-target-id="mobile-player-seek"
      type="range"
      min="0"
      max="1000"
      step="1"
      value={progress.seekValue}
      disabled={progress.seekDisabled}
      aria-label="Audio position"
      aria-valuetext={progress.seekValueText}
      oninput={onSeekInput}
      onpointerdown={onSeekPointerDown}
      onpointermove={onSeekPointerMove}
      onpointerup={(event) => finishSeek(event, true)}
      onpointercancel={(event) => finishSeek(event, false)}
      onlostpointercapture={onSeekLostPointerCapture}
    />
    <span
      class="mobile-player-time"
      data-target-id="mobile-player-duration">{progress.duration}</span
    >
  </div>

  <button
    bind:this={mobileExpand}
    class="floating-player-mobile-expand"
    data-target-id="floating-mobile-expand"
    type="button"
    aria-label="Expand audio player"
    aria-expanded={snapshot.expanded}
    aria-controls="floating-player"
    disabled={!snapshot.visible}
    onclick={() =>
      setExpanded(true, 'mobile', requireElement(mobileExpand, 'its mobile expand button'))}
  >
    <UiIcon name="chevronUp" />
  </button>

  <h3 class="floating-player-tools-heading">Playback controls</h3>
  <div class="floating-player-tools">
    <a
      class="floating-player-button mod-tool mod-save"
      class:u-hidden={!snapshot.audioDownload}
      data-target-id="floating-download"
      href={snapshot.audioDownload?.href ?? '#'}
      download={snapshot.audioDownload?.fileName}
      title="Save audio"
      aria-label="Save audio"
      aria-disabled={snapshot.audioDownload ? 'false' : 'true'}
      tabindex={snapshot.audioDownload ? 0 : -1}
    >
      <span
        class="floating-player-tool-icon"
        data-target-id="floating-download-icon"
      >
        <UiIcon name="download" />
      </span>
      <span class="floating-player-tool-label">Save</span>
    </a>
    <a
      class="floating-player-button mod-tool mod-video"
      class:u-hidden={!snapshot.videoDownload}
      data-target-id="floating-video-download"
      href={snapshot.videoDownload?.href ?? '#'}
      download={snapshot.videoDownload?.fileName}
      title="Save aliyah video"
      aria-label="Save aliyah video"
      aria-disabled={snapshot.videoDownload ? 'false' : 'true'}
      tabindex={snapshot.videoDownload ? 0 : -1}
    >
      <span
        class="floating-player-tool-icon"
        data-target-id="floating-video-download-icon"
      >
        <UiIcon name="download" />
      </span>
      <span class="floating-player-tool-label">Video</span>
    </a>
  </div>

  <div
    class="floating-player-details"
    data-target-id="floating-player-details"
  >
    <div class="floating-player-meta" data-target-id="floating-player-meta">
      <span
        class="floating-player-meta-item"
        class:u-hidden={!snapshot.status}
        data-target-id="floating-meta-status-wrap"
      >
        <span class="floating-player-meta-label">Playback</span>
        <span
          class="floating-player-meta-value"
          data-target-id="floating-meta-status"
        >{snapshot.status}</span>
      </span>
    </div>
    <div class="floating-player-progress-list">
      <div class="floating-player-progress-item mod-word-progress">
        <div class="floating-player-progress-head">
          <span class="floating-player-progress-label">Word progress</span>
          <span
            class="floating-player-progress-value"
            data-target-id="floating-meta-cues">{progress.wordProgress}</span
          >
        </div>
      </div>
    </div>
  </div>
</div>

<button
  class="floating-player-backdrop"
  data-target-id="floating-player-backdrop"
  type="button"
  aria-label="Close expanded player"
  aria-hidden={!snapshot.expanded || !snapshot.compact}
  tabindex="-1"
  onclick={() => setExpanded(false, 'close')}
></button>
