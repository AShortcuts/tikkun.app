import type { MountScope } from '../lifecycle/mount.ts'
import { passageRangeLabel, type PassageAudioPortion, type PassageAudioResolution } from './passage-audio.ts'

export function createPassageAudioDialog(scope: MountScope, document: Document) {
  const dialog = document.createElement('dialog')
  dialog.className = 'passage-audio-dialog'
  dialog.setAttribute('aria-labelledby', 'passage-audio-heading')
  document.body.append(dialog)
  let finishPending: ((portion: PassageAudioPortion | null) => void) | null = null
  const finish = (portion: PassageAudioPortion | null) => {
    const callback = finishPending
    finishPending = null
    dialog.close()
    callback?.(portion)
  }
  dialog.addEventListener('cancel', event => { event.preventDefault(); finish(null) }, { signal: scope.signal })
  scope.own(() => { finish(null); dialog.remove() })

  return (resolution: PassageAudioResolution, signal: AbortSignal,
    authorize: (portion: PassageAudioPortion) => void) => {
    finish(null)
    if (signal.aborted || scope.signal.aborted) return Promise.resolve(null)
    return new Promise<PassageAudioPortion | null>(resolve => {
      const abort = () => finish(null)
      finishPending = portion => { signal.removeEventListener('abort', abort); resolve(portion) }
      signal.addEventListener('abort', abort, { once: true })
      const title = document.createElement('h2')
      title.id = 'passage-audio-heading'
      title.textContent = resolution.portions.length ? 'Partial audio' : 'Excerpt timing needed'
      const description = document.createElement('p')
      description.textContent = resolution.message
      const actions = document.createElement('div')
      for (const portion of resolution.portions) {
        const button = document.createElement('button')
        button.type = 'button'
        button.textContent = `Play available portion (${passageRangeLabel(portion.range)})`
        button.addEventListener('click', () => { authorize(portion); finish(portion) }, { once: true })
        actions.append(button)
      }
      const close = document.createElement('button')
      close.type = 'button'
      close.textContent = 'Close'
      close.addEventListener('click', () => finish(null), { once: true })
      actions.append(close)
      dialog.replaceChildren(title, description, actions)
      dialog.showModal()
    })
  }
}
