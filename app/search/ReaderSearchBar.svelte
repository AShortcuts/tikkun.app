<script lang="ts">
  import { flushSync, onMount } from 'svelte'
  import UiIcon from '../components/UiIcon.svelte'
  import type { NavigationActionGroup } from '../navigation/actions.ts'
  import type { SearchRange } from './index.ts'
  import type { ReaderSearch, ReaderSearchResult } from './reader-search.ts'
  import type {
    ReaderSearchBarController,
    ReaderSearchBarProps,
  } from './reader-search-bar.ts'

  let {
    presentation,
    createSearch,
    navigate,
    requestClose,
    resultActivated,
    queryChanged,
    isBookmarkAction,
    formatBadge,
    autoFocus = false,
    connect,
  }: ReaderSearchBarProps = $props()

  const groupLabels: Record<NavigationActionGroup, string> = {
    reading: 'Reading',
    page: 'Page',
    resume: 'Resume',
    checkpoint: 'Checkpoint',
    tools: 'Tool',
    admin: 'Admin',
  }
  const listboxId = $derived(`reader-search-${presentation}-results`)

  let query = $state('')
  let activeIndex = $state(0)
  let matches = $state<ReaderSearchResult[]>([])
  let focusWithin = $state(false)
  let search: ReaderSearch | null = null
  let input: HTMLInputElement
  const resultsVisible = $derived(Boolean(query) || focusWithin)

  function runSearch(nextQuery: string) {
    search ??= createSearch()
    return search.search(nextQuery, 12)
  }

  function setQuery(nextQuery: string) {
    const nextMatches = runSearch(nextQuery)
    flushSync(() => {
      query = nextQuery
      matches = nextMatches
      activeIndex = 0
    })
    queryChanged(nextQuery)
  }

  function reset() {
    setQuery('')
  }

  function refresh({ resetQuery = false }: { resetQuery?: boolean } = {}) {
    const nextSearch = createSearch()
    const nextQuery = resetQuery ? '' : query
    const nextMatches = nextSearch.search(nextQuery, 12)
    flushSync(() => {
      search = nextSearch
      query = nextQuery
      matches = nextMatches
      activeIndex = Math.min(activeIndex, Math.max(nextMatches.length - 1, 0))
    })
    queryChanged(nextQuery)
  }

  function focus({ select = false }: { select?: boolean } = {}) {
    input.focus({ preventScroll: true })
    if (select) input.select()
  }

  function moveSelection(adjustment: number) {
    if (!matches.length) return
    activeIndex =
      (activeIndex + adjustment + matches.length) % matches.length
    input.ownerDocument
      .getElementById(`${listboxId}-${activeIndex}`)
      ?.scrollIntoView?.({ block: 'nearest' })
  }

  function activate(result: ReaderSearchResult) {
    resultActivated()
    if (result.action) {
      void result.action.run()
      return
    }
    if (result.href) navigate(result.href)
  }

  function activateLink(event: MouseEvent, result: ReaderSearchResult) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    activate(result)
  }

  function handleInput(event: Event) {
    setQuery((event.currentTarget as HTMLInputElement).value)
  }

  function handleFocusIn() {
    if (!search) setQuery(query)
    flushSync(() => {
      focusWithin = true
    })
  }

  function handleFocusOut(event: FocusEvent) {
    const nextTarget = event.relatedTarget
    const searchRoot = event.currentTarget as HTMLElement
    flushSync(() => {
      focusWithin = nextTarget instanceof Node && searchRoot.contains(nextTarget)
    })
  }

  function dismiss() {
    if (query) reset()
    else requestClose()
  }

  function handleSearchShortcut(event: KeyboardEvent) {
    const isCmdK =
      event.key.toLocaleLowerCase() === 'k' &&
      (event.metaKey || event.ctrlKey) &&
      !event.altKey &&
      !event.shiftKey
    if (!isCmdK) return false

    event.preventDefault()
    event.stopPropagation()
    dismiss()
    return true
  }

  function handleKeydown(event: KeyboardEvent) {
    if (handleSearchShortcut(event)) return

    const key = event.key.toLocaleLowerCase()
    if (event.key === 'ArrowDown' || (event.ctrlKey && key === 'n')) {
      event.preventDefault()
      moveSelection(1)
      return
    }
    if (event.key === 'ArrowUp' || (event.ctrlKey && key === 'p')) {
      event.preventDefault()
      moveSelection(-1)
      return
    }
    if (event.key === 'Enter') {
      const selected = matches[activeIndex]
      if (!selected) return
      event.preventDefault()
      activate(selected)
      return
    }
    if (event.key !== 'Escape') return

    event.preventDefault()
    event.stopPropagation()
    dismiss()
  }

  function isMatched(ranges: readonly SearchRange[], index: number) {
    return ranges.some(([start, end]) => index >= start && index <= end)
  }

  function activeDescendant() {
    return resultsVisible && matches[activeIndex]
      ? `${listboxId}-${activeIndex}`
      : undefined
  }

  const controller: ReaderSearchBarController = { focus, refresh, reset }

  onMount(() => {
    connect(controller)
    if (autoFocus) {
      reset()
      focus()
    }
    return () => connect(null)
  })
</script>

<div
  class="reader-search"
  class:reader-search-overlay={presentation === 'overlay'}
  class:reader-search-embedded={presentation === 'embedded'}
  data-target-id="reader-search"
  data-search-presentation={presentation}
  role="search"
  dir="ltr"
  onfocusin={handleFocusIn}
  onfocusout={handleFocusOut}
>
  <div class="reader-search-bar">
    <span class="reader-search-icon" aria-hidden="true">
      <UiIcon name="search" />
    </span>
    <input
      bind:this={input}
      class="reader-search-input search-input"
      data-target-id="reader-search-input"
      type="search"
      role="combobox"
      aria-label="Search readings and commands"
      aria-autocomplete="list"
      aria-expanded={resultsVisible}
      aria-controls={listboxId}
      aria-activedescendant={activeDescendant()}
      placeholder="Search readings or run a command…"
      autocomplete="off"
      autocorrect="off"
      autocapitalize="off"
      spellcheck="false"
      value={query}
      oninput={handleInput}
      onkeydown={handleKeydown}
    />
    <kbd class="reader-search-shortcut" aria-hidden="true">⌘K</kbd>
  </div>

  {#if resultsVisible}
    <div class="reader-search-divider"></div>
    <div
      class="reader-search-results"
      data-target-id="reader-search-results"
    >
      {#if matches.length}
        <div class="reader-search-context">
          {query ? 'Best matches' : 'Quick access'}
        </div>
        <ol id={listboxId} class="reader-search-list" role="listbox">
          {#each matches as result, index (result.id)}
          <li
            class="reader-search-result"
            class:is-active={index === activeIndex}
            data-action-id={result.action?.id}
            data-target-class="list-item"
            data-result-source={result.source}
            data-match-band={result.band}
            data-match-field={result.matchedField}
            onpointermove={() => (activeIndex = index)}
          >
            {#if result.href}
              <a
                id={`${listboxId}-${index}`}
                class="reader-search-result-control"
                data-target-class="parsha-result"
                href={result.href}
                role="option"
                aria-selected={index === activeIndex}
                tabindex="-1"
                onclick={(event) => activateLink(event, result)}
                onkeydown={handleSearchShortcut}
              >
                <span class="reader-search-result-copy">
                  <span class="reader-search-label" dir="auto">
                    {#if result.action && isBookmarkAction(result.action)}
                      <span class="reader-search-inline-icon">
                        <UiIcon name="bookmarkFilled" />
                      </span>
                    {/if}
                    {#each result.label.split('') as character, characterIndex (characterIndex)}
                      {#if isMatched(result.labelRanges, characterIndex)}<strong>{character}</strong>{:else}{character}{/if}
                    {/each}
                    {#if result.badgeLabel}
                      <span class="reader-search-badge">{formatBadge(result.badgeLabel)}</span>
                    {/if}
                  </span>
                  {#if result.secondaryLabel}
                    <span class="reader-search-secondary" dir="auto">
                      {#each result.secondaryLabel.split('') as character, characterIndex (characterIndex)}
                        {#if isMatched(result.secondaryRanges, characterIndex)}<strong>{character}</strong>{:else}{character}{/if}
                      {/each}
                    </span>
                  {/if}
                  {#if result.matchedAlias}
                    <small class="reader-search-alias search-result-alias" dir="auto">
                      <span class="reader-search-alias-prefix">Matched:</span>{#each result.matchedAlias.split('') as character, characterIndex (characterIndex)}
                        {#if isMatched(result.matchedAliasRanges, characterIndex)}<strong>{character}</strong>{:else}{character}{/if}
                      {/each}
                    </small>
                  {/if}
                </span>
                <span class="reader-search-group">{groupLabels[result.group]}</span>
              </a>
            {:else}
              <button
                id={`${listboxId}-${index}`}
                class="reader-search-result-control"
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                tabindex="-1"
                onclick={() => activate(result)}
                onkeydown={handleSearchShortcut}
              >
                <span class="reader-search-result-copy">
                  <span class="reader-search-label" dir="auto">
                    {#if result.action && isBookmarkAction(result.action)}
                      <span class="reader-search-inline-icon">
                        <UiIcon name="bookmarkFilled" />
                      </span>
                    {/if}
                    {#each result.label.split('') as character, characterIndex (characterIndex)}
                      {#if isMatched(result.labelRanges, characterIndex)}<strong>{character}</strong>{:else}{character}{/if}
                    {/each}
                    {#if result.badgeLabel}
                      <span class="reader-search-badge">{formatBadge(result.badgeLabel)}</span>
                    {/if}
                  </span>
                  {#if result.matchedAlias}
                    <small class="reader-search-alias search-result-alias" dir="auto">
                      <span class="reader-search-alias-prefix">Matched:</span>{#each result.matchedAlias.split('') as character, characterIndex (characterIndex)}
                        {#if isMatched(result.matchedAliasRanges, characterIndex)}<strong>{character}</strong>{:else}{character}{/if}
                      {/each}
                    </small>
                  {/if}
                </span>
                <span class="reader-search-group">{groupLabels[result.group]}</span>
              </button>
            {/if}
          </li>
          {/each}
        </ol>
      {:else}
        <div id={listboxId} class="reader-search-empty" role="listbox">
          {query ? 'No matching reading or command' : 'No quick actions available'}
        </div>
      {/if}
    </div>
  {/if}
  <div class="reader-search-status u-visually-hidden" aria-live="polite">
    {resultsVisible ? matches.length : 0} {resultsVisible && matches.length === 1 ? 'result' : 'results'}
  </div>
</div>
