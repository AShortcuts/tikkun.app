import type { LineType } from '../components/Page.ts'
import type { Ref, RefWithScroll, ScrollName } from '../ref.ts'
import { LeiningGenerator } from '../calendar-model/generator.ts'
import type {
  LeiningAliyah,
  LeiningRun,
} from '../calendar-model/model-types.ts'
import {
  LeiningInstanceId,
  LeiningRunType,
} from '../calendar-model/model-types.ts'
import { HDate } from '@hebcal/hdate'
import { compareRefs, containsRef } from '../calendar-model/ref-utils.ts'
import {
  fromISODateString,
  last,
  range,
  toISODateString,
} from '../calendar-model/utils.ts'
import { AliyahLabeller } from './aliyah-labeller.ts'
import {
  hasScrollData,
  loadScroll,
  ScrollResolver,
} from '../location.ts'

type PageLoader = () => Promise<LineType[]>
type PageVerse = LineType['verses'][number]

function toRef(verse: PageVerse): Ref {
  return { b: verse.book, c: verse.chapter, v: verse.verse }
}

export type PageStartLocation = {
  scroll: ScrollName
  pageNumber: number
  lineNumber?: number
}
export type StartLocation = RefWithScroll | PageStartLocation

const isNodeRuntime =
  typeof process !== 'undefined' && Boolean(process.versions?.node)

const pageLoaders: Record<string, PageLoader> | null = isNodeRuntime
  ? null
  : import.meta.glob<LineType[]>('../../text/pages/*/*.json', {
      import: 'default',
    })

/** Information to render a single page from a scroll. */
export interface RenderedPageInfo {
  type: 'page'
  /** Stable position in this view, distinct from the physical page number. */
  contentIndex: number
  pageNumber: number
  /** Identifies the run that owns this logical occurrence, when applicable. */
  runId?: string
  lines: RenderedLineInfo[]
}

export interface PageOccurrenceHint {
  runId: string
}

/** Information to render a message between `RenderedPageInfo`s. */
export interface RenderedMessageInfo {
  type: 'message'
  /** Stable position in this view, distinct from the surrounding page numbers. */
  contentIndex: number
  text: string
}

/** A single entry rendered as the user scrolls. */
export type RenderedEntry = RenderedPageInfo | RenderedMessageInfo

/** A logical entry before its page data has been loaded and rendered. */
export type ScrollContentSource =
  | {
      type: 'page'
      pageNumber: number
      /** Identifies the Holiday run that owns this occurrence of a physical page. */
      runId?: string
    }
  | {
      type: 'message'
      text: string
    }

/**
 * Information to render a single line in the UI.
 * Most of these properties come from the JSON files in pages/.
 */
export interface RenderedLineInfo {
  /**
   * Whitespace-separated spans of text.
   * The outer array has one entry per span in a שירה.
   * The inner array separates a פרשה סתומה.
   */
  text: string[][]
  /** The פסוקים that begin in this line, if any. */
  verses: Ref[]
  /** The verse at the beginning of this line, used for exact focal membership. */
  focalRef?: Ref
  /** True if this line should not be justified. */
  isPetucha: boolean
  /**
   * Labels that apply to פסוקים that begin in this line, for the current leining.
   * This includes beginnings of עליות (which can include both שביעי and מפטיר).
   * It can also include the end of an עלייה if no other עלייה begins.
   * This is computed dynamically based on the current leining.
   */
  labels: string[]
  /** The עליות that begin in this line. */
  aliyahStarts: LeiningAliyah[]
  /**
   * The LeiningRun containing the first פסוק that begins in this line.
   * May be null for the first lines on a page, if they are part of the
   * last פסוק from the previous page.
   * Will also be null for פסוקים that are outside the run (this cannot
   * happen when rendering all of  חומש).
   *
   * This is used to render the header UI as the user scrolls.
   */
  run?: LeiningRun
  /**
   * The עליות that contain this line.
   * This will be empty iff `run` is unset, following the same rules.
   * This can have multiple elements for מפטיר and חול המועד סוכות.
   */
  aliyot: LeiningAliyah[]
}

/** Tracks scrolling through a single "view" of a scroll, associated with one or more LeiningRuns. */
export abstract class ScrollViewModel {
  private readonly contentCursor: Promise<ContentCursor>
  private readonly pageEntryPromises = new Map<
    number,
    Promise<RenderedEntry | null>
  >()
  readonly startingLocation: Promise<{
    page: RenderedEntry
    lineNumber: number
  }>
  readonly resolver: Promise<ScrollResolver>
  readonly initialTitle: string | undefined

  protected constructor(
    readonly generator: LeiningGenerator,
    /** The "view" (set of runs and contained עליות) that the user can scroll through. */
    readonly relevantRuns: LeiningRun[],
    initialRef: StartLocation,
    private readonly displayTitleByRunId: Record<string, string> = {},
    initialRunId?: string
  ) {
    const initialRun = relevantRuns.find((run) => run.id === initialRunId)
    // Page-number routes use a seed run, not the reading on that page.
    this.initialTitle =
      !('pageNumber' in initialRef) && initialRun
        ? this.displayTitleForRun(initialRun)
        : undefined
    this.resolver = loadScroll(initialRef.scroll)
    const startingInfo = this.loadAndConsumeScroll(initialRef, initialRunId)
    this.contentCursor = startingInfo.then(
      ({ contentIndex }) => new ContentCursor(contentIndex)
    )
    this.startingLocation = startingInfo.then(({ location }) => location)
  }

  displayTitleForRun(run: LeiningRun) {
    return this.displayTitleByRunId[run.id] ?? run.leining.date.title.he
  }
  private async loadAndConsumeScroll(
    initialRef: StartLocation,
    initialRunId?: string
  ) {
    const scrollResolver = await this.resolver
    const { pageNumber, lineNumber } =
      'pageNumber' in initialRef
        ? {
            pageNumber: initialRef.pageNumber,
            lineNumber: initialRef.lineNumber ?? 1,
          }
        : await scrollResolver.physicalLocationFromRef(initialRef)

    const startingContentIndex = await this.contentIndexFromPageNumber(
      pageNumber,
      initialRunId ? { runId: initialRunId } : undefined
    )
    const page = await this.fetchPage(startingContentIndex)
    if (!page) throw new Error(`First page ${startingContentIndex} must exist`)
    return {
      location: {
        page,
        lineNumber,
      },
      contentIndex: startingContentIndex,
    }
  }

  /** Creates the appropriate `ScrollViewModel` subclass for a particular `LeiningRun` */
  static forId(
    generator: LeiningGenerator,
    runId: string,
    initialRef?: StartLocation,
    options: { displayTitle?: string } = {}
  ): ScrollViewModel | null {
    const run = generator.parseId(runId)
    if (!run || !hasScrollData(run.scroll)) return null
    const displayTitleByRunId = options.displayTitle
      ? { [run.id]: options.displayTitle }
      : {}
    // Always render the full מגילה.
    if (run.type === LeiningRunType.Megillah)
      return new FullScrollViewModel(generator, run, initialRef, displayTitleByRunId)
    // For the פרשה itself, render all of חומש.
    if (run.leining.isParsha && run.type === LeiningRunType.Main)
      return new FullScrollViewModel(generator, run, initialRef, displayTitleByRunId)
    // For any part of יום טוב, special מפטיר, or הפתרה, only render relevant parts.
    return new HolidayViewModel(generator, run, initialRef, displayTitleByRunId)
  }

  /** Creates the appropriate `ScrollViewModel` subclass for the first leining on or after a date. */
  static forDate(generator: LeiningGenerator, date: Date) {
    // Collect all main leinings in the year containing the date.
    const allDates = generator.aroundDate(date)

    // Strip the time component so we can find today's leining.
    date = fromISODateString(toISODateString(date))
    const targetRun = allDates
      .filter((candidate) => candidate.date >= date)
      .flatMap((candidate) => candidate.leinings)
      .flatMap((leining) => leining.runs)
      .find((run) => hasScrollData(run.scroll))
    if (!targetRun) {
      throw new Error('No supported leining found in the upcoming calendar window')
    }

    const model = ScrollViewModel.forId(generator, targetRun.id)
    if (!model) {
      throw new Error(`Unable to create a reader for supported run ${targetRun.id}`)
    }
    return model
  }

  /** Creates the appropriate `ScrollViewModel` subclass for the first leining containing a פסוק. */
  static forRef(generator: LeiningGenerator, ref: RefWithScroll) {
    if (!hasScrollData(ref.scroll)) return null

    // Use this year's calendar.

    let allRuns
    if (ref.scroll === 'torah') {
      allRuns = getParshaRuns(generator, new Date())
    } else {
      allRuns = generator
        .forEntireChumash(new HDate(new Date()))
        .flatMap((d) => d.leinings)
        .flatMap((i) => i.runs)
    }
    const run =
      allRuns.find((r) => r.scroll === ref.scroll && containsRef(r, ref)) ??
      allRuns[0]

    return ScrollViewModel.forId(generator, run.id, ref)
  }

  async fetchPreviousPage(): Promise<RenderedEntry | null> {
    return (await this.contentCursor).previous((contentIndex) =>
      this.fetchPage(contentIndex)
    )
  }

  async fetchNextPage(): Promise<RenderedEntry | null> {
    return (await this.contentCursor).next((contentIndex) =>
      this.fetchPage(contentIndex)
    )
  }

  async fetchPageByPageNumber(
    pageNumber: number,
    hint?: PageOccurrenceHint
  ): Promise<RenderedEntry | null> {
    const contentIndex = await this.contentIndexFromPageNumber(pageNumber, hint)
    if (contentIndex < 0) return null
    return this.fetchPage(contentIndex)
  }

  /** Fetches an exact logical occurrence, including repeated physical pages. */
  async fetchPageByContentIndex(
    contentIndex: number
  ): Promise<RenderedEntry | null> {
    return this.fetchPage(contentIndex)
  }

  /**
   * Returns the page or message source for a contiguous logical index.
   *
   * This is overridden to render only a subset of pages.
   *
   * See the Readme for more background.
   */
  protected abstract contentSourceFromIndex(
    contentIndex: number
  ): Promise<ScrollContentSource | null>
  /** Returns the (contiguous) index at which the given page is rendered. */
  protected abstract contentIndexFromPageNumber(
    pageNumber: number,
    hint?: { runId: string }
  ): Promise<number>

  private async fetchPage(contentIndex: number): Promise<RenderedEntry | null> {
    const existing = this.pageEntryPromises.get(contentIndex)
    if (existing) return existing

    const promise = this.loadPage(contentIndex)
    this.pageEntryPromises.set(contentIndex, promise)
    void promise.catch(() => {
      if (this.pageEntryPromises.get(contentIndex) === promise) {
        this.pageEntryPromises.delete(contentIndex)
      }
    })
    return promise
  }

  private async loadPage(contentIndex: number): Promise<RenderedEntry | null> {
    const source = await this.contentSourceFromIndex(contentIndex)
    if (!source) return null
    if (source.type === 'message') return { ...source, contentIndex }
    if (source.pageNumber <= 0) return null

    const pageNumber = source.pageNumber

    const pageLines = await this.loadPageLines(pageNumber)

    const preferredRun = source.runId
      ? this.relevantRuns.find((candidate) => candidate.id === source.runId)
      : undefined
    let run: LeiningRun | undefined
    let aliyot: LeiningAliyah[] = []
    let mostRecentlyStartedRef: Ref | undefined
    const labeller = new AliyahLabeller((run) => this.displayTitleForRun(run))
    const lines: RenderedLineInfo[] = pageLines.map((rawLine) => {
      const verses = rawLine.verses.map(toRef)
      const focalRef = mostRecentlyStartedRef ?? verses[0]

      if (verses.length) {
        const [containingRun, containingAliyot] = this.findContainingAliyot(
          verses,
          run,
          preferredRun
        )
        run = containingRun
        aliyot = containingAliyot
        mostRecentlyStartedRef = verses[verses.length - 1]
      }
      const aliyahStarts =
        run?.aliyot.filter(
          (aliyah) =>
            aliyah.index &&
            verses.some((verse) => compareRefs(aliyah.start, verse) === 0)
        ) ?? []

      return {
        ...rawLine,
        verses,
        focalRef,
        run,
        aliyot,
        aliyahStarts,
        labels: labeller.getLabelsForLine(run, verses),
      }
    })
    return {
      type: 'page',
      contentIndex,
      pageNumber,
      ...(source.runId ? { runId: source.runId } : {}),
      lines,
    }
  }

  protected async loadPageLines(pageNumber: number): Promise<LineType[]> {
    const pageLoader =
      pageLoaders?.[
        `../../text/pages/${this.relevantRuns[0].scroll}/${pageNumber}.json`
      ]

    if (pageLoader) {
      return pageLoader()
    } else if (import.meta.env?.MODE) {
      // Vite dynamic imports doesn't support the second parameter
      const page = await import(
        /* @vite-ignore */
        `../../text/pages/${this.relevantRuns[0].scroll}/${pageNumber}.json`
      )
      return page.default
    } else {
      const page = await import(
        /* @vite-ignore */
        `../../text/pages/${this.relevantRuns[0].scroll}/${pageNumber}.json`,
        // Node.js requires the second parameter.
        { with: { type: 'json' } }
      )
      return page.default
    }
  }

  private findContainingAliyot(
    verses: Ref[],
    candidateRun?: LeiningRun,
    preferredRun?: LeiningRun
  ): [LeiningRun | undefined, LeiningAliyah[]] {
    if (preferredRun && preferredRun !== candidateRun) {
      const aliyot = preferredRun.aliyot.filter((a) => containsRef(a, verses))
      if (aliyot.length) return [preferredRun, aliyot]
    }
    if (candidateRun) {
      const aliyot = candidateRun.aliyot.filter((a) => containsRef(a, verses))
      if (aliyot.length) return [candidateRun, aliyot]
    }
    for (const run of this.relevantRuns) {
      if (run === candidateRun || run === preferredRun) continue
      const aliyot = run.aliyot.filter((a) => containsRef(a, verses))
      if (aliyot.length) return [run, aliyot]
    }
    return [undefined, []]
  }
}

/** A view that includes the entire scroll.  Used for regular פרשיות and any מגילה. */
class FullScrollViewModel extends ScrollViewModel {
  private readonly pageCount: Promise<number>
  constructor(
    generator: LeiningGenerator,
    run: LeiningRun,
    initialRef: StartLocation = run.aliyot[0].start,
    displayTitleByRunId: Record<string, string> = {}
  ) {
    super(
      generator,
      FullScrollViewModel.calculateRuns(generator, run),
      initialRef,
      displayTitleByRunId,
      run.id
    )
    this.pageCount = this.resolver.then((r) => r.getPageCount())
  }

  protected override async contentSourceFromIndex(
    contentIndex: number
  ): Promise<ScrollContentSource | null> {
    if (contentIndex < 0 || contentIndex + 1 > (await this.pageCount)) return null
    // Page numbers in the JSON are 1-based
    return { type: 'page', pageNumber: contentIndex + 1 }
  }
  /** Returns the (contiguous) index at which the given page is rendered. */
  protected override async contentIndexFromPageNumber(
    pageNumber: number
  ): Promise<number> {
    // Content indices are 0-based.
    return pageNumber - 1
  }

  private static calculateRuns(
    generator: LeiningGenerator,
    run: LeiningRun
  ): LeiningRun[] {
    // When used for a מגילה, just include this run.
    if (run.scroll !== 'torah') return [run]
    return getParshaRuns(generator, run.leining.date.date)
  }
}

/** Gets all LeiningRuns that should appear in the חומש-only view. */
function getParshaRuns(generator: LeiningGenerator, hdate: Date) {
  // Ignore separate מפטיר runs so that we don't label them as מפטיר out of context.
  return generator
    .forEntireChumash(new HDate(hdate))
    .flatMap((d) => d.leinings)
    .filter((i) => i.isParsha || i.runs.some(isVezosHabracha))
    .map((i) => i.runs[0])
}

export function isVezosHabracha(r: LeiningRun): boolean {
  return (
    r.leining.id === LeiningInstanceId.Shacharis &&
    r.aliyot[0]?.start.b === 5 &&
    r.aliyot[0]?.start.c === 33
  )
}

/** A view that only renders pages containing the actual leinings.  Used for יום טוב. */
class HolidayViewModel extends ScrollViewModel {
  private readonly pages: Promise<ScrollContentSource[]>

  constructor(
    generator: LeiningGenerator,
    run: LeiningRun,
    initialRef: StartLocation = run.aliyot[0].start,
    displayTitleByRunId: Record<string, string> = {}
  ) {
    // TODO(decide): Should this include the whole LeiningDate?
    super(
      generator,
      run.leining.runs.filter((r) => r.scroll === run.scroll),
      initialRef,
      displayTitleByRunId,
      run.id
    )
    this.pages = this.fetchPages()
  }

  private async fetchPages(): Promise<ScrollContentSource[]> {
    let lastEndPage = 0
    const resolver = await this.resolver
    return this.relevantRuns.flatMap((r) => {
      const start = resolver.physicalLocationFromRef(r.aliyot[0].start)
      const end = resolver.physicalLocationFromRef(last(r.aliyot).end)

      const extraEntries: ScrollContentSource[] = []
      if (lastEndPage) {
        const skipCount = Math.max(
          0,
          Math.abs(start.pageNumber - lastEndPage) - 1
        )
        if (skipCount > 0) {
          extraEntries.push({
            type: 'message',
            text: `✃ ${skipCount} ${skipCount === 1 ? 'עמוד' : 'עמודים'} ✁`,
          })
        }
      }
      lastEndPage = end.pageNumber

      return extraEntries.concat(
        range(start.pageNumber, end.pageNumber).map((pageNumber) => ({
          type: 'page' as const,
          pageNumber,
          runId: r.id,
        }))
      )
    })
  }

  protected override async contentSourceFromIndex(
    index: number
  ): Promise<ScrollContentSource | null> {
    return (await this.pages)[index] ?? null
  }
  protected override async contentIndexFromPageNumber(
    pageNumber: number,
    hint?: { runId: string }
  ): Promise<number> {
    const pages = await this.pages
    if (hint) {
      const matchingRunIndex = pages.findIndex(
        (entry) =>
          entry.type === 'page' &&
          entry.pageNumber === pageNumber &&
          entry.runId === hint.runId
      )
      if (matchingRunIndex >= 0) return matchingRunIndex
    }
    return pages.findIndex(
      (entry) => entry.type === 'page' && entry.pageNumber === pageNumber
    )
  }
}

type ContentLoader = (contentIndex: number) => Promise<RenderedEntry | null>

/**
 * Advances only after a successful load. Requests in the same direction are
 * serialized so a transient failure cannot skip a logical entry.
 */
class ContentCursor {
  private previousIndex: number
  private nextIndex: number
  private previousEnded = false
  private nextEnded = false
  private previousQueue: Promise<void> = Promise.resolve()
  private nextQueue: Promise<void> = Promise.resolve()

  constructor(startingAt: number) {
    this.previousIndex = startingAt - 1
    this.nextIndex = startingAt + 1
  }

  previous(loader: ContentLoader) {
    const request = this.previousQueue.then(async () => {
      if (this.previousEnded) return null
      const entry = await loader(this.previousIndex)
      if (!entry) {
        this.previousEnded = true
        return null
      }
      this.previousIndex -= 1
      return entry
    })
    this.previousQueue = request.then(
      (): void => {},
      (): void => {}
    )
    return request
  }

  next(loader: ContentLoader) {
    const request = this.nextQueue.then(async () => {
      if (this.nextEnded) return null
      const entry = await loader(this.nextIndex)
      if (!entry) {
        this.nextEnded = true
        return null
      }
      this.nextIndex += 1
      return entry
    })
    this.nextQueue = request.then(
      (): void => {},
      (): void => {}
    )
    return request
  }
}
