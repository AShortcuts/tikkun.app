<script lang="ts">
  import { resolve } from '$app/paths'
  import { tidbits } from '$lib/tidbits'
</script>

<svelte:head>
  <title>Tidbits — Tikkun Korim</title>
  <meta name="description" content="Short, practical notes from Tikkun Korim." />
</svelte:head>

<main class="site-content-page">
  <section class="site-page-hero" aria-labelledby="tidbits-title">
    <div>
      <h1 class="site-page-title" id="tidbits-title">Tidbits</h1>
    </div>
    <p class="site-page-intro">
      Short notes about the text, reading practice, and the work behind the reader.
    </p>
  </section>

  {#if tidbits.length === 0}
    <section class="site-section site-empty-section" aria-labelledby="tidbits-empty-title">
      <div class="site-empty-state">
        <h2 id="tidbits-empty-title">No tidbits published yet.</h2>
        <p>See which readings are ready to practice in the meantime.</p>
        <a class="site-inline-action" href={resolve('/readings/')}>View available readings</a>
      </div>
    </section>
  {:else}
    <section class="site-section" aria-label="Published tidbits">
      <div class="tidbit-list" role="list">
        {#each tidbits as tidbit (tidbit.slug)}
          <article class="tidbit-card" role="listitem">
            <time datetime={tidbit.published}>{tidbit.published}</time>
            <h2>{tidbit.title}</h2>
            <p>{tidbit.summary}</p>
            <a href={resolve(`/tidbits/${tidbit.slug}/`)}>Read note</a>
          </article>
        {/each}
      </div>
    </section>
  {/if}
</main>
