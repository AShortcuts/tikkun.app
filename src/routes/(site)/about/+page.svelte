<script lang="ts">
  import { resolve } from '$app/paths'
  import { projectStatusRows } from '../../../../app/data/about-progress.ts'

  function projectStatusClass(status: string) {
    return `mod-${status.toLowerCase().replace(/[^a-z]+/g, '-')}`
  }
</script>

<svelte:head>
  <title>About — Tikkun Korim</title>
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
        <a class="site-secondary-action" href={resolve('/readings/')}>See available readings</a>
        <a
          class="site-secondary-action"
          href={resolve('/reader/#/about/playback-analytics')}
          data-sveltekit-reload
        >Cue analytics</a>
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
      <p>Recordings are aligned to the Torah text by hand. “Word sync ready” means every published aliyah has complete Cue Data.</p>
    </article>
    <article>
      <h2>Open source</h2>
      <p>
        The project is published under the MIT License.
        <a href="https://github.com/AShortcuts/tikkun.app" rel="noreferrer">View the source.</a>
      </p>
    </article>
  </section>

  <section class="site-section about-taskboard" aria-labelledby="taskboard-title">
    <div class="site-section-header">
      <h2 id="taskboard-title">Taskboard</h2>
      <p>Current work and the next concrete milestones for the reader.</p>
    </div>
    <div class="project-taskboard" role="list">
      {#each projectStatusRows as item (item.feature)}
        <article role="listitem">
          <header>
            <h3>{item.feature}</h3>
            <span class={`project-status ${projectStatusClass(item.status)}`}>
              {item.status}
            </span>
          </header>
          <p>{item.notes}</p>
          {#if item.nextMilestone}
            <dl>
              <dt>Next milestone</dt>
              <dd>{item.nextMilestone}</dd>
            </dl>
          {/if}
        </article>
      {/each}
    </div>
  </section>
</main>
