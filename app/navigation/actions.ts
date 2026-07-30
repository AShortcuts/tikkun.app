import type { LeiningAliyah, LeiningRun } from '../calendar-model/model-types.ts'
import { createLastReadingHash } from '../reading/last-reading.ts'
import type { ScrollName } from '../ref.ts'
import { getParshaSearchTermsForLeining } from '../view-model/navigation/parsha-routes.ts'
import { holidayLeiningKeywords } from './holiday-actions.ts'

export type NavigationActionGroup =
  | 'reading'
  | 'page'
  | 'resume'
  | 'checkpoint'
  | 'tools'
  | 'admin'

export interface NavigationAction {
  id: string
  group: NavigationActionGroup
  label: string
  badgeLabel?: string
  keywords: string[]
  available: boolean
  showWhenEmpty: boolean
  dedupeKey: string
  run: () => void | Promise<void>
}

export interface NavigationActionInput {
  id: string
  group: NavigationActionGroup
  label: string
  badgeLabel?: string
  keywords?: string[]
  available?: boolean
  showWhenEmpty?: boolean
  dedupeKey?: string
  run: () => void | Promise<void>
}

export function normalizeActionQuery(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
}

export function createNavigationAction(input: NavigationActionInput): NavigationAction {
  return {
    ...input,
    keywords: input.keywords ?? [],
    available: input.available ?? true,
    showWhenEmpty: input.showWhenEmpty ?? true,
    dedupeKey: input.dedupeKey ?? input.label,
  }
}

function scoreAction(action: NavigationAction, query: string) {
  const label = normalizeActionQuery(action.label)
  const keywords = action.keywords.map(normalizeActionQuery)
  if (!query) return action.showWhenEmpty ? 1 : 0
  if (label === query) return 100
  if (label.startsWith(query)) return 80
  if (label.includes(query)) return 60

  const keywordScore = keywords.reduce((best, keyword) => {
    if (keyword === query) return Math.max(best, 50)
    if (keyword.startsWith(query)) return Math.max(best, 40)
    if (keyword.includes(query)) return Math.max(best, 30)
    return best
  }, 0)
  if (keywordScore) return keywordScore

  const queryWords = query.split(' ')
  const searchable = [label, ...keywords].join(' ')
  return queryWords.every((word) => searchable.includes(word)) ? 20 : 0
}

export function filterNavigationActions(
  actions: NavigationAction[],
  rawQuery: string,
  limit = 12
) {
  const query = normalizeActionQuery(rawQuery)
  const seenLabels = new Set<string>()
  const filtered: NavigationAction[] = []

  for (const { action } of actions
    .filter((action) => action.available)
    .map((action, index) => ({ action, index, score: scoreAction(action, query) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)) {
    const labelKey = normalizeActionQuery(action.dedupeKey)
    if (seenLabels.has(labelKey)) continue
    seenLabels.add(labelKey)
    filtered.push(action)
    if (filtered.length >= limit) break
  }

  return filtered
}

function englishAliyahLabel(index: LeiningAliyah['index']) {
  return index === 'Maftir' ? 'Maftir' : `Aliyah ${index}`
}

function aliyahKeywordAliases(index: LeiningAliyah['index']) {
  if (index === 'Maftir') return ['m', 'maftir']
  return [`${index}`, `aliyah ${index}`]
}

export function createAliyahNavigationActions({
  run,
  displayTitle,
  navigate,
  showWhenEmpty = true,
  dedupeKeyPrefix,
}: {
  run: LeiningRun
  displayTitle: string
  navigate: (hash: string) => void
  showWhenEmpty?: boolean
  dedupeKeyPrefix?: string
}) {
  const title = displayTitle.trim()
  const titleTerms = [
    title,
    ...getParshaSearchTermsForLeining(run.leining),
    ...(!run.leining.isParsha
      ? holidayLeiningKeywords(run.leining.date.title, `${run.leining.id}`)
      : []),
  ]
  return run.aliyot
    .filter((aliyah) => Boolean(aliyah.index && aliyah.start))
    .map((aliyah) =>
      createNavigationAction({
        id: `reading.${run.id}.${aliyah.index}`,
        group: 'reading',
        label: `${title} ${englishAliyahLabel(aliyah.index)}`,
        dedupeKey: `${dedupeKeyPrefix ?? `reading.${run.id}`}.${aliyah.index}`,
        keywords: [
          ...titleTerms,
          ...titleTerms.flatMap((term) => [
            `${term} ${aliyah.index}`,
            `${term} ${englishAliyahLabel(aliyah.index)}`,
          ]),
          ...aliyahKeywordAliases(aliyah.index),
        ],
        showWhenEmpty,
        run: () => navigate(createLastReadingHash(run, aliyah.start)),
      })
    )
}

export function createPageNavigationActions({
  navigateToPage,
}: {
  navigateToPage: (scroll: ScrollName, page: number) => void
}) {
  const actions: NavigationAction[] = []

  for (let page = 1; page <= 245; page += 1) {
    actions.push(
      createNavigationAction({
        id: `page.torah.${page}`,
        group: 'page',
        label: `Torah page ${page}`,
        keywords: [
          `${page}`,
          `page ${page}`,
          `torah ${page}`,
          `torah page ${page}`,
          `chumash page ${page}`,
        ],
        showWhenEmpty: false,
        run: () => navigateToPage('torah', page),
      })
    )
  }

  for (let page = 1; page <= 17; page += 1) {
    actions.push(
      createNavigationAction({
        id: `page.esther.${page}`,
        group: 'page',
        label: `Esther page ${page}`,
        keywords: [
          `esther ${page}`,
          `esther page ${page}`,
          `megillah ${page}`,
          `megillah page ${page}`,
          `megillat esther page ${page}`,
        ],
        showWhenEmpty: false,
        run: () => navigateToPage('esther', page),
      })
    )
  }

  return actions
}
