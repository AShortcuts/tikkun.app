import { expect, test } from 'vitest'
import { playbackTargetKey, playbackTokenRangeAliyahIndex } from './playback-session.ts'

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
