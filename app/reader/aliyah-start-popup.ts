import type { MountScope } from '../lifecycle/mount.ts'

export interface AliyahStartPopupOptions {
  document: Document
  view: Window
  book: HTMLElement
  /** Phone layouts mark aliyah starts with a tappable marker instead of the badge. */
  isCompact(): boolean
}

export interface AliyahStartPopup {
  close(): void
  /** Closes the popup when its marker is inside a subtree that is about to be re-rendered. */
  closeWithin(root: ParentNode): void
}

/** The small Parsha / Aliyah / Verses card shown for an aliyah-start marker. */
export function createAliyahStartPopup(
  scope: MountScope,
  { document, view, book, isCompact }: AliyahStartPopupOptions
): AliyahStartPopup {
  let popupElement: HTMLElement | null = null
  let popupLine: HTMLElement | null = null
  let popupMarker: HTMLElement | null = null

  function getPopup() {
    if (popupElement) return popupElement

    popupElement = document.createElement('div')
    popupElement.className = 'aliyah-start-popup u-hidden'
    popupElement.id = 'aliyah-start-popup'
    popupElement.setAttribute('role', 'dialog')
    popupElement.setAttribute('aria-label', 'Aliyah start')
    document.body.appendChild(popupElement)
    return popupElement
  }

  function close() {
    popupElement?.classList.add('u-hidden')
    if (popupMarker?.matches('.aliyah-start-marker')) {
      popupMarker.setAttribute('aria-expanded', 'false')
    }
    popupLine = null
    popupMarker = null
  }

  function getVisibleMarker(line: HTMLElement) {
    const marker = line.querySelector<HTMLButtonElement>('.aliyah-start-marker')
    if (!marker) return null
    const rect = marker.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0 ? marker : null
  }

  function getMarkerAtPointer(event: Event) {
    const marker = (event.target as Element | null)?.closest<HTMLElement>(
      isCompact()
        ? '.aliyah-start-marker'
        : '.aliyah-badge[data-aliyah-marker="true"]'
    )
    return marker && book.contains(marker) ? marker : null
  }

  function getMarkerLine(marker: HTMLElement) {
    return marker.closest<HTMLElement>('[data-line-index][data-aliyah-starts]')
  }

  function appendRow(popup: HTMLElement, label: string, value: string) {
    if (!value) return

    const row = document.createElement('div')
    row.className = 'aliyah-start-popup-row'

    const rowLabel = document.createElement('span')
    rowLabel.className = 'aliyah-start-popup-label'
    rowLabel.textContent = label

    const rowValue = document.createElement('span')
    rowValue.className = 'aliyah-start-popup-value'
    rowValue.textContent = value

    row.append(rowLabel, rowValue)
    popup.appendChild(row)
  }

  function position(
    popup: HTMLElement,
    line: HTMLElement,
    marker: HTMLElement | null = getVisibleMarker(line)
  ) {
    const content = line.querySelector<HTMLElement>('.line-content')
    if (!content) return

    const rect = (marker ?? content).getBoundingClientRect()
    const popupRect = popup.getBoundingClientRect()
    const margin = 8
    const markerX = marker ? rect.left + rect.width / 2 : rect.right - 4
    const markerY = rect.top
    const left = Math.max(
      margin,
      Math.min(
        markerX - popupRect.width / 2,
        view.innerWidth - popupRect.width - margin
      )
    )
    const topAbove = markerY - popupRect.height - margin
    const top = topAbove >= margin ? topAbove : Math.min(markerY + 24, view.innerHeight - popupRect.height - margin)

    popup.style.left = `${left}px`
    popup.style.top = `${Math.max(margin, top)}px`
  }

  function open(
    line: HTMLElement,
    marker: HTMLElement | null = getVisibleMarker(line)
  ) {
    if (
      popupLine === line &&
      popupMarker === marker &&
      popupElement &&
      !popupElement.classList.contains('u-hidden')
    ) {
      return
    }

    const popup = getPopup()
    if (popupMarker?.matches('.aliyah-start-marker')) {
      popupMarker.setAttribute('aria-expanded', 'false')
    }
    popupLine = line
    popupMarker = marker
    if (marker?.matches('.aliyah-start-marker')) {
      marker.setAttribute('aria-expanded', 'true')
    }
    popup.replaceChildren()
    appendRow(popup, 'Parsha', line.dataset.aliyahStartTitle ?? '')
    appendRow(
      popup,
      'Aliyah',
      marker?.dataset.aliyahStartLabel ?? line.dataset.aliyahStartLabel ?? ''
    )
    appendRow(
      popup,
      'Verses:',
      marker?.dataset.aliyahStartVerse ?? line.dataset.aliyahStartVerse ?? ''
    )
    popup.classList.remove('u-hidden')
    position(popup, line, marker)
  }

  book.addEventListener(
    'click',
    (event) => {
      if (!isCompact()) {
        close()
        return
      }
      if (!(event instanceof MouseEvent)) return
      const marker = getMarkerAtPointer(event)
      const line = marker ? getMarkerLine(marker) : null
      if (!line || !marker) {
        close()
        return
      }

      event.preventDefault()
      event.stopImmediatePropagation()
      open(line, marker)
    },
    { signal: scope.signal }
  )

  book.addEventListener(
    'pointerover',
    (event) => {
      if (event.pointerType === 'touch') return
      const marker = getMarkerAtPointer(event)
      const line = marker ? getMarkerLine(marker) : null
      if (!line || !marker) return

      open(line, marker)
    },
    { signal: scope.signal }
  )

  book.addEventListener(
    'pointerout',
    (event) => {
      if (event.pointerType === 'touch') return
      const marker = getMarkerAtPointer(event)
      if (!marker) return
      const nextTarget = event.relatedTarget
      if (nextTarget instanceof Node && marker.contains(nextTarget)) return
      close()
    },
    { signal: scope.signal }
  )

  book.addEventListener(
    'focusin',
    (event) => {
      const marker = getMarkerAtPointer(event)
      const line = marker ? getMarkerLine(marker) : null
      if (line && marker) open(line, marker)
    },
    { signal: scope.signal }
  )

  book.addEventListener(
    'focusout',
    (event) => {
      const marker = getMarkerAtPointer(event)
      if (!marker) return
      if (event.relatedTarget instanceof Node && marker.contains(event.relatedTarget)) return
      close()
    },
    { signal: scope.signal }
  )

  book.addEventListener('scroll', close, {
    passive: true,
    signal: scope.signal,
  })
  document.addEventListener(
    'pointerdown',
    (event) => {
      const target = event.target as Element | null
      if (!popupElement || popupElement.classList.contains('u-hidden')) return
      if (target && popupElement.contains(target)) return
      if (target?.closest('.aliyah-start-marker')) return
      if (target?.closest('[data-aliyah-starts]')) return
      close()
    },
    { signal: scope.signal }
  )
  scope.own(() => {
    close()
    popupElement?.remove()
    popupElement = null
  })

  return {
    close,
    closeWithin(root) {
      if (popupMarker && root instanceof Node && root.contains(popupMarker)) close()
    },
  }
}
