import type { NavigationAction } from '../navigation/actions.ts'
import type { ReaderSearch } from './reader-search.ts'

export type ReaderSearchPresentation = 'embedded' | 'overlay'

export interface ReaderSearchBarController {
  focus(options?: { select?: boolean }): void
  refresh(options?: { resetQuery?: boolean }): void
  reset(): void
}

export interface ReaderSearchBarProps {
  presentation: ReaderSearchPresentation
  createSearch(): ReaderSearch
  navigate(href: string): void
  requestClose(): void
  resultActivated(): void
  queryChanged(query: string): void
  isBookmarkAction(action: NavigationAction): boolean
  formatBadge(label: string): string
  autoFocus?: boolean
  connect(controller: ReaderSearchBarController | null): void
}
