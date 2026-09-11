import { get, writable } from 'svelte/store'

export type UpdatePhase = 'idle' | 'checking' | 'downloading' | 'current' | 'unpublished' | 'ready' | 'disabled' | 'error'
export interface UpdateChannelState {
  phase: UpdatePhase
  pending: boolean
  checkedAt: number | null
}
export interface NativeUpdateState {
  web: UpdateChannelState
  content: UpdateChannelState
  applying: boolean
  canCancel: boolean
  applyError: string | null
}
const initialChannel = (): UpdateChannelState => ({ phase: 'idle', pending: false, checkedAt: null })
export const nativeUpdateState = writable<NativeUpdateState>({
  web: initialChannel(), content: initialChannel(), applying: false, canCancel: false, applyError: null,
})
export const nativeUpdatePromptDismissed = writable(false)
export function updateChannel(channel: 'web' | 'content', update: Partial<UpdateChannelState>) {
  nativeUpdateState.update(state => ({ ...state, [channel]: { ...state[channel], ...update } }))
}
export function updatePending() {
  const state = get(nativeUpdateState)
  return state.web.pending || state.content.pending
}
export function updatesBusy(state: NativeUpdateState) {
  return state.applying || [state.web, state.content].some(channel => ['checking', 'downloading'].includes(channel.phase))
}
export function updateStatusText(state: NativeUpdateState) {
  if (state.applyError) return state.applyError
  if (state.applying) return 'Applying update...'
  if ([state.web, state.content].some(channel => channel.phase === 'downloading')) return 'Downloading update...'
  if (updatesBusy(state)) return 'Checking for updates...'
  if (state.web.pending || state.content.pending) return 'Update ready. Apply now or it will install next time you open the app.'
  if ([state.web, state.content].some(channel => channel.phase === 'error')) return 'Could not check for updates. Check your connection and try again.'
  if ([state.web, state.content].some(channel => channel.phase === 'unpublished')) return 'No update has been published for this version yet.'
  if ([state.web, state.content].some(channel => channel.phase === 'disabled')) return 'Updates are unavailable in this build.'
  if (state.web.phase === 'current' && state.content.phase === 'current') return 'Up to date.'
  return 'Updates install automatically next time you open the app.'
}
