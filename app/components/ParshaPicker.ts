import { flushSync, mount, unmount } from 'svelte'
import '../../css/parsha-picker-entry.css'
import type { CalendarSettings } from '../calendar-settings.ts'
import type { LeiningGenerator } from '../calendar-model/generator.ts'
import type { NavigationAction } from '../navigation/actions.ts'
import type { ReaderSearchBarController } from '../search/reader-search-bar.ts'
import ParshaPickerView from './ParshaPicker.svelte'
import { buildParshaPickerModel } from './parsha-picker-model.ts'

export type ParshaPickerOptions = {
  calendarSettings: CalendarSettings
  animateOnOpen?: boolean
  onCalendarSettingsChange(settings: CalendarSettings): void
  navigate(hash: string): void
  getActions?(): NavigationAction[]
  requestClose?(): void
  isBookmarkAction?(action: NavigationAction): boolean
  formatBadge?(label: string): string
}

export type ParshaPickerComponentProps = Omit<
  ParshaPickerOptions,
  'getActions' | 'requestClose' | 'isBookmarkAction' | 'formatBadge'
> & {
  getActions(): NavigationAction[]
  requestClose(): void
  isBookmarkAction(action: NavigationAction): boolean
  formatBadge(label: string): string
  connectSearch(controller: ReaderSearchBarController | null): void
  model: ReturnType<typeof buildParshaPickerModel>
  document: Document
  view: Window
}

export default function createParshaPicker(
  generator: LeiningGenerator,
  options: ParshaPickerOptions
) {
  const ownerDocument = document
  const view = ownerDocument.defaultView
  if (!view) throw new Error('Parsha Picker requires a browser window')

  const node = ownerDocument.createElement('div')
  node.dataset.targetId = 'parsha-picker-root'
  node.tabIndex = -1
  node.setAttribute('role', 'region')
  node.setAttribute('aria-label', 'Reading index')
  let component: ReturnType<typeof mount> | null = null
  let searchController: ReaderSearchBarController | null = null

  return {
    node,
    onMount() {
      if (component) throw new Error('Parsha Picker is already mounted')
      component = mount(ParshaPickerView, {
        target: node,
        props: {
          calendarSettings: options.calendarSettings,
          animateOnOpen: options.animateOnOpen ?? false,
          onCalendarSettingsChange: options.onCalendarSettingsChange,
          navigate: options.navigate,
          getActions: options.getActions ?? (() => []),
          requestClose: options.requestClose ?? (() => undefined),
          isBookmarkAction: options.isBookmarkAction ?? (() => false),
          formatBadge: options.formatBadge ?? ((label: string) => label),
          connectSearch: (controller: ReaderSearchBarController | null) => {
            searchController = controller
          },
          model: buildParshaPickerModel(generator),
          document: ownerDocument,
          view,
        },
      })
      flushSync()
    },
    focusSearch() {
      searchController?.focus({ select: true })
    },
    refreshSearch() {
      searchController?.refresh()
    },
    destroy() {
      const mountedComponent = component
      component = null
      searchController = null
      if (mountedComponent) {
        void unmount(mountedComponent).catch((error: unknown) => {
          console.error('Failed to unmount Parsha Picker', error)
        })
      }
      node.remove()
    },
  }
}
