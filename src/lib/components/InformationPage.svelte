<script lang="ts">
  import { resolve } from '$app/paths'
  import type { Snippet } from 'svelte'

  let { title, introduction, current, children }: {
    title: string
    introduction: string
    current: 'privacy' | 'support'
    children: Snippet
  } = $props()
</script>

<main class="information-page" aria-labelledby={`${current}-title`}>
  <header class="information-heading">
    <h1 id={`${current}-title`}>{title}</h1>
    <p>{introduction}</p>
    <nav aria-label="Help and privacy">
      <a href={resolve('/support')} aria-current={current === 'support' ? 'page' : undefined}>Support</a>
      <a href={resolve('/privacy')} aria-current={current === 'privacy' ? 'page' : undefined}>Privacy policy</a>
    </nav>
  </header>
  <div class="information-body">
    {@render children()}
  </div>
</main>

<style>
  .information-page {
    display: grid;
    grid-template-columns: minmax(14rem, 0.8fr) minmax(0, 1.8fr);
    align-items: start;
    gap: clamp(2rem, 6vw, 5.5rem);
    width: min(100% - 4rem, 76rem);
    margin-inline: auto;
    padding-block: clamp(3.5rem, 7vw, 6rem) clamp(4rem, 8vw, 7rem);
  }

  .information-heading h1 {
    margin: 0;
    font-size: clamp(2.75rem, 4.5vw, 4rem);
    font-weight: 400;
    line-height: 1.08;
    letter-spacing: -0.035em;
    text-wrap: balance;
  }

  .information-heading p,
  .information-body {
    font-family: var(--hebrew-ui-font-family);
    font-size: 1rem;
    line-height: 1.75;
    color: var(--site-muted);
  }

  .information-heading p { margin: 1.4rem 0; }

  .information-heading nav {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem 1.35rem;
    font-family: var(--hebrew-ui-font-family);
    font-size: 0.875rem;
  }

  .information-heading a {
    display: inline-flex;
    align-items: center;
    min-height: 2.75rem;
    color: var(--site-muted);
    text-decoration: none;
  }

  .information-heading a[aria-current='page'] {
    color: var(--site-text);
    text-decoration: underline;
    text-underline-offset: 0.45em;
    text-decoration-color: var(--site-accent-soft);
  }

  .information-body {
    min-width: 0;
    border: 1px solid var(--site-line-strong);
    border-radius: 1rem;
    padding: clamp(1.5rem, 3.5vw, 3rem);
    background: var(--site-surface);
    overflow-wrap: anywhere;
  }

  .information-body :global(p) { margin: 0 0 1rem; }
  .information-body :global(section + section) { margin-top: 2rem; }
  .information-body :global(h2) {
    margin: 0 0 0.75rem;
    color: var(--site-text);
    font-size: 1.125rem;
    font-weight: 650;
    line-height: 1.4;
  }
  .information-body :global(ul) { margin: 0; padding-left: 1.25rem; }
  .information-body :global(li + li) { margin-top: 0.55rem; }
  .information-body :global(li::marker) { color: var(--site-accent-soft); }
  .information-body :global(a:not(.site-primary-action)) {
    color: var(--site-accent-soft);
    text-underline-offset: 0.2em;
  }
  .information-body :global(a:hover),
  .information-heading a:hover { color: var(--site-text); }
  .information-body :global(.information-date) {
    margin-bottom: 1.5rem;
    font-size: 0.8rem;
    font-variant-numeric: tabular-nums;
  }
  .information-body :global(.support-email) {
    display: inline-block;
    padding-block: 0.4rem;
    font-size: clamp(1rem, 2vw, 1.25rem);
  }
  .information-body :global(.support-contact) {
    padding-bottom: 2rem;
    border-bottom: 1px solid var(--site-line);
  }
  .information-body :global(.site-primary-action) {
    margin-top: 0.5rem;
    color: #fff;
    background: #2164c7;
  }
  .information-body :global(.site-primary-action:hover) {
    color: #fff;
    background: #286cce;
  }
  .information-body :global(section:last-child > :last-child) { margin-bottom: 0; }
  .information-page ::selection { background: #29466e; color: #fff; }

  @media (max-width: 48rem) {
    .information-page {
      grid-template-columns: minmax(0, 1fr);
      width: min(100% - 2.5rem, 38rem);
      gap: 1.5rem;
      padding-top: 3rem;
    }
    .information-heading p { max-width: 34rem; margin-block: 1rem 0.6rem; }
  }
</style>
