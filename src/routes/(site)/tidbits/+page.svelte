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
      <p class="site-page-kicker">Tidbits</p>
      <h1 class="site-page-title" id="tidbits-title">Tidbits</h1>
    </div>
    {#if tidbits.length === 0}
      <p class="site-page-intro">No tidbits published yet.</p>
    {/if}
  </section>

  {#if tidbits.length > 0}
    <section class="site-section" aria-label="Published tidbits">
      <div class="coverage-list" role="list">
        {#each tidbits as tidbit (tidbit.slug)}
          <article class="coverage-row" role="listitem">
            <time class="coverage-number" datetime={tidbit.published}>
              {tidbit.published}
            </time>
            <strong class="coverage-name">{tidbit.title}</strong>
            <span class="coverage-aliyot">{tidbit.summary}</span>
            <a
              class="coverage-open"
              href={resolve(`/tidbits/${tidbit.slug}/`)}
            >Read</a>
          </article>
        {/each}
      </div>
    </section>
  {/if}
</main>
