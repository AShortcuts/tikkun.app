import Line from './Line.ts'
import type { RenderedPageInfo } from '../view-model/scroll-view-model.ts'
import {
  defaultReaderPagePresentation,
  type ReaderPagePresentation,
} from '../reader-presentation.ts'

type Verse = {
  book: number
  chapter: number
  verse: number
}

export type LineType = {
  text: string[][]
  verses: Verse[]
  aliyot: { standard: number }[]
  isPetucha: boolean
}

const Page = (
  page: RenderedPageInfo,
  {
    annotationsEnabled = true,
    presentation = defaultReaderPagePresentation,
  }: {
    annotationsEnabled?: boolean
    presentation?: ReaderPagePresentation
  } = {},
) => {
  const pageReference = page.lines.find((line) => line.verses.length)?.verses[0]
  if (presentation.layout === 'reading') {
    const renderLines = ({
      surface = 'single',
      mirror = false,
    }: {
      surface?: 'single' | 'tikkun' | 'torah'
      mirror?: boolean
    } = {}) =>
      page.lines
        .map((line, idx) =>
          Line({
            pageNumber: page.pageNumber,
            lineIndex: idx,
            annotationsEnabled,
            presentation,
            surface,
            mirror,
            ...line,
          }),
        )
        .join('')

    return `
      <div
        class="reader-reading-page mod-${presentation.sides}-side"
        data-page-number="${page.pageNumber}"
      >
        <span class="tikkun-page-number" aria-hidden="true">${page.pageNumber}</span>
        ${
          presentation.sides === 'two'
            ? `<div class="reader-reading-page-side mod-tikkun">${renderLines({ surface: 'tikkun' })}</div>
               <div class="reader-reading-page-side mod-torah" aria-hidden="true">${renderLines(
                 {
                   surface: 'torah',
                   mirror: true,
                 },
               )}</div>`
            : `<div class="reader-reading-page-side mod-single">${renderLines()}</div>`
        }
      </div>
    `
  }

  return `
  <table data-page-number="${page.pageNumber}" data-reader-sides="${presentation.sides}">
    <caption class="tikkun-page-number" aria-hidden="true">${page.pageNumber}</caption>
    ${page.lines
      .map((line, idx) =>
        Line({
          pageNumber: page.pageNumber,
          lineIndex: idx,
          annotationsEnabled,
          presentation,
          pageReference,
          ...line,
        }),
      )
      .join('')}
  </table>
`
}

export default Page
