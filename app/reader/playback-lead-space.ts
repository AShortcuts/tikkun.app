import { centerElementInScrollRoot, getReaderFocalPointClientY } from '../reader-scroll.ts'

const LEAD_PROPERTY = '--reader-playback-lead'
const FIRST_WORD_SELECTOR = '[data-reader-canonical="true"] .word:not([hidden]):not(.mod-passage-context)'

/**
 * Off: on a phone, the One aliyah highlight starts on the passage's first lines
 * and moves down to the focal line, as before. Turn on to add room above the
 * text when Play starts so the highlight glides to the focal line right away.
 */
export const PLAYBACK_LEAD_SPACE_ENABLED = false

export interface PlaybackLeadSpace {
  /** Makes room for the passage's first word at the focal line and glides the playing word there. */
  reveal(): void
  clear(): void
}

export interface PlaybackLeadSpaceOptions {
  /** Applies a change that moves the text, keeping the reader's place and re-measuring the pages. */
  updateLayout(mutation: () => void): void
}

/**
 * A One aliyah passage starts at the top of its scroll, so on a phone its first
 * lines cannot reach the focal line and the highlight starts high. When playback
 * starts, this adds room above the text without moving it, then smooth-scrolls
 * the playing word to the focal line.
 */
export function createPlaybackLeadSpace(book: HTMLElement, { updateLayout }: PlaybackLeadSpaceOptions): PlaybackLeadSpace {
  const document = book.ownerDocument
  const root = document.documentElement
  const reducedMotionQuery = document.defaultView?.matchMedia('(prefers-reduced-motion: reduce)')
  const reduceMotion = () => root.dataset.readerReducedMotion === 'on' ||
    (root.dataset.readerReducedMotion !== 'off' && Boolean(reducedMotionQuery?.matches))
  let lead = 0

  return {
    reveal() {
      if (!PLAYBACK_LEAD_SPACE_ENABLED) return
      const firstWord = book.querySelector<HTMLElement>(FIRST_WORD_SELECTOR)
      const activeWord = book.querySelector<HTMLElement>('.is-active-word:not([hidden])')
      if (!firstWord || !activeWord) return
      const first = firstWord.getBoundingClientRect()
      const centerAtTop = (first.top + first.bottom) / 2 + book.scrollTop
      const missing = Math.ceil(getReaderFocalPointClientY(book) - centerAtTop)
      if (missing <= 0) return
      lead += missing
      // The text stays where it was; the scroll below then moves it.
      updateLayout(() => book.style.setProperty(LEAD_PROPERTY, lead + 'px'))
      centerElementInScrollRoot(book, activeWord, reduceMotion() ? {} : { behavior: 'smooth' })
    },
    clear() {
      if (!lead) return
      lead = 0
      book.style.removeProperty(LEAD_PROPERTY)
    },
  }
}
