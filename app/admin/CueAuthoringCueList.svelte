<script lang="ts">
  import { flushSync, onDestroy, onMount } from 'svelte'
  import type {
    CueAuthoringCueList,
    CueAuthoringCueListComponentProps,
    CueAuthoringCueListItem,
    CueAuthoringCueListSnapshot,
  } from './cue-authoring-cue-list.ts'

  let {
    view,
    formatTimestamp,
    action,
    connect,
  }: CueAuthoringCueListComponentProps = $props()

  let list: HTMLElement
  let items = $state<CueAuthoringCueListItem[]>([])
  let emptyMessage = $state<string | null>(
    'Select an aliyah to load timing.'
  )
  let selectedIndex = $state(-1)
  let currentIndex = $state(-1)
  let lastRenderedCueCount = 0
  let lastFollowedCueIndex = -1
  let panelFrame = 0

  const hasSelection = $derived(selectedIndex >= 0)
  const canMovePrevious = $derived(selectedIndex > 0)
  const canMoveNext = $derived(
    hasSelection && selectedIndex < items.length - 1
  )

  const rows = $derived.by(() =>
    items.map((item, index) => {
      const previous = items[index - 1]
      const gap = previous ? item.timeStart - previous.timeStart : null
      const deltaText = gap === null ? 'start' : `+${gap.toFixed(3)}s`
      const note =
        gap !== null && gap <= 0
          ? 'Out of order'
          : gap !== null && gap > 8
            ? `Long gap ${gap.toFixed(3)}s`
            : ''
      const tone =
        gap !== null && gap <= 0
          ? 'invalid'
          : gap !== null && gap > 8
            ? 'warning'
            : 'normal'
      const timeText = formatTimestamp(item.timeStart)
      const label =
        `Select saved timing for ${item.tokenLabel} at ${timeText}` +
        (note ? `. ${note}` : '')
      return {
        ...item,
        index,
        deltaText,
        label,
        note,
        timeText,
        tone,
      }
    })
  )

  function cancelPanelFrame() {
    if (!panelFrame) return
    view.cancelAnimationFrame(panelFrame)
    panelFrame = 0
  }

  function syncViewport(followIndex: number | null) {
    const cueRows = Array.from(
      list.querySelectorAll<HTMLElement>('.admin-cue-row')
    )
    if (!cueRows.length) {
      list.style.maxHeight = ''
      lastRenderedCueCount = 0
      lastFollowedCueIndex = -1
      cancelPanelFrame()
      return
    }

    const visibleRows = cueRows.slice(0, 5)
    const listStyles = view.getComputedStyle(list)
    const rowGap =
      Number.parseFloat(listStyles.rowGap || listStyles.gap || '0') || 0
    const viewportHeight =
      visibleRows.reduce((height, row) => height + row.offsetHeight, 0) +
      rowGap * Math.max(visibleRows.length - 1, 0)
    list.style.maxHeight = `${Math.ceil(viewportHeight)}px`

    const shouldFollow =
      followIndex !== null &&
      followIndex >= 0 &&
      followIndex < cueRows.length &&
      (followIndex !== lastFollowedCueIndex ||
        cueRows.length !== lastRenderedCueCount)
    if (shouldFollow) {
      const row = cueRows[followIndex]
      const rowRect = row?.getBoundingClientRect()
      const listRect = list.getBoundingClientRect()
      if (rowRect && rowRect.top < listRect.top) {
        list.scrollTop -= listRect.top - rowRect.top
      } else if (rowRect && rowRect.bottom > listRect.bottom) {
        list.scrollTop += rowRect.bottom - listRect.bottom
      }

      cancelPanelFrame()
      panelFrame = view.requestAnimationFrame(() => {
        panelFrame = 0
        const panel = list.closest<HTMLElement>(
          '[data-target-id="admin-panel"]'
        )
        if (!panel || panel.classList.contains('u-hidden')) return
        panel.scrollTop = panel.scrollHeight - panel.clientHeight
      })
      lastFollowedCueIndex = followIndex
    }
    lastRenderedCueCount = cueRows.length
  }

  function sync(snapshot: CueAuthoringCueListSnapshot) {
    flushSync(() => {
      items = [...snapshot.items]
      emptyMessage = snapshot.emptyMessage
      selectedIndex = snapshot.selectedIndex
      currentIndex = snapshot.currentIndex
    })
    syncViewport(snapshot.followIndex)
  }

  function setCurrent(index: number) {
    if (
      index === currentIndex &&
      index === lastFollowedCueIndex
    ) {
      return
    }
    flushSync(() => {
      currentIndex = index
    })
    syncViewport(index)
  }

  function focus(index: number) {
    if (index < 0) return
    list
      .querySelector<HTMLButtonElement>(
        `[data-admin-cue-index="${index}"]`
      )
      ?.focus({ preventScroll: true })
  }

  const cueList: CueAuthoringCueList = {
    sync,
    setCurrent,
    focus,
  }

  onMount(() => {
    connect(cueList)
  })

  onDestroy(cancelPanelFrame)
</script>

<div class="admin-cue-list-module">
  <div class="admin-panel-actions mod-secondary">
    <button
      type="button"
      class="toolbar-button"
      data-target-id="admin-prev-saved"
      aria-label="Select the previous saved word timing"
      title="Select the previous saved word timing"
      disabled={!canMovePrevious}
      onclick={() => action({ type: 'move', delta: -1 })}
    >Prev Saved</button>
    <button
      type="button"
      class="toolbar-button"
      data-target-id="admin-play-current"
      aria-label="Play audio from the selected word timing"
      title="Play audio from the selected word timing"
      disabled={!hasSelection}
      onclick={() => action({ type: 'play' })}
    >Play Current</button>
    <button
      type="button"
      class="toolbar-button"
      data-target-id="admin-next-saved"
      aria-label="Select the next saved word timing"
      title="Select the next saved word timing"
      disabled={!canMoveNext}
      onclick={() => action({ type: 'move', delta: 1 })}
    >Next Saved</button>
    <button
      type="button"
      class="toolbar-button"
      data-target-id="admin-trim-here"
      aria-label="Delete saved timings after the selected word"
      title="Delete saved timings after the selected word"
      disabled={!hasSelection}
      onclick={() => action({ type: 'trim' })}
    >Trim From Here</button>
  </div>
  <div class="admin-panel-actions mod-secondary mod-timing">
    <button
      type="button"
      class="toolbar-button"
      data-admin-nudge="-0.25"
      title="Move the selected word timing 250 milliseconds earlier"
      aria-label="Move the selected word timing 250 milliseconds earlier"
      disabled={!hasSelection}
      onclick={() => action({ type: 'nudge', seconds: -0.25 })}
    >-250</button>
    <button
      type="button"
      class="toolbar-button"
      data-admin-nudge="-0.05"
      title="Move the selected word timing 50 milliseconds earlier"
      aria-label="Move the selected word timing 50 milliseconds earlier"
      disabled={!hasSelection}
      onclick={() => action({ type: 'nudge', seconds: -0.05 })}
    >-50</button>
    <button
      type="button"
      class="toolbar-button"
      data-admin-nudge="0.05"
      title="Move the selected word timing 50 milliseconds later"
      aria-label="Move the selected word timing 50 milliseconds later"
      disabled={!hasSelection}
      onclick={() => action({ type: 'nudge', seconds: 0.05 })}
    >+50</button>
    <button
      type="button"
      class="toolbar-button"
      data-admin-nudge="0.25"
      title="Move the selected word timing 250 milliseconds later"
      aria-label="Move the selected word timing 250 milliseconds later"
      disabled={!hasSelection}
      onclick={() => action({ type: 'nudge', seconds: 0.25 })}
    >+250</button>
  </div>
  <div
    bind:this={list}
    class="admin-cue-list"
    data-target-id="admin-cue-list"
  >
    {#if emptyMessage}
      <div class="admin-cue-empty">{emptyMessage}</div>
    {:else}
      {#each rows as row (row.key)}
        <button
          type="button"
          class="admin-cue-row"
          class:is-selected={row.index === selectedIndex}
          class:is-current={row.index === currentIndex}
          class:mod-warning={row.tone === 'warning'}
          class:mod-invalid={row.tone === 'invalid'}
          data-admin-cue-index={row.index}
          title={row.label}
          aria-label={row.label}
          onclick={() => action({ type: 'select', index: row.index })}
        >
          <span class="admin-cue-index">{row.index + 1}</span>
          <span class="admin-cue-token">{row.tokenLabel}</span>
          <span class="admin-cue-time">{row.timeText}</span>
          <span class="admin-cue-delta">{row.deltaText}</span>
          {#if row.note}
            <span class="admin-cue-note">{row.note}</span>
          {/if}
        </button>
      {/each}
    {/if}
  </div>
</div>

<style>
  .admin-cue-list-module {
    display: grid;
    gap: 0.8rem;
  }
</style>
