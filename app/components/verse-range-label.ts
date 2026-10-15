import hebrewNumeral from '../hebrew-numeral.ts'

type ChapterVerse = { c: number; v: number }

export const chapterVerseLabel = ({ c, v }: ChapterVerse) => `${hebrewNumeral(c)}:${hebrewNumeral(v)}`

export function verseRangeLabel({ start, end }: { start: ChapterVerse; end: ChapterVerse }, separator = '-') {
  return `${chapterVerseLabel(start)}${separator}${start.c === end.c ? hebrewNumeral(end.v) : chapterVerseLabel(end)}`
}
