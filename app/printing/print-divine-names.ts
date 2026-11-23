import type { RefWithScroll } from '../ref.ts'
import type { LineType } from '../components/Page.ts'
import { createPassageTokenIdentityIndex } from '../reading/passage-token-identity.ts'
import { tokenizeReaderWords } from '../reader/word-tokenization.ts'
import textFilter from '../text-filter.ts'

// Match whole Hebrew words so ordinary words such as אלה and יהודה stay intact.
const divineName = /^(ו?[בכלמש]?ה?)(יהוה|אלוה|אלו?ה(?:ים|י(?:נו|כם|כן|הם|הן|מו|ך|ו|ם|ן|ה)?))$/u
const hebrewWord = /[א-ת][א-ת\p{M}]*/gu
const cantillation = /[\u0591-\u05AF\u05BD]/gu

export function replacePrintDivineNames(text: string): string {
  return text.replace(hebrewWord, word => {
    const letters = word.replace(/\p{M}/gu, '')
    const match = divineName.exec(letters)
    if (!match) return word
    const prefixLength = match[1].length
    const name = match[2]
    // The four-letter Name keeps its final hey (ידוה); Eloah derivatives change the root hey to kuf.
    const replacedPosition = name === 'יהוה' ? 1 : name.indexOf('ה')
    const replacement = name === 'יהוה' ? 'ד' : 'ק'
    let position = -1
    return word.replace(/[א-ת]/gu, letter => {
      position++
      return position - prefixLength === replacedPosition ? replacement : letter
    })
  })
}

type Letter = { letter: string, points: string }

function pointedLetters(word: string): Letter[] {
  return [...word.matchAll(/([א-ת])(\p{M}*)/gu)].map(([, letter, points]) => ({ letter, points }))
}

const verseKey = ({ b, c, v }: RefWithScroll) => `${b}:${c}:${v}`

// Every אֵל in the Torah was reviewed in context. These verses use the word
// in its ordinary sense; the unpointed spelling identifies the word.
const ordinaryElVerses = new Map([
  // הָאֵל meaning "these"
  ['1:19:8', 'האל'], ['1:19:25', 'האל'], ['1:26:3', 'האל'], ['1:26:4', 'האל'],
  ['3:18:27', 'האל'], ['5:4:42', 'האל'], ['5:7:22', 'האל'], ['5:19:11', 'האל'],
  // Lael, a man's name
  ['4:3:24', 'לאל'],
])

/** Whether a pointed אֵל is an ordinary word, judged from its neighbors and verse. */
function isOrdinaryEl(plain: string, previous: string, next: string, ref: RefWithScroll) {
  return ordinaryElVerses.get(verseKey(ref)) === plain
    || /^ו?(?:עד)?[למ]?בית$/u.test(previous) // the place Beit-El
    || /^ו?ב?לא$/u.test(previous) // בְלֹא אֵל, "a non-god"
    || /^(?:אחר|נכר)$/u.test(next) // other and foreign gods
    || (plain === 'לאל' && next.startsWith('יד')) // לְאֵל יָדִי, "in my power"
}

type Segment = { pointed: string, plain: string, tokenKey: string, letterStart: number, ref: RefWithScroll }

/**
 * Identifies a name and the length of its prefix letters. Names other than the
 * four-letter Name and Elokim are recognized from their pointing; ambiguous
 * spellings count as names, since a needless ב״ה is harmless and a missed name is not.
 */
function nameInSegment(segment: Segment, previous: string, next: string) {
  const letters = pointedLetters(segment.pointed)
  const plain = segment.plain
  const substituted = divineName.exec(plain)
  if (substituted) return { prefixLength: substituted[1].length, respelled: true }
  const named = (pattern: RegExp, check: (name: Letter[]) => boolean) => {
    const match = pattern.exec(plain)
    return match && check(letters.slice(match[1].length)) ? { prefixLength: match[1].length, respelled: false } : undefined
  }
  return named(/^(ו?[בכלמ]?)שדי$/u, ([shin]) => shin.points.includes('\u05C1'))
    ?? named(/^(ו?[בכלמ]?)אדני$/u, ([, , nun]) => nun.points.includes('\u05B8'))
    ?? named(/^(ו?[בכלמ]?ה?)אלי?$/u, ([aleph, lamed]) => aleph.points.includes('\u05B5')
      && (plain.endsWith('אל') || lamed.points.includes('\u05B4'))
      && !isOrdinaryEl(plain, previous, next, segment.ref))
    ?? named(/^()יה$/u, ([yud, hey]) => yud.points.includes('\u05B8') && hey.points.includes('\u05BC'))
    ?? named(/^()אהיה$/u, ([aleph]) => aleph.points.includes('\u05B6'))
}

export type PrintSourceWord = {
  tokenKey: string
  text: string
  ref: RefWithScroll
  /** The same word in scroll form, which splits maqaf groups into separate words. */
  scrollWords: { tokenKey: string, text: string }[]
}

/** Every word of a column in reading order, with its pasuk and its scroll-form words. */
export function printSourceWords({ pageNumber, lines, previousLines, scroll }: { pageNumber: number, lines: LineType[], previousLines?: LineType[], scroll: RefWithScroll['scroll'] }): PrintSourceWord[] {
  const { canonical } = createPassageTokenIdentityIndex({ pageNumber, lines, previousLines, scroll })
  const scrollTexts = new Map<string, string>()
  lines.forEach((line, lineIndex) => line.text.forEach((column, columnIndex) => column.forEach((fragment, fragmentIndex) => {
    tokenizeReaderWords(textFilter({ text: fragment, annotated: false })).forEach((word, wordIndex) => {
      scrollTexts.set(`${pageNumber}:${lineIndex}:${columnIndex * 100 + fragmentIndex}:${wordIndex}`, word.text)
    })
  })))
  return [...canonical.values()].map(({ canonicalTokenKey, canonicalText, ref, plainTokenKeys }) => ({
    tokenKey: canonicalTokenKey, text: canonicalText, ref,
    scrollWords: plainTokenKeys.map(tokenKey => ({ tokenKey, text: scrollTexts.get(tokenKey) ?? '' })),
  }))
}

export type PrintDivineName = {
  tokenKey: string
  /** The pointed name with any prefix, without cantillation. */
  word: string
  ref: RefWithScroll
  /** Whether print substitution respells this name (ידוה, אלקים). */
  respelled: boolean
  /** Letter positions in the whole token that start the name's second and later letters, where breaks go. */
  breakBeforeLetters: number[]
  /** The scroll-form word holding the name, with break positions inside that word. */
  scrollTarget?: { tokenKey: string, breakBeforeLetters: number[] }
}

const lettersOf = (text: string) => text.replace(/[^א-ת]/gu, '')

/** Finds every divine name in pointed source words given in reading order. */
export function findDivineNames(words: readonly PrintSourceWord[]): PrintDivineName[] {
  const segments: (Segment & { source: PrintSourceWord, index: number, count: number })[] = words.flatMap(source => {
    let letterStart = 0
    const matches = [...source.text.replace(cantillation, '').matchAll(hebrewWord)]
    return matches.map(([pointed], index) => {
      const plain = pointed.replace(/\p{M}/gu, '')
      const segment = { pointed, plain, tokenKey: source.tokenKey, letterStart, ref: source.ref, source, index, count: matches.length }
      letterStart += plain.length
      return segment
    })
  })
  return segments.flatMap((segment, index) => {
    const name = nameInSegment(segment, segments[index - 1]?.plain ?? '', segments[index + 1]?.plain ?? '')
    if (!name) return []
    const breaks = (start: number) => Array.from({ length: segment.plain.length - name.prefixLength - 1 }, (_, index) => start + name.prefixLength + 1 + index)
    // Scroll form normally has one word per maqaf part; ketiv/kri can differ, so match by letters.
    const { scrollWords } = segment.source
    const aligned = scrollWords.length === segment.count ? scrollWords[segment.index] : undefined
    const scrollWord = aligned && lettersOf(aligned.text) === segment.plain ? aligned : scrollWords.find(word => lettersOf(word.text) === segment.plain)
    return [{
      tokenKey: segment.tokenKey,
      word: segment.pointed,
      ref: segment.ref,
      respelled: name.respelled,
      breakBeforeLetters: breaks(segment.letterStart),
      scrollTarget: scrollWord && { tokenKey: scrollWord.tokenKey, breakBeforeLetters: breaks(0) },
    }]
  })
}
