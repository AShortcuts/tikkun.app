<script lang="ts">
  import { flushSync, onMount } from 'svelte'
  import type {
    CueAuthoringAccessDialog,
    CueAuthoringAccessDialogComponentProps,
  } from './cue-authoring-access-dialog.ts'

  let {
    document: ownerDocument,
    submit,
    connect,
  }: CueAuthoringAccessDialogComponentProps = $props()

  let openState = $state(false)
  let unlockCode = $state('')
  let errorMessage = $state('')
  let modal: HTMLElement
  let unlockCodeInput: HTMLInputElement
  let returnFocus: HTMLElement | null = null

  function open() {
    if (openState) {
      unlockCodeInput.focus({ preventScroll: true })
      return
    }

    const activeElement = ownerDocument.activeElement
    returnFocus =
      activeElement instanceof HTMLElement &&
      activeElement !== ownerDocument.body
        ? activeElement
        : null
    flushSync(() => {
      unlockCode = ''
      errorMessage = ''
      openState = true
    })
    unlockCodeInput.focus({ preventScroll: true })
  }

  function close() {
    if (!openState) return

    const focusTarget = returnFocus
    returnFocus = null
    flushSync(() => {
      openState = false
      unlockCode = ''
      errorMessage = ''
    })
    if (focusTarget?.isConnected) {
      focusTarget.focus({ preventScroll: true })
    }
  }

  function submitUnlockCode(event: SubmitEvent) {
    event.preventDefault()
    if (!unlockCode) return
    if (submit(unlockCode)) {
      close()
      return
    }

    flushSync(() => {
      errorMessage = "That unlock code isn't correct. Try again."
    })
    unlockCodeInput.focus({ preventScroll: true })
    unlockCodeInput.select()
  }

  function updateUnlockCode(event: Event) {
    const nextUnlockCode = (event.currentTarget as HTMLInputElement).value
    flushSync(() => {
      unlockCode = nextUnlockCode
      if (errorMessage) errorMessage = ''
    })
  }

  function handleBackdropPointer(event: PointerEvent) {
    if (event.target === event.currentTarget) close()
  }

  function handleDialogKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      close()
      return
    }
    if (event.key !== 'Tab') return

    const focusable = [
      ...modal.querySelectorAll<HTMLElement>(
        'input:not(:disabled), button:not(:disabled), [href], [tabindex]:not([tabindex="-1"])'
      ),
    ]
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (!first || !last) return

    const activeElement = ownerDocument.activeElement
    if (!modal.contains(activeElement)) {
      event.preventDefault()
      ;(event.shiftKey ? last : first).focus()
    } else if (event.shiftKey && activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  const dialog: CueAuthoringAccessDialog = {
    open,
    close,
    isOpen: () => openState,
  }

  onMount(() => {
    connect(dialog)
    return () => {
      returnFocus = null
      unlockCode = ''
      errorMessage = ''
    }
  })
</script>

<div
  bind:this={modal}
  class="admin-access-modal"
  class:u-hidden={!openState}
  data-target-id="admin-access-dialog"
  role="dialog"
  aria-modal="true"
  aria-labelledby="admin-access-title"
  aria-describedby="admin-access-description"
  aria-hidden={!openState}
  onkeydown={handleDialogKeydown}
  onpointerdown={handleBackdropPointer}
>
  <section class="admin-access-card">
    <header class="admin-access-header">
      <h2 id="admin-access-title">Cue Authoring</h2>
      <p id="admin-access-description">
        Enter the local unlock code to access recording studio features.
      </p>
    </header>
    <form
      class="admin-access-form"
      data-target-id="admin-access-form"
      onsubmit={submitUnlockCode}
    >
      <label class="admin-access-field">
        <span>Local unlock code</span>
        <input
          bind:this={unlockCodeInput}
          class="admin-access-input"
          data-target-id="admin-access-password"
          type="password"
          name="cue-authoring-unlock-code"
          autocomplete="off"
          autocapitalize="none"
          spellcheck="false"
          aria-invalid={Boolean(errorMessage)}
          aria-describedby="admin-access-error"
          value={unlockCode}
          oninput={updateUnlockCode}
        />
      </label>
      <p
        class="admin-access-error"
        data-target-id="admin-access-error"
        id="admin-access-error"
        role="alert"
        aria-live="polite"
      >
        {errorMessage}
      </p>
      <div class="admin-access-actions">
        <button
          class="toolbar-button"
          data-target-id="admin-access-cancel"
          type="button"
          onclick={close}
        >Cancel</button>
        <button
          class="toolbar-button admin-access-submit"
          data-target-id="admin-access-submit"
          type="submit"
          disabled={!unlockCode}
        >Unlock</button>
      </div>
    </form>
  </section>
</div>
