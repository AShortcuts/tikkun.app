import specialLettersJson from '../text/special-letters.json' with {
  type: 'json',
}
import type { Ref } from './ref.ts'

export type SpecialLetterForm = {
  type: 'small'
}

export type SpecialLetterEntry = {
  id: string
  verse: {
    book: number
    chapter: number
    verse: number
  }
  word: {
    text: string
    occurrence: number
  }
  letter: {
    text: string
    /** One-based position among the Hebrew letters in the word. */
    position: number
  }
  form: SpecialLetterForm
}

export type SpecialLetterCatalog = {
  schemaVersion: 1
  tradition: string
  entries: SpecialLetterEntry[]
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const isPositiveInteger = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) > 0

const isHebrewLetter = (value: unknown): value is string =>
  typeof value === 'string' && /^[א-ת]$/u.test(value)

export const normalizeHebrewWord = (text: string) =>
  text.match(/[א-ת]/gu)?.join('') ?? ''

const parseEntry = (value: unknown, index: number): SpecialLetterEntry => {
  const label = `Special-letter entry ${index + 1}`
  if (!isRecord(value)) throw new Error(`${label} must be an object`)

  const { id, verse, word, letter, form } = value
  if (typeof id !== 'string' || !/^[a-z0-9-]+$/.test(id)) {
    throw new Error(`${label} has an invalid id`)
  }
  if (
    !isRecord(verse) ||
    !isPositiveInteger(verse.book) ||
    !isPositiveInteger(verse.chapter) ||
    !isPositiveInteger(verse.verse)
  ) {
    throw new Error(`${label} has an invalid verse`)
  }
  if (
    !isRecord(word) ||
    typeof word.text !== 'string' ||
    normalizeHebrewWord(word.text) !== word.text ||
    !isPositiveInteger(word.occurrence)
  ) {
    throw new Error(`${label} has an invalid word target`)
  }
  if (
    !isRecord(letter) ||
    !isHebrewLetter(letter.text) ||
    !isPositiveInteger(letter.position) ||
    Array.from(word.text)[letter.position - 1] !== letter.text
  ) {
    throw new Error(`${label} has an invalid letter target`)
  }
  if (!isRecord(form) || form.type !== 'small') {
    throw new Error(`${label} has an unsupported form`)
  }

  return {
    id,
    verse: {
      book: verse.book,
      chapter: verse.chapter,
      verse: verse.verse,
    },
    word: {
      text: word.text,
      occurrence: word.occurrence,
    },
    letter: {
      text: letter.text,
      position: letter.position,
    },
    form: { type: 'small' },
  }
}

export const parseSpecialLetterCatalog = (
  value: unknown
): SpecialLetterCatalog => {
  if (!isRecord(value) || value.schemaVersion !== 1) {
    throw new Error('Special-letter catalog has an unsupported schema version')
  }
  if (typeof value.tradition !== 'string' || !value.tradition.trim()) {
    throw new Error('Special-letter catalog must name its tradition')
  }
  if (!Array.isArray(value.entries)) {
    throw new Error('Special-letter catalog entries must be an array')
  }

  const entries = value.entries.map(parseEntry)
  const ids = new Set<string>()
  const targets = new Set<string>()
  for (const entry of entries) {
    if (ids.has(entry.id)) {
      throw new Error(`Duplicate special-letter id: ${entry.id}`)
    }
    ids.add(entry.id)

    const target = [
      entry.verse.book,
      entry.verse.chapter,
      entry.verse.verse,
      entry.word.text,
      entry.word.occurrence,
      entry.letter.position,
    ].join(':')
    if (targets.has(target)) {
      throw new Error(`Duplicate special-letter target: ${target}`)
    }
    targets.add(target)
  }

  return {
    schemaVersion: 1,
    tradition: value.tradition,
    entries,
  }
}

export const specialLetterCatalog = parseSpecialLetterCatalog(specialLettersJson)

const verseKey = ({ b, c, v }: Ref) => `${b}:${c}:${v}`
const entryVerseKey = ({ verse }: SpecialLetterEntry) =>
  `${verse.book}:${verse.chapter}:${verse.verse}`

const entriesByVerse = specialLetterCatalog.entries.reduce(
  (entries, entry) => {
    const key = entryVerseKey(entry)
    entries.set(key, [...(entries.get(key) ?? []), entry])
    return entries
  },
  new Map<string, SpecialLetterEntry[]>()
)

const renderTargetedGrapheme = (
  grapheme: string,
  entry: SpecialLetterEntry
) => `<span
  class="special-letter mod-${entry.form.type}"
  data-special-letter-id="${entry.id}"
  data-special-letter-form="${entry.form.type}"
  data-special-letter-position="${entry.letter.position}"
>${grapheme}</span>`

const renderTargetedWord = (
  text: string,
  entries: SpecialLetterEntry[]
) => {
  const entriesByPosition = new Map(
    entries.map((entry) => [entry.letter.position, entry])
  )
  let letterPosition = 0

  return (text.match(/.\p{Mark}*/gu) ?? [])
    .map((grapheme) => {
      const letter = grapheme.match(/[א-ת]/u)?.[0]
      if (!letter) return grapheme

      letterPosition += 1
      const entry = entriesByPosition.get(letterPosition)
      if (!entry || entry.letter.text !== letter) return grapheme
      return renderTargetedGrapheme(grapheme, entry)
    })
    .join('')
}

/**
 * Creates independent state for one rendered line and annotation mode.
 * The returned function keeps every outer word token intact and changes only
 * the selected grapheme inside it.
 */
export const createSpecialLetterRenderer = (
  references: readonly (Ref | undefined)[]
) => {
  const referenceKeys = new Set(
    references.filter((ref): ref is Ref => Boolean(ref)).map(verseKey)
  )
  const candidates = [...referenceKeys].flatMap(
    (key) => entriesByVerse.get(key) ?? []
  )
  const occurrencesByWord = new Map<string, number>()

  return (text: string) => {
    const normalizedWord = normalizeHebrewWord(text)
    const wordCandidates = candidates.filter(
      (entry) => entry.word.text === normalizedWord
    )
    if (!wordCandidates.length) return text

    const occurrence = (occurrencesByWord.get(normalizedWord) ?? 0) + 1
    occurrencesByWord.set(normalizedWord, occurrence)
    const matchingEntries = wordCandidates.filter(
      (entry) => entry.word.occurrence === occurrence
    )
    return matchingEntries.length
      ? renderTargetedWord(text, matchingEntries)
      : text
  }
}
