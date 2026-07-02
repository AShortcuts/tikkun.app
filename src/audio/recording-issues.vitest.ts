import { expect, test } from 'vitest'
import {
  createRecordingIssue,
  filterRecordingIssues,
  getReaderVisibleIssues,
  loadRecordingIssues,
  mergeRecordingIssues,
  recordingIssueReaderLabel,
  saveRecordingIssues,
} from './recording-issues.ts'

function createStorage(initial?: string) {
  const entries = new Map<string, string>()
  if (initial) entries.set('tikkun.recording-issues.v1:bereshit-1', initial)
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

test('creates a reader-visible recording issue anchored to a token', () => {
  const issue = createRecordingIssue({
    audioId: 'bereshit-1',
    tokenKey: '1:0:0:1',
    kind: 'mistaken-pronunciation',
    visibility: 'readerVisible',
    severity: 'medium',
    note: 'Listen carefully.',
    createdAt: 1,
    tokenizationVersion: 'v2',
  })

  expect(issue).toMatchObject({
    id: 'issue:bereshit-1:1:0:0:1:1',
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
  const storage = createStorage()
  saveRecordingIssues(storage, 'bereshit-1', [
    createRecordingIssue({
      audioId: 'bereshit-1',
      tokenKey: '1:0:0:0',
      kind: 'hesitation',
      visibility: 'authoringOnly',
      severity: 'low',
      createdAt: 1,
      tokenizationVersion: 'old',
    }),
  ])

  expect(loadRecordingIssues(storage, 'bereshit-1', 'v2')).toEqual([])
})

test('filters published issue payloads with the same validation as local storage', () => {
  const issue = createRecordingIssue({
    audioId: 'bereshit-1',
    tokenKey: '1:0:0:0',
    kind: 'hesitation',
    visibility: 'authoringOnly',
    severity: 'low',
    createdAt: 1,
    tokenizationVersion: 'v2',
  })

  expect(filterRecordingIssues([issue, { ...issue, audioId: 'other' }], 'bereshit-1', 'v2')).toEqual([issue])
})

test('merges published and local issues without duplicating the same mark', () => {
  const published = createRecordingIssue({
    audioId: 'bereshit-1',
    tokenKey: '1:0:0:0',
    kind: 'hesitation',
    visibility: 'authoringOnly',
    severity: 'low',
    createdAt: 1,
    tokenizationVersion: 'v2',
  })
  const local = createRecordingIssue({
    audioId: 'bereshit-1',
    tokenKey: '1:0:0:1',
    kind: 'other',
    visibility: 'readerVisible',
    severity: 'low',
    createdAt: 2,
    tokenizationVersion: 'v2',
  })

  expect(mergeRecordingIssues([published], [published, local])).toEqual([published, local])
})
