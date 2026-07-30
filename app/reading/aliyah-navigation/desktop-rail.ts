import type { MountScope } from '../../lifecycle/mount.ts'
import {
  isSameAliyahNavigationTarget,
  parseAliyahNavigationTarget,
  type AliyahNavigationAdapter,
  type AliyahNavigationItem,
  type AliyahNavigationSnapshot,
  type AliyahNavigationTarget,
} from './model.ts'

export const ALIYAH_RAIL_AUTO_HIDE_MS = 4000

export type AliyahCueStatus =
  | 'none'
  | 'published'
  | 'pending'
  | 'local-draft'
  | 'generated-review'

type AliyahRailVisibility = 'hidden' | 'peek' | 'expanded'

export interface DesktopAliyahRailAdapter extends AliyahNavigationAdapter {
  reveal(
    visibility?: Exclude<AliyahRailVisibility, 'hidden'>,
    options?: { autoHideMs?: number }
  ): void
  revealForMovement(): void
  scheduleHide(delayMs?: number): void
  hide(): void
}

export function aliyahCueStatusLabel(status: AliyahCueStatus) {
  return {
    none: 'no cues',
    pending: 'partial published cues',
    published: 'complete published cues',
    'local-draft': 'local draft',
    'generated-review': 'generated draft needs review',
  }[status]
}

export function createDesktopAliyahRail(
  scope: MountScope,
  {
    root,
    toolbar,
    onSelect,
    onHidden,
    loadCueStatus,
    onLoadError,
  }: {
    root: HTMLElement
    toolbar: HTMLElement
    onSelect: (target: AliyahNavigationTarget) => void
    onHidden: () => void
    loadCueStatus: (item: AliyahNavigationItem) => Promise<AliyahCueStatus>
    onLoadError: (error: unknown, item: AliyahNavigationItem) => void
  }
): DesktopAliyahRailAdapter {
  const documentRoot = root.ownerDocument.documentElement
  const view = root.ownerDocument.defaultView
  if (!view) throw new Error('Aliyah rail requires an attached browser document')

  let available = false
  let renderedSignature: string | null = null
  let visibility: AliyahRailVisibility = 'hidden'
  let hideTimer: number | null = null
  let focusSyncTimer: number | null = null
  let pointerInside = false
  let focusInside = false

  const clearHideTimer = () => {
    if (hideTimer === null) return
    view.clearTimeout(hideTimer)
    hideTimer = null
  }

  const syncPosition = () => {
    documentRoot.style.setProperty(
      '--aliyah-rail-top',
      `${toolbar.getBoundingClientRect().bottom}px`
    )
  }

  const syncVisibility = () => {
    const hidden = visibility === 'hidden'
    documentRoot.dataset.aliyahRailVisibility = visibility
    root.dataset.visibility = visibility
    root.classList.toggle('is-peeking', visibility === 'peek')
    root.classList.toggle('is-expanded', visibility === 'expanded')
    root.setAttribute('aria-hidden', hidden ? 'true' : 'false')
    root.toggleAttribute('inert', hidden)
    if (hidden) onHidden()
  }

  const hide = () => {
    clearHideTimer()
    visibility = 'hidden'
    syncVisibility()
  }

  const scheduleHide = (delayMs = ALIYAH_RAIL_AUTO_HIDE_MS) => {
    clearHideTimer()
    hideTimer = view.setTimeout(() => {
      hideTimer = null
      if (pointerInside || focusInside) return
      hide()
    }, delayMs)
  }

  const reveal: DesktopAliyahRailAdapter['reveal'] = (
    nextVisibility = 'peek',
    { autoHideMs = ALIYAH_RAIL_AUTO_HIDE_MS } = {}
  ) => {
    if (!available) return
    syncPosition()
    visibility = nextVisibility
    syncVisibility()
    if (nextVisibility === 'expanded') clearHideTimer()
    else scheduleHide(autoHideMs)
  }

  const setActive = (target: AliyahNavigationTarget | null) => {
    root.querySelectorAll<HTMLButtonElement>('.aliyah-rail-button').forEach((button) => {
      button.classList.toggle(
        'is-active',
        isSameAliyahNavigationTarget(
          parseAliyahNavigationTarget(
            button.dataset.runId,
            button.dataset.aliyahIndex
          ),
          target
        )
      )
    })
  }

  const loadButtonCueStatus = (
    button: HTMLButtonElement,
    item: AliyahNavigationItem
  ) => {
    void loadCueStatus(item)
      .then((status) => {
        if (
          scope.signal.aborted ||
          !button.isConnected ||
          button.dataset.navigationKey !== item.key
        ) {
          return
        }
        button.dataset.cueStatus = status
        button.title = `${item.label} · ${aliyahCueStatusLabel(status)}`
      })
      .catch((error) => {
        if (!scope.signal.aborted) onLoadError(error, item)
      })
  }

  const render = (snapshot: AliyahNavigationSnapshot) => {
    available = true
    root.classList.remove('u-hidden')
    syncPosition()
    syncVisibility()

    if (snapshot.signature === renderedSignature) {
      setActive(snapshot.active)
      return
    }

    renderedSignature = snapshot.signature
    root.replaceChildren()

    const caption = root.ownerDocument.createElement('span')
    caption.className = 'aliyah-rail-caption'
    caption.textContent = 'Aliyah'
    caption.setAttribute('aria-hidden', 'true')
    root.appendChild(caption)

    for (const item of snapshot.items) {
      const button = root.ownerDocument.createElement('button')
      button.type = 'button'
      button.className = 'aliyah-rail-button'
      button.textContent = item.compactLabel
      button.dataset.runId = item.target.runId
      button.dataset.aliyahIndex = `${item.target.aliyahIndex}`
      button.dataset.navigationKey = item.key
      button.dataset.cueStatus = 'none'
      button.title = `${item.label} · ${aliyahCueStatusLabel('none')}`
      root.appendChild(button)
      loadButtonCueStatus(button, item)
    }

    setActive(snapshot.active)
  }

  const clear = () => {
    available = false
    renderedSignature = null
    root.classList.add('u-hidden')
    root.replaceChildren()
    hide()
  }

  const invalidate = () => {
    renderedSignature = null
  }

  root.addEventListener(
    'pointerenter',
    () => {
      pointerInside = true
      reveal('expanded')
    },
    { signal: scope.signal }
  )
  root.addEventListener(
    'pointerleave',
    () => {
      pointerInside = false
      scheduleHide()
    },
    { signal: scope.signal }
  )
  root.addEventListener(
    'focusin',
    () => {
      focusInside = true
      reveal('expanded')
    },
    { signal: scope.signal }
  )
  root.addEventListener(
    'focusout',
    () => {
      if (focusSyncTimer !== null) view.clearTimeout(focusSyncTimer)
      focusSyncTimer = view.setTimeout(() => {
        focusSyncTimer = null
        focusInside = root.ownerDocument.activeElement
          ? root.contains(root.ownerDocument.activeElement)
          : false
        if (!focusInside) scheduleHide()
      }, 0)
    },
    { signal: scope.signal }
  )
  root.addEventListener(
    'click',
    (event) => {
      const button = (event.target as Element | null)?.closest<HTMLButtonElement>(
        '.aliyah-rail-button'
      )
      if (!button || !root.contains(button)) return
      const target = parseAliyahNavigationTarget(
        button.dataset.runId,
        button.dataset.aliyahIndex
      )
      if (!target) return
      onSelect(target)
      reveal('expanded')
      scheduleHide()
    },
    { signal: scope.signal }
  )

  view.addEventListener('resize', syncPosition, { signal: scope.signal })
  view.visualViewport?.addEventListener('resize', syncPosition, {
    signal: scope.signal,
  })

  scope.own(() => {
    clearHideTimer()
    if (focusSyncTimer !== null) view.clearTimeout(focusSyncTimer)
    focusSyncTimer = null
    pointerInside = false
    focusInside = false
    clear()
    documentRoot.style.removeProperty('--aliyah-rail-top')
    delete documentRoot.dataset.aliyahRailVisibility
  })

  return {
    render,
    clear,
    invalidate,
    setActive,
    reveal,
    revealForMovement: () => reveal('peek'),
    scheduleHide,
    hide,
  }
}
