import { expect, test } from 'vitest'
import Line from './components/Line.ts'
import type { LineType } from './components/Page.ts'
import {
  createSpecialLetterRenderer,
  normalizeHebrewWord,
  specialLetterCatalog,
} from './special-letters.ts'

const torahPages = import.meta.glob<LineType[]>(
  '../text/pages/torah/*.json',
  {
    eager: true,
    import: 'default',
  }
)

test('loads the seven small-letter targets from the extensible catalog', () => {
  expect(specialLetterCatalog.schemaVersion).toBe(1)
  expect(specialLetterCatalog.tradition).toBe(
    'contemporary-ashkenazi-sephardi'
  )
  expect(
    specialLetterCatalog.entries.map((entry) => ({
      ref: `${entry.verse.book}:${entry.verse.chapter}:${entry.verse.verse}`,
      word: entry.word.text,
      letter: entry.letter.text,
      position: entry.letter.position,
      form: entry.form.type,
    }))
  ).toEqual([
    { ref: '1:2:4', word: 'בהבראם', letter: 'ה', position: 2, form: 'small' },
    { ref: '1:23:2', word: 'ולבכתה', letter: 'כ', position: 4, form: 'small' },
    { ref: '1:27:46', word: 'קצתי', letter: 'ק', position: 1, form: 'small' },
    { ref: '3:1:1', word: 'ויקרא', letter: 'א', position: 5, form: 'small' },
    { ref: '3:6:2', word: 'מוקדה', letter: 'מ', position: 1, form: 'small' },
    { ref: '4:25:11', word: 'פינחס', letter: 'י', position: 2, form: 'small' },
    { ref: '5:32:18', word: 'תשי', letter: 'י', position: 3, form: 'small' },
  ])
})

test('each catalog entry resolves to exactly one word in its canonical verse', () => {
  const matchCounts = new Map(
    specialLetterCatalog.entries.map((entry) => [entry.id, 0])
  )
  let activeVerse: LineType['verses'][number] | undefined

  const orderedPages = Object.entries(torahPages).sort(
    ([left], [right]) => pageNumber(left) - pageNumber(right)
  )
  for (const [, lines] of orderedPages) {
    for (const line of lines) {
      const lineVerses = activeVerse
        ? [activeVerse, ...line.verses]
        : line.verses
      const words = line.text
        .flat()
        .flatMap((fragment) => fragment.trim().split(/\s+/))
        .map(normalizeHebrewWord)

      for (const entry of specialLetterCatalog.entries) {
        const verseIsOnLine = lineVerses.some(
          (verse) =>
            verse.book === entry.verse.book &&
            verse.chapter === entry.verse.chapter &&
            verse.verse === entry.verse.verse
        )
        if (!verseIsOnLine) continue

        const matches = words.filter((word) => word === entry.word.text).length
        matchCounts.set(entry.id, (matchCounts.get(entry.id) ?? 0) + matches)
      }

      activeVerse = line.verses[line.verses.length - 1] ?? activeVerse
    }
  }

  expect([...matchCounts.values()]).toEqual(
    specialLetterCatalog.entries.map(() => 1)
  )
})

test('the line renderer keeps one live marker and one stored alternate', () => {
  const renderedCounts = new Map(
    specialLetterCatalog.entries.map((entry) => [entry.id, 0])
  )
  const alternateCounts = new Map(
    specialLetterCatalog.entries.map((entry) => [entry.id, 0])
  )
  const targetWords = new Set(
    specialLetterCatalog.entries.map((entry) => entry.word.text)
  )
  const orderedPages = Object.entries(torahPages).sort(
    ([left], [right]) => pageNumber(left) - pageNumber(right)
  )

  for (const [path, lines] of orderedPages) {
    const currentPageNumber = pageNumber(path)
    let focalRef: { b: number; c: number; v: number } | undefined

    for (const [lineIndex, line] of lines.entries()) {
      const verses = line.verses.map((verse) => ({
        b: verse.book,
        c: verse.chapter,
        v: verse.verse,
      }))
      const lineFocalRef = focalRef ?? verses[0]
      const containsTargetWord = line.text
        .flat()
        .flatMap((fragment) => fragment.trim().split(/\s+/))
        .map(normalizeHebrewWord)
        .some((word) => targetWords.has(word))

      if (containsTargetWord) {
        const html = Line({
          pageNumber: currentPageNumber,
          lineIndex,
          text: line.text,
          verses,
          focalRef: lineFocalRef,
          isPetucha: line.isPetucha,
          labels: [],
          aliyot: [],
          aliyahStarts: [],
          run: undefined,
        })
        for (const entry of specialLetterCatalog.entries) {
          const marker = `data-special-letter-id="${entry.id}"`
          const alternateMarker =
            `data-special-letter-id=&quot;${entry.id}&quot;`
          renderedCounts.set(
            entry.id,
            (renderedCounts.get(entry.id) ?? 0) + html.split(marker).length - 1
          )
          alternateCounts.set(
            entry.id,
            (alternateCounts.get(entry.id) ?? 0) +
              html.split(alternateMarker).length -
              1
          )
        }
      }

      focalRef = verses[verses.length - 1] ?? focalRef
    }
  }

  expect([...renderedCounts.values()]).toEqual(
    specialLetterCatalog.entries.map(() => 1)
  )
  expect([...alternateCounts.values()]).toEqual(
    specialLetterCatalog.entries.map(() => 1)
  )
})

test('wraps the selected letter and all of its marks without changing word text', () => {
  const render = createSpecialLetterRenderer([{ b: 1, c: 23, v: 2 }])
  const text = 'וְלִבְכֹּתָֽהּ׃'
  const rendered = render(text)

  expect(rendered).toContain('>כֹּ</span>')
  expect(rendered).toContain('data-special-letter-form="small"')
  expect(rendered).toContain('data-special-letter-position="4"')
  expect(rendered.replace(/<[^>]+>/g, '')).toBe(text)
})

test('does not change the same word outside its cataloged verse', () => {
  const render = createSpecialLetterRenderer([{ b: 1, c: 1, v: 5 }])
  expect(render('וַיִּקְרָא')).toBe('וַיִּקְרָא')
})

const pageNumber = (path: string) =>
  Number(/\/(\d+)\.json$/.exec(path)?.[1] ?? Number.NaN)
