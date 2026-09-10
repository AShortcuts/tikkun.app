import type { PassageAudioState } from './passage-audio.ts'

export function audioButtonState({ state, available, cueIncomplete = false, adminMissing = false, playing = false }: {
  state?: PassageAudioState
  available: boolean
  cueIncomplete?: boolean
  adminMissing?: boolean
  playing?: boolean
}) {
  const problem = state?.problem
  const absent = adminMissing || (!state?.recording && (!available || problem === 'missing-audio'))
  const canPlay = !absent && (state?.canPlay ?? (available && !['checking', 'timing-needed', 'load-failed', 'missing-audio'].includes(problem ?? '')))
  const tone = absent ? 'empty' : problem === 'load-failed' ? 'audio' :
    state?.issue ?? (problem === 'timing-needed' || problem === 'incomplete-cues' || cueIncomplete ? 'cue' :
      problem === 'partial-audio' || problem === 'missing-audio' ? 'audio' : 'normal')
  let tooltip = playing ? 'Pause this aliyah' : 'Play this aliyah'
  if (absent) tooltip = adminMissing ? 'No recording yet. Select this aliyah to record.' : 'No recording available for this aliyah.'
  else if (problem === 'checking') tooltip = 'Checking available audio and timing cues.'
  else if (problem === 'load-failed') tooltip = state?.message || 'The recording could not load. Try again.'
  else if (problem === 'timing-needed') tooltip = 'Audio exists, but timing cues are needed to play this excerpt.'
  else if (problem === 'partial-audio') tooltip = `${(state?.message || 'Part of this aliyah is available').replace(/[.!?]$/, '')}. Select for an available portion to play.`
  else if (tone === 'cue') tooltip = 'Full audio available. Some word highlighting is missing.'
  else if (problem === 'missing-audio') tooltip = state?.message || 'No playable audio available for this aliyah.'
  return { tone, dimmed: !canPlay, tooltip, actionDisabled: !adminMissing && (absent || problem === 'checking') }
}
