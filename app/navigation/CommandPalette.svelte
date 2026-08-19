<script lang="ts">
  import { flushSync, onMount } from 'svelte'
  import ReaderSearchBar from '../search/ReaderSearchBar.svelte'
  import type { ReaderSearchBarController } from '../search/reader-search-bar.ts'
  import { listReadingSearchLeinings } from '../search/reading-catalog.ts'
  import { createReaderSearch } from '../search/reader-search.ts'
  import type {
    CommandPalette,
    CommandPaletteComponentProps,
  } from './command-palette.ts'

  let {
    getActions,
    createGenerator,
    restoreFocus,
    isBookmarkAction,
    formatBadge,
    connect,
  }: CommandPaletteComponentProps = $props()

  let openState = $state(false)
  let searchBar: ReaderSearchBarController | null = null
  let hasOpened = false

  function createSearch() {
    const readings = createGenerator
      ? listReadingSearchLeinings(createGenerator())
      : []
    return createReaderSearch(readings, getActions())
  }

  function close({ restore = false }: { restore?: boolean } = {}) {
    if (!openState) return
    flushSync(() => {
      openState = false
    })
    if (restore) restoreFocus()
  }

  function refresh() {
    searchBar?.refresh()
  }

  function open() {
    if (openState) {
      searchBar?.focus({ select: true })
      return
    }
    flushSync(() => {
      openState = true
    })
    if (hasOpened) searchBar?.refresh({ resetQuery: true })
    else searchBar?.reset()
    hasOpened = true
    searchBar?.focus()
  }

  function toggle() {
    if (openState) close({ restore: true })
    else open()
  }

  function handleBackdropPointer(event: PointerEvent) {
    if (event.target === event.currentTarget) close({ restore: true })
  }

  function handleDialogKeydown(event: KeyboardEvent) {
    if (event.key !== 'Tab') return
    event.preventDefault()
    searchBar?.focus()
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
    return () => close()
  })
</script>

<div
  class="command-palette"
  class:u-hidden={!openState}
  data-target-id="command-palette"
  role="dialog"
  aria-modal="true"
  aria-label="Search readings and commands"
  aria-hidden={!openState}
  onpointerdown={handleBackdropPointer}
  onkeydown={handleDialogKeydown}
>
  <div class="command-palette-panel">
    <ReaderSearchBar
      presentation="overlay"
      {createSearch}
      navigate={(href) => {
        window.location.hash = href
      }}
      requestClose={() => close({ restore: true })}
      resultActivated={() => close()}
      queryChanged={() => undefined}
      {isBookmarkAction}
      {formatBadge}
      connect={(controller) => (searchBar = controller)}
    />
  </div>
</div>
