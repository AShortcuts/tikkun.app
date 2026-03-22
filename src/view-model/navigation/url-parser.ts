import { LeiningGenerator } from '../../calendar-model/generator.ts'
import type { LeiningRun } from '../../calendar-model/model-types.ts'
import { ScrollViewModel } from '../scroll-view-model.ts'

export type AppRoute =
  | {
      view: 'reader'
      model: ScrollViewModel
    }
  | {
      view: 'about'
    }

/** Generates a URL that points to the beginning of a specific run. */
export function generateUrl(run: LeiningRun) {
  return `#/run/${run.id}`
}

export function generateAboutUrl() {
  return '#/about'
}

// TODO(decide): Should we support links to a specific עלייה in a run?

const pathHandlers: Record<
  string,
  (
    generator: LeiningGenerator,
    ...pathParts: string[]
  ) => AppRoute | null
> = {
  run(generator, runId) {
    const model = ScrollViewModel.forId(generator, runId)
    return model ? { view: 'reader', model } : null
  },
  /** Legacy URL: Specifies a ref in חומש. */
  r(generator, ref) {
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
  next(generator) {
    return {
      view: 'reader',
      model: ScrollViewModel.forDate(generator, new Date()),
    }
  },
  about() {
    return { view: 'about' }
  },
  // TODO(decide): Should we maintain support for Parsha & Holiday URLs?
}

/** Parses a URL path (without #) into the ScrollViewModel to display. */
export function parseUrl(
  generator: LeiningGenerator,
  path: string
): AppRoute | null {
  const [urlType, ...pathParts] = path.split('/').filter((p) => p)
  return pathHandlers[urlType]?.(generator, ...pathParts) ?? null
}
