import seaSource from '../../text/pages/torah/78.json?raw'
import haazinuFirstSource from '../../text/pages/torah/242.json?raw'
import haazinuSecondSource from '../../text/pages/torah/243.json?raw'
import type { Ref } from '../ref.ts'
import type { LineType } from './Page.ts'
import { getMatchShirahLayout, renderTextFlow } from './Line.ts'

// Keep these measurement inputs separate from the reader's lazy JSON modules.
const sea: LineType[] = JSON.parse(seaSource)
const haazinuFirst: LineType[] = JSON.parse(haazinuFirstSource)
const haazinuSecond: LineType[] = JSON.parse(haazinuSecondSource)

// Complete-song source, independent of which physical pages are mounted.
// Reuse the real word renderer so marks, kri/ktiv and unusual letters measure
// exactly as they do in the reader; only these small samples enter the probe.
export function matchShirahSamples(kind: 'sea' | 'haazinu') {
  const pages = kind === 'sea'
    ? [{ pageNumber: 78, lines: sea }]
    : [{ pageNumber: 242, lines: haazinuFirst }, { pageNumber: 243, lines: haazinuSecond }]
  return pages.flatMap(({ pageNumber, lines }) => {
    let previousRef: Ref | undefined
    const firstVerse = lines.find((line) => line.verses.length)?.verses[0]
    const pageReference = firstVerse
      ? { b: firstVerse.book, c: firstVerse.chapter, v: firstVerse.verse }
      : undefined
    return lines.flatMap((line, lineIndex) => {
      const verses = line.verses.map(({ book: b, chapter: c, verse: v }) => ({ b, c, v }))
      const focalRef = previousRef ?? verses[0]
      previousRef = verses.at(-1) ?? previousRef
      const layout = getMatchShirahLayout(line.text, verses[0] ?? focalRef ?? pageReference, pageNumber, lineIndex)
      if (layout?.kind !== kind) return []
      return [{
        pageNumber,
        lineIndex,
        markup: renderTextFlow({
          text: line.text,
          references: [focalRef, ...verses],
          annotationsEnabled: true,
          pageNumber,
          lineIndex,
          presentation: { layout: 'match', sides: 'one' },
          surface: 'single',
        }),
      }]
    })
  })
}
