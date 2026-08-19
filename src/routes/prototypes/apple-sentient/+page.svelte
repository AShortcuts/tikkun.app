<script lang="ts">
  import { asset, resolve } from '$app/paths'
  import ReadingCard from '$lib/components/ReadingCard.svelte'
  import {
    PUBLIC_THEME_CONTEXT,
    type PublicTheme,
    type PublicThemeContext,
    type ResolvedPublicTheme,
  } from '$lib/prototypes/apple-sentient-theme'
  import { availableReadings, getRequiredReading } from '$lib/readings'
  import { getContext } from 'svelte'

  const featuredReading = getRequiredReading('beresheet')
  const featuredReadings = availableReadings.slice(0, 4)
  const publicTheme = getContext<PublicThemeContext>(PUBLIC_THEME_CONTEXT)

  const readerThemeImages: Record<ResolvedPublicTheme, string> = {
    light: asset('/assets/images/prototypes/apple-sentient/home-reader-demo-light.png'),
    sepia: asset('/assets/images/prototypes/apple-sentient/home-reader-demo-sepia.png'),
    dark: asset('/assets/images/prototypes/apple-sentient/home-reader-demo-dark.png'),
  }

  const themeOptions: readonly { value: PublicTheme; label: string; description: string }[] = [
    { value: 'automatic', label: 'System', description: 'Follow this device' },
    { value: 'light', label: 'Light', description: 'Bright white paper' },
    { value: 'sepia', label: 'Sepia', description: 'Warm reading paper' },
    { value: 'dark', label: 'Dark', description: 'Low-light practice' },
  ]

  let readerThemeImage = $derived(readerThemeImages[publicTheme.resolvedTheme])
</script>

<svelte:head>
  <title>Apple/Sentient prototype | Tikkun Korim</title>
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
        Choose a reading. Press play. Follow every word.
      </p>
      <div class="home-hero-actions">
        <a
          class="home-primary-action"
          href={resolve(`/reader/#/torah/parsha/${featuredReading.parshaSlug}`)}
          data-sveltekit-reload
        >
          Start practicing
        </a>
      </div>
    </div>

    <a
      class="home-reader-demo"
      href={resolve(`/reader/#/torah/parsha/${featuredReading.parshaSlug}`)}
      data-sveltekit-reload
      aria-label={`Open ${featuredReading.parshaName} in the reader`}
    >
      <span class="home-reader-window">
        <img
          src={readerThemeImage}
          alt={`The Tikkun reader showing Beresheet in ${publicTheme.resolvedTheme} mode`}
          width="1000"
          height="670"
          fetchpriority="high"
          decoding="async"
        />
      </span>
    </a>
  </section>

  <section class="home-theme-stage" aria-labelledby="home-theme-title">
    <div class="home-theme-heading">
      <h2 id="home-theme-title">Read it your way</h2>
      <p>Choose the page that keeps your focus comfortable.</p>
    </div>
    <div class="home-theme-controls" aria-label="Reader preview theme">
      {#each themeOptions as option (option.value)}
        <button
          type="button"
          aria-pressed={publicTheme.theme === option.value}
          onclick={() => publicTheme.setTheme(option.value)}
        >
          <strong>{option.label}</strong>
          <span>{option.description}</span>
        </button>
      {/each}
    </div>
    <p class="home-theme-status" aria-live="polite">
      {themeOptions.find((option) => option.value === publicTheme.theme)?.label} theme selected
    </p>
  </section>

  <section class="home-story" aria-labelledby="home-story-title">
    <div class="home-section-heading">
      <h2 id="home-story-title">Practice without losing your place.</h2>
      <p>
        The recording, highlighted word, aliyah boundary, and place on the page stay together so you can concentrate on the reading.
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
        <h2 id="home-readings-title">Available readings</h2>
      </div>
      <p>Each bubble shows an aliyah with an available recording.</p>
    </div>
    <div class="home-readings-grid">
      {#each featuredReadings as reading (reading.parshaSlug)}
        <ReadingCard {reading} />
      {/each}
    </div>
    <a class="home-secondary-link" href={resolve('/prototypes/apple-sentient/readings/')}>See all coverage</a>
  </section>

  <section class="home-project" aria-labelledby="home-project-title">
    <h2 id="home-project-title">Built one reading at a time.</h2>
    <p>
      Recordings are aligned to the Torah text by hand, then reviewed before their word timing is marked ready.
    </p>
    <a class="home-secondary-link" href={resolve('/prototypes/apple-sentient/readings/')}>
      View readings & coverage
    </a>
  </section>
</main>
