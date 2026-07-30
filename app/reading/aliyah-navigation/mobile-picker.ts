import { iconMarkup } from '../../components/icons.ts'
import type { MountScope } from '../../lifecycle/mount.ts'
import {
  isSameAliyahNavigationTarget,
  parseAliyahNavigationTarget,
  type AliyahNavigationAdapter,
  type AliyahNavigationItem,
  type AliyahNavigationPlayback,
  type AliyahNavigationSnapshot,
  type AliyahNavigationTarget,
} from './model.ts'

export type MobileAliyahCapsuleState = 'default' | 'loaded' | 'playing'

export function getMobileAliyahCapsuleState({
  loaded,
  playing,
}: {
  loaded: boolean
  playing: boolean
}): MobileAliyahCapsuleState {
  if (loaded && playing) return 'playing'
  if (loaded) return 'loaded'
  return 'default'
}

export type MobileAliyahCapsule = Readonly<{
  visible: boolean
  target: AliyahNavigationTarget | null
  label: string
  playbackState: MobileAliyahCapsuleState
}>

export interface MobileAliyahPickerAdapter extends AliyahNavigationAdapter {
  open(returnFocus?: HTMLElement): void
  close(options?: {
    focusTarget?: HTMLElement
    restoreFocus?: boolean
  }): void
  isOpen(): boolean
  syncPlayback(playback: AliyahNavigationPlayback): void
  syncCapsule(capsule: MobileAliyahCapsule): void
}

export function createMobileAliyahPicker(
  scope: MountScope,
  {
    picker,
    toggle,
    label,
    speaker,
    chevron,
    segments,
    grid,
    backdrop,
    closeButton,
    onSelect,
    onPlay,
    onBeforeOpen,
    onAfterNavigate,
    focusReturnTarget,
    getReaderFocusTarget,
    loadDurationLabel,
    onLoadError,
  }: {
    picker: HTMLElement
    toggle: HTMLButtonElement
    label: HTMLElement
    speaker: HTMLElement
    chevron: HTMLElement
    segments: HTMLElement
    grid: HTMLElement
    backdrop: HTMLElement
    closeButton: HTMLElement
    onSelect: (target: AliyahNavigationTarget) => void
    onPlay: (
      target: AliyahNavigationTarget
    ) => Promise<AliyahNavigationPlayback>
    onBeforeOpen: () => AliyahNavigationPlayback
    onAfterNavigate: () => void
    focusReturnTarget: (target: HTMLElement | null) => void
    getReaderFocusTarget: () => HTMLElement
    loadDurationLabel: (item: AliyahNavigationItem) => Promise<string>
    onLoadError: (error: unknown, item: AliyahNavigationItem) => void
  }
): MobileAliyahPickerAdapter {
  const view = picker.ownerDocument.defaultView
  if (!view) throw new Error('Mobile aliyah picker requires an attached browser document')

  let renderedSignature: string | null = null
  let returnFocus: HTMLElement | null = null
  let closeTimer: number | null = null
  let playbackState: AliyahNavigationPlayback = {
    target: null,
    playing: false,
    progressLabel: '',
  }

  const setIcon = (element: HTMLElement, icon: Parameters<typeof iconMarkup>[0]) => {
    element.innerHTML = iconMarkup(icon)
  }

  const isOpen = () =>
    !picker.classList.contains('u-hidden') &&
    !picker.classList.contains('is-closing')

  const finishClose = () => {
    picker.classList.add('u-hidden')
    picker.classList.remove('is-closing')
    closeTimer = null
  }

  const close: MobileAliyahPickerAdapter['close'] = (
    {
      focusTarget,
      restoreFocus = true,
    }: {
      focusTarget?: HTMLElement
      restoreFocus?: boolean
    } = {}
  ) => {
    if (picker.classList.contains('u-hidden') || picker.classList.contains('is-closing')) {
      return
    }

    picker.setAttribute('aria-hidden', 'true')
    picker.inert = true
    toggle.setAttribute('aria-expanded', 'false')
    setIcon(chevron, 'chevronDown')

    const nextFocus = focusTarget ?? (restoreFocus ? returnFocus : null)
    returnFocus = null
    if (nextFocus) focusReturnTarget(nextFocus)

    if (view.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      finishClose()
      return
    }

    picker.classList.add('is-closing')
    closeTimer = view.setTimeout(finishClose, 180)
  }

  const syncPlayback = (playback: AliyahNavigationPlayback) => {
    playbackState = playback

    grid.querySelectorAll<HTMLButtonElement>('.mobile-aliyah-play').forEach((button) => {
      const target = parseAliyahNavigationTarget(
        button.dataset.runId,
        button.dataset.aliyahIndex
      )
      const isCurrentSession = isSameAliyahNavigationTarget(
        playback.target,
        target
      )
      const isPlayingTarget = Boolean(isCurrentSession && playback.playing)
      const card = button.closest<HTMLElement>('.mobile-aliyah-card')
      const status = card?.querySelector<HTMLElement>('.mobile-aliyah-card-status')
      const durationLabel = status?.dataset.durationLabel ?? 'Available'

      card?.classList.toggle('is-playing', isPlayingTarget)
      setIcon(button, isPlayingTarget ? 'pause' : 'play')
      button.title = `${isPlayingTarget ? 'Pause' : 'Play'} ${
        card?.querySelector('.mobile-aliyah-card-label')?.textContent ?? 'aliyah'
      }`
      button.setAttribute('aria-label', button.title)

      if (!status) return
      status.textContent = isPlayingTarget
        ? `Playing · ${playback.progressLabel}`
        : isCurrentSession
          ? `Paused · ${playback.progressLabel}`
          : durationLabel
      status.title = status.textContent
    })

    segments
      .querySelectorAll<HTMLButtonElement>('.mobile-aliyah-segment')
      .forEach((segment) => {
        const target = parseAliyahNavigationTarget(
          segment.dataset.runId,
          segment.dataset.aliyahIndex
        )
        const isPlayingTarget = Boolean(
          playback.playing &&
            isSameAliyahNavigationTarget(playback.target, target)
        )
        segment.classList.toggle('is-playing', isPlayingTarget)
        const itemLabel = segment.dataset.aliyahLabel
        if (!itemLabel) return
        const accessibleLabel = isPlayingTarget
          ? `${itemLabel} is playing. Go to aliyah.`
          : `Go to ${itemLabel}`
        segment.title = accessibleLabel
        segment.setAttribute('aria-label', accessibleLabel)
      })
  }

  const open = (requestedReturnFocus?: HTMLElement) => {
    if (toggle.classList.contains('u-hidden')) return
    syncPlayback(onBeforeOpen())

    if (closeTimer !== null) {
      view.clearTimeout(closeTimer)
      closeTimer = null
    }
    picker.classList.remove('is-closing')
    const activeElement =
      picker.ownerDocument.activeElement instanceof HTMLElement &&
      picker.ownerDocument.activeElement !== picker.ownerDocument.body
        ? picker.ownerDocument.activeElement
        : null
    returnFocus = requestedReturnFocus ?? activeElement ?? toggle
    picker.classList.remove('u-hidden')
    picker.setAttribute('aria-hidden', 'false')
    picker.inert = false
    toggle.setAttribute('aria-expanded', 'true')
    setIcon(chevron, 'chevronUp')

    const currentCard = picker.querySelector<HTMLButtonElement>(
      '.mobile-aliyah-card.is-current .mobile-aliyah-card-main'
    )
    view.requestAnimationFrame(() => {
      if (!scope.signal.aborted) (currentCard ?? closeButton)?.focus()
    })
  }

  const setActive = (target: AliyahNavigationTarget | null) => {
    grid.querySelectorAll<HTMLElement>('.mobile-aliyah-card').forEach((card) => {
      card.classList.toggle(
        'is-current',
        isSameAliyahNavigationTarget(
          parseAliyahNavigationTarget(
            card.dataset.runId,
            card.dataset.aliyahIndex
          ),
          target
        )
      )
    })

    segments
      .querySelectorAll<HTMLButtonElement>('.mobile-aliyah-segment')
      .forEach((segment) => {
        const current = isSameAliyahNavigationTarget(
          parseAliyahNavigationTarget(
            segment.dataset.runId,
            segment.dataset.aliyahIndex
          ),
          target
        )
        segment.classList.toggle('is-current', current)
        if (current) segment.setAttribute('aria-current', 'true')
        else segment.removeAttribute('aria-current')
      })
  }

  const loadCardDuration = (
    status: HTMLElement,
    item: AliyahNavigationItem
  ) => {
    void loadDurationLabel(item)
      .then((durationLabel) => {
        if (
          scope.signal.aborted ||
          !status.isConnected ||
          status.dataset.audioKey !== item.audioKey
        ) {
          return
        }
        status.dataset.durationLabel = durationLabel
        syncPlayback(playbackState)
      })
      .catch((error) => {
        if (scope.signal.aborted) return
        onLoadError(error, item)
        if (
          !status.isConnected ||
          status.dataset.audioKey !== item.audioKey
        ) {
          return
        }
        status.dataset.durationLabel = 'Available'
        syncPlayback(playbackState)
      })
  }

  const render = (snapshot: AliyahNavigationSnapshot) => {
    segments.classList.remove('u-hidden')

    if (snapshot.signature !== renderedSignature) {
      renderedSignature = snapshot.signature
      segments.replaceChildren()
      grid.replaceChildren()

      for (const item of snapshot.items.slice(0, 7)) {
        const segment = picker.ownerDocument.createElement('button')
        segment.type = 'button'
        segment.className = 'mobile-aliyah-segment'
        segment.dataset.runId = item.target.runId
        segment.dataset.aliyahIndex = `${item.target.aliyahIndex}`
        segment.dataset.aliyahLabel = item.label
        segment.title = `Go to ${item.label}`
        segment.setAttribute('aria-label', segment.title)
        segments.appendChild(segment)
      }

      for (const item of snapshot.items) {
        const available = Boolean(item.audioKey)
        const card = picker.ownerDocument.createElement('article')
        card.className = 'mobile-aliyah-card'
        card.dataset.runId = item.target.runId
        card.dataset.aliyahIndex = `${item.target.aliyahIndex}`
        card.classList.toggle('is-unavailable', !available)

        const navigationButton = picker.ownerDocument.createElement('button')
        navigationButton.type = 'button'
        navigationButton.className = 'mobile-aliyah-card-main'
        navigationButton.dataset.runId = item.target.runId
        navigationButton.dataset.aliyahIndex = `${item.target.aliyahIndex}`
        navigationButton.setAttribute('aria-label', `Go to ${item.label}`)

        const itemLabel = picker.ownerDocument.createElement('span')
        itemLabel.className = 'mobile-aliyah-card-label'
        itemLabel.textContent = item.label

        const status = picker.ownerDocument.createElement('span')
        status.className = 'mobile-aliyah-card-status'
        status.dataset.audioKey = item.audioKey ?? ''
        status.dataset.durationLabel = available ? 'Loading…' : 'No audio'
        status.textContent = status.dataset.durationLabel
        navigationButton.append(itemLabel, status)

        card.append(navigationButton)
        if (available) {
          const playButton = picker.ownerDocument.createElement('button')
          playButton.type = 'button'
          playButton.className = 'mobile-aliyah-play'
          playButton.dataset.runId = item.target.runId
          playButton.dataset.aliyahIndex = `${item.target.aliyahIndex}`
          setIcon(playButton, 'play')
          playButton.title = `Play ${item.label}`
          playButton.setAttribute('aria-label', playButton.title)
          card.append(playButton)
        }

        grid.appendChild(card)
        if (available) loadCardDuration(status, item)
      }
    }

    setActive(snapshot.active)
    syncPlayback(snapshot.playback)
  }

  const clear = () => {
    renderedSignature = null
    segments.classList.add('u-hidden')
    segments.replaceChildren()
    grid.replaceChildren()
    close()
  }

  const invalidate = () => {
    renderedSignature = null
  }

  const syncCapsule = ({
    visible,
    target,
    label: capsuleLabel,
    playbackState: capsulePlaybackState,
  }: MobileAliyahCapsule) => {
    toggle.classList.toggle('u-hidden', !visible)
    toggle.dataset.runId = target?.runId ?? ''
    toggle.dataset.aliyahIndex = target ? `${target.aliyahIndex}` : ''
    label.textContent = capsuleLabel
    toggle.dataset.playbackState = capsulePlaybackState
    toggle.classList.toggle('is-loaded', capsulePlaybackState === 'loaded')
    toggle.classList.toggle('is-playing', capsulePlaybackState === 'playing')
    speaker.classList.toggle('u-hidden', capsulePlaybackState !== 'playing')
    toggle.title =
      capsulePlaybackState === 'playing'
        ? 'Choose aliyah; current aliyah is playing'
        : capsulePlaybackState === 'loaded'
          ? 'Choose aliyah; current aliyah is paused'
          : 'Choose aliyah'
    if (!visible) close()
  }

  toggle.addEventListener(
    'click',
    () => {
      if (isOpen()) close()
      else open(toggle)
    },
    { signal: scope.signal }
  )
  backdrop.addEventListener('click', () => close(), { signal: scope.signal })
  closeButton.addEventListener('click', () => close(), { signal: scope.signal })

  segments.addEventListener(
    'click',
    (event) => {
      const button = (event.target as Element | null)?.closest<HTMLButtonElement>(
        '.mobile-aliyah-segment'
      )
      if (!button || !segments.contains(button)) return
      const target = parseAliyahNavigationTarget(
        button.dataset.runId,
        button.dataset.aliyahIndex
      )
      if (!target) return
      setActive(target)
      onSelect(target)
      onAfterNavigate()
    },
    { signal: scope.signal }
  )

  grid.addEventListener(
    'click',
    async (event) => {
      const eventTarget = event.target as Element | null
      const playButton =
        eventTarget?.closest<HTMLButtonElement>('.mobile-aliyah-play')
      const navigationButton = eventTarget?.closest<HTMLButtonElement>(
        '.mobile-aliyah-card-main'
      )
      const control = playButton ?? navigationButton
      if (!control || !grid.contains(control) || control.disabled) return
      const target = parseAliyahNavigationTarget(
        control.dataset.runId,
        control.dataset.aliyahIndex
      )
      if (!target) return

      if (playButton) {
        setActive(target)
        close({ focusTarget: getReaderFocusTarget() })
        const playback = await onPlay(target)
        if (!scope.signal.aborted) syncPlayback(playback)
        return
      }

      close()
      setActive(target)
      onSelect(target)
      onAfterNavigate()
    },
    { signal: scope.signal }
  )

  picker.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
        return
      }
      if (event.key !== 'Tab') return

      const focusable = [
        ...picker.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])'
        ),
      ].filter((element) => element.offsetParent !== null)
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (!first || !last) return
      if (event.shiftKey && picker.ownerDocument.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (
        !event.shiftKey &&
        picker.ownerDocument.activeElement === last
      ) {
        event.preventDefault()
        first.focus()
      }
    },
    { signal: scope.signal }
  )

  scope.own(() => {
    if (closeTimer !== null) view.clearTimeout(closeTimer)
    closeTimer = null
    returnFocus = null
    picker.classList.add('u-hidden')
    picker.classList.remove('is-closing')
    picker.setAttribute('aria-hidden', 'true')
    picker.inert = true
    toggle.setAttribute('aria-expanded', 'false')
    setIcon(chevron, 'chevronDown')
  })

  return {
    render,
    clear,
    invalidate,
    setActive,
    open,
    close,
    isOpen,
    syncPlayback,
    syncCapsule,
  }
}
