<script lang="ts">
  import { asset, resolve } from '$app/paths'
  import { page } from '$app/state'
  import { onMount } from 'svelte'
  import '../../../css/site.css'
  import '../../../css/site-shell.css'

  let { children } = $props()
  let mobileMenu: HTMLDetailsElement
  let mobileMenuOpen = $state(false)

  function closeMobileMenu() {
    mobileMenu.open = false
    mobileMenuOpen = false
  }

  function handleDocumentPointerDown(event: PointerEvent) {
    if (!mobileMenu.open || !(event.target instanceof Node)) return
    if (!mobileMenu.contains(event.target)) closeMobileMenu()
  }

  function handleDocumentKeydown(event: KeyboardEvent) {
    // Native details toggles precede Svelte's asynchronous open binding.
    if (event.key !== 'Escape' || !mobileMenu.open) return
    closeMobileMenu()
    mobileMenu.querySelector<HTMLElement>('summary')?.focus({ preventScroll: true })
  }

  onMount(() => {
    document.addEventListener('pointerdown', handleDocumentPointerDown)
    document.addEventListener('keydown', handleDocumentKeydown)

    return () => {
      document.removeEventListener('pointerdown', handleDocumentPointerDown)
      document.removeEventListener('keydown', handleDocumentKeydown)
    }
  })
</script>

<svelte:head>
  <meta name="theme-color" content="#06080b" />
</svelte:head>

<div
  class="home-page"
  style={`background-image: url("${asset('/assets/images/home-ambient.jpg')}")`}
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
      <details class="site-mobile-menu" bind:this={mobileMenu} bind:open={mobileMenuOpen}>
        <summary
          aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={mobileMenuOpen}
        >{mobileMenuOpen ? 'Close' : 'Menu'}</summary>
        <nav aria-label="Mobile navigation">
          <a
            href={resolve('/readings/')}
            aria-current={page.url.pathname.startsWith(resolve('/readings/')) ? 'page' : undefined}
            onclick={closeMobileMenu}
          >Readings & coverage</a>
          <a
            href={resolve('/tidbits/')}
            aria-current={page.url.pathname.startsWith(resolve('/tidbits/')) ? 'page' : undefined}
            onclick={closeMobileMenu}
          >Tidbits</a>
          <a
            href={resolve('/about/')}
            aria-current={page.url.pathname.startsWith(resolve('/about/')) ? 'page' : undefined}
            onclick={closeMobileMenu}
          >About</a>
          <a href={resolve('/reader/#/next')}>Open reader</a>
        </nav>
      </details>
      <a class="home-open-reader" href={resolve('/reader/#/next')}>
        Open reader
      </a>
    </nav>
  </header>

  {@render children()}

  <footer class="home-footer">
    <p>Recordings by Yoni Davidov. Reader and timing tools by Tikkun Korim.</p>
    <nav class="site-footer-nav" aria-label="Footer navigation">
      <a href={resolve('/support/')}>Support</a>
      <a href={resolve('/privacy/')}>Privacy policy</a>
      <a href={resolve('/readings/')}>Readings & coverage</a>
      <a href={resolve('/tidbits/')}>Tidbits</a>
      <a href={resolve('/about/')}>About</a>
      <a href="https://github.com/AShortcuts/tikkun.app" rel="noreferrer">Source</a>
    </nav>
  </footer>
</div>
