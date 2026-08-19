import type { NavigationAction } from '../navigation/actions.ts'
import {
  createSearchIndex,
  normalizeSearchText,
  parseStructuredSearchQuery,
  type SearchDocument,
  type SearchMatch,
  type StructuredSearchIntent,
} from './index.ts'

export type ActionSearchResult = {
  action: NavigationAction
  match: SearchMatch<string>
}

export type ActionSearchRequest = {
  limit?: number
  contextBoost?: (action: NavigationAction) => number
}

function hasAliyahSuffix(destinationId: string, aliyah: number | 'Maftir') {
  const suffix = aliyah === 'Maftir' ? 'maftir' : String(aliyah)
  return normalizeSearchText(destinationId).endsWith(` ${suffix}`)
}

function containsReadingName(document: SearchDocument<string>, reading: string) {
  const normalizedReading = normalizeSearchText(reading)
  return [document.primary, ...(document.aliases ?? []), ...(document.keywords ?? [])]
    .map(normalizeSearchText)
    .some(
      (value) =>
        value === normalizedReading ||
        value.startsWith(`${normalizedReading} `) ||
        value.includes(` ${normalizedReading} `)
    )
}

function matchesIntent(
  document: SearchDocument<string>,
  intent: StructuredSearchIntent,
  action?: NavigationAction
) {
  if (intent.kind === 'page') {
    return (
      document.destinationId === `page.${intent.scroll}.${intent.page}` ||
      document.id === `page.${intent.scroll}.${intent.page}`
    )
  }
  if (intent.kind !== 'aliyah') return false
  const constrainedAliyah = action?.searchConstraint?.aliyah
  const matchesAliyah = constrainedAliyah
    ? constrainedAliyah === intent.aliyah
    : hasAliyahSuffix(document.destinationId, intent.aliyah) ||
      hasAliyahSuffix(document.id, intent.aliyah)
  if (!matchesAliyah) {
    return false
  }
  return intent.reading ? containsReadingName(document, intent.reading) : true
}

function containsWholeTerm(query: string, term: string) {
  const normalizedQuery = ` ${normalizeSearchText(query)} `
  const normalizedTerm = normalizeSearchText(term)
  return Boolean(normalizedTerm && normalizedQuery.includes(` ${normalizedTerm} `))
}

function matchesSearchConstraint(
  document: SearchDocument<string>,
  action: NavigationAction,
  query: string,
  intent: StructuredSearchIntent | null
) {
  const constraint = action.searchConstraint
  if (!constraint) return true
  if (intent?.kind === constraint.kind) {
    return matchesIntent(document, intent, action)
  }
  return constraint.allowTerms?.some((term) => containsWholeTerm(query, term)) ?? false
}

export class ActionSearch {
  readonly #actionsById: Map<string, NavigationAction>
  readonly #index

  constructor(actions: readonly NavigationAction[]) {
    this.#actionsById = new Map(actions.map((action) => [action.id, action]))
    this.#index = createSearchIndex(
      actions.map((action) => ({
        id: action.id,
        destinationId: action.destinationId,
        primary: action.label,
        aliases: action.aliases,
        keywords: action.keywords,
        available: action.available,
        emptyPriority: action.emptyPriority ?? undefined,
        item: action.id,
      }))
    )
  }

  get size() {
    return this.#index.size
  }

  search(query: string, request: ActionSearchRequest = {}): ActionSearchResult[] {
    const intent = parseStructuredSearchQuery(query)
    if (intent?.kind === 'reference') return []

    return this.#index
      .search(query, {
        intent,
        limit: request.limit ?? 12,
        intentMatches: (document, structuredIntent) =>
          matchesIntent(
            document,
            structuredIntent,
            this.#actionsById.get(document.item)
          ),
        filter: (document) => {
          const action = this.#actionsById.get(document.item)
          if (!action) return false
          return intent?.kind === 'page'
            ? matchesIntent(document, intent, action)
            : matchesSearchConstraint(document, action, query, intent)
        },
        contextBoost: request.contextBoost
          ? ({ item }) => {
              const action = this.#actionsById.get(item)
              return action ? request.contextBoost?.(action) ?? 0 : 0
            }
          : undefined,
      })
      .flatMap((match) => {
        const action = this.#actionsById.get(match.document.item)
        return action ? [{ action, match }] : []
      })
  }
}

export function createActionSearch(actions: readonly NavigationAction[]) {
  return new ActionSearch(actions)
}
