import torahTOC from '../data/tables-of-contents/torah.json' with { type: 'json' }

export type TorahBook = {
  number: number
  label: string
  hebrew: string
}

type TorahTOC = Record<string, Record<string, Record<string, { p: number; l: number }>>>

const numericSort = (left: number, right: number) => left - right
const indexedTorahTOC = torahTOC as TorahTOC

const TORAH_BOOKS: TorahBook[] = [
  { number: 1, label: 'Beresheet', hebrew: 'בראשית' },
  { number: 2, label: 'Shemot', hebrew: 'שמות' },
  { number: 3, label: 'Vayikra', hebrew: 'ויקרא' },
  { number: 4, label: 'Bamidbar', hebrew: 'במדבר' },
  { number: 5, label: 'Devarim', hebrew: 'דברים' },
]

export function listTorahBooks() {
  return TORAH_BOOKS
}

export function listTorahChapters(bookNumber: number) {
  const book = indexedTorahTOC[String(bookNumber)]
  if (!book) return []

  return Object.keys(book).map(Number).sort(numericSort)
}

export function listTorahVerses(bookNumber: number, chapterNumber: number) {
  const chapter = indexedTorahTOC[String(bookNumber)]?.[String(chapterNumber)]
  if (!chapter) return []

  return Object.keys(chapter).map(Number).sort(numericSort)
}

export function generateTorahReferenceHash({
  book,
  chapter,
  verse,
}: {
  book: number
  chapter: number
  verse: number
}) {
  return `#/r/${book}-${chapter}-${verse}`
}
