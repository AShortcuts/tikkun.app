import { flushSync, mount, unmount } from 'svelte'
import PrintDialog from './PrintDialog.svelte'
import type { PrintContext } from './print-context.ts'
import type { LeiningGenerator } from '../calendar-model/generator.ts'
import { upcomingPrintReadings } from './upcoming-print-readings.ts'
import type { PassageRange } from './print-model.ts'

export function openPrintDialog(context: PrintContext, onclose: () => void, generator: LeiningGenerator, selection?: PassageRange) {
  const returnFocus = document.activeElement
  let destroyed = false
  const component = mount(PrintDialog, {
    target: document.body,
    props: { context, upcoming: upcomingPrintReadings(generator), initialRange: selection, initialScope: selection ? 'custom' : context.aliyot[0].start.scroll === 'esther' ? 'whole' : 'current', onclose: () => destroy() },
  })
  function destroy() {
    if (destroyed) return
    destroyed = true
    void unmount(component).then(() => {
      const target = returnFocus instanceof HTMLElement && returnFocus.isConnected && returnFocus.getClientRects().length
        ? returnFocus
        : document.querySelector<HTMLElement>('[data-target-id="settings-toggle"]')
      target?.focus({ preventScroll: true })
    }).catch(error => console.error('Failed to close print dialog', error))
    onclose()
  }
  flushSync()
  return destroy
}
