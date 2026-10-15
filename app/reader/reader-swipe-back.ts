import type { MountScope } from '../lifecycle/mount.ts'

export interface ReaderSwipeDestination {
  element: HTMLElement
  commit(): void
  cancel(): void
}

interface Swipe {
  pointerId: number
  startX: number
  startY: number
  distance: number
  lastTime: number
  velocity: number
  width: number
  locked: boolean
  released: boolean
  destination: ReaderSwipeDestination | null
}

// Touch owns horizontal movement only after intent is clear; the browser keeps scrolling/pinch.
export function mountReaderSwipeBack(scope: MountScope, options: {
  surface: HTMLElement
  container: HTMLElement
  enabled(): boolean
  prepare(): Promise<ReaderSwipeDestination | null>
}) {
  const { surface, container } = options
  const document = surface.ownerDocument
  const view = document.defaultView
  if (!view) throw new Error('Reader swipe requires a browser window')
  const reducedMotion = view.matchMedia('(prefers-reduced-motion: reduce)')
  const shouldReduceMotion = () => reducedMotion.matches || document.documentElement.dataset.readerReducedMotion === 'on'
  const fullscreenPicker = view.matchMedia('(max-width: 550px)')
  const toolbar = document.querySelector<HTMLElement>('.app-toolbar')
  const blocked = 'button, a, input, select, textarea, [contenteditable], [data-reader-no-form-toggle]'
  let swipe: Swipe | null = null
  let finishTimer: number | undefined
  let suppressClickUntil = 0

  function clearPresentation() {
    surface.style.removeProperty('transform')
    surface.style.removeProperty('transition')
    surface.style.removeProperty('--reader-swipe-header-gap')
    toolbar?.style.removeProperty('transform')
    toolbar?.style.removeProperty('transition')
    toolbar?.classList.remove('is-swiping-back')
    container.classList.remove('is-swiping-back')
  }

  function cancel() {
    view!.clearTimeout(finishTimer)
    finishTimer = undefined
    const previous = swipe
    swipe = null
    if (previous && surface.hasPointerCapture(previous.pointerId)) surface.releasePointerCapture(previous.pointerId)
    previous?.destination?.cancel()
    clearPresentation()
  }

  function draw(current: Swipe) {
    if (!current.destination || shouldReduceMotion()) return
    surface.style.transform = `translate3d(${current.distance}px, 0, 0)`
    if (toolbar && fullscreenPicker.matches) toolbar.style.transform = surface.style.transform
    current.destination.element.style.transform = `translate3d(${(current.distance - current.width) * 0.22}px, 0, 0)`
  }

  function settle(current: Swipe) {
    if (!current.destination || swipe !== current) return
    const recentVelocity = view!.performance.now() - current.lastTime < 100 ? current.velocity : 0
    const commit = (current.distance >= Math.min(140, current.width * 0.33) && recentVelocity > -0.25)
      || (current.distance >= 40 && recentVelocity > 0.45)
    const duration = shouldReduceMotion() ? 0 : commit ? 200 : 160
    surface.style.transition = `transform ${duration}ms cubic-bezier(0.32, 0.72, 0, 1)`
    if (toolbar && fullscreenPicker.matches) toolbar.style.transition = surface.style.transition
    current.destination.element.style.transition = surface.style.transition
    current.distance = commit ? current.width : 0
    draw(current)
    const finish = () => {
      if (swipe !== current) return
      swipe = null
      finishTimer = undefined
      if (commit) current.destination!.commit()
      else current.destination!.cancel()
      clearPresentation()
    }
    if (duration) finishTimer = view!.setTimeout(finish, duration)
    else finish()
  }

  surface.addEventListener('pointerdown', (event) => {
    if (swipe || event.pointerType !== 'touch' || !event.isPrimary || !options.enabled()) return
    if (!(event.target instanceof Element) || event.target.closest(blocked)) return
    if (document.getSelection()?.isCollapsed === false) return
    swipe = {
      pointerId: event.pointerId, startX: event.clientX, startY: event.clientY,
      distance: 0, lastTime: view.performance.now(), velocity: 0,
      width: container.clientWidth, locked: false, released: false, destination: null,
    }
  }, { signal: scope.signal })

  view.addEventListener('pointerdown', (event) => {
    if (swipe && event.pointerType === 'touch' && event.pointerId !== swipe.pointerId) cancel()
  }, { capture: true, signal: scope.signal })

  surface.addEventListener('pointermove', (event) => {
    const current = swipe
    if (!current || current.released || event.pointerId !== current.pointerId) return
    const x = event.clientX - current.startX
    const y = Math.abs(event.clientY - current.startY)
    if (!current.locked) {
      if (view.performance.now() - current.lastTime > 450 || document.getSelection()?.isCollapsed === false) { cancel(); return }
      if (Math.max(Math.abs(x), y) < 10) return
      if (x < 0 || x < y * 1.3 || !options.enabled()) { cancel(); return }
      current.locked = true
      surface.setPointerCapture(event.pointerId)
      container.classList.add('is-swiping-back')
      surface.style.transition = 'none'
      if (toolbar && fullscreenPicker.matches) {
        toolbar.classList.add('is-swiping-back')
        toolbar.style.transition = 'none'
        const gap = surface.getBoundingClientRect().top - toolbar.getBoundingClientRect().bottom
        surface.style.setProperty('--reader-swipe-header-gap', `${Math.max(0, gap)}px`)
      }
      void options.prepare().then(destination => {
        if (swipe !== current || scope.signal.aborted) { destination?.cancel(); return }
        if (!destination) { cancel(); return }
        current.destination = destination
        draw(current)
        if (current.released) settle(current)
      }).catch(error => {
        console.error('Could not prepare reader swipe navigation', error)
        if (swipe === current) cancel()
      })
    }
    event.preventDefault()
    const now = view.performance.now()
    const distance = Math.max(0, Math.min(current.width, x))
    current.velocity = (distance - current.distance) / Math.max(1, now - current.lastTime)
    current.lastTime = now
    current.distance = distance
    draw(current)
  }, { signal: scope.signal })

  surface.addEventListener('pointerup', (event) => {
    const current = swipe
    if (!current || event.pointerId !== current.pointerId) return
    if (!current.locked) { swipe = null; return }
    current.released = true
    suppressClickUntil = view.performance.now() + 500
    settle(current)
  }, { signal: scope.signal })

  surface.addEventListener('pointercancel', cancel, { signal: scope.signal })
  surface.addEventListener('lostpointercapture', (event) => {
    // Taking capture from the touched word also bubbles its lost-capture event here.
    if (event.target === surface && swipe && !swipe.released) cancel()
  }, { signal: scope.signal })
  surface.addEventListener('click', event => {
    if (view.performance.now() >= suppressClickUntil) return
    event.preventDefault()
    event.stopImmediatePropagation()
  }, { capture: true, signal: scope.signal })
  view.addEventListener('resize', cancel, { signal: scope.signal })
  view.addEventListener('blur', cancel, { signal: scope.signal })
  view.addEventListener('keydown', cancel, { signal: scope.signal })
  scope.own(cancel)
}
