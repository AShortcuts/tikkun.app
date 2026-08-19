import { HDate } from '@hebcal/hdate'
import type { LeiningGenerator } from '../calendar-model/generator.ts'
import type { LeiningInstance } from '../calendar-model/model-types.ts'
import { hasScrollData } from '../location.ts'

function firstScroll(leining: LeiningInstance) {
  const run = leining.runs[0]
  if (!run) {
    throw new Error(
      `Leining ${leining.date.title.en || leining.id} has no reading runs`
    )
  }
  return run.scroll
}

export function listReadingSearchLeinings(
  generator: LeiningGenerator,
  now = new HDate()
) {
  return generator
    .forEntireChumash(now)
    .flatMap((date) => date.leinings)
    .filter((leining) => hasScrollData(firstScroll(leining)))
}
