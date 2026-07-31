<script lang="ts">
  import { flushSync, onMount } from 'svelte'
  import UiIcon from '../components/UiIcon.svelte'
  import type {
    CueAuthoringPanel,
    CueAuthoringPanelComponentProps,
    CueAuthoringPanelProgress,
    CueAuthoringPanelSnapshot,
  } from './cue-authoring-panel.ts'

  let { action, connect }: CueAuthoringPanelComponentProps = $props()

  let snapshot = $state<CueAuthoringPanelSnapshot>({
    visible: false,
    cueCountText: '0 Words',
    statusText: 'Select an aliyah and press play to start timing words.',
    draftStatusText: 'Drafts autosave locally per recording.',
    syncNoteVisible: false,
    captureAudio: {
      requested: false,
      disabled: true,
      statusText:
        'Optional: capture your microphone into a downloadable audio file while you mark cues.',
      tone: 'normal',
    },
    record: {
      disabled: true,
      mode: 'idle',
    },
    canStepBack: false,
    canUndo: false,
    canMarkIssue: false,
    canReset: false,
    canExport: false,
    exportChanged: false,
    resumeWord: null,
  })
  let progress = $state<CueAuthoringPanelProgress>({
    wordLabel: '0 / 0',
    durationLabel: '0:00 / 0:00',
    audioRatio: 0,
    cueRatio: 0,
  })

  const recording = $derived(
    snapshot.record.mode === 'timing' ||
      snapshot.record.mode === 'audio'
  )
  const confirming = $derived(snapshot.record.mode === 'confirm')
  const recordLabel = $derived.by(() => {
    switch (snapshot.record.mode) {
      case 'confirm':
        return 'Confirm a fresh synchronized microphone audio and timing pass'
      case 'audio':
        return 'Stop microphone audio and word timing recording'
      case 'timing':
        return 'Stop recording word timings and switch to playback review'
      default:
        return 'Record or edit word timing for the loaded aliyah'
    }
  })
  const recordCaption = $derived.by(() => {
    switch (snapshot.record.mode) {
      case 'confirm':
        return 'Confirm Fresh Pass'
      case 'audio':
        return 'Stop Audio + Timing'
      case 'timing':
        return 'Stop Recording'
      default:
        return 'Record/Edit Timing'
    }
  })
  const exportLabel = $derived(
    snapshot.exportChanged
      ? 'Export local cue changes that differ from published cue data'
      : 'Export the current timing draft as cue data'
  )
  const resumeLabel = $derived(
    snapshot.resumeWord === null
      ? 'Resume the incomplete timing draft from the next unsaved word'
      : `Resume timing draft from Word ${snapshot.resumeWord}`
  )

  function sync(nextSnapshot: CueAuthoringPanelSnapshot) {
    flushSync(() => {
      snapshot = {
        ...nextSnapshot,
        captureAudio: { ...nextSnapshot.captureAudio },
        record: { ...nextSnapshot.record },
      }
    })
  }

  function syncProgress(nextProgress: CueAuthoringPanelProgress) {
    flushSync(() => {
      progress = { ...nextProgress }
    })
  }

  const panel: CueAuthoringPanel = {
    sync,
    syncProgress,
  }

  onMount(() => {
    connect(panel)
  })
</script>

<aside
  class="admin-panel"
  class:u-hidden={!snapshot.visible}
  data-target-id="admin-panel"
>
  <div class="admin-panel-header">
    <strong>Admin Timing Mode</strong>
    <div class="admin-panel-header-actions">
      <span data-target-id="admin-cue-count">{snapshot.cueCountText}</span>
      <button
        class="admin-panel-close"
        type="button"
        data-target-id="admin-close"
        aria-label="Close admin timing mode"
        title="Close admin timing mode"
        onclick={() => action({ type: 'close' })}
      >
        <UiIcon name="x" />
      </button>
    </div>
  </div>

  <div class="admin-panel-status" data-target-id="admin-status">
    {snapshot.statusText}
  </div>

  <label class="admin-audio-capture-option">
    <input
      type="checkbox"
      data-target-id="admin-capture-audio"
      aria-describedby="admin-audio-capture-status"
      checked={snapshot.captureAudio.requested}
      disabled={snapshot.captureAudio.disabled}
      onchange={(event) =>
        action({
          type: 'capture-audio',
          requested: event.currentTarget.checked,
        })}
    />
    <span class="admin-audio-capture-copy">
      <strong>Record Audio</strong>
      <span
        >Creates a fresh audio file and synchronized cues in one pass.</span
      >
    </span>
  </label>
  <div
    class="admin-audio-capture-status"
    class:mod-error={snapshot.captureAudio.tone === 'error'}
    class:mod-confirm={snapshot.captureAudio.tone === 'confirm'}
    class:mod-recording={snapshot.captureAudio.tone === 'recording'}
    data-target-id="admin-audio-capture-status"
    id="admin-audio-capture-status"
    role="status"
    aria-live="polite"
  >
    {snapshot.captureAudio.statusText}
  </div>

  <div class="admin-panel-actions">
    <span class="admin-icon-control">
      <button
        type="button"
        class="toolbar-button admin-icon-button admin-record-button"
        class:is-recording={recording}
        class:is-confirming={confirming}
        data-target-id="admin-record"
        aria-label={recordLabel}
        title={recordLabel}
        disabled={snapshot.record.disabled}
        onclick={() => action({ type: 'record' })}
      >
        <span class="admin-record-icon-stack" aria-hidden="true">
          <svg
            class="admin-record-icon mod-record"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            focusable="false"
          >
            <circle cx="12" cy="12" r="10" />
            <circle
              cx="12"
              cy="12"
              r="5.41"
              fill="currentColor"
              stroke="none"
            />
          </svg>
          <svg
            class="admin-record-icon mod-stop"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            focusable="false"
          >
            <circle
              class="admin-record-stop-outer"
              cx="12"
              cy="12"
              r="10"
            />
            <rect
              class="admin-record-stop-inner"
              x="7.84"
              y="7.84"
              width="8.32"
              height="8.32"
              rx="2.08"
              fill="currentColor"
              stroke="none"
            />
          </svg>
        </span>
      </button>
      <span class="admin-icon-caption" aria-hidden="true"
        >{recordCaption}</span
      >
    </span>

    <span class="admin-icon-control">
      <button
        type="button"
        class="toolbar-button admin-icon-button"
        data-target-id="admin-step-back"
        aria-label="Step back to the previous word while timing"
        title="Step back to the previous word while timing"
        disabled={!snapshot.canStepBack}
        onclick={() => action({ type: 'step-back' })}
      >
        <UiIcon name="arrowLeft" />
      </button>
      <span class="admin-icon-caption" aria-hidden="true">Step Back</span>
    </span>

    <span class="admin-icon-control">
      <button
        type="button"
        class="toolbar-button admin-icon-button"
        data-target-id="admin-undo"
        aria-label="Undo the most recently saved word timing"
        title="Undo the most recently saved word timing"
        disabled={!snapshot.canUndo}
        onclick={() => action({ type: 'undo' })}
      >
        <UiIcon name="undo" />
      </button>
      <span class="admin-icon-caption" aria-hidden="true">Undo Last</span>
    </span>

    <span class="admin-icon-control">
      <button
        type="button"
        class="toolbar-button admin-icon-button"
        data-target-id="admin-mark-issue"
        aria-label="Mark a reader-visible issue at the selected word timing"
        title="Mark a reader-visible issue at the selected word timing"
        disabled={!snapshot.canMarkIssue}
        onclick={() => action({ type: 'mark-issue' })}
      >
        <UiIcon name="triangleAlert" />
      </button>
      <span class="admin-icon-caption" aria-hidden="true">Mark Issue</span>
    </span>

    <span class="admin-icon-control">
      <button
        type="button"
        class="toolbar-button admin-icon-button"
        data-target-id="admin-reset"
        aria-label="Clear the current timing draft and start over"
        title="Clear the current timing draft and start over"
        disabled={!snapshot.canReset}
        onclick={() => action({ type: 'reset' })}
      >
        <UiIcon name="reset" />
      </button>
      <span class="admin-icon-caption" aria-hidden="true">Start Over</span>
    </span>

    <span class="admin-icon-control">
      <button
        type="button"
        class="toolbar-button admin-icon-button admin-export-button"
        class:has-local-cue-diff={snapshot.exportChanged}
        data-target-id="admin-export"
        aria-label={exportLabel}
        title={exportLabel}
        disabled={!snapshot.canExport}
        onclick={() => action({ type: 'export' })}
      >
        <UiIcon name="externalLink" />
      </button>
      <span class="admin-icon-caption" aria-hidden="true">Export</span>
    </span>
  </div>

  <div class="admin-panel-draft" data-target-id="admin-draft-status">
    {snapshot.draftStatusText}
  </div>
  <div
    class="admin-panel-actions mod-secondary"
    data-target-id="admin-resume-wrap"
    hidden={snapshot.resumeWord === null}
  >
    <span class="admin-icon-control">
      <button
        type="button"
        class="toolbar-button admin-icon-button"
        data-target-id="admin-resume-draft"
        aria-label={resumeLabel}
        title={resumeLabel}
        disabled={snapshot.resumeWord === null}
        onclick={() => action({ type: 'resume' })}
      >
        <UiIcon name="playOutline" />
      </button>
      <span class="admin-icon-caption" aria-hidden="true">Resume Draft</span>
    </span>
  </div>
  <div
    class="admin-panel-draft"
    data-target-id="admin-sync-note"
    hidden={!snapshot.syncNoteVisible}
  >
    To visualize synced autoplay highlighting, press 'Stop Recording'.
  </div>

  <div data-target-id="admin-cue-list-root"></div>

  <div
    class="admin-progress-list"
    data-target-id="admin-progress"
    style={`--audio-progress-ratio: ${progress.audioRatio}; --cue-progress-ratio: ${progress.cueRatio};`}
  >
    <div class="floating-player-progress-item">
      <div class="floating-player-progress-head">
        <span class="floating-player-progress-label">Word Progress</span>
        <span
          class="floating-player-progress-value"
          data-target-id="admin-meta-cues">{progress.wordLabel}</span
        >
      </div>
    </div>
    <div class="floating-player-progress-item">
      <div class="floating-player-progress-head">
        <span class="floating-player-progress-label">Audio Progress</span>
        <span
          class="floating-player-progress-value"
          data-target-id="admin-meta-duration">{progress.durationLabel}</span
        >
      </div>
      <div class="floating-player-progress-track">
        <div class="floating-player-progress-fill mod-audio"></div>
      </div>
    </div>
  </div>

  <div class="admin-waveform" data-target-id="admin-waveform">
    <div class="admin-waveform-head">
      <span data-target-id="admin-waveform-status"
        >Load a recording to show the waveform.</span
      >
      <span>cues - issues - playhead</span>
    </div>
    <div
      class="admin-waveform-lane"
      data-target-id="admin-waveform-lane"
    >
      <div
        class="admin-waveform-bars"
        data-target-id="admin-waveform-bars"
      ></div>
    </div>
  </div>
</aside>
