const SMALL_LETTER_SELECTOR = '.special-letter.mod-small'
const BASELINE_SHIFT_PROPERTY = '--special-letter-baseline-shift'
const HEBREW_LETTER_PATTERN = /[א-ת]/u
const HEBREW_LETTERS_PATTERN = /[א-ת]/gu

const canvasFont = (style: CSSStyleDeclaration) =>
  `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`

const measureAscent = (
  context: CanvasRenderingContext2D,
  text: string,
  style: CSSStyleDeclaration
) => {
  context.direction = style.direction === 'rtl' ? 'rtl' : 'ltr'
  context.font = canvasFont(style)
  context.textBaseline = 'alphabetic'
  const ascent = context.measureText(text).actualBoundingBoxAscent
  if (!Number.isFinite(ascent) || ascent <= 0) {
    throw new Error(`Could not measure the visible top of special letter ${text}`)
  }
  return ascent
}

const neighboringLetters = (word: HTMLElement, letter: HTMLElement) => {
  const targetLetter = letter.textContent?.match(HEBREW_LETTER_PATTERN)?.[0]
  const position = Number(letter.dataset.specialLetterPosition)
  const wordLetters = word.textContent?.match(HEBREW_LETTERS_PATTERN) ?? []
  if (
    !targetLetter ||
    !Number.isSafeInteger(position) ||
    position < 1 ||
    wordLetters[position - 1] !== targetLetter
  ) {
    throw new Error('Small special letter has invalid word-position metadata')
  }

  const neighbors = [wordLetters[position - 2], wordLetters[position]].filter(
    (candidate): candidate is string => Boolean(candidate)
  )
  if (!neighbors.length) {
    throw new Error('Small special letter requires a neighboring Hebrew letter')
  }

  return { targetLetter, neighbors }
}

/**
 * Aligns each reduced letter to the lower visible top of its immediate normal-
 * size neighbors. Marks remain attached to the reduced letter, but do not
 * distort the body-to-body alignment measurement.
 */
export const alignSmallSpecialLetters = (root: Document | Element) => {
  const document = root instanceof Document ? root : root.ownerDocument
  const view = document.defaultView
  if (!view) throw new Error('Special-letter alignment requires a window')

  const context = document.createElement('canvas').getContext('2d')
  if (!context) throw new Error('Special-letter alignment requires Canvas 2D')

  const letters = root.querySelectorAll<HTMLElement>(SMALL_LETTER_SELECTOR)
  letters.forEach((letter) => {
    const word = letter.closest<HTMLElement>('.word')
    const text = letter.textContent
    if (!word || !text) {
      throw new Error('Small special letter must remain inside a non-empty word')
    }

    const { targetLetter, neighbors } = neighboringLetters(word, letter)
    const wordStyle = view.getComputedStyle(word)
    const referenceAscent = Math.min(
      ...neighbors.map((neighbor) => measureAscent(context, neighbor, wordStyle))
    )
    const smallSizeAscent = measureAscent(
      context,
      targetLetter,
      view.getComputedStyle(letter)
    )
    const baselineShift = referenceAscent - smallSizeAscent
    if (!Number.isFinite(baselineShift)) {
      throw new Error(`Invalid special-letter baseline shift for ${text}`)
    }

    letter.style.setProperty(BASELINE_SHIFT_PROPERTY, `${baselineShift}px`)
  })

  return letters.length
}

export const alignSmallSpecialLettersWhenFontsReady = async (
  root: Document | Element,
  signal?: AbortSignal
) => {
  const document = root instanceof Document ? root : root.ownerDocument
  if (document.fonts.status !== 'loaded') await document.fonts.ready
  if (signal?.aborted || (root instanceof Element && !root.isConnected)) return 0
  return alignSmallSpecialLetters(root)
}
