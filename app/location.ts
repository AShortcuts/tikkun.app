import type { RefWithScroll, ScrollName } from './ref.ts'
import estherTOC from '../text/esther-toc.json' with { type: 'json' }
import {
  getTorahPageCount,
  getTorahPageLine,
} from './data/torah-index.ts'

type AppleSauce = {
  p: number
  l: number
}

type TOC = Record<string, Record<string, Record<string, AppleSauce>>>

type IndexedLocation = {
  pageNumber: number
  lineNumber: number
}

interface PageIndex {
  getPageCount(): number
  getLocation(book: number, chapter: number, verse: number): IndexedLocation | null
}

function createObjectPageIndex(toc: TOC): PageIndex {
  return {
    getPageCount: () => {
      const book = Math.max(...Object.keys(toc).map(Number))
      const chapter = Math.max(...Object.keys(toc[book]).map(Number))
      const verse = Math.max(...Object.keys(toc[book][chapter]).map(Number))
      return toc[book][chapter][verse].p
    },
    getLocation: (book, chapter, verse) => {
      const location = toc[book]?.[chapter]?.[verse]
      return location
        ? {
            pageNumber: location.p,
            lineNumber: location.l,
          }
        : null
    },
  }
}

const pageIndexes: Record<ScrollName, PageIndex> = {
  torah: {
    getPageCount: getTorahPageCount,
    getLocation: getTorahPageLine,
  },
  esther: createObjectPageIndex(estherTOC as TOC),
}

export function hasScrollData(name: string): name is ScrollName {
  return Object.prototype.hasOwnProperty.call(pageIndexes, name)
}

export function getScrollPageCount(name: ScrollName) {
  return pageIndexes[name].getPageCount()
}

export function isValidScrollPageNumber(
  name: ScrollName,
  pageNumber: number
) {
  return (
    Number.isInteger(pageNumber) &&
    pageNumber >= 1 &&
    pageNumber <= getScrollPageCount(name)
  )
}

export function isIndexedReference({
  b: book,
  c: chapter,
  v: verse,
  scroll,
}: RefWithScroll) {
  return Boolean(pageIndexes[scroll]?.getLocation(book, chapter, verse))
}

export async function loadScroll(name: ScrollName) {
  if (!hasScrollData(name)) {
    throw new Error(`Scroll data is unavailable for ${name}`)
  }
  return new ScrollResolver(name, pageIndexes[name])
}

export class ScrollResolver {
  constructor(readonly scroll: string, private readonly index: PageIndex) {}

  getPageCount() {
    return this.index.getPageCount()
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
    const indexedLocation = this.index.getLocation(book, chapter, verse)
    if (!indexedLocation) {
      throw new Error(`Unknown reference ${scroll} ${book}:${chapter}:${verse}`)
    }
    return indexedLocation
  }
}
