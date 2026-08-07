<script lang="ts">
  import { resolve } from '$app/paths'
  import ReadingCard from '$lib/components/ReadingCard.svelte'
  import {
    availableReadings,
    coverageSummary,
    readingCoverage,
  } from '$lib/readings'
</script>

<svelte:head>
  <title>Readings & coverage — Tikkun Korim</title>
  <meta
    name="description"
    content="See which Torah readings and aliyot are available in the Tikkun Korim reader and how word-sync coverage is progressing."
  />
</svelte:head>

<main class="site-content-page">
  <section class="site-page-hero" aria-labelledby="readings-title">
    <div>
      <p class="site-page-kicker">Readings & coverage</p>
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
    <div class="coverage-list" role="list">
      {#each readingCoverage as reading (reading.number ?? reading.parshaName)}
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
  </section>
</main>
