<script lang="ts">
  import { asset, resolve } from '$app/paths'
  import { page } from '$app/state'
  import {
    PUBLIC_THEME_CONTEXT,
    PUBLIC_THEME_STORAGE_KEY,
    isPublicTheme,
    type PublicTheme,
    type PublicThemeContext,
    type ResolvedPublicTheme,
  } from '$lib/prototypes/apple-sentient-theme'
  import { onMount, setContext } from 'svelte'
  import '../../../../css/site.css'
  import '../../../../css/prototypes/apple-sentient-site.css'
  import '../../../../css/prototypes/apple-sentient-home.css'

  let { children } = $props()
  let mobileMenu: HTMLDetailsElement
  let mobileMenuOpen = $state(false)
  let publicTheme = $state<PublicTheme>('automatic')
  let systemPrefersDark = $state(true)

  let resolvedTheme = $derived<ResolvedPublicTheme>(
    publicTheme === 'automatic' ? (systemPrefersDark ? 'dark' : 'light') : publicTheme
  )

  let browserThemeColor = $derived(
    resolvedTheme === 'dark' ? '#050505' : resolvedTheme === 'sepia' ? '#efe1b2' : '#f5f5f2'
  )

  function persistPublicTheme(theme: PublicTheme) {
    try {
      window.localStorage.setItem(PUBLIC_THEME_STORAGE_KEY, theme)
    } catch (error) {
      console.warn('Could not save the Apple/Sentient prototype theme.', error)
    }
  }

  function setPublicTheme(theme: PublicTheme) {
    publicTheme = theme
    if (typeof window !== 'undefined') persistPublicTheme(theme)
  }

  const publicThemeContext: PublicThemeContext = {
    get theme() {
      return publicTheme
    },
    get resolvedTheme() {
      return resolvedTheme
    },
    setTheme: setPublicTheme,
  }

  setContext(PUBLIC_THEME_CONTEXT, publicThemeContext)

  function closeMobileMenu() {
    mobileMenuOpen = false
  }

  function handleDocumentPointerDown(event: PointerEvent) {
    if (!mobileMenuOpen || !(event.target instanceof Node)) return
    if (!mobileMenu.contains(event.target)) closeMobileMenu()
  }

  function handleDocumentKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape' || !mobileMenuOpen) return
    closeMobileMenu()
    mobileMenu.querySelector<HTMLElement>('summary')?.focus({ preventScroll: true })
  }

  onMount(() => {
    const colorPreference = window.matchMedia('(prefers-color-scheme: dark)')
    const handleColorPreferenceChange = (event: MediaQueryListEvent) => {
      systemPrefersDark = event.matches
    }

    systemPrefersDark = colorPreference.matches
    colorPreference.addEventListener('change', handleColorPreferenceChange)

    try {
      const savedTheme = window.localStorage.getItem(PUBLIC_THEME_STORAGE_KEY)
      if (isPublicTheme(savedTheme)) publicTheme = savedTheme
    } catch (error) {
      console.warn('Could not load the Apple/Sentient prototype theme.', error)
    }

    document.addEventListener('pointerdown', handleDocumentPointerDown)
    document.addEventListener('keydown', handleDocumentKeydown)

    return () => {
      colorPreference.removeEventListener('change', handleColorPreferenceChange)
      document.removeEventListener('pointerdown', handleDocumentPointerDown)
      document.removeEventListener('keydown', handleDocumentKeydown)
    }
  })
</script>

<svelte:head>
  <meta name="theme-color" content={browserThemeColor} />
</svelte:head>

<div class="prototype-apple-sentient">
  <div
    class="home-page"
    data-site-theme={publicTheme}
    data-resolved-theme={resolvedTheme}
    style={`--home-background-image: url("${asset('/assets/images/home-ambient.jpg')}")`}
  >
  <header class="home-header" aria-label="Site navigation">
    <a
      class="home-brand site-brand-link"
      href={resolve('/prototypes/apple-sentient/')}
      aria-label="Apple and Sentient design prototype home"
    >
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
        href={resolve('/prototypes/apple-sentient/readings/')}
        aria-current={page.url.pathname.startsWith(resolve('/prototypes/apple-sentient/readings/')) ? 'page' : undefined}
      >Readings & coverage</a>
      <a
        class="home-nav-link"
        href={resolve('/prototypes/apple-sentient/tidbits/')}
        aria-current={page.url.pathname.startsWith(resolve('/prototypes/apple-sentient/tidbits/')) ? 'page' : undefined}
      >Tidbits</a>
      <a
        class="home-nav-link"
        href={resolve('/prototypes/apple-sentient/about/')}
        aria-current={page.url.pathname.startsWith(resolve('/prototypes/apple-sentient/about/')) ? 'page' : undefined}
      >About</a>
      <details class="site-mobile-menu" bind:this={mobileMenu} bind:open={mobileMenuOpen}>
        <summary
          aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={mobileMenuOpen}
        >{mobileMenuOpen ? 'Close' : 'Menu'}</summary>
        <nav aria-label="Mobile navigation">
          <a
            href={resolve('/prototypes/apple-sentient/readings/')}
            aria-current={page.url.pathname.startsWith(resolve('/prototypes/apple-sentient/readings/')) ? 'page' : undefined}
            onclick={closeMobileMenu}
          >Readings & coverage</a>
          <a
            href={resolve('/prototypes/apple-sentient/tidbits/')}
            aria-current={page.url.pathname.startsWith(resolve('/prototypes/apple-sentient/tidbits/')) ? 'page' : undefined}
            onclick={closeMobileMenu}
          >Tidbits</a>
          <a
            href={resolve('/prototypes/apple-sentient/about/')}
            aria-current={page.url.pathname.startsWith(resolve('/prototypes/apple-sentient/about/')) ? 'page' : undefined}
            onclick={closeMobileMenu}
          >About</a>
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
      <a href={resolve('/prototypes/apple-sentient/readings/')}>Readings & coverage</a>
      <a href={resolve('/prototypes/apple-sentient/tidbits/')}>Tidbits</a>
      <a href={resolve('/prototypes/apple-sentient/about/')}>About</a>
      <a href="https://github.com/AShortcuts/tikkun.app" rel="noreferrer">Source</a>
    </nav>
  </footer>
  </div>
</div>
