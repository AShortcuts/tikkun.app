import { get, writable } from 'svelte/store'

export type UpdatePhase = 'idle' | 'checking' | 'downloading' | 'current' | 'unpublished' | 'ready' | 'disabled' | 'error'
export interface UpdateChannelState {
  phase: UpdatePhase
  pending: boolean
  checkedAt: number | null
}
export interface NativeUpdateState {
  web: UpdateChannelState
  // Recordings and cues published by the website.
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
// The short status shown after the Release Version in Settings; null before the first check.
export function releaseStatus(state: NativeUpdateState) {
  const channels = [state.web, state.content]
  if (state.applying) return 'Applying...'
  if (channels.some(channel => channel.phase === 'downloading')) return 'Downloading...'
  if (updatesBusy(state)) return 'Checking...'
  if (channels.some(channel => channel.pending)) return 'Update ready'
  if (channels.some(channel => channel.phase === 'error')) return 'Could not check'
  // Website content made for newer Torah text is not something this version can install.
  if (['current', 'unpublished'].includes(state.web.phase) && ['current', 'unpublished', 'disabled'].includes(state.content.phase)) return 'Latest'
  return null
}
