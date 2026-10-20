import { loadPassageTokens } from '../audio/passage-tokens.ts'
import { compareRefs, containsRef } from '../calendar-model/ref-utils.ts'
import type { LeiningRun } from '../calendar-model/model-types.ts'
import type { RefWithScroll } from '../ref.ts'
import type { ScrollViewModel } from '../view-model/scroll-view-model.ts'
import {
  getAliyahNavigationEntriesForRun,
  isSameAliyahNavigationTarget,
  type AliyahNavigationEntry,
  type AliyahNavigationTarget,
} from '../reading/aliyah-navigation/model.ts'

export function targetForEntry(entry: AliyahNavigationEntry): AliyahNavigationTarget {
  return { runId: entry.run.id, aliyahIndex: entry.aliyah.index }
}

export function initialIsolatedEntry(
  model: ScrollViewModel,
  explicit?: AliyahNavigationTarget,
): AliyahNavigationEntry | null {
  const location = model.initialLocation
  if (location.scroll !== 'torah' || 'pageNumber' in location) return null
  const run = model.relevantRuns.find(candidate => candidate.id === (explicit?.runId ?? model.initialRunId)) ??
    model.relevantRuns.find(candidate => containsRef(candidate, location))
  if (!run) return null
  const selected = explicit && getAliyahNavigationEntriesForRun(run)
    .find(entry => isSameAliyahNavigationTarget(targetForEntry(entry), explicit))
  if (selected) return selected
  return entryAtReference(run, location, explicit)
}

export function entryAtReference(
  run: LeiningRun,
  reference: RefWithScroll,
  explicit?: AliyahNavigationTarget,
): AliyahNavigationEntry | null {
  const entries = getAliyahNavigationEntriesForRun(run)
  const selected = entries.find(entry => isSameAliyahNavigationTarget(targetForEntry(entry), explicit))
  if (selected && containsRef(selected.aliyah, reference)) return selected
  return entries.find(entry => compareRefs(entry.aliyah.start, reference) === 0) ??
    [...entries].reverse().find(entry => containsRef(entry.aliyah, reference)) ?? null
}

/** Old bookmark hashes can name the first verse of a shared physical row. */
export async function isolatedEntryForToken(
  model: ScrollViewModel,
  tokenKey: string,
  preferred: AliyahNavigationEntry,
  isCurrent: () => boolean,
): Promise<AliyahNavigationEntry | null> {
  const preferredEntries = getAliyahNavigationEntriesForRun(preferred.run)
  const seen = new Set<string>()
  const candidates = [preferred, ...[...preferredEntries].reverse(),
    ...model.relevantRuns.flatMap(getAliyahNavigationEntriesForRun).reverse()]
  for (const entry of candidates) {
    if (!isCurrent()) return null
    const key = `${entry.run.id}:${entry.aliyah.index}`
    if (seen.has(key)) continue
    seen.add(key)
    const tokens = await loadPassageTokens(entry.aliyah)
    if (!isCurrent()) return null
    if (tokens.includes(tokenKey)) return entry
  }
  throw new Error('The saved word could not be found in this reading.')
}
