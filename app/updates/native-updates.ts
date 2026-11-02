import { get } from 'svelte/store'
import { checkNativeContent } from './content-runtime.ts'
import { checkNativeWeb } from './web-runtime.ts'
import { nativeUpdatePromptDismissed, nativeUpdateState, updatePending, updatesBusy } from './update-state.ts'

let applyAttempt: AbortController | undefined

export async function checkNativeUpdates(force = false) {
  if (get(nativeUpdateState).applying) return
  if (force) nativeUpdatePromptDismissed.set(false)
  nativeUpdateState.update(state => ({ ...state, applyError: null }))
  await Promise.all([checkNativeContent(force), checkNativeWeb(force)])
}

export async function applyNativeUpdate(prepare: () => void | Promise<void>) {
  if (updatesBusy(get(nativeUpdateState)) || !updatePending()) return
  const attempt = new AbortController()
  applyAttempt = attempt
  nativeUpdateState.update(state => ({ ...state, applying: true, canCancel: true, applyError: null }))
  try {
    // A brief grace period gives the shared Cancel control time to stop the reload.
    await new Promise<void>(resolve => {
      const timer = setTimeout(resolve, 1200)
      attempt.signal.addEventListener('abort', () => { clearTimeout(timer); resolve() }, { once: true })
    })
    if (attempt.signal.aborted) return
    // Load the bridge before checking playback, then checkpoint immediately before reload.
    const { LiveUpdate } = await import('@capawesome/capacitor-live-update')
    if (attempt.signal.aborted) return
    await prepare()
    if (attempt.signal.aborted) return
    nativeUpdateState.update(state => ({ ...state, canCancel: false }))
    await LiveUpdate.reload()
  } catch (error) {
    if (attempt.signal.aborted) return
    console.error('Tikkun update could not be applied', error)
    nativeUpdateState.update(state => ({ ...state, applying: false, canCancel: false,
      applyError: error instanceof Error ? error.message : 'Could not apply the update. Try again.' }))
  } finally {
    if (applyAttempt === attempt) applyAttempt = undefined
  }
}

export function cancelNativeUpdate() {
  if (!get(nativeUpdateState).canCancel || !applyAttempt) return
  applyAttempt.abort()
  applyAttempt = undefined
  nativeUpdateState.update(state => ({ ...state, applying: false, canCancel: false, applyError: null }))
}
