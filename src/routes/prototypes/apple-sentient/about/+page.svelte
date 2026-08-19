<script lang="ts">
  import { resolve } from '$app/paths'
</script>

<svelte:head>
  <title>About | Apple/Sentient prototype</title>
  <meta
    name="description"
    content="About the Tikkun Korim Torah practice reader, its recordings, and its open-source project."
  />
</svelte:head>

<main class="site-content-page">
  <section class="site-page-hero" aria-labelledby="about-title">
    <div>
      <h1 class="site-page-title" id="about-title">A reader built for practice.</h1>
    </div>
    <div class="site-page-summary">
      <p class="site-page-intro">
        Tikkun Korim keeps Torah text, aliyah boundaries, audio, and word highlighting in one browser-based reader.
      </p>
      <div class="site-action-row">
        <a class="site-primary-action" href={resolve('/reader/#/next')} data-sveltekit-reload>
          Open reader
        </a>
        <a class="site-secondary-action" href={resolve('/prototypes/apple-sentient/readings/')}>See available readings</a>
      </div>
    </div>
  </section>

  <section class="about-facts" aria-label="Project facts">
    <article>
      <h2>Recordings</h2>
      <p>Current aliyah recordings are by Yoni Davidov.</p>
    </article>
    <article>
      <h2>Word timing</h2>
      <p>Recordings are aligned to the Torah text by hand and reviewed before their timing is marked ready.</p>
    </article>
    <article>
      <h2>Open source</h2>
      <p>
        The project is published under the MIT License.
        <a href="https://github.com/AShortcuts/tikkun.app" rel="noreferrer">View the source.</a>
      </p>
    </article>
  </section>
</main>
