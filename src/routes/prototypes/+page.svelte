<script lang="ts">
  import { resolve } from '$app/paths'
  import '../../../css/site.css'
</script>

<svelte:head>
  <title>Design prototypes | Tikkun Korim</title>
  <meta
    name="description"
    content="Isolated Tikkun Korim design prototypes for review."
  />
</svelte:head>

<main class="prototype-index">
  <p class="prototype-index-kicker">Tikkun Korim</p>
  <h1>Design prototypes</h1>
  <p class="prototype-index-intro">
    Draft interfaces live here for review without changing the current public site or reader.
  </p>

  <a class="prototype-card" href={resolve('/prototypes/apple-sentient/')}>
    <span>Draft 01</span>
    <strong>Apple / Sentient</strong>
    <small>Mobile-first editorial launch, reader themes, and purpose-built secondary pages.</small>
  </a>

  <a class="prototype-card" href={resolve('/prototypes/scroll-story/')}>
    <span>Draft 02</span>
    <strong>Tikkun Reader scroll story</strong>
    <small>Current hero identity, live reader embed, scroll-led practice story, and a focused light theme chapter.</small>
  </a>

  <a class="prototype-index-back" href={resolve('/')}>Return to the current site</a>
</main>

<style>
  .prototype-index {
    display: grid;
    width: min(100% - 2rem, 54rem);
    min-height: 100svh;
    align-content: center;
    margin: 0 auto;
    padding: 4rem 0;
    color: var(--site-text);
  }

  .prototype-index-kicker,
  .prototype-card span,
  .prototype-card small,
  .prototype-index-back {
    font-family: var(--hebrew-ui-font-family);
  }

  .prototype-index-kicker {
    margin: 0 0 1rem;
    color: var(--site-accent-soft);
    font-size: 0.78rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  h1 {
    max-width: 11ch;
    margin: 0;
    font-size: clamp(3.2rem, 14vw, 6.8rem);
    font-weight: 400;
    letter-spacing: -0.065em;
    line-height: 0.88;
  }

  .prototype-index-intro {
    max-width: 34rem;
    margin: 1.6rem 0 3rem;
    color: var(--site-muted);
    font-size: clamp(1rem, 2.5vw, 1.2rem);
    line-height: 1.65;
  }

  .prototype-card {
    display: grid;
    gap: 0.55rem;
    border: 1px solid var(--site-line-strong);
    border-radius: 1rem;
    padding: 1.3rem;
    background: var(--site-surface);
    color: inherit;
    text-decoration: none;
  }

  .prototype-card + .prototype-card {
    margin-top: 1rem;
  }

  .prototype-card span {
    color: var(--site-accent-soft);
    font-size: 0.72rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .prototype-card strong {
    font-size: clamp(1.55rem, 6vw, 2.2rem);
    font-weight: 400;
  }

  .prototype-card small {
    max-width: 42rem;
    color: var(--site-muted);
    font-size: 0.86rem;
    line-height: 1.5;
  }

  .prototype-index-back {
    width: fit-content;
    margin-top: 2rem;
    color: var(--site-muted);
    font-size: 0.82rem;
    text-underline-offset: 0.3rem;
  }

  @media (hover: hover) and (pointer: fine) {
    .prototype-card:hover {
      border-color: rgba(57, 132, 255, 0.56);
    }
  }
</style>
