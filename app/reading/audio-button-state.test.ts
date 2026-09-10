import { expect, test } from 'vitest'
import { audioButtonState } from './audio-button-state.ts'
import type { PassageAudioState } from './passage-audio.ts'
import { audioRecordings } from '../../generated/audio-manifest.ts'

const recording = audioRecordings[0]
const state = (problem: PassageAudioState['problem'], extra: Partial<PassageAudioState> = {}): PassageAudioState =>
  ({ problem, recording, message: '', ...extra })

test.each([
  [state(null), 'normal', false, false],
  [state('incomplete-cues'), 'cue', false, false],
  [state('timing-needed'), 'cue', true, false],
  [state('partial-audio', { issue: 'audio', canPlay: true }), 'audio', false, false],
  [state('partial-audio', { issue: 'cue', canPlay: true }), 'cue', false, false],
  [state('load-failed'), 'audio', true, false],
  [state('missing-audio', { recording: null }), 'empty', true, true],
  [state('checking'), 'normal', true, true],
] as const)('separates color, dimming and action availability for %j', (state, tone, dimmed, actionDisabled) => {
  expect(audioButtonState({ state, available: Boolean(state.recording) })).toMatchObject({ tone, dimmed, actionDisabled })
})

test('admin missing audio stays gray and faded while recording selection remains enabled', () => {
  expect(audioButtonState({ available: false, adminMissing: true })).toEqual({
    tone: 'empty', dimmed: true, actionDisabled: false,
    tooltip: 'No recording yet. Select this aliyah to record.',
  })
})

test('partial tooltip includes missing passage and a concrete action', () => {
  expect(audioButtonState({ available: true, state: state('partial-audio', { message: 'Audio unavailable for Devarim 30:15-30:20 portion', canPlay: true }) }).tooltip)
    .toBe('Audio unavailable for Devarim 30:15-30:20 portion. Select for an available portion to play.')
})
