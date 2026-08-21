import { afterEach, expect, test, vi } from 'vitest'
import {
  createRecordingIssue,
  filterRecordingIssues,
  getReaderVisibleIssues,
  loadLocalRecordingIssues,
  mergePublishedAndLocalRecordingIssues,
  parseRecordingIssues,
  recordingIssueReaderLabel,
  RecordingIssueConflictError,
  RecordingIssueStorageError,
  saveLocalRecordingIssues,
} from './recording-issues.ts'

function createStorage(initial?: string) {
  const entries = new Map<string, string>()
  if (initial) entries.set('tikkun.recording-issues:beresheet-1', initial)
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

test('ignores stored issues from another tokenization version', () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  const storage = createStorage()
  const initial = loadLocalRecordingIssues(storage, 'beresheet-1', 'old')
  saveLocalRecordingIssues(
    storage,
    'beresheet-1',
    'old',
    [
      createRecordingIssue({
        audioId: 'beresheet-1',
        tokenKey: '1:0:0:0',
        kind: 'hesitation',
        visibility: 'authoringOnly',
        severity: 'low',
        createdAt: 1,
        tokenizationVersion: 'old',
      }),
    ],
    initial.revision
  )

  expect(
    loadLocalRecordingIssues(storage, 'beresheet-1', 'v2').issues
  ).toEqual([])
  expect(storage.getItem('tikkun.recording-issues:beresheet-1')).not.toBeNull()
})

test('salvages valid issues without rewriting a malformed local list', () => {
  const validIssue = createRecordingIssue({
    audioId: 'beresheet-1',
    tokenKey: '1:0:0:0',
    kind: 'hesitation',
    visibility: 'authoringOnly',
    severity: 'low',
    createdAt: 1,
    tokenizationVersion: 'v2',
  })
  const raw = JSON.stringify([validIssue, { invalid: true }])
  const storage = createStorage(raw)
  vi.spyOn(console, 'warn').mockImplementation(() => {})

  expect(
    loadLocalRecordingIssues(storage, 'beresheet-1', 'v2').issues
  ).toEqual([validIssue])
  expect(
    loadLocalRecordingIssues(storage, 'beresheet-1', 'v2').issues
  ).toEqual([validIssue])
  expect(storage.getItem('tikkun.recording-issues:beresheet-1')).toBe(raw)
})

test('uses an empty snapshot for malformed JSON and permits later saves', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const rawValue = '{bad json'
  const storage = createStorage(rawValue)
  const snapshot = loadLocalRecordingIssues(
    storage,
    'beresheet-1',
    'v2'
  )
  const issue = createRecordingIssue({
    audioId: 'beresheet-1',
    tokenKey: '1:0:0:0',
    kind: 'hesitation',
    visibility: 'authoringOnly',
    severity: 'low',
    createdAt: 1,
    tokenizationVersion: 'v2',
  })

  expect(snapshot.issues).toEqual([])
  expect(storage.getItem('tikkun.recording-issues:beresheet-1')).toBe(rawValue)
  saveLocalRecordingIssues(
    storage,
    'beresheet-1',
    'v2',
    [issue],
    snapshot.revision
  )
  expect(
    loadLocalRecordingIssues(storage, 'beresheet-1', 'v2').issues
  ).toEqual([issue])
})

test('reads current issue JSON without rewriting it', () => {
  const issue = createRecordingIssue({
    audioId: 'beresheet-1',
    tokenKey: '1:0:0:0',
    kind: 'hesitation',
    visibility: 'authoringOnly',
    severity: 'low',
    createdAt: 1,
    tokenizationVersion: 'v2',
  })
  const storage = createStorage(JSON.stringify([issue]))

  expect(
    loadLocalRecordingIssues(storage, 'beresheet-1', 'v2').issues
  ).toEqual([issue])
  expect(JSON.parse(
    storage.getItem('tikkun.recording-issues:beresheet-1') ?? '[]'
  )).toEqual([issue])
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
  expect(
    loadLocalRecordingIssues(storage, 'beresheet-1', 'v2').issues
  ).toEqual([])

  const writeStorage = createStorage()
  const writableSnapshot = loadLocalRecordingIssues(
    writeStorage,
    'beresheet-1',
    'v2'
  )
  writeStorage.setItem = () => { throw denied }
  expect(() =>
    saveLocalRecordingIssues(
      writeStorage,
      'beresheet-1',
      'v2',
      [],
      writableSnapshot.revision
    )
  ).toThrow(RecordingIssueStorageError)
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

  expect(
    mergePublishedAndLocalRecordingIssues([published], [published, local])
  ).toEqual([published, local])
})

test('treats local issues as an overlay without mutating published input', () => {
  const published = createRecordingIssue({
    audioId: 'beresheet-1',
    tokenKey: '1:0:0:0',
    kind: 'hesitation',
    visibility: 'authoringOnly',
    severity: 'low',
    note: 'Published note',
    createdAt: 1,
    tokenizationVersion: 'v2',
  })
  const local = createRecordingIssue({
    audioId: 'beresheet-1',
    tokenKey: published.tokenKey,
    kind: published.kind,
    visibility: 'readerVisible',
    severity: 'medium',
    note: 'Local correction',
    createdAt: 2,
    tokenizationVersion: 'v2',
  })
  const publishedInput = [published]
  const localInput = [local]

  expect(
    mergePublishedAndLocalRecordingIssues(publishedInput, localInput)
  ).toEqual([local])
  expect(publishedInput).toEqual([published])
  expect(localInput).toEqual([local])
})

test('rejects a stale local overlay write without losing the newer tab value', () => {
  const storage = createStorage()
  const first = loadLocalRecordingIssues(storage, 'beresheet-1', 'v2')
  const stale = loadLocalRecordingIssues(storage, 'beresheet-1', 'v2')
  const newerIssue = createRecordingIssue({
    audioId: 'beresheet-1',
    tokenKey: '1:0:0:0',
    kind: 'hesitation',
    visibility: 'authoringOnly',
    severity: 'low',
    createdAt: 1,
    tokenizationVersion: 'v2',
  })
  const staleIssue = createRecordingIssue({
    audioId: 'beresheet-1',
    tokenKey: '1:0:0:1',
    kind: 'other',
    visibility: 'readerVisible',
    severity: 'low',
    createdAt: 2,
    tokenizationVersion: 'v2',
  })

  saveLocalRecordingIssues(
    storage,
    'beresheet-1',
    'v2',
    [newerIssue],
    first.revision
  )
  let conflict: unknown
  try {
    saveLocalRecordingIssues(
      storage,
      'beresheet-1',
      'v2',
      [staleIssue],
      stale.revision
    )
  } catch (error) {
    conflict = error
  }

  expect(conflict).toBeInstanceOf(RecordingIssueConflictError)
  expect((conflict as RecordingIssueConflictError).latest.issues).toEqual([
    newerIssue,
  ])
  expect(
    loadLocalRecordingIssues(storage, 'beresheet-1', 'v2').issues
  ).toEqual([newerIssue])
})
