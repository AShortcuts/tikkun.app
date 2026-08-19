<script lang="ts">
  import { asset, resolve } from '$app/paths'
  import AliyahBubbles from '$lib/components/AliyahBubbles.svelte'
  import ReadingCard from '$lib/components/ReadingCard.svelte'
  import { availableReadings, getRequiredReading } from '$lib/readings'
  import { onMount } from 'svelte'

  type PreviewTheme = 'automatic' | 'light' | 'sepia' | 'dark'
  type MobileThemeSheetState = 'waiting' | 'pinned' | 'released'

  const featuredReading = getRequiredReading('beresheet')
  const featuredAliyah = featuredReading.aliyot[0]
  if (!featuredAliyah) throw new Error('Beresheet is missing its first aliyah')

  const ambientImage = asset('/assets/images/home-ambient.jpg')
  const readerUrl = resolve(`/reader/#/torah/parsha/${featuredReading.parshaSlug}`)
  const featuredAliyahUrl = resolve(`/reader/${featuredAliyah.readerHash}`)

  const previewThemes: readonly {
    value: PreviewTheme
    label: string
    description: string
  }[] = [
    { value: 'automatic', label: 'System', description: 'Follows your device' },
    { value: 'light', label: 'Light', description: 'Clear white paper' },
    { value: 'sepia', label: 'Sepia', description: 'Warm reading paper' },
    { value: 'dark', label: 'Dark', description: 'For low light' },
  ]

  const beatCopy = [
    'Open the contents and choose the aliyah you are preparing.',
    'Hear the recording while the active phrase stays in view.',
    'Use Continue to return to the aliyah you were practicing.',
  ] as const

  const torahWords = [
    'בְּרֵאשִׁית',
    'בָּרָא',
    'אֱלֹהִים',
    'אֵת',
    'הַשָּׁמַיִם',
    'וְאֵת',
    'הָאָרֶץ',
  ] as const

  let selectedTheme = $state<PreviewTheme>('light')
  let activeBeat = $state(0)
  let readerLoaded = $state(false)
  let tocPreviewOpen = $state(true)
  let isMobileHero = $state(false)
  let desktopThemeActive = $state(false)
  let mobileThemeSheetState = $state<MobileThemeSheetState>('waiting')
  let responsiveLayoutReady = $state(false)
  let heroReaderStage: HTMLDivElement | undefined
  let heroReaderShell: HTMLDivElement | undefined
  let heroReaderFrame: HTMLIFrameElement | undefined
  let desktopThemeHandoffElement: HTMLDivElement | undefined
  let mobileThemeSheetElement: HTMLElement | undefined
  let mobileThemeSheetReleaseSentinel: HTMLSpanElement | undefined
  let frameThemeObserver: MutationObserver | undefined

  const frameScrollRelayCleanups = new WeakMap<HTMLIFrameElement, () => void>()
  const activeFrameScrollRelayCleanups: Array<() => void> = []

  let selectedThemeLabel = $derived(
    previewThemes.find((theme) => theme.value === selectedTheme)?.label ?? 'Light'
  )

  function applyFrameTheme(frame: HTMLIFrameElement | undefined, theme: PreviewTheme) {
    const root = frame?.contentDocument?.documentElement
    if (!root) return false
    root.dataset.readerTheme = theme
    return true
  }

  function attachFrameThemeOverride(frame: HTMLIFrameElement | undefined) {
    const root = frame?.contentDocument?.documentElement
    if (!root) return false

    frameThemeObserver?.disconnect()
    const keepSelectedThemeApplied = () => {
      if (root.dataset.readerTheme !== selectedTheme) {
        root.dataset.readerTheme = selectedTheme
      }
    }
    const themeObserver = new MutationObserver(keepSelectedThemeApplied)
    themeObserver.observe(root, {
      attributes: true,
      attributeFilter: ['data-reader-theme'],
    })
    frameThemeObserver = themeObserver
    keepSelectedThemeApplied()
    return true
  }

  function lockFrameScrolling(frame: HTMLIFrameElement | undefined) {
    const frameDocument = frame?.contentDocument
    if (!frameDocument?.head) return false

    frameDocument.head
      .querySelector('style[data-scroll-story-scroll-lock]')
      ?.remove()

    const scrollLockStyle = frameDocument.createElement('style')
    scrollLockStyle.dataset.scrollStoryScrollLock = ''
    scrollLockStyle.textContent = `
      html,
      body,
      .tikkun-book {
        overflow: hidden !important;
        overscroll-behavior: none !important;
      }
    `
    frameDocument.head.append(scrollLockStyle)

    return true
  }

  function attachFrameScrollRelay(frame: HTMLIFrameElement | undefined) {
    const frameDocument = frame?.contentDocument
    const frameWindow = frame?.contentWindow
    if (!frame || !frameDocument?.body || !frameWindow) return false

    frameScrollRelayCleanups.get(frame)?.()

    const computedLineHeight = Number.parseFloat(
      frameWindow.getComputedStyle(frameDocument.body).lineHeight
    )
    const lineHeight = Number.isFinite(computedLineHeight) ? computedLineHeight : 16
    let pendingScrollDelta = 0
    let pendingScrollFrame: number | undefined
    let momentumFrame: number | undefined
    let activeTouchId: number | undefined
    let lastTouchY = 0
    let lastTouchTimestamp = 0
    let touchVelocity = 0

    const scrollOuterInstantly = (deltaY: number) => {
      const before = window.scrollY
      window.scrollBy({ top: deltaY, behavior: 'instant' })
      return window.scrollY !== before
    }

    const flushOuterScroll = () => {
      pendingScrollFrame = undefined
      const deltaY = pendingScrollDelta
      pendingScrollDelta = 0
      if (deltaY !== 0) scrollOuterInstantly(deltaY)
    }

    const queueOuterScroll = (deltaY: number) => {
      pendingScrollDelta += deltaY
      pendingScrollFrame ??= window.requestAnimationFrame(flushOuterScroll)
    }

    const stopMomentum = () => {
      if (momentumFrame === undefined) return
      window.cancelAnimationFrame(momentumFrame)
      momentumFrame = undefined
    }

    const isFrameHTMLElement = (target: EventTarget): target is HTMLElement =>
      'ownerDocument' in target &&
      target.ownerDocument === frameDocument &&
      'scrollHeight' in target &&
      'clientHeight' in target &&
      'scrollTop' in target

    const canScrollInsideFrame = (event: WheelEvent | TouchEvent, deltaY: number) => {
      for (const target of event.composedPath()) {
        if (!isFrameHTMLElement(target)) continue
        if (target.scrollHeight <= target.clientHeight + 1) continue
        const overflowY = frameWindow.getComputedStyle(target).overflowY
        if (!['auto', 'scroll', 'overlay'].includes(overflowY)) continue
        if (deltaY < 0 && target.scrollTop > 0) return true
        if (
          deltaY > 0 &&
          target.scrollTop + target.clientHeight < target.scrollHeight - 1
        ) {
          return true
        }
      }
      return false
    }

    const normalizeWheelDelta = (event: WheelEvent) => {
      if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return event.deltaY * lineHeight
      if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
        return event.deltaY * window.innerHeight
      }
      return event.deltaY
    }

    const handleWheel = (event: WheelEvent) => {
      if (event.ctrlKey) return
      const deltaY = normalizeWheelDelta(event)
      if (deltaY === 0 || canScrollInsideFrame(event, deltaY)) return
      if (event.cancelable) event.preventDefault()
      stopMomentum()
      queueOuterScroll(deltaY)
    }

    const findTouch = (touches: TouchList, identifier: number) => {
      for (let index = 0; index < touches.length; index += 1) {
        const touch = touches.item(index)
        if (touch?.identifier === identifier) return touch
      }
      return undefined
    }

    const handleTouchStart = (event: TouchEvent) => {
      stopMomentum()
      if (event.touches.length !== 1) {
        activeTouchId = undefined
        return
      }
      const touch = event.touches.item(0)
      if (!touch) return
      activeTouchId = touch.identifier
      lastTouchY = touch.clientY
      lastTouchTimestamp = event.timeStamp
      touchVelocity = 0
    }

    const handleTouchMove = (event: TouchEvent) => {
      if (activeTouchId === undefined || event.touches.length !== 1) return
      const touch = findTouch(event.touches, activeTouchId)
      if (!touch) return

      const deltaY = lastTouchY - touch.clientY
      const elapsed = Math.max(event.timeStamp - lastTouchTimestamp, 1)
      lastTouchY = touch.clientY
      lastTouchTimestamp = event.timeStamp
      if (deltaY === 0) return
      if (canScrollInsideFrame(event, deltaY)) {
        touchVelocity = 0
        return
      }

      if (event.cancelable) event.preventDefault()
      const measuredVelocity = deltaY / elapsed
      touchVelocity = touchVelocity * 0.2 + measuredVelocity * 0.8
      queueOuterScroll(deltaY)
    }

    const startTouchMomentum = () => {
      let velocity = Math.max(-3, Math.min(3, touchVelocity))
      if (Math.abs(velocity) < 0.05) return
      let previousTimestamp = window.performance.now()

      const advanceMomentum = (timestamp: number) => {
        const elapsed = Math.min(timestamp - previousTimestamp, 32)
        previousTimestamp = timestamp
        const didScroll = scrollOuterInstantly(velocity * elapsed)
        velocity *= Math.pow(0.95, elapsed / (1000 / 60))
        if (didScroll && Math.abs(velocity) >= 0.02) {
          momentumFrame = window.requestAnimationFrame(advanceMomentum)
        } else {
          momentumFrame = undefined
        }
      }

      momentumFrame = window.requestAnimationFrame(advanceMomentum)
    }

    const handleTouchEnd = (event: TouchEvent) => {
      if (
        activeTouchId === undefined ||
        !findTouch(event.changedTouches, activeTouchId)
      ) {
        return
      }
      activeTouchId = undefined
      startTouchMomentum()
    }

    const handleTouchCancel = () => {
      activeTouchId = undefined
      touchVelocity = 0
      stopMomentum()
    }

    frameDocument.addEventListener('wheel', handleWheel, {
      passive: false,
      capture: true,
    })
    frameDocument.addEventListener('touchstart', handleTouchStart, {
      passive: true,
      capture: true,
    })
    frameDocument.addEventListener('touchmove', handleTouchMove, {
      passive: false,
      capture: true,
    })
    frameDocument.addEventListener('touchend', handleTouchEnd, {
      passive: true,
      capture: true,
    })
    frameDocument.addEventListener('touchcancel', handleTouchCancel, {
      passive: true,
      capture: true,
    })
    frame.dataset.scrollStoryRelay = 'ready'

    const cleanup = () => {
      frameDocument.removeEventListener('wheel', handleWheel, { capture: true })
      frameDocument.removeEventListener('touchstart', handleTouchStart, {
        capture: true,
      })
      frameDocument.removeEventListener('touchmove', handleTouchMove, {
        capture: true,
      })
      frameDocument.removeEventListener('touchend', handleTouchEnd, {
        capture: true,
      })
      frameDocument.removeEventListener('touchcancel', handleTouchCancel, {
        capture: true,
      })
      if (pendingScrollFrame !== undefined) {
        window.cancelAnimationFrame(pendingScrollFrame)
      }
      stopMomentum()
      delete frame.dataset.scrollStoryRelay
      if (frameScrollRelayCleanups.get(frame) === cleanup) {
        frameScrollRelayCleanups.delete(frame)
      }
      const cleanupIndex = activeFrameScrollRelayCleanups.indexOf(cleanup)
      if (cleanupIndex >= 0) activeFrameScrollRelayCleanups.splice(cleanupIndex, 1)
    }

    frameScrollRelayCleanups.set(frame, cleanup)
    activeFrameScrollRelayCleanups.push(cleanup)
    return true
  }

  function prepareLoadedFrame(
    frame: HTMLIFrameElement | undefined,
    theme: PreviewTheme,
    frameName: string
  ) {
    if (!applyFrameTheme(frame, theme)) {
      console.error(`${frameName} did not expose a same-origin document`)
      return false
    }
    if (!attachFrameThemeOverride(frame)) {
      console.error(`${frameName} did not expose an observable theme root`)
      return false
    }
    if (!lockFrameScrolling(frame)) {
      console.error(`${frameName} did not expose a same-origin scroll surface`)
      return false
    }
    if (!attachFrameScrollRelay(frame)) {
      console.error(`${frameName} did not expose relayable input events`)
      return false
    }
    return true
  }

  function handleHeroReaderLoad() {
    readerLoaded = prepareLoadedFrame(
      heroReaderFrame,
      selectedTheme,
      'The prototype hero reader'
    )
  }

  $effect(() => {
    if (!readerLoaded) return
    applyFrameTheme(heroReaderFrame, selectedTheme)
  })

  onMount(() => {
    const mobileHeroQuery = window.matchMedia('(max-width: 47.999rem)')
    let mobileThemeSheetSetupFrame: number | undefined
    let readerEnteredSheetZone = false
    let readerBottomReachedSheet = false
    let readerEntryObserver: IntersectionObserver | undefined
    let readerReleaseObserver: IntersectionObserver | undefined
    let desktopThemeObserver: IntersectionObserver | undefined

    const syncMobileThemeSheetState = () => {
      if (!mobileHeroQuery.matches || !readerEnteredSheetZone) {
        mobileThemeSheetState = 'waiting'
      } else {
        mobileThemeSheetState = readerBottomReachedSheet ? 'released' : 'pinned'
      }
    }

    const setupMobileThemeSheetObservers = () => {
      mobileThemeSheetSetupFrame = undefined
      readerEntryObserver?.disconnect()
      readerReleaseObserver?.disconnect()

      if (
        !mobileHeroQuery.matches ||
        !heroReaderStage ||
        !heroReaderShell ||
        !mobileThemeSheetElement ||
        !mobileThemeSheetReleaseSentinel
      ) {
        readerEnteredSheetZone = false
        readerBottomReachedSheet = false
        syncMobileThemeSheetState()
        return
      }

      const computedSheetHeight = Number.parseFloat(
        window.getComputedStyle(mobileThemeSheetElement).height
      )
      const sheetHeight =
        Number.isFinite(computedSheetHeight) && computedSheetHeight > 0
          ? computedSheetHeight
          : mobileThemeSheetElement.offsetHeight
      const sheetInset = Math.min(
        Math.max(sheetHeight, 1),
        Math.max(window.innerHeight - 1, 1)
      )
      const handoffGap = Math.min(Math.max(window.innerWidth * 0.06, 20), 28)
      const releaseInset = Math.min(
        sheetInset + handoffGap,
        Math.max(window.innerHeight - 1, 1)
      )
      heroReaderStage.style.setProperty('--mobile-theme-handoff-gap', `${handoffGap}px`)
      heroReaderStage.style.setProperty('--mobile-theme-sheet-height', `${sheetHeight}px`)
      const readerEntryLine = window.innerHeight * 0.25
      const sheetHandoffLine = window.innerHeight - releaseInset

      readerEntryObserver = new IntersectionObserver(
        ([entry]) => {
          if (!entry) return
          const rootBottom = entry.rootBounds?.bottom ?? readerEntryLine
          readerEnteredSheetZone =
            entry.isIntersecting || entry.boundingClientRect.top <= rootBottom
          syncMobileThemeSheetState()
        },
        { rootMargin: '0px 0px -75% 0px' }
      )
      readerEntryObserver.observe(heroReaderShell)

      readerReleaseObserver = new IntersectionObserver(
        ([entry]) => {
          if (!entry) return
          const rootBottom = entry.rootBounds?.bottom ?? sheetHandoffLine
          readerBottomReachedSheet =
            entry.isIntersecting || entry.boundingClientRect.top < rootBottom
          syncMobileThemeSheetState()
        },
        { rootMargin: `0px 0px -${releaseInset}px 0px` }
      )
      readerReleaseObserver.observe(mobileThemeSheetReleaseSentinel)
    }

    const scheduleMobileThemeSheetObserverSetup = () => {
      if (mobileThemeSheetSetupFrame !== undefined) return
      mobileThemeSheetSetupFrame = window.requestAnimationFrame(setupMobileThemeSheetObservers)
    }

    const setupDesktopThemeObserver = () => {
      desktopThemeObserver?.disconnect()
      if (mobileHeroQuery.matches || !desktopThemeHandoffElement) {
        desktopThemeActive = false
        return
      }

      desktopThemeObserver = new IntersectionObserver(
        ([entry]) => {
          if (!entry) return
          const activationLine = entry.rootBounds?.bottom ?? window.innerHeight * 0.5
          desktopThemeActive =
            entry.isIntersecting || entry.boundingClientRect.top <= activationLine
        },
        { rootMargin: '0px 0px -50% 0px' }
      )
      desktopThemeObserver.observe(desktopThemeHandoffElement)
    }

    const syncHeroLayout = () => {
      isMobileHero = mobileHeroQuery.matches
      responsiveLayoutReady = true
      scheduleMobileThemeSheetObserverSetup()
      setupDesktopThemeObserver()
    }
    syncHeroLayout()
    mobileHeroQuery.addEventListener('change', syncHeroLayout)
    window.addEventListener('resize', scheduleMobileThemeSheetObserverSetup)

    const beats = document.querySelectorAll<HTMLElement>('.scroll-practice-beat')
    const beatObserver = new IntersectionObserver(
      (entries) => {
        const mostVisibleBeat = entries
          .filter((entry) => entry.isIntersecting)
          .sort((first, second) => second.intersectionRatio - first.intersectionRatio)[0]
        if (!(mostVisibleBeat?.target instanceof HTMLElement)) return
        const nextBeat = Number.parseInt(mostVisibleBeat.target.dataset.beat ?? '', 10)
        if (Number.isInteger(nextBeat)) {
          const beatChanged = nextBeat !== activeBeat
          activeBeat = nextBeat
          if (beatChanged && nextBeat === 0) tocPreviewOpen = true
        }
      },
      { threshold: [0.35, 0.55, 0.75], rootMargin: '-12% 0px -20% 0px' }
    )
    beats.forEach((beat) => beatObserver.observe(beat))

    if (
      !heroReaderStage ||
      !heroReaderShell ||
      !mobileThemeSheetElement ||
      !mobileThemeSheetReleaseSentinel
    ) {
      console.error('The prototype mobile reader theme-sheet anchors were unavailable')
    }

    const mobileThemeSheetResizeObserver = new ResizeObserver(
      scheduleMobileThemeSheetObserverSetup
    )
    if (mobileThemeSheetElement) {
      mobileThemeSheetResizeObserver.observe(mobileThemeSheetElement)
    }
    scheduleMobileThemeSheetObserverSetup()

    return () => {
      for (const cleanup of [...activeFrameScrollRelayCleanups]) cleanup()
      beatObserver.disconnect()
      readerEntryObserver?.disconnect()
      readerReleaseObserver?.disconnect()
      desktopThemeObserver?.disconnect()
      frameThemeObserver?.disconnect()
      mobileThemeSheetResizeObserver.disconnect()
      if (mobileThemeSheetSetupFrame !== undefined) {
        window.cancelAnimationFrame(mobileThemeSheetSetupFrame)
      }
      mobileHeroQuery.removeEventListener('change', syncHeroLayout)
      window.removeEventListener('resize', scheduleMobileThemeSheetObserverSetup)
    }
  })
</script>

<svelte:head>
  <title>Tikkun Reader | Scroll story prototype</title>
  <meta
    name="description"
    content="A mobile-first, scroll-led prototype for Tikkun Reader, a Torah-reading companion by Ocean of Torah."
  />
  <link rel="preload" as="image" href={ambientImage} fetchpriority="high" />
</svelte:head>

{#snippet practiceScene(beat: number, contentId: string)}
  <div class="scroll-practice-scene" data-scene={beat}>
    {#if beat === 0}
      <div class="scroll-toc-demo">
        <button
          class="scroll-toc-trigger"
          type="button"
          aria-expanded={tocPreviewOpen}
          aria-controls={`scroll-story-contents-${contentId}`}
          onclick={() => (tocPreviewOpen = !tocPreviewOpen)}
        >
          <span>
            <small>Reader contents</small>
            <strong>{featuredReading.parshaName}</strong>
          </span>
          <span>{tocPreviewOpen ? 'Close' : 'Open'}</span>
        </button>

        {#if tocPreviewOpen}
          <div class="scroll-toc-panel" id={`scroll-story-contents-${contentId}`}>
            <div class="scroll-toc-reading">
              <span>
                <small>Choose an aliyah</small>
                <strong>
                  {featuredReading.parshaName}
                  <span dir="rtl" lang="he">{featuredReading.parshaHebrew}</span>
                </strong>
              </span>
              <span class="scroll-toc-status">{featuredReading.statusLabel}</span>
            </div>
            <nav
              class="home-reading-bubbles"
              aria-label={`${featuredReading.parshaName} aliyot`}
            >
              <AliyahBubbles
                aliyot={featuredReading.aliyot}
                readingName={featuredReading.parshaName}
                interactive
              />
            </nav>
            <p>Select a bubble to open that aliyah at its first word.</p>
          </div>
        {/if}
      </div>
    {:else if beat === 1}
      <div class="scroll-listen-demo">
        <div class="scroll-demo-heading">
          <span>
            <small>Now practicing</small>
            <strong>{featuredReading.parshaName}, aliyah 1</strong>
          </span>
          <a href={featuredAliyahUrl} data-sveltekit-reload>Open reader</a>
        </div>
        <p class="scroll-torah-line" dir="rtl" lang="he">
          {#each torahWords as word, index (word)}
            <span class:mod-highlighted={index >= 2 && index <= 4}>{word}</span>
          {/each}
        </p>
        <div class="scroll-playback" aria-hidden="true"><span></span></div>
        <p class="scroll-listen-status">
          <span aria-hidden="true"></span>
          Playback and Torah text stay connected.
        </p>
      </div>
    {:else}
      <div class="scroll-continue-demo">
        <p class="scroll-continue-eyebrow">When you return</p>
        <div class="scroll-continue-prompt">
          <span>
            <small>Your recent place</small>
            <strong>Continue {featuredReading.parshaName}, aliyah 1?</strong>
          </span>
          <a href={featuredAliyahUrl} data-sveltekit-reload>Continue</a>
        </div>
        <p>The reader keeps a recent place for up to 48 hours.</p>
      </div>
    {/if}
  </div>
{/snippet}

<main>
  <div
    class:mod-theme-active={responsiveLayoutReady && !isMobileHero && desktopThemeActive}
    class="scroll-reader-journey"
  >
    <section class="scroll-hero" aria-labelledby="scroll-hero-title">
      <img
        class="scroll-hero-ambient"
        src={ambientImage}
        alt=""
        width="1536"
        height="1024"
        fetchpriority="high"
        decoding="async"
        aria-hidden="true"
      />

      <div class="scroll-hero-copy">
        <h1 id="scroll-hero-title">Read along.<br /><span>In sync.</span></h1>
        <p class="scroll-hero-byline">A Torah-reading companion by Ocean of Torah</p>
        <p class="scroll-hero-lede">
          Choose the reading, press play, and follow every word where it appears in the Torah.
        </p>
        <div class="scroll-hero-actions">
          <a class="scroll-primary-action" href={readerUrl} data-sveltekit-reload>
            Start practicing
          </a>
          <a class="scroll-text-action" href="#how-it-works">See how it works</a>
        </div>
      </div>

      <div class="scroll-reader-track">
        <div bind:this={heroReaderStage} class="scroll-reader-stage">
          <div class="scroll-reader-motion">
            <div class="scroll-reader-stack">
              <div bind:this={heroReaderShell} class="scroll-reader-frame">
                <div class="scroll-reader-toolbar">
                  <span>Live Beresheet reader</span>
                  <a
                    href={readerUrl}
                    data-sveltekit-reload
                    aria-label="Open Beresheet in the full reader"
                  >
                    Open full reader
                    <svg viewBox="0 0 20 20" aria-hidden="true">
                      <path d="M6 14 14 6M8 6h6v6" />
                    </svg>
                  </a>
                </div>
                <div class:mod-loaded={readerLoaded} class="scroll-reader-viewport">
                  <p class="scroll-reader-loading" role="status">Loading the live reader</p>
                  <iframe
                    bind:this={heroReaderFrame}
                    src={readerUrl}
                    title="Interactive Beresheet Torah reader"
                    loading="eager"
                    referrerpolicy="same-origin"
                    allow="autoplay"
                    scrolling="no"
                    onload={handleHeroReaderLoad}
                  ></iframe>
                </div>
              </div>
              <span
                bind:this={mobileThemeSheetReleaseSentinel}
                class="scroll-mobile-theme-release-sentinel"
                aria-hidden="true"
              ></span>
            </div>
            <p class="scroll-reader-note">This is the real reader. Tap inside to explore it.</p>
          </div>
          <section
            bind:this={mobileThemeSheetElement}
            class:mod-pinned={isMobileHero && mobileThemeSheetState === 'pinned'}
            class:mod-released={isMobileHero && mobileThemeSheetState === 'released'}
            class:mod-waiting={!isMobileHero || mobileThemeSheetState === 'waiting'}
            class="scroll-mobile-theme-sheet"
            aria-labelledby="scroll-mobile-theme-title"
            aria-hidden={!isMobileHero || mobileThemeSheetState === 'waiting'}
            inert={!isMobileHero || mobileThemeSheetState === 'waiting'}
          >
            <h2 id="scroll-mobile-theme-title">Read it your way</h2>
            <div
              class="scroll-theme-controls scroll-mobile-theme-controls"
              aria-label="Mobile reader preview theme"
            >
              {#each previewThemes as theme (theme.value)}
                <button
                  type="button"
                  data-theme={theme.value}
                  aria-pressed={selectedTheme === theme.value}
                  onclick={() => (selectedTheme = theme.value)}
                >
                  <span class="scroll-theme-control-content">
                    <strong>{theme.label}</strong>
                    <span>{theme.description}</span>
                  </span>
                </button>
              {/each}
            </div>
            <p class="scroll-theme-status" aria-live="polite">{selectedThemeLabel} theme selected</p>
          </section>
        </div>
      </div>
    </section>

    <section class="scroll-theme-chapter" id="themes" aria-labelledby="scroll-theme-title">
      <div class="scroll-theme-copy">
        <h2 id="scroll-theme-title">Read it your way.</h2>
        <p>Choose the page treatment that keeps the text comfortable and your attention steady.</p>
      </div>

      <div
        bind:this={desktopThemeHandoffElement}
        class="scroll-theme-reader-space"
        aria-hidden="true"
      ></div>

      <div class="scroll-theme-footer">
        <div class="scroll-theme-controls" aria-label="Reader preview theme">
          {#each previewThemes as theme (theme.value)}
            <button
              type="button"
              data-theme={theme.value}
              aria-pressed={selectedTheme === theme.value}
              onclick={() => (selectedTheme = theme.value)}
            >
              <span class="scroll-theme-control-content">
                <strong>{theme.label}</strong>
                <span>{theme.description}</span>
              </span>
            </button>
          {/each}
        </div>
        <p class="scroll-theme-status" aria-live="polite">{selectedThemeLabel} theme selected</p>
      </div>
    </section>
  </div>

  <section class="scroll-practice" id="how-it-works" aria-labelledby="scroll-practice-title">
    <div class="scroll-practice-shell">
      <div class="scroll-practice-intro">
        <h2 id="scroll-practice-title">Practice without losing your place.</h2>
        <p>
          Choose an aliyah, follow the recording, and return to your place without leaving the
          Torah.
        </p>
      </div>

      <div class="scroll-practice-grid">
        <div class="scroll-practice-sticky">
          <div class="scroll-practice-visual" data-active-beat={activeBeat}>
            {#key activeBeat}
              {@render practiceScene(activeBeat, 'desktop')}
            {/key}
          </div>
          {#key activeBeat}
            <p class="scroll-beat-status" aria-live="polite">{beatCopy[activeBeat]}</p>
          {/key}
        </div>

        <div class="scroll-practice-beats">
          <article
            class:mod-active={activeBeat === 0}
            class="scroll-practice-beat"
            data-beat="0"
            aria-labelledby="scroll-practice-beat-0-title"
          >
            <div class="scroll-practice-beat-copy">
              <p class="scroll-practice-step"><span aria-hidden="true">01</span> Choose</p>
              <h3 id="scroll-practice-beat-0-title">Go straight to your aliyah.</h3>
              <p>
                Open the table of contents, then choose a real aliyah deep link instead of
                searching the page.
              </p>
            </div>
            <div
              class="scroll-practice-mobile-demo"
              role="group"
              aria-labelledby="scroll-practice-beat-0-title"
            >
              {@render practiceScene(0, 'mobile')}
            </div>
          </article>
          <article
            class:mod-active={activeBeat === 1}
            class="scroll-practice-beat"
            data-beat="1"
            aria-labelledby="scroll-practice-beat-1-title"
          >
            <div class="scroll-practice-beat-copy">
              <p class="scroll-practice-step"><span aria-hidden="true">02</span> Follow</p>
              <h3 id="scroll-practice-beat-1-title">Listen in context.</h3>
              <p>
                The recording stays connected to the original Torah layout, with the active
                phrase in view.
              </p>
            </div>
            <div
              class="scroll-practice-mobile-demo"
              role="group"
              aria-labelledby="scroll-practice-beat-1-title"
            >
              {@render practiceScene(1, 'mobile')}
            </div>
          </article>
          <article
            class:mod-active={activeBeat === 2}
            class="scroll-practice-beat"
            data-beat="2"
            aria-labelledby="scroll-practice-beat-2-title"
          >
            <div class="scroll-practice-beat-copy">
              <p class="scroll-practice-step"><span aria-hidden="true">03</span> Return</p>
              <h3 id="scroll-practice-beat-2-title">Recover your place instantly.</h3>
              <p>
                Continue returns to the recent aliyah you were practicing, without repeating the
                setup.
              </p>
            </div>
            <div
              class="scroll-practice-mobile-demo"
              role="group"
              aria-labelledby="scroll-practice-beat-2-title"
            >
              {@render practiceScene(2, 'mobile')}
            </div>
          </article>
        </div>
      </div>
    </div>
  </section>

  <section class="scroll-readings" id="readings" aria-labelledby="scroll-readings-title">
    <div class="scroll-readings-heading">
      <h2 id="scroll-readings-title">Choose what you are preparing.</h2>
      <p>
        Select any aliyah bubble to open it directly. Green is synced, blue is a draft, and yellow still needs timing.
      </p>
    </div>

    <div class="scroll-readings-grid">
      {#each availableReadings as reading (reading.parshaSlug)}
        <ReadingCard {reading} />
      {/each}
    </div>

    <div class="scroll-project-note">
      <h2>Built one reading at a time.</h2>
      <p>
        Recordings are aligned to the Torah text by hand, then reviewed before their word timing is marked ready.
      </p>
      <a href={resolve('/readings/')}>View readings and coverage</a>
    </div>
  </section>
</main>
