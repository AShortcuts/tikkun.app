<script lang="ts">
  import { asset, resolve } from '$app/paths'
  import { page } from '$app/state'
  import { onMount } from 'svelte'
  import '../../../css/site.css'
  import '../../../css/home.css'

  let { children } = $props()
  let mobileMenu: HTMLDetailsElement

  function closeMobileMenu() {
    mobileMenu?.removeAttribute('open')
  }

  onMount(() => {
    const rootPath = resolve('/')
    if (window.location.pathname !== rootPath) return
    const hashPath = window.location.hash.split('?', 1)[0]
    if (!hashPath.startsWith('#/')) return

    if (hashPath === '#/about') {
      window.location.replace(resolve('/about/'))
      return
    }
    window.location.replace(`${resolve('/reader/')}${window.location.hash}`)
  })
</script>

<svelte:head>
  <meta name="theme-color" content="#06080b" />
</svelte:head>

<div
  class="home-page"
  style={`--home-background-image: url("${asset('/assets/images/home-ambient.jpg')}")`}
>
  <header class="home-header" aria-label="Site navigation">
    <a class="home-brand site-brand-link" href={resolve('/')} aria-label="Tikkun Korim home">
      <span class="home-brand-mark" aria-hidden="true">
        <img
          src={asset('/assets/images/safari-pinned-tab.svg')}
          alt=""
          width="24"
          height="24"
        />
      </span>
      <span>Tikkun Korim</span>
    </a>

    <nav class="home-nav" aria-label="Primary navigation">
      <a
        class="home-nav-link"
        href={resolve('/readings/')}
        aria-current={page.url.pathname.startsWith(resolve('/readings/')) ? 'page' : undefined}
      >Readings & coverage</a>
      <a
        class="home-nav-link"
        href={resolve('/tidbits/')}
        aria-current={page.url.pathname.startsWith(resolve('/tidbits/')) ? 'page' : undefined}
      >Tidbits</a>
      <a
        class="home-nav-link"
        href={resolve('/about/')}
        aria-current={page.url.pathname.startsWith(resolve('/about/')) ? 'page' : undefined}
      >About</a>
      <details class="site-mobile-menu" bind:this={mobileMenu}>
        <summary aria-label="Open navigation menu">Menu</summary>
        <nav aria-label="Mobile navigation">
          <a href={resolve('/readings/')} onclick={closeMobileMenu}>Readings & coverage</a>
          <a href={resolve('/tidbits/')} onclick={closeMobileMenu}>Tidbits</a>
          <a href={resolve('/about/')} onclick={closeMobileMenu}>About</a>
          <a href={resolve('/reader/#/next')} data-sveltekit-reload>Open reader</a>
        </nav>
      </details>
      <a class="home-open-reader" href={resolve('/reader/#/next')} data-sveltekit-reload>
        Open reader
      </a>
    </nav>
  </header>

  {@render children()}

  <footer class="home-footer">
    <p>Recordings by Yoni Davidov. Reader and timing tools by Tikkun Korim.</p>
    <nav class="site-footer-nav" aria-label="Footer navigation">
      <a href={resolve('/readings/')}>Readings & coverage</a>
      <a href={resolve('/tidbits/')}>Tidbits</a>
      <a href={resolve('/about/')}>About</a>
      <a href="https://github.com/akivajgordon/tikkun.io" rel="noreferrer">Source</a>
    </nav>
  </footer>
</div>
