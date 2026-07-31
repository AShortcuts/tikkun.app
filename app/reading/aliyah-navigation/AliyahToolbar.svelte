<script lang="ts">
  import { flushSync, onMount } from 'svelte'
  import UiIcon from '../../components/UiIcon.svelte'
  import type {
    AliyahToolbar,
    AliyahToolbarComponentProps,
    AliyahToolbarState,
  } from './aliyah-navigation.ts'

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

  function toggleCompact() {
    onToggleCompact(compactToggle)
  }

  async function playCurrent() {
    if (
      !toolbarState.current.target ||
      !toolbarState.current.audioAvailable
    ) {
      return
    }
    await onPlayCurrent(toolbarState.current.target)
  }

  const toolbar: AliyahToolbar = {
    sync,
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
  class:u-hidden={!toolbarState.current.audioAvailable}
  class:is-active={toolbarState.current.playing}
  data-target-id="toolbar-current-aliyah-audio"
  data-run-id={toolbarState.current.target?.runId ?? ''}
  data-aliyah-index={toolbarState.current.target
    ? `${toolbarState.current.target.aliyahIndex}`
    : ''}
  type="button"
  disabled={!toolbarState.current.audioAvailable}
  title={toolbarState.current.audioAvailable
    ? `${toolbarState.current.playing ? 'Pause' : 'Play'} ${toolbarState.current.label}`
    : 'Recording unavailable'}
  aria-label={toolbarState.current.audioAvailable
    ? `${toolbarState.current.playing ? 'Pause' : 'Play'} ${toolbarState.current.label}`
    : 'Recording unavailable'}
  onclick={playCurrent}
>
  <UiIcon name={toolbarState.current.playing ? 'pause' : 'play'} />
</button>
