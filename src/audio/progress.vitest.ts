import { expect, test } from 'vitest'

import { getWordProgress } from './progress.ts'

test('uses token count as word progress total when cues are incomplete', () => {
  expect(
    getWordProgress({
      cueIndex: 1,
      cueCount: 2,
      tokenCount: 10,
    })
  ).toEqual({
    current: 2,
    total: 10,
    label: '2 / 10',
    ratio: 0.2,
  })
})

test('uses saved cue count when token count is unavailable', () => {
  expect(
    getWordProgress({
      cueIndex: 1,
      cueCount: 2,
      tokenCount: 0,
    })
  ).toMatchObject({
    current: 2,
    total: 2,
    label: '2 / 2',
    ratio: 1,
  })
})

test('shows zero progress out of token count before any cues exist', () => {
  expect(
    getWordProgress({
      cueIndex: -1,
      cueCount: 0,
      tokenCount: 8,
    })
  ).toMatchObject({
    current: 0,
    total: 8,
    label: '0 / 8',
    ratio: 0,
  })
})
