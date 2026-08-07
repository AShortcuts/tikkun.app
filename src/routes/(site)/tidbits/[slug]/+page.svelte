<script lang="ts">
  import type { PageProps } from './$types'

  let { data }: PageProps = $props()
</script>

<svelte:head>
  <title>{data.tidbit.title} — Tikkun Korim</title>
  <meta name="description" content={data.tidbit.summary} />
</svelte:head>

<main class="site-content-page">
  <article>
    <header class="site-page-hero">
      <div>
        <p class="site-page-kicker">
          <time datetime={data.tidbit.published}>{data.tidbit.published}</time>
        </p>
        <h1 class="site-page-title">{data.tidbit.title}</h1>
      </div>
      <p class="site-page-intro">{data.tidbit.summary}</p>
    </header>
    <div class="site-section">
      {#each data.tidbit.body as paragraph, index (index)}
        <p class="site-page-intro">{paragraph}</p>
      {/each}
    </div>
  </article>
</main>
