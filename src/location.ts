/// <reference types="vite/client" />
import type { RefWithScroll, ScrollName } from './ref.ts'

type AppleSauce = {
  p: number
  l: number
}

type TOC = Record<string, Record<string, Record<string, AppleSauce>>>
type TOCLoader = () => Promise<TOC>

let tocLoaders: Record<string, TOCLoader> | null | undefined

function getBundledTOCLoaders() {
  if (tocLoaders !== undefined) return tocLoaders
  if (typeof import.meta.glob !== 'function') {
    tocLoaders = null
    return tocLoaders
  }

  tocLoaders = import.meta.glob<TOC>('./data/tables-of-contents/*.json', {
    import: 'default',
  })
  return tocLoaders
}

export async function loadScroll(name: ScrollName) {
  const tocLoader =
    getBundledTOCLoaders()?.[`./data/tables-of-contents/${name}.json`]
  if (tocLoader) return new ScrollResolver(name, await tocLoader())

  // TODO(https://github.com/vitejs/vite/issues/18582): Delete this workaround.
  let toc
  if (import.meta.env?.MODE)
    // Vite dynamic imports doesn't support the second parameter
    toc = await import(
      /* @vite-ignore */ `./data/tables-of-contents/${name}.json`
    )
  else
    toc = await import(/* @vite-ignore */ `./data/tables-of-contents/${name}.json`, {
      // Node.js requires the second parameter.
      with: { type: 'json' },
    })
  return new ScrollResolver(name, toc.default)
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
    if (!this.toc[book]) throw new Error(`Unknown book ${scroll} #${book}`)
    const { p: pageNumber, l: lineNumber } = this.toc[book][chapter][verse]
    return { pageNumber, lineNumber }
  }
}
