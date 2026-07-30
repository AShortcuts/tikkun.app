import { expect, test } from 'vitest'
import {
  checkpointFromCue,
  checkpointFromIssue,
  compareCheckpoints,
  formatTokenKey,
  isValidTokenKey,
  parseTokenKey,
} from './checkpoints.ts'
import type { RecordingIssue } from '../audio/recording-issues.ts'

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

test('refuses to construct checkpoints with malformed token identity', () => {
  expect(() => checkpointFromCue({
    audioId: 'a',
    label: 'Invalid',
    tokenKey: '1::0:0',
    timeStart: 0,
  })).toThrow('Invalid checkpoint token key')
})

test('creates a cue checkpoint anchored by token key and audio time', () => {
  const checkpoint = checkpointFromCue({
    audioId: 'beresheet-1',
    label: 'Current word',
    tokenKey: '1:2:0:4',
    timeStart: 12.345,
  })

  expect(checkpoint).toMatchObject({
    id: 'cue:beresheet-1:1:2:0:4',
    kind: 'cue',
    tokenKey: '1:2:0:4',
    timeStart: 12.345,
  })
})

test('creates a reader-visible issue checkpoint with issue source', () => {
  const issue: RecordingIssue = {
    id: 'issue-1',
    audioId: 'noach-3',
    tokenKey: '12:1:0:0',
    kind: 'repeated-word',
    visibility: 'readerVisible',
    severity: 'medium',
    note: 'Recording repeats here.',
    createdAt: 100,
    tokenizationVersion: 'v2',
  }

  const checkpoint = checkpointFromIssue(issue)

  expect(checkpoint).toMatchObject({
    id: 'issue:issue-1',
    kind: 'recording-issue',
    source: 'recording-issue',
    tokenKey: '12:1:0:0',
  })
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
