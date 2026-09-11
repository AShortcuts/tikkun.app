<script lang="ts">
  import { asset, resolve } from '$app/paths'
  import '../../../css/site.css'
  import '../../../css/prototypes/scroll-story.css'

  let { children } = $props()
</script>

<svelte:head>
  <meta name="theme-color" content="#06080b" />
</svelte:head>

<div class="prototype-scroll-story">
  <!-- eslint-disable-next-line svelte/no-at-html-tags -- Static design contract must survive the production build. -->
  {@html `<!--
    THESIS: Practice stays connected to the Torah page; this refuses a generic feature-card landing page.
    OWN-WORLD: Near-black reading space, Lora display type, Noto Sans Hebrew controls, blue actions, hairline structure, and one white paper chapter.
    STORY: See the live reader, carry it into a chosen page theme, understand how audio and place move together, then open the needed aliyah.
    FIRST VIEWPORT: Copy occupies the left third; a live angled Beresheet reader fills and clips past the right edge; the primary action sits below the explanation.
    FORM: Preserve-led scroll story, user-pinned direction 1 of 1, seed key PINNED-SCROLL-STORY-2026-08-09.
    FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
  -->`}
  <header class="scroll-header" aria-label="Site navigation">
    <a
      class="scroll-brand"
      href={resolve('/')}
      aria-label="Tikkun Reader home"
    >
      <span class="scroll-brand-mark" aria-hidden="true">
        <img
          src={asset('/assets/images/safari-pinned-tab.svg')}
          alt=""
          width="24"
          height="24"
        />
      </span>
      <span class="scroll-brand-copy">
        <strong>Tikkun Reader</strong>
        <small>A Torah-reading companion by Ocean of Torah</small>
      </span>
    </a>

    <nav class="scroll-nav" aria-label="Primary navigation">
      <a class="scroll-nav-link" href={resolve('/readings/')}>Readings & coverage</a>
      <a class="scroll-nav-link" href={resolve('/tidbits/')}>Tidbits</a>
      <a class="scroll-nav-link" href={resolve('/about/')}>About</a>
      <a
        class="scroll-open-reader"
        href={resolve('/reader/#/next')}
      >Open reader</a>
    </nav>
  </header>

  {@render children()}

  <footer class="scroll-footer">
    <div>
      <a class="scroll-footer-brand" href={resolve('/')}>
        Tikkun Reader
      </a>
      <p>A Torah-reading companion by Ocean of Torah</p>
    </div>
    <nav aria-label="Footer navigation">
      <a href={resolve('/support/')}>Support</a>
      <a href={resolve('/privacy/')}>Privacy policy</a>
      <a href={resolve('/readings/')}>Readings & coverage</a>
      <a href={resolve('/tidbits/')}>Tidbits</a>
      <a href={resolve('/about/')}>About</a>
      <a href="https://github.com/AShortcuts/tikkun.app" rel="noreferrer">Source</a>
    </nav>
    <p class="scroll-footer-credit">
      Recordings by Yoni Davidov. Reader and timing tools by Tikkun Reader.
    </p>
  </footer>
</div>
