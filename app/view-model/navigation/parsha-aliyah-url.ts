import { LeiningGenerator } from '../../calendar-model/generator.ts'
import { generateParshaUrl, resolveParshaRun } from './parsha-routes.ts'

const routeGenerator = new LeiningGenerator({
  ashkenazi: true,
  includeModernHolidays: false,
  israel: false,
})
const resolvedRuns = new Map<string, ReturnType<typeof resolveParshaRun>>()

function resolveRun(parshaSlug: string) {
  if (!resolvedRuns.has(parshaSlug)) {
    resolvedRuns.set(parshaSlug, resolveParshaRun(routeGenerator, parshaSlug))
  }
  return resolvedRuns.get(parshaSlug) ?? null
}

/** Reader hash URL that opens a parsha at the first pasuk of one aliyah. */
export function generateParshaAliyahUrl(parshaSlug: string, aliyah: number) {
  const resolved = resolveRun(parshaSlug)
  const startRef = resolved?.run.aliyot.find((candidate) => candidate.index === aliyah)?.start
  return generateParshaUrl(resolved?.canonicalSlug ?? parshaSlug, startRef)
}
