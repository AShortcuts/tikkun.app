<script lang="ts">
  import { flushSync, onMount } from 'svelte'
  import type { RecordingIssue } from '../audio/recording-issues.ts'
  import type {
    CueAuthoringIssueDialog,
    CueAuthoringIssueDialogComponentProps,
  } from './cue-authoring-issue-dialog.ts'

  let {
    issueKinds,
    save,
    remove,
    getSaveError,
    closed,
    connect,
  }: CueAuthoringIssueDialogComponentProps = $props()

  let openState = $state(false)
  let note = $state('')
  let readerVisible = $state(true)
  let selectedKind = $state<(typeof issueKinds)[number]['kind'] | null>(null)
  let existingIssues = $state<readonly RecordingIssue[]>([])
  let editingId = $state('')
  let wordLabel = $state('')
  let errorMessage = $state('')
  let modal: HTMLElement

  function close() {
    if (!openState) return
    flushSync(() => {
      openState = false
    })
    closed()
  }

  function selectIssue(id: string) {
    const issue = existingIssues?.find(issue => issue.id === id)
    editingId = issue?.id ?? ''
    selectedKind = issue?.kind ?? null
    note = issue?.note ?? ''
    readerVisible = issue ? issue.visibility === 'readerVisible' : true
    errorMessage = ''
  }

  const open: CueAuthoringIssueDialog['open'] = (options = {}) => {
    flushSync(() => {
      existingIssues = options.issues ?? []
      wordLabel = options.wordLabel ?? ''
      selectIssue(existingIssues.at(-1)?.id ?? '')
      openState = true
    })
    modal.focus({ preventScroll: true })
  }

  function saveIssue() {
    if (!selectedKind) return
    const saved = save({
      ...(editingId ? { issueId: editingId } : {}),
      kind: selectedKind,
      note: note.trim() || undefined,
      readerVisible,
    })
    if (saved) close()
    else errorMessage = getSaveError?.() || 'This issue could not be saved. Your edits are still here; try again.'
  }

  function removeIssue() {
    if (!editingId) return
    if (remove(editingId)) close()
    else errorMessage = getSaveError?.() || 'This issue could not be removed. Try again.'
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
  tabindex="-1"
  aria-modal="true"
  aria-label="Mark recording issue"
  aria-hidden={!openState}
  onpointerdown={handleBackdropPointer}
>
  <form class="recording-issue-card" onsubmit={(event) => {
    event.preventDefault()
    saveIssue()
  }}>
    <div class="settings-pane-header">
      <h2>{editingId ? 'Edit Issue' : 'Mark Issue'}</h2>
      <button
        class="toolbar-button"
        type="button"
        data-target-id="recording-issue-close"
        onclick={close}>Close</button
      >
    </div>
    {#if wordLabel}<p class="recording-issue-word">Word: <bdi>{wordLabel}</bdi></p>{/if}
    {#if existingIssues?.length}
      <label class="recording-issue-note">
        <span>Saved issue</span>
        <select value={editingId} onchange={(event) => selectIssue(event.currentTarget.value)}>
          {#each existingIssues as issue (issue.id)}
            <option value={issue.id}>{issueKinds.find(option => option.kind === issue.kind)?.label}</option>
          {/each}
          <option value="">New issue</option>
        </select>
      </label>
    {/if}
    <div
      class="recording-issue-options"
      data-target-id="recording-issue-options"
    >
      {#each issueKinds as issueKind (issueKind.kind)}
        <button
          class="recording-issue-option"
          data-issue-kind={issueKind.kind}
          type="button"
          aria-pressed={selectedKind === issueKind.kind}
          onclick={() => { selectedKind = issueKind.kind }}
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
          >(Use only when the recording differs from the text in a way readers
          should know.)</span
        >
      </span>
    </label>
    {#if errorMessage}<p role="alert">{errorMessage}</p>{/if}
    <div class="recording-issue-actions">
      {#if editingId}
        <button class="toolbar-button" type="button" data-target-id="recording-issue-remove" onclick={removeIssue}>Remove</button>
      {/if}
      <button
        class="toolbar-button"
        type="submit"
        data-target-id="recording-issue-save"
        disabled={selectedKind === null}
      >Save</button>
    </div>
  </form>
</div>
