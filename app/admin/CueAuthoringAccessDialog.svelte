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
  let password = $state('')
  let errorMessage = $state('')
  let modal: HTMLElement
  let passwordInput: HTMLInputElement
  let returnFocus: HTMLElement | null = null

  function open() {
    if (openState) {
      passwordInput.focus({ preventScroll: true })
      return
    }

    const activeElement = ownerDocument.activeElement
    returnFocus =
      activeElement instanceof HTMLElement &&
      activeElement !== ownerDocument.body
        ? activeElement
        : null
    flushSync(() => {
      password = ''
      errorMessage = ''
      openState = true
    })
    passwordInput.focus({ preventScroll: true })
  }

  function close() {
    if (!openState) return

    const focusTarget = returnFocus
    returnFocus = null
    flushSync(() => {
      openState = false
      password = ''
      errorMessage = ''
    })
    if (focusTarget?.isConnected) {
      focusTarget.focus({ preventScroll: true })
    }
  }

  function submitPassword(event: SubmitEvent) {
    event.preventDefault()
    if (!password) return
    if (submit(password)) {
      close()
      return
    }

    flushSync(() => {
      errorMessage = "That password isn't correct. Try again."
    })
    passwordInput.focus({ preventScroll: true })
    passwordInput.select()
  }

  function updatePassword(event: Event) {
    const nextPassword = (event.currentTarget as HTMLInputElement).value
    flushSync(() => {
      password = nextPassword
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
      password = ''
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
      <h2 id="admin-access-title">Admin Access</h2>
      <p id="admin-access-description">
        Enter the admin password to open cue authoring.
      </p>
    </header>
    <form
      class="admin-access-form"
      data-target-id="admin-access-form"
      onsubmit={submitPassword}
    >
      <label class="admin-access-field">
        <span>Password</span>
        <input
          bind:this={passwordInput}
          class="admin-access-input"
          data-target-id="admin-access-password"
          type="password"
          name="admin-password"
          autocomplete="current-password"
          autocapitalize="none"
          spellcheck="false"
          aria-invalid={Boolean(errorMessage)}
          aria-describedby="admin-access-error"
          value={password}
          oninput={updatePassword}
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
          disabled={!password}
        >Unlock</button>
      </div>
    </form>
  </section>
</div>
