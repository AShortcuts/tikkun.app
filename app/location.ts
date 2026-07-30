import type { RefWithScroll, ScrollName } from './ref.ts'
import torahTOC from '../text/torah-toc.json' with { type: 'json' }
import estherTOC from '../text/esther-toc.json' with { type: 'json' }

type AppleSauce = {
  p: number
  l: number
}

type TOC = Record<string, Record<string, Record<string, AppleSauce>>>

const scrollTOCs: Record<ScrollName, TOC> = {
  torah: torahTOC as TOC,
  esther: estherTOC as TOC,
}

export function hasScrollData(name: string): name is ScrollName {
  return Object.prototype.hasOwnProperty.call(scrollTOCs, name)
}

export function isIndexedReference({
  b: book,
  c: chapter,
  v: verse,
  scroll,
}: RefWithScroll) {
  return Boolean(scrollTOCs[scroll]?.[book]?.[chapter]?.[verse])
}

export async function loadScroll(name: ScrollName) {
  if (!hasScrollData(name)) {
    throw new Error(`Scroll data is unavailable for ${name}`)
  }
  return new ScrollResolver(name, scrollTOCs[name])
}

export class ScrollResolver {
  constructor(readonly scroll: string, private readonly toc: TOC) {}

  getPageCount() {
    const b = Math.max(...Object.keys(this.toc).map(Number))
    const c = Math.max(...Object.keys(this.toc[b]).map(Number))
    const v = Math.max(...Object.keys(this.toc[b][c]).map(Number))
    return this.toc[b][c][v].p
  }

  physicalLocationFromRef({
    b: book,
    c: chapter,
    v: verse,
    scroll,
  }: RefWithScroll) {
    if (scroll !== this.scroll)
      throw new Error(
        `Cannot read scroll ${scroll} from resolver for ${this.scroll}`
      )
    const indexedLocation = this.toc[book]?.[chapter]?.[verse]
    if (!indexedLocation) {
      throw new Error(`Unknown reference ${scroll} ${book}:${chapter}:${verse}`)
    }
    const { p: pageNumber, l: lineNumber } = indexedLocation
    return { pageNumber, lineNumber }
  }
}
