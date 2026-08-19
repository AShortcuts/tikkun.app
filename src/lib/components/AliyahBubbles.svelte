<script lang="ts">
  import { resolve } from '$app/paths'
  import {
    aliyahLetters,
    type CueCoverageStatus,
    type PublicAliyah,
  } from '$lib/readings'
  import {
    getLocalCueDraftStatus,
    type LocalCueDraftStatus,
  } from '$lib/local-draft-coverage'
  import { onMount } from 'svelte'

  let {
    aliyot,
    readingName = 'this reading',
    interactive = false,
  }: {
    aliyot: readonly PublicAliyah[]
    readingName?: string
    interactive?: boolean
  } = $props()

  const statusLabels: Record<CueCoverageStatus, string> = {
    cued: 'word timing ready',
    draft: 'draft timing',
    missing: 'audio available, timing not started',
    empty: 'audio not yet available',
  }
  const localStatusLabels: Record<LocalCueDraftStatus, string> = {
    draft: 'local timing draft present, not publicly verified',
  }
  let localCueStatuses = $state<Record<string, LocalCueDraftStatus>>({})

  function localStatusFor(aliyah: PublicAliyah) {
    return aliyah.audioId ? localCueStatuses[aliyah.audioId] ?? null : null
  }

  function statusDescription(
    publishedStatus: CueCoverageStatus,
    localStatus: LocalCueDraftStatus | null
  ) {
    const published = statusLabels[publishedStatus]
    return localStatus ? `${published}; ${localStatusLabels[localStatus]}` : published
  }

  onMount(() => {
    if (!interactive) return
    const draftStatuses: Record<string, LocalCueDraftStatus> = {}
    for (const aliyah of aliyot) {
      if (!aliyah.audioId) continue
      const status = getLocalCueDraftStatus(
        aliyah.audioId,
        aliyah.expectedTokenCount
      )
      if (status) draftStatuses[aliyah.audioId] = status
    }
    localCueStatuses = draftStatuses
  })
</script>

{#each aliyahLetters as letter, index (letter)}
  {@const aliyah = index + 1}
  {@const item = aliyot.find((candidate) => candidate.number === aliyah)}
  {#if item}
    {@const localStatus = localStatusFor(item)}
    {@const description = statusDescription(item.cueStatus, localStatus)}
    {@const label = `Open ${readingName}, aliyah ${aliyah}: ${description}`}
    {#if interactive}
      <a
        class={`home-aliyah-bubble home-aliyah-bubble-link mod-${item.cueStatus}`}
        class:is-available={item.cueStatus !== 'empty'}
        href={resolve(`/reader/${item.readerHash}`)}
        data-sveltekit-reload
        data-cue-status={item.cueStatus}
        data-local-cue-status={localStatus ?? undefined}
        aria-label={label}
        title={`Aliyah ${letter} — ${description}`}
      >{letter}</a>
    {:else}
      <span
        class={`home-aliyah-bubble mod-${item.cueStatus}`}
        class:is-available={item.cueStatus !== 'empty'}
        aria-label={`Aliyah ${aliyah}: ${statusLabels[item.cueStatus]}`}
      >{letter}</span>
    {/if}
  {/if}
{/each}
