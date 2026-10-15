import type { MountScope } from '../lifecycle/mount.ts'

let tooltipId = 0

export function mountAudioButtonTooltip(scope: MountScope, document: Document) {
  const view = document.defaultView!
  const tip = document.createElement('div')
  tip.id = `audio-button-tooltip-${++tooltipId}`
  tip.className = 'audio-button-tooltip'
  tip.setAttribute('role', 'tooltip')
  tip.hidden = true
  document.body.append(tip)
  let target: HTMLElement | null = null
  let timer = 0
  const hide = () => {
    view.clearTimeout(timer)
    if (target) {
      const ids = (target.getAttribute('aria-describedby') ?? '').split(' ').filter(id => id && id !== tip.id)
      if (ids.length) target.setAttribute('aria-describedby', ids.join(' '))
      else target.removeAttribute('aria-describedby')
    }
    tip.hidden = true
    target = null
  }
  const show = (element: HTMLElement, delay: number) => {
    if (target === element && !tip.hidden) { view.clearTimeout(timer); return }
    hide()
    target = element
    timer = view.setTimeout(() => {
      const message = element.dataset.readerTooltip ?? element.dataset.audioTooltip
      if (!element.isConnected || !message) { hide(); return }
      tip.textContent = message
      tip.hidden = false
      const rect = element.getBoundingClientRect()
      const width = tip.offsetWidth
      const height = tip.offsetHeight
      tip.style.left = `${Math.max(8, Math.min(view.innerWidth - width - 8, rect.left + rect.width / 2 - width / 2))}px`
      const rangePopup = element.closest('[data-aliyah-marker="true"]')
        ? document.querySelector<HTMLElement>('.aliyah-start-popup:not(.u-hidden)')?.getBoundingClientRect()
        : null
      const below = Math.max(rect.bottom, rangePopup?.bottom ?? rect.bottom) + 8
      const above = Math.min(rect.top, rangePopup?.top ?? rect.top) - height - 8
      const preferBelow = element.hasAttribute('data-audio-tooltip') && below + height <= view.innerHeight - 8
      tip.style.top = `${preferBelow || above < 8 ? below : above}px`
      element.setAttribute('aria-describedby', [element.getAttribute('aria-describedby'), tip.id].filter(Boolean).join(' '))
    }, delay)
  }
  const button = (node: EventTarget | null) => node instanceof Element ? node.closest<HTMLElement>('[data-audio-tooltip], [data-reader-tooltip]') : null
  const listeners = { signal: scope.signal }
  document.addEventListener('pointerover', event => {
    const element = button(event.target)
    if (element && event.pointerType !== 'touch') show(element, 350)
    else if (event.target === tip) view.clearTimeout(timer)
  }, listeners)
  document.addEventListener('pointerout', event => {
    if (document.activeElement === target) return
    if (target && (button(event.target) === target || event.target === tip) &&
      button(event.relatedTarget) !== target && event.relatedTarget !== tip) {
      view.clearTimeout(timer)
      timer = view.setTimeout(hide, 120)
    }
  }, listeners)
  document.addEventListener('focusin', event => {
    const element = button(event.target)
    if (element) show(element, 0)
  }, listeners)
  document.addEventListener('focusout', hide, listeners)
  document.addEventListener('click', event => {
    const element = button(event.target)
    if (element?.hasAttribute('data-tooltip-on-press')) show(element, 0)
    else hide()
  }, listeners)
  document.addEventListener('keydown', event => { if (event.key === 'Escape') hide() }, listeners)
  document.addEventListener('scroll', hide, { ...listeners, capture: true })
  view.addEventListener('resize', hide, listeners)
  scope.own(() => { hide(); tip.remove() })
}
