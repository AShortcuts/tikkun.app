<script lang="ts">
  import { resolve } from '$app/paths'
  import ReadingCard from '$lib/components/ReadingCard.svelte'
  import {
    availableReadings,
    filterReadingCoverage,
    coverageSummary,
    readingCoverage,
    type CoverageFilter,
  } from '$lib/readings'

  let coverageQuery = $state('')
  let coverageFilter = $state<CoverageFilter>('all')
  let showAllCoverage = $state(false)

  const initialCoverageLimit = 12

  const coverageFilters: readonly {
    value: CoverageFilter
    label: string
    count: number
  }[] = [
    { value: 'all', label: 'All', count: readingCoverage.length },
    {
      value: 'audio',
      label: 'Has audio',
      count: readingCoverage.filter((reading) => reading.availableAliyot.length > 0).length,
    },
    {
      value: 'ready',
      label: 'Word synced',
      count: readingCoverage.filter((reading) => reading.statusKind === 'ready').length,
    },
    {
      value: 'active',
      label: 'In progress',
      count: readingCoverage.filter(
        (reading) => reading.statusKind === 'progress' || reading.statusKind === 'review'
      ).length,
    },
    {
      value: 'planned',
      label: 'Planned',
      count: readingCoverage.filter((reading) => reading.statusKind === 'planned').length,
    },
  ]

  let filteredCoverage = $derived(
    filterReadingCoverage(readingCoverage, coverageQuery, coverageFilter)
  )
  let visibleCoverage = $derived(
    showAllCoverage ? filteredCoverage : filteredCoverage.slice(0, initialCoverageLimit)
  )

  function selectCoverageFilter(filter: CoverageFilter) {
    coverageFilter = filter
    showAllCoverage = false
  }

  function clearCoverageFilters() {
    coverageQuery = ''
    coverageFilter = 'all'
    showAllCoverage = false
  }
</script>

<svelte:head>
  <title>Readings & coverage | Apple/Sentient prototype</title>
  <meta
    name="description"
    content="See which Torah readings and aliyot are available in the Tikkun Korim reader and how word-sync coverage is progressing."
  />
</svelte:head>

<main class="site-content-page">
  <section class="site-page-hero" aria-labelledby="readings-title">
    <div>
      <h1 class="site-page-title" id="readings-title">Practice what is ready.</h1>
    </div>
    <dl class="coverage-summary" aria-label="Current coverage totals">
      <div>
        <dt>Readings with audio</dt>
        <dd>{coverageSummary.readingsWithAudio}</dd>
      </div>
      <div>
        <dt>Available aliyot</dt>
        <dd>{coverageSummary.availableAliyot}</dd>
      </div>
      <div>
        <dt>Readings synced</dt>
        <dd>{coverageSummary.syncedReadings}</dd>
      </div>
    </dl>
  </section>

  <section class="site-section" aria-labelledby="available-title">
    <div class="site-section-header">
      <h2 id="available-title">Available now</h2>
      <p>Open a reading directly. The aliyah bubbles show the available recordings.</p>
    </div>
    <div class="home-readings-grid">
      {#each availableReadings as reading (reading.parshaSlug)}
        <ReadingCard {reading} />
      {/each}
    </div>
  </section>

  <section class="site-section" aria-labelledby="coverage-title">
    <div class="site-section-header">
      <h2 id="coverage-title">Full coverage</h2>
      <p>Coverage reflects the current recording catalog and maintained timing tracker.</p>
    </div>
    <div class="coverage-tools">
      <label class="coverage-search">
        <span>Find a reading</span>
        <input
          type="search"
          placeholder="English or Hebrew name"
          autocomplete="off"
          bind:value={coverageQuery}
          oninput={() => (showAllCoverage = false)}
        />
      </label>
      <div class="coverage-filters" aria-label="Filter coverage">
        {#each coverageFilters as option (option.value)}
          <button
            type="button"
            aria-pressed={coverageFilter === option.value}
            onclick={() => selectCoverageFilter(option.value)}
          >
            <span>{option.label}</span>
            <small>{option.count}</small>
          </button>
        {/each}
      </div>
    </div>
    <p class="coverage-result-count" aria-live="polite">
      Showing {visibleCoverage.length} of {filteredCoverage.length} matching readings
    </p>
    {#if filteredCoverage.length > 0}
      <div class="coverage-list" role="list" aria-label="Reading coverage results">
        {#each visibleCoverage as reading (reading.number ?? reading.parshaName)}
          <article class="coverage-row" role="listitem">
            <span class="coverage-number">{reading.number ?? '—'}</span>
            <strong class="coverage-name">{reading.parshaName}</strong>
            <span class="coverage-hebrew" dir="rtl">{reading.parshaHebrew}</span>
            <span class="coverage-aliyot">
              {reading.availableAliyot.length > 0
                ? `${reading.availableAliyot.length} aliyot`
                : 'No audio yet'}
            </span>
            <span class={`coverage-status mod-${reading.statusKind}`}>
              {reading.statusLabel}
            </span>
            {#if reading.parshaSlug}
              <a
                class="coverage-open"
                href={resolve(`/reader/#/torah/parsha/${reading.parshaSlug}`)}
                data-sveltekit-reload
              >Open</a>
            {/if}
          </article>
        {/each}
      </div>
      {#if filteredCoverage.length > initialCoverageLimit}
        <button
          class="coverage-more"
          type="button"
          aria-expanded={showAllCoverage}
          onclick={() => (showAllCoverage = !showAllCoverage)}
        >
          {showAllCoverage ? 'Show fewer readings' : `Show all ${filteredCoverage.length} readings`}
        </button>
      {/if}
    {:else}
      <div class="coverage-empty">
        <h3>No readings match.</h3>
        <p>Try another name or clear the current coverage filter.</p>
        <button type="button" onclick={clearCoverageFilters}>Clear filters</button>
      </div>
    {/if}
  </section>
</main>
