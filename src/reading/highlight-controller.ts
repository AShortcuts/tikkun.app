import type { WordCue } from '../audio/types.ts'
import type { ScrollDisplay } from '../components/ScrollDisplay.ts'

const ACTIVE_CLASS = 'is-active-word'

const cueToTokenKey = (cue: WordCue) =>
  `${cue.pageNumber}:${cue.lineIndex}:${cue.fragmentIndex}:${cue.wordIndex}`

export class HighlightController {
  private activeTokenKey: string | null = null
  private sequence: string[] = []
  private display: ScrollDisplay | null = null

  constructor(private readonly book: HTMLElement) {}

  setDisplay(display: ScrollDisplay) {
    this.display = display
  }

  setSequence(tokenKeys: string[]) {
    this.sequence = tokenKeys
  }

  getSequence() {
    return [...this.sequence]
  }

  getActiveTokenKey() {
    return this.activeTokenKey
  }

  getActiveIndex() {
    return this.activeTokenKey ? this.sequence.indexOf(this.activeTokenKey) : -1
  }

  clear() {
    if (!this.activeTokenKey) return
    this.getTokenElements(this.activeTokenKey).forEach((element) => {
      element.classList.remove(ACTIVE_CLASS)
    })
    this.activeTokenKey = null
  }

  async activateCue(cue: WordCue, options?: { scroll?: boolean }) {
    await this.display?.ensurePageRendered(cue.pageNumber)
    return this.activateTokenKey(cueToTokenKey(cue), options)
  }

  async activateTokenKey(
    tokenKey: string,
    { scroll = true }: { scroll?: boolean } = {}
  ) {
    if (this.activeTokenKey === tokenKey) return this.getVisibleTokenElement(tokenKey)

    if (this.activeTokenKey) {
      this.getTokenElements(this.activeTokenKey).forEach((element) => {
        element.classList.remove(ACTIVE_CLASS)
      })
    }

    const elements = this.getTokenElements(tokenKey)
    elements.forEach((element) => element.classList.add(ACTIVE_CLASS))
    this.activeTokenKey = tokenKey

    const visible = this.getVisibleTokenElement(tokenKey) ?? elements[0] ?? null
    if (visible && scroll) {
      visible.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
    return visible
  }

  step(delta: -1 | 1, options?: { scroll?: boolean }) {
    const currentIndex = this.getActiveIndex()
    const nextIndex = currentIndex < 0 ? 0 : currentIndex + delta
    if (nextIndex < 0 || nextIndex >= this.sequence.length) return null
    return this.activateTokenKey(this.sequence[nextIndex], options)
  }

  getCueIndex(cues: WordCue[], currentTime: number) {
    let index = -1
    for (let i = 0; i < cues.length; i++) {
      if (currentTime >= cues[i].timeStart) index = i
      else break
    }
    return index
  }

  getTokenKeyFromElement(element: HTMLElement) {
    return element.dataset.tokenKey ?? null
  }

  private getTokenElements(tokenKey: string) {
    return [
      ...this.book.querySelectorAll<HTMLElement>(`[data-token-key="${tokenKey}"]`),
    ]
  }

  private getVisibleTokenElement(tokenKey: string) {
    const bookRect = this.book.getBoundingClientRect()
    return this.getTokenElements(tokenKey).find((element) => {
      const rect = element.getBoundingClientRect()
      return rect.top < bookRect.bottom && rect.bottom > bookRect.top
    })
  }
}

export function cueKey(cue: WordCue) {
  return cueToTokenKey(cue)
}
