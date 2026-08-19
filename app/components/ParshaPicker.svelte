<script lang="ts">
  import { flushSync, onMount } from 'svelte'
  import ReaderSearchBar from '../search/ReaderSearchBar.svelte'
  import { createReaderSearch } from '../search/reader-search.ts'
  import UiIcon from './UiIcon.svelte'
  import type { ParshaPickerComponentProps } from './ParshaPicker.ts'
  import {
    ALIYAH_HOVER_FLYOUT_QUERY,
    POPUP_VIEWPORT_MARGIN,
    calculateAnchoredPopupMaxHeight,
    calculateAnchoredPopupPosition,
    calculateFlyoutPopupPosition,
    type ParshaAliyahChoice,
    type ParshaAliyahChoiceGroup,
    type ParshaPickerEntry,
  } from './parsha-picker-model.ts'
  import {
    generateTorahReferenceHash,
    listTorahBooks,
    listTorahChapters,
    listTorahVerses,
  } from './torah-reference.ts'

  let {
    model,
    calendarSettings,
    animateOnOpen,
    onCalendarSettingsChange,
    navigate,
    document: ownerDocument,
    view,
    getActions,
    requestClose,
    isBookmarkAction,
    formatBadge,
    connectSearch,
  }: ParshaPickerComponentProps = $props()

  type AliyahMenuState = {
    entryId: string
    entryLabel: string
    trigger: HTMLAnchorElement
    groups: ParshaAliyahChoiceGroup[]
    activeGroupIndex: number | null
  }

  const dateFormat = Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })
  const torahBooks = listTorahBooks()
  const firstBook = torahBooks[0]
  if (!firstBook) throw new Error('Torah reference index has no books')

  let searchQuery = $state('')

  const initialChapters = listTorahChapters(firstBook.number)
  const initialChapter = initialChapters[0] ?? 1
  const initialVerses = listTorahVerses(
    firstBook.number,
    initialChapter
  )
  let selectedBook = $state(firstBook.number)
  let chapters = $state(initialChapters)
  let selectedChapter = $state(initialChapter)
  let verses = $state(initialVerses)
  let selectedVerse = $state(initialVerses[0] ?? 1)

  let flyoutMedia: MediaQueryList | null = null
  let hoverFlyout = $state(false)
  let menu = $state<AliyahMenuState | null>(null)
  let menuStack = $state<HTMLElement | null>(null)
  let popup = $state<HTMLElement | null>(null)
  let submenu = $state<HTMLElement | null>(null)

  function isModifiedClick(event: MouseEvent) {
    return (
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
  }

  function navigateLink(event: MouseEvent, href: string) {
    if (isModifiedClick(event)) return false
    event.preventDefault()
    navigate(href)
    return true
  }

  function updateBook(rawValue: string) {
    const book = Number(rawValue)
    const nextChapters = listTorahChapters(book)
    const chapter = nextChapters.includes(selectedChapter)
      ? selectedChapter
      : nextChapters[0] ?? 1
    const nextVerses = listTorahVerses(book, chapter)
    flushSync(() => {
      selectedBook = book
      chapters = nextChapters
      selectedChapter = chapter
      verses = nextVerses
      selectedVerse = nextVerses.includes(selectedVerse)
        ? selectedVerse
        : nextVerses[0] ?? 1
    })
  }

  function updateChapter(rawValue: string) {
    const chapter = Number(rawValue)
    const nextVerses = listTorahVerses(selectedBook, chapter)
    flushSync(() => {
      selectedChapter = chapter
      verses = nextVerses
      selectedVerse = nextVerses.includes(selectedVerse)
        ? selectedVerse
        : nextVerses[0] ?? 1
    })
  }

  function submitTorahReference(event: SubmitEvent) {
    event.preventDefault()
    navigate(
      generateTorahReferenceHash({
        book: selectedBook,
        chapter: selectedChapter,
        verse: selectedVerse,
      })
    )
  }

  function portal(node: HTMLElement) {
    ownerDocument.body.appendChild(node)
    return {
      destroy() {
        node.remove()
      },
    }
  }

  function closeAliyahMenu() {
    if (!menu) return
    flushSync(() => {
      menu = null
    })
  }

  function positionAliyahPopup() {
    if (!menu || !popup) return
    const triggerRect = menu.trigger.getBoundingClientRect()
    const viewport = { width: view.innerWidth, height: view.innerHeight }

    if (hoverFlyout) {
      popup.style.maxHeight = `${Math.max(
        0,
        viewport.height - POPUP_VIEWPORT_MARGIN * 2
      )}px`
      const { left, top, side } = calculateFlyoutPopupPosition({
        anchorRect: triggerRect,
        popupRect: popup.getBoundingClientRect(),
        viewport,
      })
      popup.dataset.flyoutSide = side
      popup.style.left = `${left}px`
      popup.style.top = `${top}px`
      return
    }

    delete popup.dataset.flyoutSide
    popup.style.maxHeight = `${calculateAnchoredPopupMaxHeight(
      triggerRect,
      viewport
    )}px`
    const { left, top } = calculateAnchoredPopupPosition({
      triggerRect,
      popupRect: popup.getBoundingClientRect(),
      viewport,
    })
    popup.style.left = `${left}px`
    popup.style.top = `${top}px`
  }

  function positionAliyahSubmenu() {
    if (
      !menu ||
      menu.activeGroupIndex === null ||
      !submenu ||
      !popup
    ) {
      return
    }
    const groupOption = popup.querySelector<HTMLElement>(
      `[data-choice-group-index="${menu.activeGroupIndex}"]`
    )
    if (!groupOption) return

    const { left, top, side } = calculateFlyoutPopupPosition({
      anchorRect: popup.getBoundingClientRect(),
      verticalAnchorRect: groupOption.getBoundingClientRect(),
      popupRect: submenu.getBoundingClientRect(),
      viewport: { width: view.innerWidth, height: view.innerHeight },
    })
    submenu.dataset.flyoutSide = side
    groupOption.dataset.flyoutSide = side
    submenu.style.left = `${left}px`
    submenu.style.top = `${top}px`
  }

  function showAliyahMenu(
    trigger: HTMLAnchorElement,
    entry: ParshaPickerEntry
  ) {
    if (menu?.trigger === trigger) return
    closeAliyahMenu()
    flushSync(() => {
      menu = {
        entryId: entry.id,
        entryLabel: entry.label,
        trigger,
        groups: entry.aliyahGroups,
        activeGroupIndex: null,
      }
    })
    positionAliyahPopup()
  }

  function showAliyahGroup(groupIndex: number, focusFirstChoice = false) {
    if (!menu || !menu.groups[groupIndex]) return
    flushSync(() => {
      if (menu) menu = { ...menu, activeGroupIndex: groupIndex }
    })
    positionAliyahPopup()
    if (hoverFlyout) positionAliyahSubmenu()
    if (focusFirstChoice) {
      const target = hoverFlyout ? submenu : popup
      target?.querySelector<HTMLElement>('.aliyah-selection-option')?.focus()
    }
  }

  function showAliyahGroupList(focusGroupIndex?: number) {
    if (!menu) return
    flushSync(() => {
      if (menu) menu = { ...menu, activeGroupIndex: null }
    })
    positionAliyahPopup()
    if (focusGroupIndex !== undefined) {
      popup
        ?.querySelector<HTMLElement>(
          `[data-choice-group-index="${focusGroupIndex}"]`
        )
        ?.focus()
    }
  }

  function handleParshaPointerOver(
    event: PointerEvent,
    entry: ParshaPickerEntry
  ) {
    const trigger = event.currentTarget as HTMLAnchorElement
    if (
      !hoverFlyout ||
      trigger.contains(event.relatedTarget as Node | null)
    ) {
      return
    }
    showAliyahMenu(trigger, entry)
  }

  function handleParshaClick(
    event: MouseEvent,
    entry: ParshaPickerEntry
  ) {
    if (isModifiedClick(event)) return
    event.preventDefault()
    showAliyahMenu(event.currentTarget as HTMLAnchorElement, entry)
  }

  function handleParshaKeydown(
    event: KeyboardEvent,
    entry: ParshaPickerEntry
  ) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      showAliyahMenu(event.currentTarget as HTMLAnchorElement, entry)
      popup?.querySelector<HTMLElement>('.aliyah-selection-option')?.focus()
      return
    }
    if (event.key === 'Escape') closeAliyahMenu()
  }

  function handleGroupPointerOver(event: PointerEvent, groupIndex: number) {
    const groupOption = event.currentTarget as HTMLElement
    if (
      !hoverFlyout ||
      groupOption.contains(event.relatedTarget as Node | null)
    ) {
      return
    }
    showAliyahGroup(groupIndex)
  }

  function handleGroupClick(event: MouseEvent, groupIndex: number) {
    event.stopPropagation()
    showAliyahGroup(groupIndex, event.detail === 0)
  }

  function handleChoiceClick(event: MouseEvent, choice: ParshaAliyahChoice) {
    navigateLink(event, choice.href)
    closeAliyahMenu()
  }

  function handleDocumentPointerDown(event: PointerEvent) {
    if (!menu) return
    const path = event.composedPath()
    if (
      (menuStack && path.includes(menuStack)) ||
      path.includes(menu.trigger)
    ) {
      return
    }
    closeAliyahMenu()
  }

  function handleDocumentKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape' || !menu) return
    event.preventDefault()
    const groupIndex = menu.activeGroupIndex
    if (groupIndex !== null) {
      showAliyahGroupList(groupIndex)
      return
    }
    const trigger = menu.trigger
    closeAliyahMenu()
    trigger.focus()
  }

  function handleResize() {
    if (!menu) return
    positionAliyahPopup()
    if (hoverFlyout) positionAliyahSubmenu()
  }

  function handleFlyoutChange(event: MediaQueryListEvent) {
    flushSync(() => {
      hoverFlyout = event.matches
      if (menu) menu = { ...menu, activeGroupIndex: null }
    })
    positionAliyahPopup()
  }

  onMount(() => {
    flyoutMedia = view.matchMedia(ALIYAH_HOVER_FLYOUT_QUERY)
    flushSync(() => {
      hoverFlyout = flyoutMedia?.matches ?? false
    })
    ownerDocument.addEventListener(
      'pointerdown',
      handleDocumentPointerDown,
      true
    )
    ownerDocument.addEventListener('keydown', handleDocumentKeydown)
    view.addEventListener('resize', handleResize)
    flyoutMedia.addEventListener('change', handleFlyoutChange)

    return () => {
      ownerDocument.removeEventListener(
        'pointerdown',
        handleDocumentPointerDown,
        true
      )
      ownerDocument.removeEventListener('keydown', handleDocumentKeydown)
      view.removeEventListener('resize', handleResize)
      flyoutMedia?.removeEventListener('change', handleFlyoutChange)
      flyoutMedia = null
      closeAliyahMenu()
    }
  })
</script>

<div
  class="parsha-picker"
  class:mod-animate-open={animateOnOpen}
  onscroll={closeAliyahMenu}
>
  <div class="stack xlarge">
    <div class="centerize">
      <ReaderSearchBar
        presentation="embedded"
        createSearch={() =>
          createReaderSearch(model.searchLeinings, getActions())}
        {navigate}
        {requestClose}
        resultActivated={() => undefined}
        queryChanged={(query) => (searchQuery = query)}
        {isBookmarkAction}
        {formatBadge}
        connect={connectSearch}
      />
    </div>

    <section class="calendar-settings" dir="ltr">
      <label class="calendar-settings-toggle">
        <input
          data-target-id="calendar-israel-toggle"
          type="checkbox"
          checked={calendarSettings.israel}
          onchange={(event) =>
            onCalendarSettingsChange({
              israel: event.currentTarget.checked,
            })}
        />
        <span>🇮🇱 In Israel</span>
      </label>
    </section>

    <section class="torah-reference-panel" dir="ltr">
      <div class="stack medium">
        <div class="torah-reference-header">
          <div class="section-label">Go to Torah reference</div>
          <p class="torah-reference-copy">
            Jump straight to a chapter and verse in the Torah.
          </p>
        </div>
        <form
          class="torah-reference-form"
          data-target-id="torah-reference-form"
          onsubmit={submitTorahReference}
        >
          <div class="torah-reference-grid">
            <label class="torah-reference-field">
              <span>Sefer</span>
              <select
                data-target-id="torah-book-select"
                value={selectedBook}
                onchange={(event) => updateBook(event.currentTarget.value)}
              >
                {#each torahBooks as book (book.number)}
                  <option value={book.number}>
                    {book.label} · {book.hebrew}
                  </option>
                {/each}
              </select>
            </label>
            <label class="torah-reference-field">
              <span>Chapter</span>
              <select
                data-target-id="torah-chapter-select"
                value={selectedChapter}
                onchange={(event) => updateChapter(event.currentTarget.value)}
              >
                {#each chapters as chapter (chapter)}
                  <option value={chapter}>{chapter}</option>
                {/each}
              </select>
            </label>
            <label class="torah-reference-field">
              <span>Verse</span>
              <select
                data-target-id="torah-verse-select"
                value={selectedVerse}
                onchange={(event) =>
                  (selectedVerse = Number(event.currentTarget.value))}
              >
                {#each verses as verse (verse)}
                  <option value={verse}>{verse}</option>
                {/each}
              </select>
            </label>
          </div>
          <button class="torah-reference-button" type="submit">Go</button>
        </form>
      </div>
    </section>

    <section
      dir="ltr"
      id="coming-up"
      class="section mod-alternate mod-padding"
      class:u-hidden={Boolean(searchQuery)}
    >
      <div class="stack medium">
        <div class="section-label">Coming up</div>
        <div style="overflow-x: auto;">
          <ol
            id="coming-up-readings-list"
            class="cluster"
            style="list-style: none; display: table; margin-left: auto; margin-right: auto; white-space: nowrap;"
          >
            {#each model.comingUp as reading (reading.id)}
              <li
                style="display: table-cell; width: calc(100% / 3); padding: 0 0.5em;"
              >
                <div
                  class="stack small"
                  style="display: flex; flex-direction: column; align-items: center;"
                >
                  <a
                    href={reading.href}
                    class="coming-up-button"
                    onclick={(event) =>
                      navigateLink(event, reading.href)}
                  >
                    {reading.label}
                  </a>
                  <time class="coming-up-date">
                    {dateFormat.format(reading.date)}
                  </time>
                </div>
              </li>
            {/each}
          </ol>
        </div>
      </div>
    </section>

    <div class="browse" class:u-hidden={Boolean(searchQuery)}>
      <h2 class="section-heading">פרשת השבוע</h2>
      <ol class="parsha-books mod-emphasize-first-in-group">
        {#each model.parshaBooks as book, bookIndex (book[0]?.id ?? bookIndex)}
          <li class="parsha-book">
            <ol class="parsha-list">
              {#each book as entry (entry.id)}
                <li>
                  <a
                    class="parsha"
                    href={entry.href}
                    data-aliyah-choice-id={entry.aliyahGroups.length
                      ? entry.id
                      : undefined}
                    aria-expanded={entry.aliyahGroups.length
                      ? menu?.entryId === entry.id
                      : undefined}
                    aria-controls={entry.aliyahGroups.length
                      ? `${entry.id}-menu`
                      : undefined}
                    onpointerover={(event) =>
                      handleParshaPointerOver(event, entry)}
                    onfocus={(event) =>
                      showAliyahMenu(event.currentTarget, entry)}
                    onclick={(event) => handleParshaClick(event, entry)}
                    onkeydown={(event) =>
                      handleParshaKeydown(event, entry)}
                  >
                    {entry.label}
                  </a>
                </li>
              {/each}
            </ol>
          </li>
        {/each}
      </ol>

      <h2 class="section-heading">חגים</h2>
      <ol class="parsha-books mod-holidays">
        {#each model.holidayColumns as column, columnIndex (column[0]?.id ?? columnIndex)}
          <li class="parsha-book">
            <ol class="parsha-list">
              {#each column as entry (entry.id)}
                <li>
                  <a
                    class="parsha"
                    href={entry.href}
                    onclick={(event) => navigateLink(event, entry.href)}
                  >
                    {entry.label}
                  </a>
                </li>
              {/each}
            </ol>
          </li>
        {/each}
      </ol>

      <h2 class="section-heading">מגילות</h2>
      <ol class="parsha-books">
        <li class="parsha-book">
          <ol class="parsha-list">
            {#each model.megillot as entry (entry.id)}
              <li>
                <a
                  class="parsha"
                  href={entry.href}
                  onclick={(event) => navigateLink(event, entry.href)}
                >
                  {entry.label}
                </a>
              </li>
            {/each}
          </ol>
        </li>
      </ol>
    </div>
  </div>
</div>

{#if menu}
  <div bind:this={menuStack} use:portal class="aliyah-selection-stack">
    <div
      bind:this={popup}
      class="aliyah-selection-popup"
      id={`${menu.entryId}-menu`}
      role="group"
      tabindex="-1"
      aria-label="Select aliyah"
    >
      {#if menu.groups.length === 1}
        <div class="aliyah-selection-heading">{menu.groups[0].label}</div>
        {#each menu.groups[0].choices as choice (choice.href)}
          <a
            class="aliyah-selection-option"
            href={choice.href}
            onclick={(event) => handleChoiceClick(event, choice)}
          >
            {choice.label}
          </a>
        {/each}
      {:else if !hoverFlyout && menu.activeGroupIndex !== null}
        {@const activeGroup = menu.groups[menu.activeGroupIndex]}
        {#if activeGroup}
          <div class="aliyah-selection-subview-header">
            <button
              class="aliyah-selection-back"
              type="button"
              data-aliyah-subview-back
              aria-label="Back to parsha choices"
              onclick={() => showAliyahGroupList(menu?.activeGroupIndex ?? 0)}
            >
              <UiIcon name="arrowLeft" />
              <span>Back</span>
            </button>
            <div class="aliyah-selection-heading">{activeGroup.label}</div>
            <span aria-hidden="true"></span>
          </div>
          {#each activeGroup.choices as choice (choice.href)}
            <a
              class="aliyah-selection-option"
              href={choice.href}
              onclick={(event) => handleChoiceClick(event, choice)}
            >
              {choice.label}
            </a>
          {/each}
        {/if}
      {:else}
        <div class="aliyah-selection-heading">{menu.entryLabel}</div>
        {#each menu.groups as group, groupIndex (group.label)}
          <button
            class="aliyah-selection-option mod-group"
            type="button"
            data-choice-group-index={groupIndex}
            aria-expanded={menu.activeGroupIndex === groupIndex}
            onpointerover={(event) =>
              handleGroupPointerOver(event, groupIndex)}
            onclick={(event) => handleGroupClick(event, groupIndex)}
          >
            <span>{group.label}</span>
            <span class="aliyah-selection-group-arrow" aria-hidden="true">
              <UiIcon name="arrowRight" />
            </span>
          </button>
        {/each}
      {/if}
    </div>

    {#if hoverFlyout && menu.activeGroupIndex !== null}
      {@const activeGroup = menu.groups[menu.activeGroupIndex]}
      {#if activeGroup}
        {#key menu.activeGroupIndex}
          <div
            bind:this={submenu}
            class="aliyah-selection-popup mod-submenu"
            role="group"
            tabindex="-1"
            aria-label={`Select aliyah from ${activeGroup.label}`}
          >
            <div class="aliyah-selection-heading">{activeGroup.label}</div>
            {#each activeGroup.choices as choice (choice.href)}
              <a
                class="aliyah-selection-option"
                href={choice.href}
                onclick={(event) => handleChoiceClick(event, choice)}
              >
                {choice.label}
              </a>
            {/each}
          </div>
        {/key}
      {/if}
    {/if}
  </div>
{/if}
