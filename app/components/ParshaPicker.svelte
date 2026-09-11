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
    trigger: HTMLElement
    groups: ParshaAliyahChoiceGroup[]
    activeGroupIndex: number | null
  }

  type MobileLibraryView =
    | { kind: 'root' }
    | { kind: 'book'; bookIndex: number }
    | { kind: 'holidays' }
    | { kind: 'megillot' }
    | { kind: 'reference-books' }
    | { kind: 'reference-chapters'; book: number }
    | { kind: 'reference-verses'; book: number; chapter: number }
    | { kind: 'calendar' }

  const dateFormat = Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })
  const torahBooks = listTorahBooks()
  const firstBook = torahBooks[0]
  if (!firstBook) throw new Error('Torah reference index has no books')

  let searchQuery = $state('')
  let compactLibrary = $state(false)
  let mobileView = $state<MobileLibraryView>({ kind: 'root' })
  let mobileExpandedEntryId = $state<string | null>(null)
  let mobileGroupIndex = $state(0)
  let lastMobileBookIndex = $state<number | null>(null)
  let mobileLibraryTransitionActive = $state(false)
  let mobileLibraryTransition: ViewTransition | null = null
  let mobileRootScrollTop = 0
  let pickerScroller: HTMLElement | null = null

  const continueReading = $derived.by(() =>
    getActions().find(
      (action) => action.id === 'resume.last-reading' && action.href
    )
  )
  const continueReadingHref = $derived(continueReading?.href ?? null)
  const continueReadingLabel = $derived(
    continueReading?.label.replace(/^Resume\s+/, '')
  )
  const mobileComingUp = $derived([...model.comingUp].reverse())

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
  let compactMedia: MediaQueryList | null = null
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

  function openMobileView(nextView: MobileLibraryView) {
    mobileExpandedEntryId = null
    mobileGroupIndex = 0
    mobileView = nextView
  }

  function clearMobileLibraryTransition(transition: ViewTransition) {
    if (mobileLibraryTransition !== transition) return
    mobileLibraryTransition = null
    mobileLibraryTransitionActive = false
    delete ownerDocument.documentElement.dataset.mobileLibraryTransition
  }

  function runMobileLibraryTransition(
    event: MouseEvent,
    direction: 'forward' | 'back',
    update: () => void
  ) {
    const shouldAnimate =
      event.detail > 0 &&
      !view.matchMedia('(prefers-reduced-motion: reduce)').matches &&
      typeof ownerDocument.startViewTransition === 'function'

    if (!shouldAnimate) {
      update()
      return
    }

    mobileLibraryTransition?.skipTransition()
    flushSync(() => {
      mobileLibraryTransitionActive = true
    })
    ownerDocument.documentElement.dataset.mobileLibraryTransition = direction

    const transition = ownerDocument.startViewTransition(update)
    mobileLibraryTransition = transition
    void transition.finished.then(
      () => clearMobileLibraryTransition(transition),
      (error) => {
        console.warn('Mobile Library navigation transition did not finish', error)
        clearMobileLibraryTransition(transition)
      }
    )
  }

  function openMobileBook(event: MouseEvent, bookIndex: number) {
    const rootScrollTop = pickerScroller?.scrollTop ?? 0
    runMobileLibraryTransition(event, 'forward', () => {
      flushSync(() => {
        mobileRootScrollTop = rootScrollTop
        lastMobileBookIndex = bookIndex
        openMobileView({ kind: 'book', bookIndex })
      })
      if (pickerScroller) pickerScroller.scrollTop = 0
      ownerDocument
        .querySelector<HTMLElement>('.mobile-library-back')
        ?.focus({ preventScroll: true })
    })
  }

  function mobileBack(event?: MouseEvent) {
    if (mobileView.kind === 'book' && event) {
      const bookIndex = mobileView.bookIndex
      runMobileLibraryTransition(event, 'back', () => {
        flushSync(() => {
          openMobileView({ kind: 'root' })
        })
        if (pickerScroller) pickerScroller.scrollTop = mobileRootScrollTop
        const bookNumber = torahBooks[bookIndex]?.number
        if (bookNumber === undefined) return
        ownerDocument
          .querySelector<HTMLElement>(`[data-mobile-book="${bookNumber}"]`)
          ?.focus({ preventScroll: true })
      })
      return
    }
    if (mobileView.kind === 'reference-chapters') {
      openMobileView({ kind: 'reference-books' })
      return
    }
    if (mobileView.kind === 'reference-verses') {
      openMobileView({
        kind: 'reference-chapters',
        book: mobileView.book,
      })
      return
    }
    openMobileView({ kind: 'root' })
  }

  function mobileBackLabel() {
    const currentView = mobileView
    if (currentView.kind === 'book') return 'Books'
    if (currentView.kind === 'reference-chapters') return 'Torah Reference'
    if (currentView.kind === 'reference-verses') {
      return torahBooks.find((book) => book.number === currentView.book)?.label ??
        'Chapters'
    }
    return 'Library'
  }

  function mobileViewTitle() {
    const currentView = mobileView
    if (currentView.kind === 'book') {
      return torahBooks[currentView.bookIndex]?.label ?? 'Torah'
    }
    if (currentView.kind === 'holidays') return 'Holidays'
    if (currentView.kind === 'megillot') return 'Megillot'
    if (currentView.kind === 'reference-books') return 'Torah Reference'
    if (currentView.kind === 'reference-chapters') {
      return torahBooks.find((book) => book.number === currentView.book)?.label ??
        'Chapters'
    }
    if (currentView.kind === 'reference-verses') {
      const book = torahBooks.find((candidate) => candidate.number === currentView.book)
      return `${book?.label ?? 'Torah'} ${currentView.chapter}`
    }
    return 'Calendar'
  }

  function toggleMobileAliyot(entry: ParshaPickerEntry) {
    if (mobileExpandedEntryId === entry.id) {
      mobileExpandedEntryId = null
      return
    }
    mobileExpandedEntryId = entry.id
    mobileGroupIndex = 0
  }

  function chooseCalendarRegion(israel: boolean) {
    if (calendarSettings.israel === israel) {
      mobileBack()
      return
    }
    onCalendarSettingsChange({ israel })
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
      const rowRect = menu.trigger.closest('.parsha-row')?.getBoundingClientRect()
      const { left, top, side } = calculateFlyoutPopupPosition({
        anchorRect: rowRect ?? triggerRect,
        popupRect: popup.getBoundingClientRect(),
        viewport,
        preferredSide: 'left',
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
    trigger: HTMLElement,
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

  function handleAliyahTriggerPointerOver(
    event: PointerEvent,
    entry: ParshaPickerEntry
  ) {
    const trigger = event.currentTarget as HTMLElement
    if (
      !hoverFlyout ||
      trigger.contains(event.relatedTarget as Node | null)
    ) {
      return
    }
    showAliyahMenu(trigger, entry)
  }

  function handleAliyahTriggerClick(
    event: MouseEvent,
    entry: ParshaPickerEntry
  ) {
    event.preventDefault()
    const trigger = event.currentTarget as HTMLElement
    if (menu?.trigger === trigger) {
      closeAliyahMenu()
      return
    }
    showAliyahMenu(trigger, entry)
  }

  function handleAliyahTriggerKeydown(
    event: KeyboardEvent,
    entry: ParshaPickerEntry
  ) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      showAliyahMenu(event.currentTarget as HTMLElement, entry)
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

  function handleCompactChange(event: MediaQueryListEvent) {
    compactLibrary = event.matches
    closeAliyahMenu()
  }

  onMount(() => {
    flyoutMedia = view.matchMedia(ALIYAH_HOVER_FLYOUT_QUERY)
    compactMedia = view.matchMedia('(max-width: 550px)')
    flushSync(() => {
      hoverFlyout = flyoutMedia?.matches ?? false
      compactLibrary = compactMedia?.matches ?? false
    })
    ownerDocument.addEventListener(
      'pointerdown',
      handleDocumentPointerDown,
      true
    )
    ownerDocument.addEventListener('keydown', handleDocumentKeydown)
    view.addEventListener('resize', handleResize)
    flyoutMedia.addEventListener('change', handleFlyoutChange)
    compactMedia.addEventListener('change', handleCompactChange)

    return () => {
      ownerDocument.removeEventListener(
        'pointerdown',
        handleDocumentPointerDown,
        true
      )
      ownerDocument.removeEventListener('keydown', handleDocumentKeydown)
      view.removeEventListener('resize', handleResize)
      flyoutMedia?.removeEventListener('change', handleFlyoutChange)
      compactMedia?.removeEventListener('change', handleCompactChange)
      flyoutMedia = null
      compactMedia = null
      mobileLibraryTransition?.skipTransition()
      mobileLibraryTransition = null
      delete ownerDocument.documentElement.dataset.mobileLibraryTransition
      closeAliyahMenu()
    }
  })
</script>

<div
  bind:this={pickerScroller}
  class="parsha-picker"
  class:mod-animate-open={animateOnOpen}
  class:mod-mobile-page-transition={mobileLibraryTransitionActive}
  onscroll={closeAliyahMenu}
>
  {#if compactLibrary}
    <div class="mobile-library" data-target-id="mobile-library-view">
      {#if mobileView.kind === 'root'}
        <header class="mobile-library-header">
          <h1>Library</h1>
          <button
            class="mobile-library-close"
            type="button"
            aria-label="Close Library"
            onclick={requestClose}
          >
            <UiIcon name="x" />
          </button>
        </header>
      {:else}
        <header class="mobile-library-header mod-detail">
          <button
            class="mobile-library-back"
            type="button"
            aria-label={`Back to ${mobileBackLabel()}`}
            onclick={mobileBack}
          >
            <UiIcon name="arrowLeft" />
            <span>{mobileBackLabel()}</span>
          </button>
          <h1>{mobileViewTitle()}</h1>
          <button
            class="mobile-library-close"
            type="button"
            aria-label="Close Library"
            onclick={requestClose}
          >
            <UiIcon name="x" />
          </button>
        </header>
      {/if}

      <div class="mobile-library-search">
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

      {#if !searchQuery}
        <main class="mobile-library-content">
          {#if mobileView.kind === 'root'}
            {#if continueReadingHref}
              <section class="mobile-library-section">
                <h2>Continue Reading</h2>
                <a
                  class="mobile-library-destination mod-continue"
                  href={continueReadingHref}
                  data-mobile-destination="continue"
                  onclick={(event) =>
                    navigateLink(event, continueReadingHref)}
                >
                  <span class="mobile-library-destination-copy">
                    <strong dir="auto">{continueReadingLabel}</strong>
                    <small>Continue from your last place</small>
                  </span>
                  <span class="mobile-library-arrow" aria-hidden="true">
                    <UiIcon name="arrowRight" />
                  </span>
                </a>
              </section>
            {/if}

            <section class="mobile-library-section">
              <h2>Coming Up</h2>
              <ol class="mobile-coming-up">
                {#each mobileComingUp as reading (reading.id)}
                  <li>
                    <a
                      href={reading.href}
                      onclick={(event) => navigateLink(event, reading.href)}
                    >
                      <strong dir="rtl">{reading.label}</strong>
                      <time datetime={reading.date.toISOString()}>
                        {dateFormat.format(reading.date)}
                      </time>
                    </a>
                  </li>
                {/each}
              </ol>
            </section>

            <section class="mobile-library-section">
              <h2>Torah</h2>
              <div class="mobile-library-destinations">
                {#each torahBooks as book, bookIndex (book.number)}
                  <button
                    class="mobile-library-destination"
                    class:is-selected={lastMobileBookIndex === bookIndex}
                    type="button"
                    data-mobile-book={book.number}
                    onclick={(event) => openMobileBook(event, bookIndex)}
                  >
                    <span class="mobile-library-destination-copy mobile-library-book-title">
                      <span lang="en" dir="ltr">{book.label}</span>
                      <strong lang="he" dir="rtl">{book.hebrew}</strong>
                    </span>
                    <span class="mobile-library-arrow" aria-hidden="true">
                      <UiIcon name="arrowRight" />
                    </span>
                  </button>
                {/each}
              </div>
            </section>

            <section class="mobile-library-section">
              <h2>More</h2>
              <div class="mobile-library-more">
                <button
                  type="button"
                  data-mobile-destination="holidays"
                  onclick={() => openMobileView({ kind: 'holidays' })}
                >
                  <strong>Holidays</strong>
                  <small>Festival readings</small>
                </button>
                <button
                  type="button"
                  data-mobile-destination="megillot"
                  onclick={() => openMobileView({ kind: 'megillot' })}
                >
                  <strong>Megillot</strong>
                  <small>Five scrolls</small>
                </button>
                <button
                  type="button"
                  data-mobile-destination="reference"
                  onclick={() => openMobileView({ kind: 'reference-books' })}
                >
                  <strong>Torah Reference</strong>
                  <small>Book, chapter, verse</small>
                </button>
                <button
                  type="button"
                  data-mobile-destination="calendar"
                  onclick={() => openMobileView({ kind: 'calendar' })}
                >
                  <strong>Calendar</strong>
                  <small>{calendarSettings.israel ? 'Israel' : 'Diaspora'}</small>
                </button>
              </div>
            </section>
          {:else if mobileView.kind === 'book'}
            {@const book = torahBooks[mobileView.bookIndex]}
            {@const entries = model.parshaBooks[mobileView.bookIndex] ?? []}
            <section class="mobile-library-section mod-detail-list">
              <div class="mobile-library-section-heading">
                <h2>Parsha</h2>
              </div>
              <ol class="mobile-parsha-list">
                {#each entries as entry (entry.id)}
                  <li
                    class="mobile-parsha-card"
                    class:is-expanded={mobileExpandedEntryId === entry.id}
                  >
                    <button
                      class="mobile-parsha-card-row"
                      type="button"
                      data-mobile-parsha={entry.id}
                      aria-label={`Choose aliyah for ${entry.label}`}
                      aria-expanded={mobileExpandedEntryId === entry.id}
                      aria-controls={`${entry.id}-mobile-aliyot`}
                      onclick={() => toggleMobileAliyot(entry)}
                    >
                      <span class="mobile-parsha-title">
                        <span lang="en" dir="ltr" title={entry.englishLabel}>{entry.englishLabel}</span>
                        <strong lang="he" dir="rtl">{entry.label}</strong>
                      </span>
                      <UiIcon name="chevronDown" />
                    </button>
                    {#if mobileExpandedEntryId === entry.id}
                      {@const activeGroup = entry.aliyahGroups[mobileGroupIndex] ?? entry.aliyahGroups[0]}
                      <div
                        class="mobile-aliyah-choices"
                        id={`${entry.id}-mobile-aliyot`}
                      >
                        {#if entry.aliyahGroups.length > 1}
                          <div
                            class="mobile-aliyah-groups"
                            aria-label={`Reading for ${entry.label}`}
                          >
                            {#each entry.aliyahGroups as group, groupIndex (group.label)}
                              <button
                                class:is-active={mobileGroupIndex === groupIndex}
                                type="button"
                                aria-pressed={mobileGroupIndex === groupIndex}
                                onclick={() => (mobileGroupIndex = groupIndex)}
                              >{group.label}</button>
                            {/each}
                          </div>
                        {/if}
                        {#if activeGroup}
                          <div class="mobile-aliyah-links">
                            {#each activeGroup.choices as choice (choice.href)}
                              <a
                                href={choice.href}
                                onclick={(event) => handleChoiceClick(event, choice)}
                              ><span>{choice.label}</span></a>
                            {/each}
                          </div>
                        {/if}
                      </div>
                    {/if}
                  </li>
                {/each}
              </ol>
              {#if !book || !entries.length}
                <p class="mobile-library-empty">No parshiyot available.</p>
              {/if}
            </section>
          {:else if mobileView.kind === 'holidays'}
            <section class="mobile-library-section mod-detail-list">
              <h2>Festival Readings</h2>
              <ol class="mobile-simple-reading-list">
                {#each model.holidayColumns as column, columnIndex (column[0]?.id ?? columnIndex)}
                  {#each column as entry (entry.id)}
                    <li>
                      <a
                        href={entry.href}
                        onclick={(event) => navigateLink(event, entry.href)}
                      >
                        <strong dir="rtl">{entry.label}</strong>
                        <small lang="en">{entry.englishLabel}</small>
                        <span aria-hidden="true"><UiIcon name="arrowRight" /></span>
                      </a>
                    </li>
                  {/each}
                {/each}
              </ol>
            </section>
          {:else if mobileView.kind === 'megillot'}
            <section class="mobile-library-section mod-detail-list">
              <h2>Five Scrolls</h2>
              <ol class="mobile-simple-reading-list">
                {#each model.megillot as entry (entry.id)}
                  <li>
                    <a
                      href={entry.href}
                      onclick={(event) => navigateLink(event, entry.href)}
                    >
                      <strong dir="rtl">{entry.label}</strong>
                      <small lang="en">{entry.englishLabel}</small>
                      <span aria-hidden="true"><UiIcon name="arrowRight" /></span>
                    </a>
                  </li>
                {/each}
              </ol>
            </section>
          {:else if mobileView.kind === 'reference-books'}
            <section class="mobile-library-section mod-detail-list">
              <h2>Choose Book</h2>
              <div class="mobile-library-destinations">
                {#each torahBooks as book (book.number)}
                  <button
                    class="mobile-library-destination"
                    type="button"
                    data-mobile-reference-book={book.number}
                    onclick={() =>
                      openMobileView({
                        kind: 'reference-chapters',
                        book: book.number,
                      })}
                  >
                    <span class="mobile-library-destination-copy mobile-library-book-title">
                      <span lang="en" dir="ltr">{book.label}</span>
                      <strong lang="he" dir="rtl">{book.hebrew}</strong>
                    </span>
                    <span class="mobile-library-arrow" aria-hidden="true">
                      <UiIcon name="arrowRight" />
                    </span>
                  </button>
                {/each}
              </div>
            </section>
          {:else if mobileView.kind === 'reference-chapters'}
            {@const referenceBook = mobileView.book}
            <section class="mobile-library-section mod-detail-list">
              <h2>Choose Chapter</h2>
              <div class="mobile-reference-grid">
                {#each listTorahChapters(referenceBook) as chapter (chapter)}
                  <button
                    type="button"
                    data-mobile-reference-chapter={chapter}
                    onclick={() =>
                      openMobileView({
                        kind: 'reference-verses',
                        book: referenceBook,
                        chapter,
                      })}
                  >{chapter}</button>
                {/each}
              </div>
            </section>
          {:else if mobileView.kind === 'reference-verses'}
            <section class="mobile-library-section mod-detail-list">
              <h2>Choose Verse</h2>
              <div class="mobile-reference-grid">
                {#each listTorahVerses(mobileView.book, mobileView.chapter) as verse (verse)}
                  {@const href = generateTorahReferenceHash({
                    book: mobileView.book,
                    chapter: mobileView.chapter,
                    verse,
                  })}
                  <a
                    href={href}
                    data-mobile-reference-verse={verse}
                    onclick={(event) => navigateLink(event, href)}
                  >{verse}</a>
                {/each}
              </div>
            </section>
          {:else if mobileView.kind === 'calendar'}
            <section class="mobile-library-section mod-detail-list">
              <h2>Reading Calendar</h2>
              <p class="mobile-library-detail-copy">
                Choose which Torah reading calendar this Library follows.
              </p>
              <div class="mobile-calendar-options">
                <button
                  class:is-selected={!calendarSettings.israel}
                  type="button"
                  aria-pressed={!calendarSettings.israel}
                  onclick={() => chooseCalendarRegion(false)}
                >
                  <strong>Diaspora</strong>
                  <small>Outside Israel</small>
                </button>
                <button
                  class:is-selected={calendarSettings.israel}
                  type="button"
                  aria-pressed={calendarSettings.israel}
                  onclick={() => chooseCalendarRegion(true)}
                >
                  <strong>Israel</strong>
                  <small>Israeli calendar</small>
                </button>
              </div>
            </section>
          {/if}
        </main>
      {/if}
    </div>
  {:else}
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
                  <li class="parsha-row">
                    <a
                      class="parsha"
                      href={entry.href}
                      data-parsha-id={entry.id}
                      onpointerover={(event) => {
                        if (hoverFlyout && event.pointerType === 'mouse') {
                          closeAliyahMenu()
                        }
                      }}
                      onclick={(event) => navigateLink(event, entry.href)}
                    >
                      {entry.label}
                    </a>
                    {#if entry.aliyahGroups.length}
                      <button
                        class="parsha-aliyah-toggle"
                        type="button"
                        data-aliyah-choice-id={entry.id}
                        aria-label={`Choose aliyah for ${entry.label}`}
                        aria-expanded={menu?.entryId === entry.id}
                        aria-controls={`${entry.id}-menu`}
                        onpointerover={(event) =>
                          handleAliyahTriggerPointerOver(event, entry)}
                        onclick={(event) =>
                          handleAliyahTriggerClick(event, entry)}
                        onkeydown={(event) =>
                          handleAliyahTriggerKeydown(event, entry)}
                      >
                        <UiIcon name="chevronDown" />
                      </button>
                    {/if}
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
  {/if}
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
