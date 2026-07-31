<script lang="ts">
  import { flushSync, onMount } from 'svelte'
  import type {
    CueAuthoringIssueDialog,
    CueAuthoringIssueDialogComponentProps,
  } from './cue-authoring-issue-dialog.ts'

  let {
    issueKinds,
    save,
    closed,
    connect,
  }: CueAuthoringIssueDialogComponentProps = $props()

  let openState = $state(false)
  let note = $state('')
  let readerVisible = $state(true)
  let modal: HTMLElement

  function close() {
    if (!openState) return
    flushSync(() => {
      openState = false
    })
    closed()
  }

  function open() {
    flushSync(() => {
      note = ''
      readerVisible = true
      openState = true
    })
    modal
      .querySelector<HTMLButtonElement>('[data-issue-kind]')
      ?.focus({ preventScroll: true })
  }

  function saveIssue(kind: (typeof issueKinds)[number]['kind']) {
    const saved = save({
      kind,
      note: note.trim() || undefined,
      readerVisible,
    })
    if (saved) close()
  }

  function handleBackdropPointer(event: PointerEvent) {
    if (event.target === event.currentTarget) close()
  }

  const dialog: CueAuthoringIssueDialog = {
    open,
    close,
    isOpen: () => openState,
  }

  onMount(() => {
    connect(dialog)
  })
</script>

<div
  bind:this={modal}
  class="recording-issue-modal"
  class:u-hidden={!openState}
  data-target-id="recording-issue-modal"
  role="dialog"
  aria-modal="true"
  aria-label="Mark recording issue"
  aria-hidden={!openState}
  onpointerdown={handleBackdropPointer}
>
  <div class="recording-issue-card">
    <div class="settings-pane-header">
      <h2>Mark Issue</h2>
      <button
        class="toolbar-button"
        type="button"
        data-target-id="recording-issue-close"
        onclick={close}>Close</button
      >
    </div>
    <div
      class="recording-issue-options"
      data-target-id="recording-issue-options"
    >
      {#each issueKinds as issueKind (issueKind.kind)}
        <button
          class="recording-issue-option"
          data-issue-kind={issueKind.kind}
          type="button"
          onclick={() => saveIssue(issueKind.kind)}
        >
          {issueKind.label}
        </button>
      {/each}
    </div>
    <label class="recording-issue-note">
      <span>Note</span>
      <input
        bind:value={note}
        data-target-id="recording-issue-note"
        type="text"
        maxlength="120"
      />
    </label>
    <label class="settings-field mod-checkbox">
      <input
        bind:checked={readerVisible}
        data-target-id="recording-issue-reader-visible"
        type="checkbox"
      />
      <span class="settings-field-copy">
        <span class="settings-field-label">Show to readers</span>
        <span class="settings-field-helper"
          >Use only when the recording differs from the text in a way readers
          should know.</span
        >
      </span>
    </label>
  </div>
</div>
