<script lang="ts">
  import { asset, resolve } from '$app/paths'
  import AliyahBubbles from '$lib/components/AliyahBubbles.svelte'
  import ReadingCard from '$lib/components/ReadingCard.svelte'
  import { availableReadings, getRequiredReading } from '$lib/readings'
  import { onMount } from 'svelte'
  import { Spring } from 'svelte/motion'

  type PreviewTheme = 'automatic' | 'light' | 'sepia' | 'dark'
  type MobileThemeSheetState = 'waiting' | 'pinned' | 'released'
  type StoryStops = {
    themeStart: number
    themeSettle: number
    controlsStart: number
    controlsSettle: number
    practiceStart: number
    practiceSettle: number
    releaseStart: number
  }

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

  const storyProgress = new Spring(0, {
    stiffness: 0.16,
    damping: 0.82,
    precision: 0.001,
  })

  function clamp(value: number, minimum: number, maximum: number) {
    return Math.min(Math.max(value, minimum), maximum)
  }

  function clampProgress(value: number) {
    return clamp(value, 0, 1)
  }

  function phaseProgress(value: number, start: number, end: number) {
    if (end <= start) return value >= end ? 1 : 0
    return clampProgress((value - start) / (end - start))
  }

  function easeInOut(value: number) {
    const progress = clampProgress(value)
    return progress < 0.5
      ? 4 * progress * progress * progress
      : 1 - Math.pow(-2 * progress + 2, 3) / 2
  }

  function mix(start: number, end: number, progress: number) {
    return start + (end - start) * progress
  }

  function buildStoryMotion(
    progress: number,
    stops: StoryStops,
    viewportWidth: number,
    viewportHeight: number
  ) {
    const theme = easeInOut(
      phaseProgress(progress, stops.themeStart, stops.themeSettle)
    )
    const practice = easeInOut(
      phaseProgress(progress, stops.practiceStart, stops.practiceSettle)
    )
    const fit = easeInOut(
      phaseProgress(progress, stops.controlsStart, stops.controlsSettle)
    )
    const heading = easeInOut(
      phaseProgress(
        progress,
        mix(stops.themeStart, stops.themeSettle, 0.42),
        stops.themeSettle
      )
    )
    const controlsReveal = easeInOut(
      phaseProgress(
        progress,
        mix(stops.controlsStart, stops.controlsSettle, 0.42),
        stops.controlsSettle
      )
    )
    const chapterExit = easeInOut(
      phaseProgress(
        progress,
        mix(stops.controlsSettle, stops.practiceStart, 0.35),
        stops.practiceStart
      )
    )
    const release = easeInOut(phaseProgress(progress, stops.releaseStart, 1))
    const paper = theme * (1 - practice)

    const wideLayout = viewportWidth >= 1024
    const openingX = wideLayout
      ? clamp(viewportWidth * 0.19, 248, 272)
      : viewportWidth * 0.18
    const openingScale = wideLayout ? 0.84 : 0.9
    const paperX = 0
    const paperY = clamp(viewportHeight * 0.11, 72, 110)
    const fittedY = -clamp(viewportHeight * 0.026, 20, 30)
    const fittedScale = wideLayout ? 0.69 : 0.74
    const practiceX = viewportWidth * (wideLayout ? -0.2 : -0.22)
    const practiceY = viewportHeight * 0.025
    const practiceScale = wideLayout ? 0.61 : 0.58

    const paperReaderX = mix(openingX, paperX, theme)
    const paperReaderY = mix(0, paperY, theme)
    const paperReaderScale = mix(openingScale, 0.92, theme)
    const fittedReaderY = mix(paperReaderY, fittedY, fit)
    const fittedReaderScale = mix(paperReaderScale, fittedScale, fit)

    return {
      paper,
      practice,
      release,
      readerX: mix(paperReaderX, practiceX, practice),
      readerY: mix(fittedReaderY, practiceY, practice),
      readerScale: mix(fittedReaderScale, practiceScale, practice),
      rotateX: mix(mix(wideLayout ? 1.8 : 0.8, 0, theme), 0.5, practice),
      rotateY: mix(mix(wideLayout ? -5.4 : -2.8, 0, theme), 1.2, practice),
      rotateZ: mix(mix(wideLayout ? -1 : -0.5, 0, theme), -0.2, practice),
      heroOpacity: 1 - easeInOut(phaseProgress(progress, stops.themeStart, stops.themeSettle)),
      readerOpacity: 1 - release,
      themeReveal: heading,
      themeOpacity: heading > 0.001 ? 1 - chapterExit : 0,
      themeY: (1 - heading) * 10 - chapterExit * 2.25,
      controlsOpacity: controlsReveal * (1 - chapterExit),
      controlsY: (1 - controlsReveal) * 1.75 - chapterExit * 2.25,
      practiceOpacity: practice * (1 - release),
      ambientOpacity: 0.42 * (1 - theme),
    }
  }

  let selectedTheme = $state<PreviewTheme>('light')
  let activeBeat = $state(0)
  let readerLoaded = $state(false)
  let tocPreviewOpen = $state(true)
  let isMobileHero = $state(false)
  let mobileThemeSheetState = $state<MobileThemeSheetState>('waiting')
  let responsiveLayoutReady = $state(false)
  let viewportWidth = $state(1440)
  let viewportHeight = $state(900)
  let storyStops = $state<StoryStops>({
    themeStart: 0.06,
    themeSettle: 0.2,
    controlsStart: 0.25,
    controlsSettle: 0.3,
    practiceStart: 0.38,
    practiceSettle: 0.48,
    releaseStart: 0.91,
  })
  let frontFilmElement: HTMLDivElement | undefined
  let heroReaderStage: HTMLDivElement | undefined
  let heroReaderShell: HTMLDivElement | undefined
  let heroReaderFrame: HTMLIFrameElement | undefined
  let desktopThemeChapterElement: HTMLElement | undefined
  let desktopThemeFooterElement: HTMLElement | undefined
  let practiceSectionElement: HTMLElement | undefined
  let mobileThemeSheetElement: HTMLElement | undefined
  let mobileThemeSheetReleaseSentinel: HTMLSpanElement | undefined
  let frameThemeStabilizeFrame: number | undefined
  let frameThemeStabilizeUntil = 0

  const frameScrollRelayCleanups = new WeakMap<HTMLIFrameElement, () => void>()
  const activeFrameScrollRelayCleanups: Array<() => void> = []

  let selectedThemeLabel = $derived(
    previewThemes.find((theme) => theme.value === selectedTheme)?.label ?? 'Light'
  )
  let storyMotion = $derived(
    buildStoryMotion(
      storyProgress.current,
      storyStops,
      viewportWidth,
      viewportHeight
    )
  )
  let desktopThemeActive = $derived(
    responsiveLayoutReady && !isMobileHero && storyMotion.paper > 0.48
  )
  let desktopPracticeActive = $derived(
    responsiveLayoutReady &&
      !isMobileHero &&
      storyMotion.practiceOpacity > 0.08
  )
  let desktopControlsActive = $derived(
    responsiveLayoutReady &&
      !isMobileHero &&
      storyMotion.controlsOpacity > 0.08
  )
  let storyMotionStyle = $derived(
    [
      `--story-progress: ${(storyProgress.current * 100).toFixed(3)}%`,
      `--story-paper-opacity: ${storyMotion.paper.toFixed(4)}`,
      `--story-ambient-opacity: ${storyMotion.ambientOpacity.toFixed(4)}`,
      `--story-hero-opacity: ${storyMotion.heroOpacity.toFixed(4)}`,
      `--story-reader-opacity: ${storyMotion.readerOpacity.toFixed(4)}`,
      `--story-theme-opacity: ${storyMotion.themeOpacity.toFixed(4)}`,
      `--story-theme-clip: ${((1 - storyMotion.themeReveal) * 100).toFixed(3)}%`,
      `--story-theme-y: ${storyMotion.themeY.toFixed(3)}rem`,
      `--story-controls-opacity: ${storyMotion.controlsOpacity.toFixed(4)}`,
      `--story-controls-y: ${storyMotion.controlsY.toFixed(3)}rem`,
      `--story-practice-opacity: ${storyMotion.practiceOpacity.toFixed(4)}`,
      `--story-practice-y: ${((1 - storyMotion.practice) * 2.75).toFixed(3)}rem`,
      `--story-ambient-y: ${(storyProgress.current * -56).toFixed(3)}px`,
      `--story-reader-x: ${storyMotion.readerX.toFixed(3)}px`,
      `--story-reader-y: ${storyMotion.readerY.toFixed(3)}px`,
      `--story-reader-scale: ${storyMotion.readerScale.toFixed(5)}`,
      `--story-reader-rotate-x: ${storyMotion.rotateX.toFixed(4)}deg`,
      `--story-reader-rotate-y: ${storyMotion.rotateY.toFixed(4)}deg`,
      `--story-reader-rotate-z: ${storyMotion.rotateZ.toFixed(4)}deg`,
    ].join('; ')
  )

  function applyFrameTheme(frame: HTMLIFrameElement | undefined, theme: PreviewTheme) {
    const root = frame?.contentDocument?.documentElement
    if (!root) return false
    if (root.dataset.readerTheme !== theme) root.dataset.readerTheme = theme
    return true
  }

  function stabilizeFrameTheme(frame: HTMLIFrameElement | undefined) {
    if (!frame) return
    if (frameThemeStabilizeFrame !== undefined) {
      window.cancelAnimationFrame(frameThemeStabilizeFrame)
    }
    frameThemeStabilizeUntil = window.performance.now() + 600

    const syncTheme = () => {
      frameThemeStabilizeFrame = undefined
      applyFrameTheme(frame, selectedTheme)
      if (window.performance.now() >= frameThemeStabilizeUntil) return
      frameThemeStabilizeFrame = window.requestAnimationFrame(syncTheme)
    }
    syncTheme()
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
    if (readerLoaded) stabilizeFrameTheme(heroReaderFrame)
  }

  $effect(() => {
    if (!readerLoaded) return
    applyFrameTheme(heroReaderFrame, selectedTheme)
  })

  onMount(() => {
    window.history.scrollRestoration = 'manual'
    window.scrollTo({ top: 0, behavior: 'instant' })

    const mobileHeroQuery = window.matchMedia('(max-width: 47.999rem)')
    const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    let mobileThemeSheetSetupFrame: number | undefined
    let storyLayoutFrame: number | undefined
    let storyScrollFrame: number | undefined
    let readerEnteredSheetZone = false
    let readerBottomReachedSheet = false
    let readerEntryObserver: IntersectionObserver | undefined
    let readerReleaseObserver: IntersectionObserver | undefined
    const beats = Array.from(
      document.querySelectorAll<HTMLElement>('.scroll-practice-beat')
    )

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

    const syncActiveBeat = () => {
      const focusLine = window.innerHeight * 0.52
      let nextBeat = 0
      let closestDistance = Number.POSITIVE_INFINITY

      for (const beat of beats) {
        const rect = beat.getBoundingClientRect()
        const distance = Math.abs(rect.top + rect.height / 2 - focusLine)
        if (distance >= closestDistance) continue
        const parsedBeat = Number.parseInt(beat.dataset.beat ?? '', 10)
        if (!Number.isInteger(parsedBeat)) continue
        closestDistance = distance
        nextBeat = parsedBeat
      }

      const beatChanged = nextBeat !== activeBeat
      activeBeat = nextBeat
      if (beatChanged && nextBeat === 0) tocPreviewOpen = true
    }

    const syncStoryProgress = (instant = false) => {
      storyScrollFrame = undefined
      if (!frontFilmElement) return

      const filmRect = frontFilmElement.getBoundingClientRect()
      const scrollRange = Math.max(frontFilmElement.offsetHeight - window.innerHeight, 1)
      const rawProgress = clampProgress(-filmRect.top / scrollRange)
      const enteringDesktopTheme =
        !mobileHeroQuery.matches &&
        rawProgress >= storyStops.themeStart &&
        rawProgress < storyStops.controlsStart
      if (enteringDesktopTheme) {
        if (selectedTheme !== 'light') selectedTheme = 'light'
        applyFrameTheme(heroReaderFrame, 'light')
      }
      if (instant || reducedMotionQuery.matches) {
        void storyProgress.set(rawProgress, { instant: true })
      } else {
        storyProgress.target = rawProgress
      }
      syncActiveBeat()
    }

    const scheduleStoryProgressSync = () => {
      if (storyScrollFrame !== undefined) return
      storyScrollFrame = window.requestAnimationFrame(() => syncStoryProgress())
    }

    const measureStoryLayout = () => {
      storyLayoutFrame = undefined
      viewportWidth = window.innerWidth
      viewportHeight = window.innerHeight
      if (
        !frontFilmElement ||
        !desktopThemeChapterElement ||
        !desktopThemeFooterElement ||
        !practiceSectionElement
      ) {
        return
      }

      const filmTop = window.scrollY + frontFilmElement.getBoundingClientRect().top
      const scrollRange = Math.max(frontFilmElement.offsetHeight - window.innerHeight, 1)
      const progressAtViewportLine = (element: HTMLElement, viewportLine: number) => {
        const elementTop = window.scrollY + element.getBoundingClientRect().top
        return clampProgress(
          (elementTop - filmTop - window.innerHeight * viewportLine) / scrollRange
        )
      }

      const themeStart = progressAtViewportLine(desktopThemeChapterElement, 0.78)
      const themeSettle = Math.max(
        themeStart + 0.06,
        progressAtViewportLine(desktopThemeChapterElement, 0.08)
      )
      const controlsStart = Math.max(
        themeSettle + 0.018,
        progressAtViewportLine(desktopThemeFooterElement, 0.99)
      )
      const controlsSettle = Math.max(
        controlsStart + 0.032,
        progressAtViewportLine(desktopThemeFooterElement, 0.83)
      )
      const practiceStart = Math.max(
        controlsSettle + 0.055,
        progressAtViewportLine(practiceSectionElement, 0.88)
      )
      const practiceSettle = Math.max(
        practiceStart + 0.06,
        progressAtViewportLine(practiceSectionElement, 0.12)
      )
      const releaseStart = clamp(
        (frontFilmElement.offsetHeight - window.innerHeight * 1.12) / scrollRange,
        practiceSettle + 0.12,
        0.985
      )

      storyStops = {
        themeStart,
        themeSettle,
        controlsStart,
        controlsSettle,
        practiceStart,
        practiceSettle,
        releaseStart,
      }
      syncStoryProgress(true)
    }

    const scheduleStoryLayoutMeasurement = () => {
      if (storyLayoutFrame !== undefined) return
      storyLayoutFrame = window.requestAnimationFrame(measureStoryLayout)
    }

    const syncHeroLayout = () => {
      isMobileHero = mobileHeroQuery.matches
      responsiveLayoutReady = true
      scheduleMobileThemeSheetObserverSetup()
      scheduleStoryLayoutMeasurement()
    }
    syncHeroLayout()
    mobileHeroQuery.addEventListener('change', syncHeroLayout)
    reducedMotionQuery.addEventListener('change', scheduleStoryProgressSync)
    window.addEventListener('scroll', scheduleStoryProgressSync, { passive: true })
    window.addEventListener('resize', scheduleMobileThemeSheetObserverSetup)
    window.addEventListener('resize', scheduleStoryLayoutMeasurement)

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
    const storyLayoutResizeObserver = new ResizeObserver(
      scheduleStoryLayoutMeasurement
    )
    if (frontFilmElement) storyLayoutResizeObserver.observe(frontFilmElement)
    scheduleMobileThemeSheetObserverSetup()
    scheduleStoryLayoutMeasurement()

    return () => {
      for (const cleanup of [...activeFrameScrollRelayCleanups]) cleanup()
      readerEntryObserver?.disconnect()
      readerReleaseObserver?.disconnect()
      mobileThemeSheetResizeObserver.disconnect()
      storyLayoutResizeObserver.disconnect()
      if (mobileThemeSheetSetupFrame !== undefined) {
        window.cancelAnimationFrame(mobileThemeSheetSetupFrame)
      }
      if (storyLayoutFrame !== undefined) {
        window.cancelAnimationFrame(storyLayoutFrame)
      }
      if (storyScrollFrame !== undefined) {
        window.cancelAnimationFrame(storyScrollFrame)
      }
      if (frameThemeStabilizeFrame !== undefined) {
        window.cancelAnimationFrame(frameThemeStabilizeFrame)
      }
      mobileHeroQuery.removeEventListener('change', syncHeroLayout)
      reducedMotionQuery.removeEventListener('change', scheduleStoryProgressSync)
      window.removeEventListener('scroll', scheduleStoryProgressSync)
      window.removeEventListener('resize', scheduleMobileThemeSheetObserverSetup)
      window.removeEventListener('resize', scheduleStoryLayoutMeasurement)
    }
  })
</script>

<svelte:head>
  <title>Tikkun Reader — Torah reading practice in sync</title>
  <meta
    name="description"
    content="Practice Torah reading with aliyah recordings, word highlighting, and the original Torah layout kept in sync. A Torah-reading companion by Ocean of Torah."
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
    bind:this={frontFilmElement}
    class:mod-theme-active={responsiveLayoutReady && !isMobileHero && desktopThemeActive}
    class:mod-controls-active={desktopControlsActive}
    class:mod-practice-active={desktopPracticeActive}
    class="scroll-reader-journey"
    style={storyMotionStyle}
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

          <div class="scroll-film-progress" aria-hidden="true"><span></span></div>

          <div
            class="scroll-stage-practice"
            data-active-beat={activeBeat}
            aria-label="Practice walkthrough preview"
            aria-hidden={!desktopPracticeActive}
            inert={!desktopPracticeActive}
          >
            <div class="scroll-stage-practice-heading">
              <span aria-hidden="true">0{activeBeat + 1}</span>
              <p>Live reader workflow</p>
            </div>
            <div class="scroll-stage-practice-card">
              {#key activeBeat}
                {@render practiceScene(activeBeat, 'film')}
              {/key}
            </div>
            {#key activeBeat}
              <p class="scroll-beat-status" aria-live="polite">{beatCopy[activeBeat]}</p>
            {/key}
          </div>
        </div>
      </div>
    </section>

    <section
      class="scroll-theme-chapter"
      id="themes"
      aria-labelledby="scroll-theme-title"
    >
      <span
        bind:this={desktopThemeChapterElement}
        class="scroll-theme-copy-anchor"
        aria-hidden="true"
      ></span>
      <div class="scroll-theme-copy">
        <h2 id="scroll-theme-title">Read it your way.</h2>
        <p>Choose the page treatment that keeps the text comfortable and your attention steady.</p>
      </div>

      <div class="scroll-theme-reader-space" aria-hidden="true"></div>

      <span
        bind:this={desktopThemeFooterElement}
        class="scroll-theme-footer-anchor"
        aria-hidden="true"
      ></span>
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

  <section
    bind:this={practiceSectionElement}
    class="scroll-practice"
    id="how-it-works"
    aria-labelledby="scroll-practice-title"
  >
    <div class="scroll-practice-shell">
      <div class="scroll-practice-intro">
        <h2 id="scroll-practice-title">Practice without losing your place.</h2>
        <p>
          Choose an aliyah, follow the recording, and return to your place without leaving the
          Torah.
        </p>
      </div>

      <div class="scroll-practice-grid">
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
  </div>

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

    <section class="scroll-project-note" aria-labelledby="scroll-project-title">
      <p class="scroll-project-kicker">The work behind the reader</p>
      <h2 id="scroll-project-title">Built one reading at a time.</h2>
      <p>
        Recordings are aligned to the Torah text by hand, then reviewed before their word timing is marked ready.
      </p>
      <a href={resolve('/readings/')}>View readings &amp; coverage</a>
    </section>
  </section>
</main>
