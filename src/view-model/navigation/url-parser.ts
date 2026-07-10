import { LeiningGenerator } from '../../calendar-model/generator.ts'
import type { LeiningRun } from '../../calendar-model/model-types.ts'
import type { RefWithScroll, ScrollName } from '../../ref.ts'
import { isIndexedReference } from '../../location.ts'
import { ScrollViewModel } from '../scroll-view-model.ts'
import { generateParshaUrl, resolveParshaRun } from './parsha-routes.ts'

export type AppRoute =
  | {
      view: 'reader'
      model: ScrollViewModel
      canonicalHash?: string
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
  if (!initialRef) return `#/run/${run.id}`

  return `#/run/${run.id}/${initialRef.b}-${initialRef.c}-${initialRef.v}`
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

// TODO(decide): Should we support links to a specific עלייה in a run?

const pathHandlers: Record<
  string,
  (
    generator: LeiningGenerator,
    pathParts: string[],
    options?: ParseUrlOptions
  ) => AppRoute | null
> = {
  run(generator, [runId, ref]) {
    if (!runId) return null
    const run = generator.parseId(runId)
    if (!run) return null
    const initialRef = refFromPath(ref, run.scroll)
    if (ref && !initialRef) return missingReferenceRoute(ref)
    const model = ScrollViewModel.forId(generator, run.id, initialRef ?? undefined)
    return model ? { view: 'reader', model } : null
  },
  /** Legacy URL: Specifies a ref in חומש. */
  r(generator, [ref]) {
    if (!ref) return null
    const initialRef = refFromPath(ref, 'torah')
    if (!initialRef) return missingReferenceRoute(ref)

    return {
      view: 'reader',
      model: ScrollViewModel.forRef(generator, initialRef),
    }
  },
  /** Legacy URL: The next leining. */
  next(generator, _pathParts, options) {
    return {
      view: 'reader',
      model: ScrollViewModel.forDate(generator, options?.now ?? new Date()),
    }
  },
  torah(generator, pathParts, options) {
    return parseTorahRoute(generator, pathParts, options)
  },
  esther(generator, pathParts, options) {
    return parseEstherRoute(generator, pathParts, options)
  },
  about(_generator, [page]) {
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
    const [slug, ref] = pathParts
    if (!slug) return null

    const resolved = resolveParshaRun(generator, slug, options?.now)
    if (!resolved) return null
    if (resolved.run.scroll !== 'torah') return null

    const initialRef = refFromPath(ref, resolved.run.scroll)
    if (ref && !initialRef) return missingReferenceRoute(ref)

    const model = ScrollViewModel.forId(
      generator,
      resolved.run.id,
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

  if (routeType === 'page') {
    return parsePageRoute(generator, 'torah', pathParts, options)
  }

  return null
}

function parseEstherRoute(
  generator: LeiningGenerator,
  [routeType, ...pathParts]: string[],
  options?: ParseUrlOptions
): AppRoute | null {
  if (routeType === 'page') return parsePageRoute(generator, 'esther', pathParts, options)
  if (routeType === 'parsha') return null

  const [ref] = pathParts
  const resolved = resolveParshaRun(
    generator,
    routeType ?? 'megillah-esther',
    options?.now
  )
  if (!resolved || resolved.run.scroll !== 'esther') return null

  const initialRef = refFromPath(ref, resolved.run.scroll)
  if (ref && !initialRef) return missingReferenceRoute(ref)

  const model = ScrollViewModel.forId(
    generator,
    resolved.run.id,
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
  [page]: string[],
  options?: ParseUrlOptions
): AppRoute | null {
  if (!page || !/^\d+$/.test(page)) return null
  const pageNumber = Number(page)
  if (!Number.isInteger(pageNumber) || !isValidPageNumber(scroll, pageNumber)) {
    return { view: 'not-found' }
  }

  const slug = scroll === 'torah' ? 'beresheet' : 'megillah-esther'
  const resolved = resolveParshaRun(generator, slug, options?.now)
  if (!resolved) return null

  const model = ScrollViewModel.forId(
    generator,
    resolved.run.id,
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

function isValidPageNumber(scroll: ScrollName, page: number) {
  const pageCount = scroll === 'torah' ? 245 : 17
  return page >= 1 && page <= pageCount
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
  const [urlType, ...pathParts] = path.split('/').filter((p) => p)
  return pathHandlers[urlType]?.(generator, pathParts, options) ?? null
}
