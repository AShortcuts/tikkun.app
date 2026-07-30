import { flushSync, mount, unmount } from 'svelte'
import type { CalendarSettings } from '../calendar-settings.ts'
import type { LeiningGenerator } from '../calendar-model/generator.ts'
import ParshaPickerView from './ParshaPicker.svelte'
import { buildParshaPickerModel } from './parsha-picker-model.ts'

export type ParshaPickerOptions = {
  calendarSettings: CalendarSettings
  onCalendarSettingsChange(settings: CalendarSettings): void
  navigate(hash: string): void
}

export type ParshaPickerComponentProps = ParshaPickerOptions & {
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
  let component: ReturnType<typeof mount> | null = null

  return {
    node,
    onMount() {
      if (component) throw new Error('Parsha Picker is already mounted')
      component = mount(ParshaPickerView, {
        target: node,
        props: {
          ...options,
          model: buildParshaPickerModel(generator),
          document: ownerDocument,
          view,
        },
      })
      flushSync()
    },
    destroy() {
      const mountedComponent = component
      component = null
      if (mountedComponent) {
        void unmount(mountedComponent).catch((error: unknown) => {
          console.error('Failed to unmount Parsha Picker', error)
        })
      }
      node.remove()
    },
  }
}
