import type { MountScope } from '../lifecycle/mount.ts'

export const ARRIVAL_CUE_DURATION_MS = 1600

/** A decorative row cue; the existing route remains responsible for scrolling. */
export function createArrivalCue(scope: MountScope, document: Document, view: Window) {
  let release: (() => void) | null = null
  const clear = () => { release?.(); release = null }
  scope.own(clear)

  function show(line: HTMLElement) {
    clear()
    if (scope.signal.aborted || !line.isConnected) return
    const page = line.closest<HTMLElement>('.tikkun-page')
    const first = [...line.querySelectorAll<HTMLElement>('.word[data-token-key]')]
      .find(word => word.getBoundingClientRect().width > 0)
    if (!page || !first) return

    const origin = page.getBoundingClientRect()
    const layer = document.createElement('div')
    layer.className = 'reader-arrival-cue'
    layer.setAttribute('aria-hidden', 'true')
    const sides = new Set<Element>()
    for (const seed of page.querySelectorAll<HTMLElement>('.word[data-token-key]')) {
      if (seed.dataset.tokenKey !== first.dataset.tokenKey || !seed.getBoundingClientRect().width) continue
      const side = seed.closest('.reader-reading-page-side') ?? seed.closest('.reader-text-side')
      if (!side || sides.has(side)) continue
      sides.add(side)
      const top = seed.getClientRects()[0]?.top
      if (top === undefined) continue
      const rects = [...side.querySelectorAll<HTMLElement>('.word')]
        .flatMap(word => [...word.getClientRects()])
        .filter(rect => rect.width > 0 && rect.height > 0 && Math.abs(rect.top - top) < 4)
      if (!rects.length) continue
      const left = Math.min(...rects.map(rect => rect.left))
      const right = Math.max(...rects.map(rect => rect.right))
      const bottom = Math.max(...rects.map(rect => rect.bottom))
      const strip = document.createElement('span')
      strip.style.cssText = `left:${left - origin.left - 2}px;top:${top - origin.top - 1}px;width:${right - left + 4}px;height:${bottom - top + 3}px`
      layer.append(strip)
    }
    if (!layer.childElementCount) return
    page.classList.add('mod-arrival-cue')
    page.append(layer)
    // Layout changes invalidate measured rows; scrolling itself does not.
    const observer = new ResizeObserver(() => {
      const next = page.getBoundingClientRect()
      if (Math.abs(next.width - origin.width) > 1 || Math.abs(next.height - origin.height) > 1) clear()
    })
    observer.observe(page)
    const timer = view.setTimeout(clear, ARRIVAL_CUE_DURATION_MS)
    release = () => {
      view.clearTimeout(timer)
      observer.disconnect()
      layer.remove()
      page.classList.remove('mod-arrival-cue')
    }
  }

  return { show, clear }
}
