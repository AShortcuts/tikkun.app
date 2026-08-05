import Line from './Line.ts'
import type { RenderedPageInfo } from '../view-model/scroll-view-model.ts'

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
  { annotationsEnabled = true }: { annotationsEnabled?: boolean } = {}
) => `
  <table data-page-number="${page.pageNumber}">
    <caption class="tikkun-page-number" aria-hidden="true">${page.pageNumber}</caption>
    ${page.lines
      .map((line, idx) =>
        Line({
          pageNumber: page.pageNumber,
          lineIndex: idx,
          annotationsEnabled,
          ...line,
        })
      )
      .join('')}
  </table>
`

export default Page
