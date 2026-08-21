import { expect, test } from 'vitest'
import {
  firstCueAtOrAfterLocation,
  firstCueForTokenKeys,
  isActivePlaybackTarget,
  playbackTargetKey,
  playbackTokenRangeAliyahIndex,
} from './playback-session.ts'

test('matches an active target by recording identity when one is available', () => {
  const session = {
    recording: { id: 'first-reader' },
    runId: 'fixture-run',
    aliyahIndex: 1,
  }

  expect(
    isActivePlaybackTarget(session, {
      recordingId: 'first-reader',
      runId: session.runId,
      aliyahIndex: session.aliyahIndex,
    })
  ).toBe(true)
  expect(
    isActivePlaybackTarget(session, {
      recordingId: 'second-reader',
      runId: session.runId,
      aliyahIndex: session.aliyahIndex,
    })
  ).toBe(false)
  expect(
    isActivePlaybackTarget(session, {
      recordingId: null,
      runId: session.runId,
      aliyahIndex: session.aliyahIndex,
    })
  ).toBe(true)
})

test('keeps maftir and seventh aliyah playback targets distinct when they share audio', () => {
  const baseTarget = {
    recordingId: 'noach-7',
    runId: '2025-10-25:shacharis,main',
  }

  expect(playbackTargetKey({ ...baseTarget, aliyahIndex: 7 })).not.toBe(
    playbackTargetKey({ ...baseTarget, aliyahIndex: 'Maftir' })
  )
})

test('keeps maftir token range distinct from the seventh aliyah token range', () => {
  expect(playbackTokenRangeAliyahIndex('Maftir')).toBe('Maftir')
  expect(playbackTokenRangeAliyahIndex(7)).toBe(7)
})

test('finds the first cue at or after an aliyah start location', () => {
  const cues = [
    { timeStart: 1, pageNumber: 8, lineIndex: 10, fragmentIndex: 0, wordIndex: 0 },
    { timeStart: 2, pageNumber: 8, lineIndex: 11, fragmentIndex: 0, wordIndex: 0 },
    { timeStart: 3, pageNumber: 9, lineIndex: 0, fragmentIndex: 0, wordIndex: 0 },
  ]

  expect(firstCueAtOrAfterLocation(cues, { pageNumber: 8, lineNumber: 12 })).toBe(
    cues[1]
  )
})

test('finds the first cue that matches an aliyah token sequence', () => {
  const cues = [
    { timeStart: 1, pageNumber: 8, lineIndex: 11, fragmentIndex: 0, wordIndex: 0 },
    { timeStart: 2, pageNumber: 8, lineIndex: 11, fragmentIndex: 0, wordIndex: 1 },
    { timeStart: 3, pageNumber: 8, lineIndex: 11, fragmentIndex: 0, wordIndex: 2 },
  ]

  expect(firstCueForTokenKeys(cues, ['8:11:0:2', '8:11:0:3'])).toBe(cues[2])
})
