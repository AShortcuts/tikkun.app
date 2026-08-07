<script lang="ts">
  import { asset, resolve } from '$app/paths'
  import AliyahBubbles from '$lib/components/AliyahBubbles.svelte'
  import ReadingCard from '$lib/components/ReadingCard.svelte'
  import { availableReadings, getRequiredReading } from '$lib/readings'

  const featuredReading = getRequiredReading('beresheet')
</script>

<svelte:head>
  <title>Tikkun Korim — Torah reading practice in sync</title>
  <meta
    name="description"
    content="Practice Torah reading with aliyah recordings, word highlighting, and the original Torah layout kept in sync."
  />
</svelte:head>

<main>
  <section class="home-hero" aria-labelledby="home-title">
    <div class="home-hero-copy">
      <p class="home-eyebrow">A clearer way to prepare</p>
      <h1 class="home-title" id="home-title">
        Your aliyah.<br /><span>In sync.</span>
      </h1>
      <p class="home-lede">
        Choose the reading, press play, and follow every word where it appears in the Torah.
      </p>
      <a
        class="home-primary-action"
        href={resolve(`/reader/#/torah/parsha/${featuredReading.parshaSlug}`)}
        data-sveltekit-reload
      >
        Start practicing
      </a>
    </div>

    <a
      class="home-reader-demo"
      href={resolve(`/reader/#/torah/parsha/${featuredReading.parshaSlug}`)}
      data-sveltekit-reload
      aria-label={`Open ${featuredReading.parshaName} in the reader`}
    >
      <span class="home-reader-window">
        <img
          src={asset('/assets/images/home-reader-demo.jpg')}
          alt="The Tikkun reader following a highlighted word in Beresheet"
          width="1000"
          height="670"
          decoding="async"
        />
      </span>
      <span class="home-reader-dock">
        <strong>{featuredReading.parshaName}</strong>
        <span class="home-reader-dock-bubbles" aria-label="All seven aliyot available">
          <AliyahBubbles availableAliyot={featuredReading.availableAliyot} />
        </span>
        <span>All aliyot ready</span>
      </span>
    </a>
  </section>

  <section class="home-story" aria-labelledby="home-story-title">
    <div class="home-section-heading">
      <p class="home-section-kicker">Designed for actual practice</p>
      <h2 id="home-story-title">See how the reading moves.</h2>
      <p>
        The recording, highlighted word, aliyah boundary, and place on the page stay together—so you can practice without losing your spot.
      </p>
    </div>
    <div class="home-practice-steps">
      <article>
        <span aria-hidden="true">01</span>
        <h3>Choose your aliyah</h3>
        <p>Open any available reading and go directly to the portion you are preparing.</p>
      </article>
      <article>
        <span aria-hidden="true">02</span>
        <h3>Listen in context</h3>
        <p>Hear the complete aliyah while the original Torah layout remains in view.</p>
      </article>
      <article>
        <span aria-hidden="true">03</span>
        <h3>Follow every word</h3>
        <p>The active word is marked as the recording moves, making it easy to recover your place.</p>
      </article>
    </div>
  </section>

  <section class="home-readings" aria-labelledby="home-readings-title">
    <div class="home-readings-heading">
      <div>
        <p class="home-section-kicker">Practice now</p>
        <h2 id="home-readings-title">Available readings</h2>
      </div>
      <p>Each bubble shows an aliyah with an available recording.</p>
    </div>
    <div class="home-readings-grid">
      {#each availableReadings as reading (reading.parshaSlug)}
        <ReadingCard {reading} />
      {/each}
    </div>
  </section>

  <section class="home-project" aria-labelledby="home-project-title">
    <p class="home-section-kicker">The work behind the reader</p>
    <h2 id="home-project-title">Built one reading at a time.</h2>
    <p>
      Recordings are aligned to the Torah text by hand, then reviewed before their word timing is marked ready.
    </p>
    <a class="home-secondary-link" href={resolve('/readings/')}>
      View readings & coverage
      <span aria-hidden="true">→</span>
    </a>
  </section>
</main>
