import type { MountScope } from '../lifecycle/mount.ts'

/** Moves the book with a sideways touch pull and springs it back on release. */
export function listenForRevealGesture(scope: MountScope, book: HTMLElement) {
  const PULL_THRESHOLD = 30
  const PULL_MAXIMUM = 100

  const endTouch = () => {
    book.classList.add('mod-pull-releasing')
    book.style.setProperty('--pull-translation', `0`)
  }

  let startX = 0

  book.addEventListener(
    'touchstart',
    (e) => {
      book.classList.remove('mod-pull-releasing')
      startX = e.changedTouches[0].screenX
    },
    { signal: scope.signal }
  )

  book.addEventListener(
    'touchmove',
    (e) => {
      const touchX = e.changedTouches[0].screenX
      const pullDistance = -Math.max(touchX - startX, -PULL_MAXIMUM)
      if (pullDistance < PULL_THRESHOLD) return

      book.style.setProperty(
        '--pull-translation',
        `${PULL_THRESHOLD - pullDistance}px`
      )
    },
    { signal: scope.signal }
  )

  book.addEventListener('touchend', endTouch, { signal: scope.signal })
  book.addEventListener('touchcancel', endTouch, { signal: scope.signal })
  scope.own(() => {
    book.classList.remove('mod-pull-releasing')
    book.style.removeProperty('--pull-translation')
  })
}
