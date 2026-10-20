import type { LineType } from '../components/Page.ts'
import type { RefWithScroll, ScrollName } from '../ref.ts'
import { canonicalLineWords } from '../reader/canonical-line-words.ts'
import { parseTokenKey } from '../reader/token-position.ts'
import { isInvertedNun, tokenizeReaderWords } from '../reader/word-tokenization.ts'
import { normalizeSearchText } from '../search/normalize.ts'
import textFilter from '../text-filter.ts'
import { projectPassageWords } from './passage-selection.ts'

export type PassageTokenForm = 'annotated' | 'unannotated'

/** An unresolved stored identity; source-loading and context errors use other types. */
export class PassageTokenIdentityError extends Error {
  constructor(
    readonly reason: 'ambiguous' | 'unavailable',
    readonly tokenKey: string,
    message: string,
  ) {
    super(message)
    this.name = 'PassageTokenIdentityError'
  }
}

export interface PassageTokenQuery {
  tokenKey: string
  label?: string
  /** Paired Reading retains annotated coordinates on both sides. */
  form?: PassageTokenForm
}

export interface PassageTokenIdentity {
  readonly canonicalTokenKey: string
  readonly canonicalText: string
  readonly ref: RefWithScroll
  readonly plainTokenKeys: readonly string[]
}

export interface PassageTokenIdentityIndex {
  readonly canonical: ReadonlyMap<string, PassageTokenIdentity>
  readonly plain: ReadonlyMap<string, readonly PassageTokenIdentity[]>
  resolve(query: PassageTokenQuery): PassageTokenIdentity
}

type SourcePage = {
  pageNumber: number
  lines: LineType[]
  previousLines?: LineType[]
  scroll: ScrollName
}

type PageLoader = (pageNumber: number) => Promise<LineType[]>
type Candidate = { identity: PassageTokenIdentity; text: string }

function lastReference(lines: readonly LineType[], scroll: ScrollName) {
  for (let index = lines.length - 1; index >= 0; index--) {
    const verse = lines[index].verses.at(-1)
    if (verse) return { scroll, b: verse.book, c: verse.chapter, v: verse.verse }
  }
}

const exactLabel = (text: string) => text.normalize('NFC').trim().replace(/\s+/gu, ' ')

function normalizedHebrew(text: string) {
  const normalized = normalizeSearchText(text)
  return /^[א-ת]+(?: [א-ת]+)*$/u.test(normalized) ? normalized : ''
}

function uniqueIdentities(candidates: readonly Candidate[]) {
  return [...new Map(candidates.map(({ identity }) => [identity.canonicalTokenKey, identity])).values()]
}

/** Build from original source rows, never the isolated renderer's filtered verse metadata. */
export function createPassageTokenIdentityIndex({
  pageNumber, lines, previousLines = [], scroll,
}: SourcePage): PassageTokenIdentityIndex {
  if (!Number.isSafeInteger(pageNumber) || pageNumber < 1) {
    throw new Error('Cannot index an invalid text page.')
  }
  if (pageNumber > 1 && !previousLines.length) {
    throw new Error(`Previous page context is required for ${scroll} page ${pageNumber}.`)
  }
  const wordsByLine = lines.map((line, index) => canonicalLineWords(pageNumber, index, line))
  const projection = projectPassageWords([{ pageNumber, lines }], new Set(
    wordsByLine.flatMap(words => words.map(word => word.tokenKey)),
  ))
  const plainTexts = new Map<string, string>()
  lines.forEach((line, lineIndex) => line.text.forEach((column, columnIndex) => column.forEach((fragment, fragmentIndex) => {
    tokenizeReaderWords(textFilter({ text: fragment, annotated: false })).forEach((word, wordIndex) => {
      if (!isInvertedNun(word.text)) {
        plainTexts.set(`${pageNumber}:${lineIndex}:${columnIndex * 100 + fragmentIndex}:${wordIndex}`, word.text)
      }
    })
  })))

  const canonical = new Map<string, PassageTokenIdentity>()
  const plain = new Map<string, PassageTokenIdentity[]>()
  let current = lastReference(previousLines, scroll)
  const previousWord = previousLines.flatMap((line, index) => canonicalLineWords(pageNumber - 1, index, line)).at(-1)
  let startsVerse = !previousWord || previousWord.annotatedText.includes('׃')
  wordsByLine.forEach((words, lineIndex) => {
    let verseIndex = 0
    for (const word of words) {
      if (startsVerse) {
        const verse = lines[lineIndex].verses[verseIndex++]
        // The Decalogue has several sof-pasuk clauses within one indexed verse.
        if (verse) current = { scroll, b: verse.book, c: verse.chapter, v: verse.verse }
        startsVerse = false
      }
      if (!current) throw new Error(`The word ${word.tokenKey} could not be matched to a pasuk.`)
      const identity: PassageTokenIdentity = {
        canonicalTokenKey: word.tokenKey,
        canonicalText: word.annotatedText,
        ref: { ...current },
        plainTokenKeys: (projection.unannotatedKeysByAnnotated.get(word.tokenKey) ?? [])
          .filter(key => plainTexts.has(key)),
      }
      canonical.set(word.tokenKey, identity)
      for (const key of identity.plainTokenKeys) {
        const identities = plain.get(key) ?? []
        identities.push(identity)
        plain.set(key, identities)
      }
      if (word.annotatedText.includes('׃')) startsVerse = true
    }
  })

  return {
    canonical,
    plain,
    resolve({ tokenKey, label, form }) {
      if (!parseTokenKey(tokenKey)) throw new Error(`Invalid saved word position: ${tokenKey}.`)
      const candidates: Candidate[] = []
      const annotated = canonical.get(tokenKey)
      if (form !== 'unannotated' && annotated) candidates.push({ identity: annotated, text: annotated.canonicalText })
      if (form !== 'annotated') {
        for (const identity of plain.get(tokenKey) ?? []) {
          candidates.push({ identity, text: plainTexts.get(tokenKey)! })
        }
      }
      const identities = uniqueIdentities(candidates)
      if (!identities.length) throw new PassageTokenIdentityError('unavailable', tokenKey, `The saved word ${tokenKey} could not be found on this page.`)
      if (identities.length === 1) return identities[0]
      if (label?.trim()) {
        const exact = uniqueIdentities(candidates.filter(candidate => exactLabel(candidate.text) === exactLabel(label)))
        if (exact.length === 1) return exact[0]
        // Conflicting exact evidence must not be weakened into a normalized guess.
        if (!exact.length) {
          const normalized = normalizedHebrew(label)
          const matches = normalized ? uniqueIdentities(candidates.filter(candidate => normalizedHebrew(candidate.text) === normalized)) : []
          if (matches.length === 1) return matches[0]
        }
      }
      throw new PassageTokenIdentityError('ambiguous', tokenKey, `The saved word ${tokenKey} is ambiguous between annotated and unannotated text. Select the word again.`)
    },
  }
}

export async function loadPassageTokenIdentityIndex(
  { pageNumber, scroll }: { pageNumber: number; scroll: ScrollName },
  { loadPage }: { loadPage?: PageLoader } = {},
): Promise<PassageTokenIdentityIndex> {
  if (!Number.isSafeInteger(pageNumber) || pageNumber < 1) throw new Error('Cannot load an invalid text page.')
  const loader = loadPage ?? (async (page: number) => {
    const { loadScrollPageLines } = await import('../view-model/scroll-view-model.ts')
    return loadScrollPageLines(scroll, page)
  })
  const [lines, previousLines] = await Promise.all([
    loader(pageNumber),
    pageNumber > 1 ? loader(pageNumber - 1) : Promise.resolve([]),
  ])
  return createPassageTokenIdentityIndex({ pageNumber, lines, previousLines, scroll })
}

export async function resolvePassageTokenIdentity(
  query: PassageTokenQuery & { scroll: ScrollName },
  options: { loadPage?: PageLoader } = {},
): Promise<PassageTokenIdentity> {
  const position = parseTokenKey(query.tokenKey)
  if (!position) throw new Error(`Invalid saved word position: ${query.tokenKey}.`)
  return (await loadPassageTokenIdentityIndex({ pageNumber: position.pageNumber, scroll: query.scroll }, options)).resolve(query)
}
