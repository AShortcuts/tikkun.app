<script lang="ts">
  import { flushSync, onMount } from 'svelte'
  import UiIcon from '../components/UiIcon.svelte'
  import type {
    ReaderControls,
    ReaderControlsComponentProps,
  } from './reader-controls.ts'

  let {
    document: ownerDocument,
    getState,
    toggleBookmark,
    openAliyahNavigation,
    showAliyahStarts,
    toggleAnnotations,
    openSettings,
    connect,
  }: ReaderControlsComponentProps = $props()

  function readState() {
    return { ...getState() }
  }

  let controlState = $state(readState())
  let menuOpen = $state(false)
  let menuToggle: HTMLButtonElement

  function sync() {
    flushSync(() => {
      controlState = readState()
    })
  }

  function close({
    restoreFocus = false,
  }: { restoreFocus?: boolean } = {}) {
    if (!menuOpen) return false
    flushSync(() => {
      menuOpen = false
    })
    if (restoreFocus) menuToggle.focus({ preventScroll: true })
    return true
  }

  function toggleMenu(event: MouseEvent) {
    event.stopPropagation()
    if (menuOpen) {
      close()
      return
    }
    sync()
    flushSync(() => {
      menuOpen = true
    })
  }

  function run(action: () => void) {
    close()
    action()
  }

  function isElement(target: EventTarget | null): target is Element {
    const ElementConstructor = ownerDocument.defaultView?.Element
    return Boolean(
      ElementConstructor && target instanceof ElementConstructor
    )
  }

  const controls: ReaderControls = { close, sync }

  onMount(() => {
    const handleOutsidePointer = (event: PointerEvent) => {
      if (!menuOpen || !isElement(event.target)) return
      if (event.target.closest('[data-target-id="toolbar-overflow-menu"]')) {
        return
      }
      if (event.target.closest('[data-target-id="toolbar-overflow-toggle"]')) {
        return
      }
      close()
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !menuOpen) return
      event.preventDefault()
      close({ restoreFocus: true })
    }

    connect(controls)
    ownerDocument.addEventListener('pointerdown', handleOutsidePointer)
    ownerDocument.addEventListener('keydown', handleEscape)

    return () => {
      ownerDocument.removeEventListener('pointerdown', handleOutsidePointer)
      ownerDocument.removeEventListener('keydown', handleEscape)
      close()
    }
  })
</script>

<button
  class="toolbar-button mod-icon-label"
  class:is-active={controlState.bookmarked}
  data-target-id="bookmark-current"
  type="button"
  title={controlState.bookmarked ? 'Remove bookmark' : 'Bookmark current word'}
  aria-label={controlState.bookmarked
    ? 'Remove bookmark'
    : 'Bookmark current word'}
  aria-pressed={controlState.bookmarked}
  disabled={!controlState.bookmarkAvailable}
  onclick={toggleBookmark}
>
  <UiIcon
    name={controlState.bookmarked ? 'bookmarkFilled' : 'bookmark'}
  />
</button>

<button
  bind:this={menuToggle}
  class="toolbar-button mod-icon-label toolbar-overflow-toggle"
  data-target-id="toolbar-overflow-toggle"
  type="button"
  title="Reader controls"
  aria-label="Reader controls"
  aria-expanded={menuOpen}
  aria-controls="toolbar-overflow-menu"
  onclick={toggleMenu}
>
  <UiIcon name="cog" />
</button>

<div
  class="toolbar-overflow-menu"
  class:u-hidden={!menuOpen}
  data-target-id="toolbar-overflow-menu"
  id="toolbar-overflow-menu"
  role="group"
  aria-label="Reader actions"
  aria-hidden={!menuOpen}
>
  <button
    class="toolbar-overflow-item"
    type="button"
    data-toolbar-overflow-action="bookmark"
    disabled={!controlState.bookmarkAvailable}
    onclick={() => run(toggleBookmark)}
  >
    <span data-target-id="toolbar-overflow-bookmark-label">
      {controlState.bookmarked ? 'Remove Bookmark' : 'Bookmark Word'}
    </span>
    <span
      class="toolbar-overflow-icon"
      data-target-id="toolbar-overflow-bookmark-icon"
    >
      <UiIcon
        name={controlState.bookmarked ? 'bookmarkFilled' : 'bookmark'}
      />
    </span>
  </button>
  <button
    class="toolbar-overflow-item"
    type="button"
    data-toolbar-overflow-action="aliyah-rail"
    disabled={!controlState.aliyahNavigationAvailable}
    onclick={() => run(() => openAliyahNavigation(menuToggle))}
  >
    <span>Choose Aliyah</span>
  </button>
  <button
    class="toolbar-overflow-item mod-aliyah-starts"
    type="button"
    data-toolbar-overflow-action="aliyah-starts"
    disabled={!controlState.aliyahNavigationAvailable}
    onclick={() => run(showAliyahStarts)}
  >
    <span>Show Aliyah Starts</span>
    <span
      class="toolbar-overflow-icon"
      data-target-id="toolbar-overflow-aliyah-starts-icon"
      aria-hidden="true"
    >
      <UiIcon name="chevronDown" />
    </span>
  </button>
  <button
    class="toolbar-overflow-item"
    type="button"
    data-toolbar-overflow-action="annotations"
    onclick={() => run(toggleAnnotations)}
  >
    <span data-target-id="toolbar-overflow-annotations-label">
      {controlState.annotationsEnabled ? 'Hide Vowels' : 'Show Vowels'}
    </span>
    <span
      class="toolbar-overflow-icon mod-annotations"
      data-target-id="toolbar-overflow-annotations-icon"
      aria-hidden="true"
    >
      {controlState.annotationsEnabled ? 'אֶ֨' : 'א'}
    </span>
  </button>
  <button
    class="toolbar-overflow-item"
    type="button"
    data-toolbar-overflow-action="settings"
    onclick={() => run(() => openSettings(menuToggle))}
  >
    <span>Reader Settings</span>
    <span
      class="toolbar-overflow-icon"
      data-target-id="toolbar-overflow-settings-icon"
      aria-hidden="true"
    >
      <UiIcon name="settings2" />
    </span>
  </button>
</div>
