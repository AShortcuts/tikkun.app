<script lang="ts">
  import { flushSync, onMount } from 'svelte'
  import UiIcon from '../components/UiIcon.svelte'
  import {
    filterNavigationActions,
    type NavigationAction,
    type NavigationActionGroup,
  } from './actions.ts'
  import type {
    CommandPalette,
    CommandPaletteComponentProps,
  } from './command-palette.ts'

  let {
    getActions,
    restoreFocus,
    isBookmarkAction,
    formatBadge,
    connect,
  }: CommandPaletteComponentProps = $props()

  const groupLabels: Record<NavigationActionGroup, string> = {
    reading: 'Reading',
    page: 'Page',
    resume: 'Resume',
    checkpoint: 'Checkpoint',
    tools: 'Tool',
    admin: 'Admin',
  }

  let actions = $state<NavigationAction[]>([])
  let query = $state('')
  let activeIndex = $state(0)
  let openState = $state(false)
  let input: HTMLInputElement
  const matches = $derived(filterNavigationActions(actions, query))

  function close() {
    openState = false
  }

  function refresh() {
    if (!openState) return
    const nextActions = getActions()
    const nextMatches = filterNavigationActions(nextActions, query)
    flushSync(() => {
      actions = nextActions
      activeIndex = Math.min(
        activeIndex,
        Math.max(nextMatches.length - 1, 0)
      )
    })
  }

  function open() {
    flushSync(() => {
      actions = getActions()
      query = ''
      activeIndex = 0
      openState = true
    })
    input.focus({ preventScroll: true })
  }

  function toggle() {
    if (openState) {
      close()
      restoreFocus()
      return
    }
    open()
  }

  function run(action: NavigationAction) {
    close()
    void action.run()
  }

  function handleInput(event: Event) {
    flushSync(() => {
      query = (event.currentTarget as HTMLInputElement).value
      activeIndex = 0
    })
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      activeIndex = Math.min(
        activeIndex + 1,
        Math.max(matches.length - 1, 0)
      )
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      activeIndex = Math.max(activeIndex - 1, 0)
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      const action = matches[activeIndex]
      if (action) run(action)
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
      restoreFocus()
    }
  }

  function handleBackdropPointer(event: PointerEvent) {
    if (event.target === event.currentTarget) close()
  }

  const palette: CommandPalette = {
    open,
    close,
    toggle,
    isOpen: () => openState,
    refresh,
  }

  onMount(() => {
    connect(palette)
    return () => {
      actions = []
      close()
    }
  })
</script>

<div
  class="command-palette"
  class:u-hidden={!openState}
  data-target-id="command-palette"
  role="dialog"
  aria-modal="true"
  aria-label="Command palette"
  aria-hidden={!openState}
  onpointerdown={handleBackdropPointer}
>
  <div class="command-palette-panel">
    <input
      bind:this={input}
      class="command-palette-input"
      data-target-id="command-palette-input"
      type="search"
      autocomplete="off"
      spellcheck="false"
      placeholder="Jump to a reading, page, bookmark, or tool"
      value={query}
      oninput={handleInput}
      onkeydown={handleKeydown}
    />
    <div
      class="command-palette-results"
      data-target-id="command-palette-results"
    >
      {#if matches.length}
        {#each matches as action, index (action.id)}
          <button
            class="command-palette-result"
            class:is-active={index === activeIndex}
            data-action-id={action.id}
            type="button"
            onclick={() => run(action)}
          >
            <span class="command-palette-label">
              {#if isBookmarkAction(action)}
                <span class="command-palette-inline-icon">
                  <UiIcon name="bookmarkFilled" />
                </span>
              {/if}
              {action.label}
              {#if action.badgeLabel}
                <span class="command-palette-inline-badge">
                  {formatBadge(action.badgeLabel)}
                </span>
              {/if}
            </span>
            <span class="command-palette-group">
              {groupLabels[action.group]}
            </span>
          </button>
        {/each}
      {:else}
        <div class="command-palette-empty">No matching command</div>
      {/if}
    </div>
  </div>
</div>
