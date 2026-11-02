import { afterEach, expect, test, vi } from 'vitest'
import { createRecordingIssue, filterRecordingIssues, getLatestReaderVisibleIssues, getReaderVisibleIssues, loadLocalRecordingIssues, mergePublishedAndLocalRecordingIssues, parseRecordingIssues, recordingIssueReaderLabel, recordingIssueReaderText, RecordingIssueConflictError, saveLocalRecordingIssues } from './recording-issues.ts'

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
    id: 'issue:beresheet-1:1:0:0:1:mistaken-pronunciation:1',
    visibility: 'readerVisible',
  })
  expect(recordingIssueReaderLabel(issue)).toBe('Pronunciation differs here')
})

test('uses the latest visible issue per word and prefers its note in reader text', () => {
  const older = createRecordingIssue({
    audioId: 'beresheet-1', tokenKey: '1:0:0:1', kind: 'mistaken-pronunciation',
    visibility: 'readerVisible', severity: 'medium', createdAt: 1, tokenizationVersion: 'v2',
  })
  const latest = createRecordingIssue({ ...older, kind: 'repeated-word', note: '  The word is repeated twice.  ', createdAt: 2 })
  const privateIssue = createRecordingIssue({ ...older, kind: 'hesitation', visibility: 'authoringOnly', createdAt: 3 })
  const removed = createRecordingIssue({ ...older, kind: 'other', removed: true, createdAt: 4 })
  const otherWord = createRecordingIssue({ ...older, tokenKey: '1:0:0:2', kind: 'skipped-word' })

  expect(getLatestReaderVisibleIssues([latest, older, privateIssue, removed, otherWord])).toEqual([latest, otherWord])
  expect(recordingIssueReaderText(latest)).toBe('The word is repeated twice.')
  expect(recordingIssueReaderText({ ...latest, note: ' ' })).toBe('Recording repeats here')
  expect(recordingIssueReaderText(otherWord)).toBe('Recording skips here')
})

test('keeps a published issue removed after saving and reloading the local overlay', () => {
  const storage = createStorage()
  const published = createRecordingIssue({
    audioId: 'beresheet-1', tokenKey: '1:0:0:1', kind: 'mistaken-pronunciation',
    visibility: 'readerVisible', severity: 'medium', createdAt: 1, tokenizationVersion: 'v2',
  })
  const removed = { ...published, removed: true }
  saveLocalRecordingIssues(storage, 'beresheet-1', 'v2', [removed], loadLocalRecordingIssues(storage, 'beresheet-1', 'v2').revision)
  const reloaded = loadLocalRecordingIssues(storage, 'beresheet-1', 'v2').issues
  expect(mergePublishedAndLocalRecordingIssues([published], reloaded)).toEqual([])
  expect(getReaderVisibleIssues(reloaded)).toEqual([])
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

test.each([{ timeStart: 3, timeEnd: 2 }])('rejects malformed optional recording issue fields: %o', (override) => {
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
