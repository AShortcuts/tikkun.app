<script lang="ts">
  import { flushSync, onMount } from 'svelte'
  import UiIcon from '../components/UiIcon.svelte'
  import type {
    CueAuthoringAudioExportDownload,
    CueAuthoringExportDownload,
    CueAuthoringExportSheet,
    CueAuthoringExportSheetComponentProps,
    CueAuthoringExportSheetContent,
  } from './cue-authoring-export-sheet.ts'

  let {
    view,
    closeRequested,
    connect,
  }: CueAuthoringExportSheetComponentProps = $props()

  let visible = $state(false)
  let cueDownload = $state<CueAuthoringExportDownload | null>(null)
  let audioDownload = $state<CueAuthoringAudioExportDownload | null>(null)
  let targetPath = $state('')
  let serialized = $state('')
  let copyStatus = $state('')
  let textarea: HTMLTextAreaElement
  let selectTimer = 0

  function cancelPendingSelection() {
    if (!selectTimer) return
    view.clearTimeout(selectTimer)
    selectTimer = 0
  }

  function open(content: CueAuthoringExportSheetContent) {
    cancelPendingSelection()
    flushSync(() => {
      cueDownload = { ...content.cueDownload }
      audioDownload = content.audioDownload
        ? { ...content.audioDownload }
        : null
      targetPath = content.targetPath
      serialized = content.serialized
      copyStatus = ''
      visible = true
    })
    selectTimer = view.setTimeout(() => {
      selectTimer = 0
      if (visible) textarea.select()
    }, 0)
  }

  function setCopyStatus(message: string) {
    flushSync(() => {
      copyStatus = message
    })
  }

  function clearDownloads() {
    flushSync(() => {
      cueDownload = null
      audioDownload = null
    })
  }

  function close() {
    cancelPendingSelection()
    flushSync(() => {
      visible = false
    })
  }

  const sheet: CueAuthoringExportSheet = {
    open,
    setCopyStatus,
    clearDownloads,
    close,
  }

  onMount(() => {
    connect(sheet)
    return cancelPendingSelection
  })
</script>

<div
  class="export-modal"
  class:u-hidden={!visible}
  data-target-id="export-modal"
>
  <div class="export-card stack small">
    <div class="settings-pane-header">
      <h2>Export Timing</h2>
      <button
        class="toolbar-button admin-icon-button"
        type="button"
        data-target-id="export-close"
        aria-label="Close export timing sheet"
        title="Close export timing sheet"
        onclick={closeRequested}
      >
        <UiIcon name="circleX" />
      </button>
    </div>
    <div class="export-actions">
      <a
        class="toolbar-button export-download-button"
        data-target-id="export-download"
        href={cueDownload?.href}
        download={cueDownload?.fileName}
        aria-label="Download timing export JSON"
        title="Download timing export JSON"
      >
        <UiIcon name="fileDown" />
        <span class="export-download-label">Download Cues</span>
      </a>
      <a
        class="toolbar-button export-download-button mod-audio"
        class:u-hidden={!audioDownload}
        data-target-id="export-audio-download"
        href={audioDownload?.href}
        download={audioDownload?.fileName}
        aria-label="Download synchronized microphone audio"
        title="Download synchronized microphone audio"
      >
        <UiIcon name="audioLines" />
        <span class="export-download-label">Download Audio</span>
      </a>
    </div>
    <div
      class="export-audio-status"
      data-target-id="export-audio-status"
      hidden={!audioDownload}
    >
      {audioDownload?.statusText ?? ''}
    </div>
    <div class="export-target-path" data-target-id="export-target-path">
      {targetPath}
    </div>
    <div class="export-copy-status" data-target-id="export-copy-status">
      {copyStatus}
    </div>
    <textarea
      bind:this={textarea}
      data-target-id="export-text"
      spellcheck="false"
      value={serialized}
    ></textarea>
  </div>
</div>
