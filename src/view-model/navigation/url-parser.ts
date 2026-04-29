import { LeiningGenerator } from '../../calendar-model/generator.ts'
import type { LeiningRun } from '../../calendar-model/model-types.ts'
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

export type ParseUrlOptions = {
  now?: Date
}

/** Generates a URL that points to the beginning of a specific run. */
export function generateUrl(run: LeiningRun) {
  return `#/run/${run.id}`
}

export function generateAboutUrl() {
  return '#/about'
}

export function generateCueAnalyticsUrl() {
  return '#/about/playback-analytics'
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
  run(generator, [runId]) {
    if (!runId) return null
    const model = ScrollViewModel.forId(generator, runId)
    return model ? { view: 'reader', model } : null
  },
  /** Legacy URL: Specifies a ref in חומש. */
  r(generator, [ref]) {
    if (!ref) return null
    const [, book, chapter, verse] = ref.match(/^(\d+)-(\d+)-(\d+)$/) ?? []

    if (!book || !chapter || !verse) return null

    return {
      view: 'reader',
      model: ScrollViewModel.forRef(generator, {
        scroll: 'torah',
        b: Number(book),
        c: Number(chapter),
        v: Number(verse),
      }),
    }
  },
  /** Legacy URL: The next leining. */
  next(generator, _pathParts, options) {
    return {
      view: 'reader',
      model: ScrollViewModel.forDate(generator, options?.now ?? new Date()),
    }
  },
  parsha(generator, [slug], options) {
    if (!slug) return null

    const resolved = resolveParshaRun(generator, slug, options?.now)
    if (!resolved) return null

    const model = ScrollViewModel.forId(generator, resolved.run.id)
    if (!model) return null

    return {
      view: 'reader',
      model,
      canonicalHash: generateParshaUrl(resolved.canonicalSlug),
    }
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

/** Parses a URL path (without #) into the ScrollViewModel to display. */
export function parseUrl(
  generator: LeiningGenerator,
  path: string,
  options?: ParseUrlOptions
): AppRoute | null {
  const [urlType, ...pathParts] = path.split('/').filter((p) => p)
  return pathHandlers[urlType]?.(generator, pathParts, options) ?? null
}
