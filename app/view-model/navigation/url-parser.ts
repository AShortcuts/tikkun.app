import { LeiningGenerator } from '../../calendar-model/generator.ts'
import type { LeiningRun } from '../../calendar-model/model-types.ts'
import { containsRef } from '../../calendar-model/ref-utils.ts'
import { generateTorahReferenceHash } from '../../components/torah-reference.ts'
import {
  findAliyahInRun,
  type PlaybackAliyahIndex,
} from '../../reading/aliyah-dom-target.ts'
import type { RefWithScroll, ScrollName } from '../../ref.ts'
import {
  hasScrollData,
  isIndexedReference,
  isValidScrollPageNumber,
} from '../../location.ts'
import { isOrdinaryShabbatReading, ScrollViewModel } from '../scroll-view-model.ts'
import { generateParshaUrl, parshaReadingForLeining, resolveParshaRun } from './parsha-routes.ts'

export type AppRoute =
  | {
      view: 'reader'
      model: ScrollViewModel
      canonicalHash?: string
      aliyahTarget?: { runId: string; aliyahIndex: PlaybackAliyahIndex }
    }
  | {
      view: 'about'
    }
  | {
      view: 'cue-analytics'
    }
  | {
      view: 'not-found'
    }

export type ParseUrlOptions = {
  now?: Date
}

/** Generates a URL that points to the beginning of a specific run. */
export function generateUrl(run: LeiningRun, initialRef?: RefWithScroll) {
  if (run.leining.kind === 'parsha') return generateParshaUrl(run.leining.slug, initialRef)
  if (!initialRef) return `#/run/${run.id}`

  return `#/run/${run.id}/${initialRef.b}-${initialRef.c}-${initialRef.v}`
}

/**
 * An ordinary Shabbat reading has the same text as its parsha, so it opens as
 * that parsha from every list. Readings the date changes (special maftir, Rosh
 * Chodesh, holidays) keep their dated identity.
 */
export function preferredReadingRun(run: LeiningRun): LeiningRun {
  if (!isOrdinaryShabbatReading(run)) return run
  return parshaReadingForLeining(run.leining)?.runs[0] ?? run
}

/** Generates an explicit aliyah link without changing its reading context. */
export function generateAliyahUrl(
  run: LeiningRun,
  aliyahIndex: PlaybackAliyahIndex,
  initialRef?: RefWithScroll
): string {
  const aliyah = findAliyahInRun(run, aliyahIndex)
  if (!aliyah || parseAliyahIndex(String(aliyahIndex)) === null) {
    throw new Error(`Aliyah ${aliyahIndex} does not exist in reading ${run.id}`)
  }
  const ref = initialRef ?? aliyah.start
  if (!isIndexedReference(ref) || !refBelongsToAliyah(ref, run, aliyahIndex)) {
    throw new Error(`Reference does not belong to Torah aliyah ${aliyahIndex} in reading ${run.id}`)
  }
  return `${generateUrl(run, ref)}/aliyah/${aliyahIndex}`
}

export function generateAboutUrl() {
  return '#/about'
}

export function generateCueAnalyticsUrl() {
  return '#/about/playback-analytics'
}

export function generatePageUrl(scroll: ScrollName, page: number) {
  return `#/${scroll}/page/${page}`
}

const pathHandlers: Record<
  string,
  (
    generator: LeiningGenerator,
    pathParts: string[],
    options?: ParseUrlOptions
  ) => AppRoute | null
> = {
  run(generator, [runId, ...pathParts]) {
    if (!runId) return null
    const referencePath = parseAliyahReferencePath(pathParts)
    if (!referencePath) return null
    const { ref, aliyahIndex } = referencePath
    const run = generator.parseId(runId)
    if (!run) return null
    if (!hasScrollData(run.scroll)) return { view: 'not-found' }
    const initialRef = refFromPath(ref, run.scroll)
    if (ref && !initialRef) return missingReferenceRoute(ref)
    if (initialRef && !refBelongsToRun(initialRef, run)) {
      return { view: 'not-found' }
    }
    if (aliyahIndex !== undefined && !refBelongsToAliyah(initialRef, run, aliyahIndex)) {
      return { view: 'not-found' }
    }
    const model = ScrollViewModel.forId(generator, run.id, initialRef ?? undefined)
    return model ? {
      view: 'reader',
      model,
      ...(aliyahIndex !== undefined && {
        aliyahTarget: { runId: run.id, aliyahIndex },
      }),
    } : null
  },
  /** Keeps legacy Torah reference links working. */
  r(generator, pathParts) {
    return pathParts.length === 1
      ? parseTorahReferenceRoute(generator, pathParts[0])
      : null
  },
  /** Opens the current calendar reading. */
  next(generator, pathParts, options) {
    if (pathParts.length !== 0) return null
    const run = preferredReadingRun(ScrollViewModel.runForDate(generator, options?.now ?? new Date()))
    if (run.leining.kind === 'parsha') {
      // Open the parsha itself while the address stays `#/next`.
      const route = parseUrl(generator, generateUrl(run).slice(1), options)
      return route?.view === 'reader' ? { view: 'reader', model: route.model } : route
    }
    const model = ScrollViewModel.forId(generator, run.id)
    return model ? { view: 'reader', model } : null
  },
  torah(generator, pathParts, options) {
    return parseTorahRoute(generator, pathParts, options)
  },
  esther(generator, pathParts, options) {
    return parseEstherRoute(generator, pathParts, options)
  },
  about(_generator, [page, ...pathParts]) {
    if (pathParts.length !== 0) return null
    if (!page) return { view: 'about' }
    if (
      page === 'playback-analytics' ||
      page === 'word-analytics' ||
      page === 'cue-analytics'
    ) {
      return { view: 'cue-analytics' }
    }
    return null
  },
}

function parseTorahRoute(
  generator: LeiningGenerator,
  [routeType, ...pathParts]: string[],
  options?: ParseUrlOptions
): AppRoute | null {
  if (routeType === 'parsha') {
    const [slug, ...referenceParts] = pathParts
    if (!slug) return null
    const referencePath = parseAliyahReferencePath(referenceParts)
    if (!referencePath) return null
    const { ref, aliyahIndex } = referencePath

    const resolved = resolveParshaRun(generator, slug, options?.now)
    if (!resolved) return null
    if (resolved.run.scroll !== 'torah') return null

    const initialRef = refFromPath(ref, resolved.run.scroll)
    if (ref && !initialRef) return missingReferenceRoute(ref)
    if (aliyahIndex !== undefined && !refBelongsToAliyah(initialRef, resolved.run, aliyahIndex)) {
      return { view: 'not-found' }
    }
    // Earlier parsha links could point at the holiday's other scrolls.
    if (initialRef && !refBelongsToRun(initialRef, resolved.run))
      return parseTorahReferenceRoute(generator, ref)

    const model = ScrollViewModel.forRun(
      generator,
      resolved.run,
      initialRef ?? undefined,
      { displayTitle: resolved.displayTitle }
    )
    if (!model) return null

    return {
      view: 'reader',
      model,
      canonicalHash: aliyahIndex === undefined
        ? generateParshaUrl(resolved.canonicalSlug, initialRef ?? undefined)
        : generateAliyahUrl(resolved.run, aliyahIndex, initialRef ?? undefined),
      ...(aliyahIndex !== undefined && {
        aliyahTarget: { runId: resolved.run.id, aliyahIndex },
      }),
    }
  }

  if (routeType === 'page') {
    return parsePageRoute(generator, 'torah', pathParts, options)
  }

  return pathParts.length === 0
    ? parseTorahReferenceRoute(generator, routeType)
    : null
}

function parseTorahReferenceRoute(
  generator: LeiningGenerator,
  ref: string | undefined
): AppRoute | null {
  if (!ref) return null
  const initialRef = refFromPath(ref, 'torah')
  if (!initialRef) return missingReferenceRoute(ref)

  const model = ScrollViewModel.forRef(generator, initialRef)
  return model
    ? {
        view: 'reader',
        model,
        canonicalHash: generateTorahReferenceHash({
          book: initialRef.b,
          chapter: initialRef.c,
          verse: initialRef.v,
        }),
      }
    : null
}

function parseEstherRoute(
  generator: LeiningGenerator,
  [routeType, ...pathParts]: string[],
  options?: ParseUrlOptions
): AppRoute | null {
  if (routeType === 'page') return parsePageRoute(generator, 'esther', pathParts, options)
  if (routeType === 'parsha') return null
  if (pathParts.length > 1) return null

  const [ref] = pathParts
  const resolved = resolveParshaRun(
    generator,
    routeType ?? 'megillah-esther',
    options?.now
  )
  if (!resolved || resolved.run.scroll !== 'esther') return null

  const initialRef = refFromPath(ref, resolved.run.scroll)
  if (ref && !initialRef) return missingReferenceRoute(ref)
  if (initialRef && !refBelongsToRun(initialRef, resolved.run)) {
    return { view: 'not-found' }
  }

  const model = ScrollViewModel.forRun(
    generator,
    resolved.run,
    initialRef ?? undefined,
    { displayTitle: resolved.displayTitle }
  )
  if (!model) return null

  return {
    view: 'reader',
    model,
    canonicalHash: generateParshaUrl(
      resolved.canonicalSlug,
      initialRef ?? undefined
    ),
  }
}

function parsePageRoute(
  generator: LeiningGenerator,
  scroll: ScrollName,
  pathParts: string[],
  options?: ParseUrlOptions
): AppRoute | null {
  if (pathParts.length !== 1) return null
  const [page] = pathParts
  if (!page || !/^\d+$/.test(page)) return null
  const pageNumber = Number(page)
  if (!isValidScrollPageNumber(scroll, pageNumber)) {
    return { view: 'not-found' }
  }

  const slug = scroll === 'torah' ? 'beresheet' : 'megillah-esther'
  const resolved = resolveParshaRun(generator, slug, options?.now)
  if (!resolved) return null

  const model = ScrollViewModel.forRun(
    generator,
    resolved.run,
    {
      scroll,
      pageNumber,
      lineNumber: 1,
    },
    { displayTitle: resolved.displayTitle }
  )
  if (!model) return null

  return {
    view: 'reader',
    model,
    canonicalHash: generatePageUrl(scroll, pageNumber),
  }
}

function refBelongsToRun(ref: RefWithScroll, run: LeiningRun) {
  return ref.scroll === run.scroll && containsRef(run, ref)
}

function refBelongsToAliyah(
  ref: RefWithScroll | null,
  run: LeiningRun,
  aliyahIndex: PlaybackAliyahIndex
) {
  const aliyah = findAliyahInRun(run, aliyahIndex)
  return ref !== null && ref.scroll === 'torah' && run.scroll === 'torah' &&
    aliyah !== null && containsRef(aliyah, ref)
}

function parseAliyahIndex(value: string): PlaybackAliyahIndex | null {
  if (value === 'Maftir') return value
  return /^[1-8]$/.test(value) ? Number(value) : null
}

function parseAliyahReferencePath(
  pathParts: string[]
): { ref?: string; aliyahIndex?: PlaybackAliyahIndex } | null {
  if (pathParts.length <= 1) return { ref: pathParts[0] }
  const [ref, suffix, index] = pathParts
  if (pathParts.length !== 3 || suffix !== 'aliyah') return null
  const aliyahIndex = parseAliyahIndex(index)
  return aliyahIndex === null ? null : { ref, aliyahIndex }
}

function missingReferenceRoute(ref: string): AppRoute | null {
  return /^\d+-\d+-\d+$/.test(ref) ? { view: 'not-found' } : null
}

function refFromPath(ref: string | undefined, scroll: RefWithScroll['scroll']) {
  if (!ref) return null
  const [, book, chapter, verse] = ref.match(/^(\d+)-(\d+)-(\d+)$/) ?? []

  if (!book || !chapter || !verse) return null

  const parsedRef = {
    scroll,
    b: Number(book),
    c: Number(chapter),
    v: Number(verse),
  }
  return isIndexedReference(parsedRef) ? parsedRef : null
}

/** Parses a URL path (without #) into the ScrollViewModel to display. */
export function parseUrl(
  generator: LeiningGenerator,
  path: string,
  options?: ParseUrlOptions
): AppRoute | null {
  const routePath = path.split('?', 1)[0]
  if (/[\s#]/.test(routePath)) return null
  const [urlType, ...pathParts] = routePath.replace(/^\/|\/$/g, '').split('/')
  if (pathParts.some((part) => !part)) return null
  return pathHandlers[urlType]?.(generator, pathParts, options) ?? null
}
