import { get, writable } from 'svelte/store'

export type UpdatePhase = 'idle' | 'checking' | 'downloading' | 'current' | 'unpublished' | 'ready' | 'disabled' | 'error'
export interface UpdateChannelState {
  phase: UpdatePhase
  pending: boolean
  checkedAt: number | null
}
export interface NativeUpdateState {
  web: UpdateChannelState
  applying: boolean
  canCancel: boolean
  applyError: string | null
}
const initialChannel = (): UpdateChannelState => ({ phase: 'idle', pending: false, checkedAt: null })
export const nativeUpdateState = writable<NativeUpdateState>({
  web: initialChannel(), applying: false, canCancel: false, applyError: null,
})
export const nativeUpdatePromptDismissed = writable(false)
export function updateChannel(channel: 'web', update: Partial<UpdateChannelState>) {
  nativeUpdateState.update(state => ({ ...state, [channel]: { ...state[channel], ...update } }))
}
export function updatePending() {
  return get(nativeUpdateState).web.pending
}
export function updatesBusy(state: NativeUpdateState) {
  return state.applying || ['checking', 'downloading'].includes(state.web.phase)
}
export function updateStatusText(state: NativeUpdateState) {
  const { phase } = state.web
  if (state.applyError) return state.applyError
  if (state.applying) return 'Applying update...'
  if (phase === 'downloading') return 'Downloading update...'
  if (updatesBusy(state)) return 'Checking for updates...'
  if (state.web.pending) return 'Update ready. Apply now or it will install next time you open the app.'
  if (phase === 'error') return 'Could not check for updates. Check your connection and try again.'
  if (phase === 'unpublished') return 'No update has been published for this version yet.'
  if (phase === 'disabled') return 'Updates are unavailable in this build.'
  if (phase === 'current') return 'Up to date.'
  return 'Updates install automatically next time you open the app.'
}
