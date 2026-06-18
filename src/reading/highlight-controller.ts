import type { WordCue } from '../audio/types.ts'
import type { ScrollDisplay } from '../components/ScrollDisplay.ts'
import { centerElementInScrollRoot } from '../reader-scroll.ts'

const ACTIVE_CLASS = 'is-active-word'

const cueToTokenKey = (cue: WordCue) =>
  `${cue.pageNumber}:${cue.lineIndex}:${cue.fragmentIndex}:${cue.wordIndex}`

export class HighlightController {
  private activeTokenKey: string | null = null
  private activeSequenceIndex = -1
  private activeElements: HTMLElement[] = []
  private pendingActivation: Promise<HTMLElement | null> | null = null
  private pendingTokenKey: string | null = null
  private sequence: string[] = []
  private sequenceIndexByTokenKey = new Map<string, number>()
  private display: ScrollDisplay | null = null
  private tokenElementsByKey = new Map<string, HTMLElement[]>()

  constructor(private readonly book: HTMLElement) {
    this.book.addEventListener('page-rendered', (event) => {
      const renderedNode = (event as CustomEvent<{ node?: Element }>).detail?.node
      if (renderedNode instanceof HTMLElement) {
        this.indexTokenElements(renderedNode)
      }
    })
  }

  setDisplay(display: ScrollDisplay) {
    this.display = display
  }

  setSequence(tokenKeys: string[]) {
    this.sequence = tokenKeys
    this.sequenceIndexByTokenKey = new Map(
      tokenKeys.map((tokenKey, index) => [tokenKey, index])
    )
    this.activeSequenceIndex = this.activeTokenKey
      ? (this.sequenceIndexByTokenKey.get(this.activeTokenKey) ?? -1)
      : -1
  }

  getSequence() {
    return [...this.sequence]
  }

  getActiveTokenKey() {
    return this.activeTokenKey
  }

  getActiveIndex() {
    return this.activeSequenceIndex
  }

  clear() {
    if (!this.activeTokenKey) return
    this.activeElements.forEach((element) => element.classList.remove(ACTIVE_CLASS))
    this.activeElements = []
    this.activeTokenKey = null
    this.activeSequenceIndex = -1
    this.pendingActivation = null
    this.pendingTokenKey = null
  }

  async activateCue(cue: WordCue, options?: { scroll?: boolean }) {
    const tokenKey = cueToTokenKey(cue)
    if (this.activeTokenKey === tokenKey) {
      return this.getVisibleTokenElement(tokenKey) ?? this.getPrimaryTokenElement(tokenKey)
    }

    if (this.pendingTokenKey === tokenKey && this.pendingActivation) {
      return this.pendingActivation
    }

    const activation = (async () => {
      await this.display?.ensurePageRendered(cue.pageNumber)
      return this.activateTokenKey(tokenKey, options)
    })()

    this.pendingTokenKey = tokenKey
    this.pendingActivation = activation

    return activation.finally(() => {
      if (this.pendingTokenKey === tokenKey) {
        this.pendingTokenKey = null
        this.pendingActivation = null
      }
    })
  }

  async activateTokenKey(
    tokenKey: string,
    { scroll = true }: { scroll?: boolean } = {}
  ) {
    if (this.activeTokenKey === tokenKey) {
      return this.getPrimaryTokenElement(tokenKey)
    }

    this.activeElements.forEach((element) => element.classList.remove(ACTIVE_CLASS))

    const elements = this.getTokenElements(tokenKey)
    elements.forEach((element) => element.classList.add(ACTIVE_CLASS))
    this.activeElements = elements
    this.activeTokenKey = tokenKey
    this.activeSequenceIndex = this.sequenceIndexByTokenKey.get(tokenKey) ?? -1

    const target =
      scroll
        ? this.getVisibleTokenElement(tokenKey) ?? elements[0] ?? null
        : elements[0] ?? null

    if (target && scroll) {
      this.scrollTokenIntoView(target)
    }
    return target
  }

  step(delta: -1 | 1, options?: { scroll?: boolean }) {
    const currentIndex = this.getActiveIndex()
    const nextIndex = currentIndex < 0 ? 0 : currentIndex + delta
    if (nextIndex < 0 || nextIndex >= this.sequence.length) return null
    return this.activateTokenKey(this.sequence[nextIndex], options)
  }

  getCueIndex(cues: WordCue[], currentTime: number) {
    let low = 0
    let high = cues.length - 1
    let index = -1

    while (low <= high) {
      const middle = Math.floor((low + high) / 2)
      if (currentTime >= cues[middle].timeStart) {
        index = middle
        low = middle + 1
      } else {
        high = middle - 1
      }
    }

    return index
  }

  getTokenKeyFromElement(element: HTMLElement) {
    return element.dataset.tokenKey ?? null
  }

  private getTokenElements(tokenKey: string) {
    const cached = this.tokenElementsByKey.get(tokenKey)
    if (cached) return cached

    const elements = [
      ...this.book.querySelectorAll<HTMLElement>(`[data-token-key="${tokenKey}"]`),
    ]
    this.tokenElementsByKey.set(tokenKey, elements)
    return elements
  }

  private getPrimaryTokenElement(tokenKey: string) {
    return this.getTokenElements(tokenKey)[0] ?? null
  }

  private getVisibleTokenElement(tokenKey: string) {
    const bookRect = this.book.getBoundingClientRect()
    return this.getTokenElements(tokenKey).find((element) => {
      const rect = element.getBoundingClientRect()
      return rect.top < bookRect.bottom && rect.bottom > bookRect.top
    })
  }

  private scrollTokenIntoView(element: HTMLElement) {
    centerElementInScrollRoot(this.book, element, { behavior: 'smooth' })
  }

  private indexTokenElements(root: ParentNode) {
    root.querySelectorAll<HTMLElement>('[data-token-key]').forEach((element) => {
      const tokenKey = element.dataset.tokenKey
      if (!tokenKey) return

      const existing = this.tokenElementsByKey.get(tokenKey)
      if (!existing) {
        this.tokenElementsByKey.set(tokenKey, [element])
        return
      }

      if (!existing.includes(element)) {
        existing.push(element)
      }
    })
  }

}

export function cueKey(cue: WordCue) {
  return cueToTokenKey(cue)
}
