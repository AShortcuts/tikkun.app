import { containsRef } from '../calendar-model/ref-utils.ts'
import { aliyahName } from '../view-model/aliyah-labeller.ts'
import {
  ScrollViewModel,
  type IsolatedAliyahSelection,
  type PageOccurrenceHint,
  type RenderedPageInfo,
  type ScrollContentSource,
} from '../view-model/scroll-view-model.ts'
import type { RefWithScroll } from '../ref.ts'
import { loadPassageSelection } from './passage-selection.ts'
import type { PlaybackAliyahIndex } from './aliyah-dom-target.ts'
import { createPassageTokenIdentityIndex } from './passage-token-identity.ts'
import { parseTokenKey } from '../reader/token-position.ts'

export async function createIsolatedAliyahViewModel(
  base: ScrollViewModel,
  target: { runId: string; aliyahIndex: PlaybackAliyahIndex },
  initialRef?: RefWithScroll,
): Promise<ScrollViewModel> {
  const run = base.relevantRuns.find(candidate => candidate.id === target.runId)
  const aliyah = run?.aliyot.find(candidate => candidate.index === target.aliyahIndex)
  if (!run || !aliyah || run.scroll !== 'torah') {
    throw new Error(`Cannot isolate Torah aliyah ${target.runId}:${target.aliyahIndex}`)
  }
  const requestedRef = initialRef ?? aliyah.start
  if (requestedRef.scroll !== run.scroll || !containsRef(aliyah, requestedRef)) {
    throw new Error(`Initial reference is outside aliyah ${target.runId}:${target.aliyahIndex}`)
  }
  const passage = await loadPassageSelection([aliyah], { resolver: await base.resolver })
  const pageNumbers = passage.pages.map(page => page.pageNumber)
  const pageSet = new Set(pageNumbers)
  const context = new Map(passage.contextPages.map(page => [page.pageNumber, page.lines]))
  const identities = new Map(passage.pages.map(page => [page.pageNumber, createPassageTokenIdentityIndex({
    ...page, scroll: run.scroll, previousLines: context.get(page.pageNumber - 1),
  })]))
  const selection: IsolatedAliyahSelection = {
    ...target,
    run,
    aliyah,
    start: aliyah.start,
    end: aliyah.end,
    pageNumbers,
    tokenKeys: passage.tokenKeys,
    initialTokenKey: passage.firstTokenKeyAt(requestedRef),
    tokenIdentity: query => {
      const page = parseTokenKey(query.tokenKey)?.pageNumber
      const identity = page === undefined ? undefined : identities.get(page)?.resolve(query)
      if (!identity || !passage.tokenKeys.has(identity.canonicalTokenKey)) {
        throw new Error(`The word ${query.tokenKey} is outside the selected aliyah.`)
      }
      return identity
    },
    containsTokenKey: key => passage.tokenKeys.has(key),
    containsRenderedTokenKey: key => passage.tokenKeys.has(key) || passage.projection.unannotated.has(key),
    containsPage: page => pageSet.has(page),
    containsRef: ref => (!('scroll' in ref) || ref.scroll === run.scroll) && containsRef(aliyah, ref),
  }
  let focalRef = aliyah.start
  const pages: RenderedPageInfo[] = passage.pages.map(({ pageNumber, lines }, contentIndex) => ({
    type: 'page', contentIndex, pageNumber, runId: run.id,
    wordSelection: passage.projection,
    // Keep the complete source array: DOM line indexes are physical coordinates.
    lines: lines.map(line => {
      const verses = line.verses.map(v => ({ scroll: run.scroll, b: v.book, c: v.chapter, v: v.verse }))
        .filter(ref => selection.containsRef(ref))
      const lineFocalRef = focalRef
      focalRef = verses.at(-1) ?? focalRef
      const beginsAliyah = verses.some(ref => ref.b === aliyah.start.b && ref.c === aliyah.start.c && ref.v === aliyah.start.v)
      return {
        ...line,
        scroll: run.scroll,
        verses,
        focalRef: lineFocalRef,
        run,
        aliyot: [aliyah],
        aliyahStarts: beginsAliyah ? [aliyah] : [],
        labels: beginsAliyah ? [aliyahName(aliyah.index, run, { title: base.displayTitleForRun(run) })] : [],
      }
    }),
  }))
  const model = new IsolatedAliyahViewModel(base, selection, pages, requestedRef)
  await model.startingLocation
  return model
}

class IsolatedAliyahViewModel extends ScrollViewModel {
  constructor(
    base: ScrollViewModel,
    override readonly isolatedAliyah: IsolatedAliyahSelection,
    private readonly pages: readonly RenderedPageInfo[],
    initialRef: RefWithScroll,
  ) {
    super(base.generator, base.relevantRuns, initialRef,
      Object.fromEntries(base.relevantRuns.map(run => [run.id, base.displayTitleForRun(run)])),
      isolatedAliyah.runId)
  }

  protected override async contentSourceFromIndex(index: number): Promise<ScrollContentSource | null> {
    const page = this.pages[index]
    return page ? { type: 'page', pageNumber: page.pageNumber, runId: page.runId } : null
  }

  protected override async contentIndexFromPageNumber(pageNumber: number, hint?: PageOccurrenceHint) {
    if (hint && hint.runId !== this.isolatedAliyah.runId) return -1
    return this.pages.findIndex(page => page.pageNumber === pageNumber)
  }

  protected override async loadPage(index: number) {
    return this.pages[index] ?? null
  }
}
