import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'

const publicLayout = readFileSync(
  new URL('./(site)/+layout.svelte', import.meta.url),
  'utf8'
)
const publicHome = readFileSync(
  new URL('./(site)/+page.svelte', import.meta.url),
  'utf8'
)
const prototypeLayout = readFileSync(
  new URL('./prototypes/apple-sentient/+layout.svelte', import.meta.url),
  'utf8'
)
const prototypeHome = readFileSync(
  new URL('./prototypes/apple-sentient/+page.svelte', import.meta.url),
  'utf8'
)
const prototypeSiteCss = readFileSync(
  new URL('../../css/prototypes/apple-sentient-site.css', import.meta.url),
  'utf8'
)
const prototypeHomeCss = readFileSync(
  new URL('../../css/prototypes/apple-sentient-home.css', import.meta.url),
  'utf8'
)
const scrollStoryLayout = readFileSync(
  new URL('./prototypes/scroll-story/+layout.svelte', import.meta.url),
  'utf8'
)
const scrollStoryHome = readFileSync(
  new URL('./prototypes/scroll-story/+page.svelte', import.meta.url),
  'utf8'
)
const scrollStoryCss = readFileSync(
  new URL('../../css/prototypes/scroll-story.css', import.meta.url),
  'utf8'
)

test('keeps the approved draft out of the current public routes', () => {
  expect(publicLayout).not.toContain('apple-sentient-theme')
  expect(publicLayout).not.toContain('data-site-theme')
  expect(publicHome).toContain("asset('/assets/images/home-reader-demo.jpg')")
  expect(publicHome).toContain('home-reader-dock')
  expect(publicHome).toContain("resolve('/prototypes/apple-sentient/')")
  expect(publicHome).toContain('View experimental redesign')
  expect(publicHome).not.toContain("resolve('/prototypes/scroll-story/')")
  expect(publicLayout).not.toContain('prototype-scroll-story')
})

test('hosts the draft in its own route, state, assets, and style scope', () => {
  expect(prototypeLayout).toContain('class="prototype-apple-sentient"')
  expect(prototypeLayout).toContain("$lib/prototypes/apple-sentient-theme")
  expect(prototypeLayout).toContain("resolve('/prototypes/apple-sentient/')")
  expect(prototypeHome).toContain(
    "asset('/assets/images/prototypes/apple-sentient/home-reader-demo-dark.png')"
  )
  expect(prototypeSiteCss).toContain(
    '.prototype-apple-sentient .site-content-page'
  )
  expect(prototypeHomeCss).toContain(
    '.prototype-apple-sentient .home-page'
  )
  expect(prototypeHomeCss).toContain(
    '@keyframes prototype-home-copy-arrive'
  )
  expect(prototypeSiteCss).not.toContain('@import')
  expect(prototypeHomeCss).not.toContain('@import')
})

test('keeps the scroll-story draft isolated while preserving live product links', () => {
  expect(scrollStoryLayout).toContain('class="prototype-scroll-story"')
  expect(scrollStoryLayout).toContain('Tikkun Reader')
  expect(scrollStoryLayout).toContain(
    'A Torah-reading companion by Ocean of Torah'
  )
  expect(scrollStoryLayout).toContain('PINNED-SCROLL-STORY-2026-08-09')
  expect(scrollStoryHome).toContain(
    "resolve(`/reader/#/torah/parsha/${featuredReading.parshaSlug}`)"
  )
  expect(scrollStoryHome).toContain('title="Interactive Beresheet Torah reader"')
  expect(scrollStoryHome.match(/<iframe/g)).toHaveLength(1)
  expect(scrollStoryHome.match(/scrolling="no"/g)).toHaveLength(1)
  expect(scrollStoryHome).toContain('class="scroll-reader-journey"')
  expect(scrollStoryHome).toContain('class="scroll-reader-motion"')
  expect(scrollStoryHome).toContain('desktopThemeActive')
  expect(scrollStoryHome).not.toContain('themeReaderFrame')
  expect(scrollStoryHome).toContain('function lockFrameScrolling')
  expect(scrollStoryHome).toContain('function attachFrameScrollRelay')
  expect(scrollStoryHome).toContain("frameDocument.addEventListener('wheel'")
  expect(scrollStoryHome).toContain("frameDocument.addEventListener('touchmove'")
  expect(scrollStoryHome).toContain("behavior: 'instant'")
  expect(scrollStoryHome).toContain('window.requestAnimationFrame(flushOuterScroll)')
  expect(scrollStoryHome).not.toContain("behavior: 'smooth'")
  expect(scrollStoryHome).toContain('rel="preload" as="image"')
  expect(scrollStoryHome).toContain('Read it your way.')
  expect(scrollStoryHome.indexOf('Read it your way.')).toBeLessThan(
    scrollStoryHome.indexOf('Practice without losing your place.')
  )
  expect(scrollStoryHome).toContain('<ReadingCard {reading} />')
  expect(scrollStoryHome).not.toContain("addEventListener('scroll'")
  expect(scrollStoryCss).toContain('.prototype-scroll-story')
  expect(scrollStoryCss).toContain('@supports (animation-timeline: scroll())')
  expect(scrollStoryCss).toContain(
    '--reader-rest: perspective(100rem) rotateX(1.8deg) rotateY(-5.4deg) rotateZ(-1deg)'
  )
  expect(scrollStoryHome).toContain("let selectedTheme = $state<PreviewTheme>('light')")
  expect(scrollStoryHome).toContain('function attachFrameThemeOverride')
  expect(scrollStoryHome).not.toContain('heroReaderTheme')
  expect(scrollStoryCss).not.toContain('--reader-hover-nudge')
  expect(scrollStoryCss).not.toContain('.scroll-reader-stack:hover .scroll-reader-frame')
  expect(scrollStoryCss).toContain('@keyframes scroll-reader-travel')
  expect(scrollStoryCss).toContain('@keyframes scroll-reader-level')
  expect(scrollStoryCss).toContain('@keyframes scroll-theme-copy-rise')
  expect(scrollStoryCss).toContain('clip-path: inset(0 0 100% 0)')
  expect(scrollStoryCss).toContain('clamp(4rem, 8vw, 7rem)')
  expect(scrollStoryCss).toContain('clamp(5.5rem, 10svh, 7rem)')
  expect(scrollStoryCss).toContain('scale(0.92)')
  expect(scrollStoryCss).not.toContain('--journey-reader-end: translate3d(0,')
  expect(scrollStoryCss).toContain('@keyframes scroll-paper-arrive')
  expect(scrollStoryCss).not.toMatch(
    /\.scroll-header\s*\{\s*min-height:\s*5\.5rem;/
  )
  expect(scrollStoryCss).not.toContain('calc(100svh - 6.25rem)')
  expect(scrollStoryCss).toContain('@media (prefers-reduced-motion: reduce)')
  expect(scrollStoryCss).not.toContain('@import')
})
