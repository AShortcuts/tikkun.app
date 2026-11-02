import { expect, test } from 'vitest'
import { checkpointFromCue, compareCheckpoints, formatTokenKey, isValidTokenKey, parseTokenKey } from './checkpoints.ts'

test('parses and formats only canonical token positions', () => {
  expect(parseTokenKey('12:1:0:4')).toEqual({
    pageNumber: 12,
    lineIndex: 1,
    fragmentIndex: 0,
    wordIndex: 4,
  })
  expect(formatTokenKey({
    pageNumber: 12,
    lineIndex: 1,
    fragmentIndex: 0,
    wordIndex: 4,
  })).toBe('12:1:0:4')

  expect(isValidTokenKey('1::0:2')).toBe(false)
  expect(isValidTokenKey('-1:0:0:0')).toBe(false)
  expect(isValidTokenKey('01:0:0:0')).toBe(false)
  expect(isValidTokenKey('1:0:0:1.5')).toBe(false)
  expect(isValidTokenKey('1:0:0:9007199254740992')).toBe(false)
})

test('sorts checkpoints by page coordinates and then audio time', () => {
  const first = checkpointFromCue({
    audioId: 'a',
    label: 'Later audio',
    tokenKey: '1:0:0:1',
    timeStart: 3,
  })
  const second = checkpointFromCue({
    audioId: 'a',
    label: 'Earlier token',
    tokenKey: '1:0:0:0',
    timeStart: 8,
  })

  expect([first, second].sort(compareCheckpoints).map((item) => item.label)).toEqual([
    'Earlier token',
    'Later audio',
  ])
})
