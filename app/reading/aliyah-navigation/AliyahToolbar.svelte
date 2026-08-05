<script lang="ts">
  import { flushSync, onMount } from 'svelte'
  import UiIcon from '../../components/UiIcon.svelte'
  import {
    aliyahCueAuthoringActionLabel,
    isAliyahCueStatusUnfinished,
    type AliyahCueStatus,
    type AliyahToolbar,
    type AliyahToolbarComponentProps,
    type AliyahToolbarState,
  } from './aliyah-navigation.ts'
  import { isSameAliyahNavigationTarget } from './model.ts'

  let {
    onToggleCompact,
    onPlayCurrent,
    connect,
  }: AliyahToolbarComponentProps = $props()

  let toolbarState = $state<AliyahToolbarState>({
    current: {
      labelVisible: false,
      label: '—',
      target: null,
      audioAvailable: false,
      authoringAvailable: false,
      authoringEnabled: false,
      cueStatus: null,
      playing: false,
    },
    compact: {
      visible: false,
      target: null,
      label: 'ראשון',
      playbackState: 'default',
    },
  })
  let compactOpen = $state(false)
  let compactToggle: HTMLButtonElement

  function sync(nextState: AliyahToolbarState) {
    flushSync(() => {
      toolbarState = {
        current: { ...nextState.current },
        compact: { ...nextState.compact },
      }
    })
  }

  function setCompactOpen(open: boolean) {
    flushSync(() => {
      compactOpen = open
    })
  }

  function setCueStatus(
    target: Parameters<AliyahToolbar['setCueStatus']>[0],
    status: AliyahCueStatus
  ) {
    if (!isSameAliyahNavigationTarget(toolbarState.current.target, target)) {
      return
    }
    flushSync(() => {
      toolbarState = {
        ...toolbarState,
        current: { ...toolbarState.current, cueStatus: status },
      }
    })
  }

  function invalidateCueStatus() {
    flushSync(() => {
      toolbarState = {
        ...toolbarState,
        current: { ...toolbarState.current, cueStatus: null },
      }
    })
  }

  function currentCueIsIncomplete() {
    const status = toolbarState.current.cueStatus
    return Boolean(
      toolbarState.current.audioAvailable &&
        status &&
        isAliyahCueStatusUnfinished(status)
    )
  }

  function currentPlayLabel() {
    const status = toolbarState.current.cueStatus
    if (
      toolbarState.current.authoringEnabled &&
      currentCueIsIncomplete() &&
      status
    ) {
      return aliyahCueAuthoringActionLabel({
        label: toolbarState.current.label,
        status,
        playing: toolbarState.current.playing,
      })
    }
    return `${toolbarState.current.playing ? 'Pause' : 'Play'} ${toolbarState.current.label}`
  }

  function toggleCompact() {
    onToggleCompact(compactToggle)
  }

  async function playCurrent() {
    if (
      !toolbarState.current.target ||
      (!toolbarState.current.audioAvailable &&
        !toolbarState.current.authoringAvailable)
    ) {
      return
    }
    await onPlayCurrent(toolbarState.current.target)
  }

  const toolbar: AliyahToolbar = {
    sync,
    setCueStatus,
    invalidateCueStatus,
    setCompactOpen,
    getCompactToggle: () => compactToggle,
  }

  onMount(() => {
    connect(toolbar)
  })
</script>

<button
  bind:this={compactToggle}
  class="mobile-aliyah-picker-toggle"
  class:u-hidden={!toolbarState.compact.visible}
  class:is-loaded={toolbarState.compact.playbackState === 'loaded'}
  class:is-playing={toolbarState.compact.playbackState === 'playing'}
  data-target-id="mobile-aliyah-picker-toggle"
  data-run-id={toolbarState.compact.target?.runId ?? ''}
  data-aliyah-index={toolbarState.compact.target
    ? `${toolbarState.compact.target.aliyahIndex}`
    : ''}
  data-playback-state={toolbarState.compact.playbackState}
  type="button"
  title={toolbarState.compact.playbackState === 'playing'
    ? 'Choose aliyah; current aliyah is playing'
    : toolbarState.compact.playbackState === 'loaded'
      ? 'Choose aliyah; current aliyah is paused'
      : 'Choose aliyah'}
  aria-haspopup="dialog"
  aria-expanded={compactOpen}
  aria-controls="mobile-aliyah-picker"
  onclick={toggleCompact}
>
  <span
    class="mobile-aliyah-picker-speaker"
    class:u-hidden={toolbarState.compact.playbackState !== 'playing'}
    data-target-id="mobile-aliyah-picker-speaker"
    aria-hidden="true"
  >
    <UiIcon name="speakerHigh" />
  </span>
  <span data-target-id="mobile-current-aliyah">
    {toolbarState.compact.label}
  </span>
  <span
    class="mobile-aliyah-picker-chevron"
    data-target-id="mobile-aliyah-picker-chevron"
    aria-hidden="true"
  >
    <UiIcon name={compactOpen ? 'chevronUp' : 'chevronDown'} />
  </span>
</button>

<span
  class="toolbar-current-aliyah-label"
  class:u-hidden={!toolbarState.current.labelVisible}
  data-target-id="toolbar-current-aliyah-label"
>
  {toolbarState.current.label}
</span>

<button
  class="aliyah-audio-button toolbar-current-aliyah-audio"
  class:u-hidden={!toolbarState.current.audioAvailable &&
    !toolbarState.current.authoringAvailable}
  class:is-active={toolbarState.current.playing}
  class:is-missing-audio={toolbarState.current.authoringAvailable}
  class:is-cue-incomplete={currentCueIsIncomplete()}
  data-target-id="toolbar-current-aliyah-audio"
  data-run-id={toolbarState.current.target?.runId ?? ''}
  data-aliyah-index={toolbarState.current.target
    ? `${toolbarState.current.target.aliyahIndex}`
    : ''}
  type="button"
  disabled={!toolbarState.current.audioAvailable &&
    !toolbarState.current.authoringAvailable}
  title={toolbarState.current.authoringAvailable
    ? `Select ${toolbarState.current.label} for audio and cue recording`
    : toolbarState.current.audioAvailable
      ? currentPlayLabel()
      : 'Recording unavailable'}
  aria-label={toolbarState.current.authoringAvailable
    ? `Select ${toolbarState.current.label} for audio and cue recording`
    : toolbarState.current.audioAvailable
      ? currentPlayLabel()
      : 'Recording unavailable'}
  onclick={playCurrent}
>
  <UiIcon name={toolbarState.current.playing ? 'pause' : 'play'} />
</button>
