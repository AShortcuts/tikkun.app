import { afterEach, expect, test, vi } from 'vitest'
import {
  createRecordingIssue,
  filterRecordingIssues,
  getReaderVisibleIssues,
  loadRecordingIssues,
  mergeRecordingIssues,
  parseRecordingIssues,
  recordingIssueReaderLabel,
  RecordingIssueStorageError,
  saveRecordingIssues,
} from './recording-issues.ts'

function createStorage(initial?: string) {
  const entries = new Map<string, string>()
  if (initial) entries.set('tikkun.recording-issues.v1:beresheet-1', initial)
  return {
    get length() {
      return entries.size
    },
    clear: () => entries.clear(),
    getItem: (key: string) => entries.get(key) ?? null,
    key: (index: number) => [...entries.keys()][index] ?? null,
    setItem: (key: string, value: string) => entries.set(key, value),
    removeItem: (key: string) => entries.delete(key),
  } as unknown as Storage
}

afterEach(() => {
  vi.restoreAllMocks()
})

test('creates a reader-visible recording issue anchored to a token', () => {
  const issue = createRecordingIssue({
    audioId: 'beresheet-1',
    tokenKey: '1:0:0:1',
    kind: 'mistaken-pronunciation',
    visibility: 'readerVisible',
    severity: 'medium',
    note: 'Listen carefully.',
    createdAt: 1,
    tokenizationVersion: 'v2',
  })

  expect(issue).toMatchObject({
    id: 'issue:beresheet-1:1:0:0:1:1',
    visibility: 'readerVisible',
  })
  expect(recordingIssueReaderLabel(issue)).toBe('Pronunciation differs here')
})

test('filters reader-visible issues from authoring and alignment hints', () => {
  const visible = createRecordingIssue({
    audioId: 'a',
    tokenKey: '1:0:0:0',
    kind: 'repeated-word',
    visibility: 'readerVisible',
    severity: 'low',
    createdAt: 1,
    tokenizationVersion: 'v2',
  })
  const hidden = createRecordingIssue({
    audioId: 'a',
    tokenKey: '1:0:0:1',
    kind: 'hesitation',
    visibility: 'authoringOnly',
    severity: 'low',
    createdAt: 2,
    tokenizationVersion: 'v2',
  })

  expect(getReaderVisibleIssues([hidden, visible])).toEqual([visible])
})

test('drops stored issues from incompatible tokenization versions', () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  const storage = createStorage()
  saveRecordingIssues(storage, 'beresheet-1', [
    createRecordingIssue({
      audioId: 'beresheet-1',
      tokenKey: '1:0:0:0',
      kind: 'hesitation',
      visibility: 'authoringOnly',
      severity: 'low',
      createdAt: 1,
      tokenizationVersion: 'old',
    }),
  ])

  expect(loadRecordingIssues(storage, 'beresheet-1', 'v2')).toEqual([])
  expect(storage.getItem('tikkun.recording-issues.v1:beresheet-1')).toBeNull()
  expect(
    storage.getItem('tikkun.recording-issues.v1:beresheet-1:quarantine')
  ).not.toBeNull()
})

test('salvages valid issues while quarantining a malformed local payload', () => {
  const validIssue = createRecordingIssue({
    audioId: 'beresheet-1',
    tokenKey: '1:0:0:0',
    kind: 'hesitation',
    visibility: 'authoringOnly',
    severity: 'low',
    createdAt: 1,
    tokenizationVersion: 'v2',
  })
  const storage = createStorage(JSON.stringify([validIssue, { invalid: true }]))
  vi.spyOn(console, 'warn').mockImplementation(() => {})

  expect(loadRecordingIssues(storage, 'beresheet-1', 'v2')).toEqual([validIssue])
  expect(loadRecordingIssues(storage, 'beresheet-1', 'v2')).toEqual([validIssue])
  expect(
    JSON.parse(
      storage.getItem('tikkun.recording-issues.v1:beresheet-1') ?? '[]'
    )
  ).toEqual([validIssue])
  expect(
    storage.getItem('tikkun.recording-issues.v1:beresheet-1:quarantine')
  ).not.toBeNull()
})

test('filters published issue payloads with the same validation as local storage', () => {
  const issue = createRecordingIssue({
    audioId: 'beresheet-1',
    tokenKey: '1:0:0:0',
    kind: 'hesitation',
    visibility: 'authoringOnly',
    severity: 'low',
    createdAt: 1,
    tokenizationVersion: 'v2',
  })

  expect(filterRecordingIssues([issue, { ...issue, audioId: 'other' }], 'beresheet-1', 'v2')).toEqual([issue])
})

test.each([
  { timeStart: 'not-a-number' },
  { timeStart: -1 },
  { timeStart: 3, timeEnd: 2 },
  { timeEnd: 2 },
  { note: { unexpected: true } },
  { tokenKey: '1::0:0' },
])('rejects malformed optional recording issue fields: %o', (override) => {
  const issue = {
    id: 'issue-1',
    audioId: 'beresheet-1',
    tokenKey: '1:0:0:0',
    kind: 'hesitation',
    visibility: 'authoringOnly',
    severity: 'low',
    createdAt: 1,
    tokenizationVersion: 'v2',
    ...override,
  }

  expect(filterRecordingIssues([issue], 'beresheet-1', 'v2')).toEqual([])
  expect(parseRecordingIssues([issue], 'beresheet-1', 'v2')).toBeNull()
})

test('rejects duplicate issue identities in an atomic published issue list', () => {
  const issue = createRecordingIssue({
    audioId: 'beresheet-1',
    tokenKey: '1:0:0:0',
    kind: 'hesitation',
    visibility: 'authoringOnly',
    severity: 'low',
    createdAt: 1,
    tokenizationVersion: 'v2',
  })
  expect(parseRecordingIssues([issue, issue], 'beresheet-1', 'v2')).toBeNull()
})

test('handles denied issue reads and surfaces denied writes', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const denied = new Error('storage denied')
  const storage = createStorage()
  storage.getItem = () => { throw denied }
  expect(loadRecordingIssues(storage, 'beresheet-1', 'v2')).toEqual([])

  const writeStorage = createStorage()
  writeStorage.setItem = () => { throw denied }
  expect(() => saveRecordingIssues(writeStorage, 'beresheet-1', [])).toThrow(
    RecordingIssueStorageError
  )
})

test('merges published and local issues without duplicating the same mark', () => {
  const published = createRecordingIssue({
    audioId: 'beresheet-1',
    tokenKey: '1:0:0:0',
    kind: 'hesitation',
    visibility: 'authoringOnly',
    severity: 'low',
    createdAt: 1,
    tokenizationVersion: 'v2',
  })
  const local = createRecordingIssue({
    audioId: 'beresheet-1',
    tokenKey: '1:0:0:1',
    kind: 'other',
    visibility: 'readerVisible',
    severity: 'low',
    createdAt: 2,
    tokenizationVersion: 'v2',
  })

  expect(mergeRecordingIssues([published], [published, local])).toEqual([published, local])
})
