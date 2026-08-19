<script lang="ts">
  import { resolve } from '$app/paths'
  import type { PageProps } from './$types'

  let { data }: PageProps = $props()
</script>

<svelte:head>
  <title>{data.tidbit.title} — Tikkun Korim</title>
  <meta name="description" content={data.tidbit.summary} />
</svelte:head>

<main class="site-content-page site-article-page">
  <article class="site-article">
    <header class="site-article-header">
      <a class="site-back-link" href={resolve('/tidbits/')}>Back to tidbits</a>
      <time class="site-article-date" datetime={data.tidbit.published}>
        {data.tidbit.published}
      </time>
      <h1 class="site-page-title">{data.tidbit.title}</h1>
      <p class="site-page-intro">{data.tidbit.summary}</p>
    </header>
    <div class="site-article-body">
      {#each data.tidbit.body as paragraph, index (index)}
        <p>{paragraph}</p>
      {/each}
    </div>
  </article>
</main>
