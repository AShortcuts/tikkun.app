import type { LeiningAliyah, LeiningRun } from '../calendar-model/model-types.ts'
import { getScrollPageCount } from '../location.ts'
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

export type NavigationActionSearchConstraint = {
  kind: 'aliyah'
  aliyah: NonNullable<LeiningAliyah['index']>
  allowTerms?: readonly string[]
}

export interface NavigationAction {
  id: string
  group: NavigationActionGroup
  label: string
  badgeLabel?: string
  aliases: string[]
  keywords: string[]
  available: boolean
  showWhenEmpty: boolean
  emptyPriority: number | null
  dedupeKey: string
  destinationId: string
  searchConstraint?: NavigationActionSearchConstraint
  href?: string
  run: () => void | Promise<void>
}

export interface NavigationActionInput {
  id: string
  group: NavigationActionGroup
  label: string
  badgeLabel?: string
  aliases?: string[]
  keywords?: string[]
  available?: boolean
  showWhenEmpty?: boolean
  emptyPriority?: number
  dedupeKey?: string
  destinationId?: string
  searchConstraint?: NavigationActionSearchConstraint
  href?: string
  run: () => void | Promise<void>
}

export function createNavigationAction(input: NavigationActionInput): NavigationAction {
  const showWhenEmpty = input.showWhenEmpty ?? true
  const dedupeKey = input.dedupeKey ?? input.label
  return {
    ...input,
    aliases: input.aliases ?? [],
    keywords: input.keywords ?? [],
    available: input.available ?? true,
    showWhenEmpty,
    emptyPriority: showWhenEmpty ? (input.emptyPriority ?? 0) : null,
    dedupeKey,
    destinationId: input.destinationId ?? dedupeKey,
  }
}

function englishAliyahLabel(index: NonNullable<LeiningAliyah['index']>) {
  return index === 'Maftir' ? 'Maftir' : `Aliyah ${index}`
}

function aliyahKeywordAliases(index: NonNullable<LeiningAliyah['index']>) {
  if (index === 'Maftir') return ['m', 'maftir']
  return [`${index}`, `aliyah ${index}`]
}

export function createAliyahNavigationActions({
  run,
  displayTitle,
  navigate,
  showWhenEmpty = true,
  emptyPriority,
  dedupeKeyPrefix,
}: {
  run: LeiningRun
  displayTitle: string
  navigate: (hash: string) => void
  showWhenEmpty?: boolean
  emptyPriority?: number
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
  return run.aliyot.flatMap((aliyah) => {
    const aliyahIndex = aliyah.index
    if (!aliyahIndex) return []
    const href = createLastReadingHash(run, aliyah.start)
    return [
      createNavigationAction({
        id: `reading.${run.id}.${aliyahIndex}`,
        group: 'reading',
        label: `${title} ${englishAliyahLabel(aliyahIndex)}`,
        dedupeKey: `${dedupeKeyPrefix ?? `reading.${run.id}`}.${aliyahIndex}`,
        destinationId: href,
        searchConstraint: {
          kind: 'aliyah',
          aliyah: aliyahIndex,
          allowTerms: aliyahKeywordAliases(aliyahIndex),
        },
        href,
        aliases: titleTerms.flatMap((term) => [
          `${term} ${aliyahIndex}`,
          `${term} ${englishAliyahLabel(aliyahIndex)}`,
        ]),
        keywords: [...titleTerms, ...aliyahKeywordAliases(aliyahIndex)],
        showWhenEmpty,
        emptyPriority,
        run: () => navigate(href),
      }),
    ]
  })
}

export function createPageNavigationActions({
  navigateToPage,
}: {
  navigateToPage: (scroll: ScrollName, page: number) => void
}) {
  const actions: NavigationAction[] = []

  for (let page = 1; page <= getScrollPageCount('torah'); page += 1) {
    actions.push(
      createNavigationAction({
        id: `page.torah.${page}`,
        group: 'page',
        label: `Torah page ${page}`,
        aliases: [
          `${page}`,
          `page ${page}`,
          `torah ${page}`,
          `torah page ${page}`,
          `chumash page ${page}`,
        ],
        keywords: ['page', 'torah', 'chumash'],
        showWhenEmpty: false,
        run: () => navigateToPage('torah', page),
      })
    )
  }

  for (let page = 1; page <= getScrollPageCount('esther'); page += 1) {
    actions.push(
      createNavigationAction({
        id: `page.esther.${page}`,
        group: 'page',
        label: `Esther page ${page}`,
        aliases: [
          `esther ${page}`,
          `esther page ${page}`,
          `megillah ${page}`,
          `megillah page ${page}`,
          `megillat esther page ${page}`,
        ],
        keywords: ['page', 'esther', 'megillah'],
        showWhenEmpty: false,
        run: () => navigateToPage('esther', page),
      })
    )
  }

  return actions
}
